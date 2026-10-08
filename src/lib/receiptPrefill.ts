// Ausgelesener Beleg (Edge Function read-receipt) → Vorschlag fürs Ausgaben-Formular.
// Reine Logik ohne Supabase – Kategorie wie beim Import: erst deine bisherigen Ausgaben, dann der Vorschlag von Claude.
import { EXPENSE_CATEGORIES, findCategoryById, isCategoryOffered, type CategoryContext } from '@/constants/expenseCategories';
import { VAT_RATES } from '@/constants/tax2026';
import { matchHistory, targetCategoryId, type CategoryHistory } from './importMapping';
import { formatDecimalInput } from './money';
import type { ExpenseFormInput } from './expenses';
import type { VatRate } from '@/types';
import type { ScanCategory, ScanResult } from '../../supabase/functions/read-receipt/receipt';

export type { ScanResult };

/**
 * Kategorien, aus denen Claude wählt. Auch die, die bei Pauschalierung nicht extra zählen – so kann Klaro sagen,
 * dass ein Beleg schon im Pauschalsatz steckt. Tagesgeld und Nächtigung sind Pauschalen ohne Beleg.
 */
export function scanCategories(ctx: CategoryContext): ScanCategory[] {
  return EXPENSE_CATEGORIES.filter((c) => !c.calc && isCategoryOffered(c, { ...ctx, profitMethod: 'euer' })).map((c) => ({
    id: c.id,
    label: c.label,
    hint: c.hint,
  }));
}

export interface ReceiptPrefill {
  form: Partial<ExpenseFormInput>;
  /** Warum diese Kategorie – wird im Formular unter den Kacheln angezeigt */
  categoryReason: string | null;
  notes: string[];
  likelyPrivate: boolean;
}

/**
 * Den Satz mit der meisten Steuer nehmen; ohne ausgewiesene Steuer 0 %. Kleinunternehmer: immer 0 (kein Vorsteuerabzug).
 * Ausländische Umsatzsteuer ist in Österreich keine Vorsteuer → 0 % (ebenso bei Sätzen, die es hier nicht gibt).
 */
function pickVatRate(result: ScanResult, isKU: boolean): { rate: VatRate; mixed: boolean; foreign: boolean } {
  const none = { rate: 0 as VatRate, mixed: false, foreign: false };
  if (isKU || result.vat.length === 0) return none;
  const foreign =
    (result.vat_country !== null && result.vat_country !== 'AT') ||
    result.vat.some((v) => !(VAT_RATES as readonly number[]).includes(v.rate));
  if (foreign) return { ...none, foreign: true };
  const main = [...result.vat].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0]!;
  return { rate: main.rate as VatRate, mixed: new Set(result.vat.map((v) => v.rate)).size > 1, foreign: false };
}

function describe(result: ScanResult): string {
  const { description, vendor } = result;
  if (!vendor) return description;
  if (!description) return vendor;
  return description.toLowerCase().includes(vendor.toLowerCase()) ? description : `${description} – ${vendor}`;
}

export function buildPrefill(
  result: ScanResult,
  { ctx, isKU, today, history }: { ctx: CategoryContext; isKU: boolean; today: string; history?: CategoryHistory },
): ReceiptPrefill {
  const notes = [...result.notes];
  const form: Partial<ExpenseFormInput> = { description: describe(result).slice(0, 120) };

  // Betrag nur in Euro übernehmen – Fremdwährung rechnet die Person selbst um
  if (result.total !== null && (result.currency === null || result.currency === 'EUR')) {
    form.amount = formatDecimalInput(result.total);
  } else if (result.total !== null) {
    notes.unshift(`Der Beleg ist in ${result.currency} – bitte trag den Betrag in Euro ein (laut Kontoauszug).`);
  }

  if (result.date && result.date <= today) form.date = result.date;
  else if (result.date) notes.push('Das Datum auf dem Beleg liegt in der Zukunft – bitte prüf es.');

  const vat = pickVatRate(result, isKU);
  form.vatRate = vat.rate;
  if (vat.foreign) notes.push('Ausländische Umsatzsteuer kannst du dir in Österreich nicht als Vorsteuer holen – Klaro hat 0 % eingetragen.');
  if (vat.mixed) notes.push(`Der Beleg hat mehrere Umsatzsteuersätze – Klaro hat ${vat.rate} % übernommen. Teil ihn bei Bedarf auf.`);

  // Kategorie: deine bisherigen Ausgaben vor dem Vorschlag von Claude
  const learned = matchHistory(history, `${result.vendor ?? ''} ${result.description}`);
  const learnedId = learned ? targetCategoryId(learned.target) : null;
  let categoryId = learnedId ?? result.category_id;
  let categoryReason = learnedId
    ? `So hast du „${learned!.word}“ bisher eingeordnet.`
    : result.category_reason || null;

  const category = categoryId ? findCategoryById(categoryId) : undefined;
  if (category && !isCategoryOffered(category, ctx)) {
    if (ctx.profitMethod === 'pauschal') {
      notes.unshift(`„${category.label}“ zählt bei deiner Pauschalierung nicht extra – das ist im Pauschalsatz schon enthalten.`);
    }
    categoryId = null;
    categoryReason = null;
  }
  form.categoryId = categoryId ?? '';

  return { form, categoryReason, notes, likelyPrivate: result.likely_private };
}
