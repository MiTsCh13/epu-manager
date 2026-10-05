// Ausgaben erfassen: Beträge berechnen (Kilometergeld, Diäten, Netto, Bewirtung 50 %) und Eingaben prüfen.
// Über 1.000 € wird aus einem Gerät eine Anlage, die über mehrere Jahre abgeschrieben wird.
import { countsUnder, findCategoryById, findCategoryByLabel, type ExpenseCategory } from '@/constants/expenseCategories';
import type { PauschType, VatRate } from '@/types';
import { exceedsGwgLimit, validateUsefulLife } from './assets';
import { calculateDeductibleAmount, calculateKilometergeld, calculateNaechtigung, calculateTagesgeld } from './profit';
import { parseDecimal, round2 } from './money';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export interface ExpenseFormInput {
  categoryId: string;
  amount: string; // Brutto, Rohtext
  km: string; // nur bei Fahrtkosten
  hours: string; // Reisedauer in Stunden (nur Tagesgeld)
  nights: string; // Anzahl Nächte (nur Nächtigung pauschal)
  reimbursed: boolean; // an Kund:innen weiterverrechnet (nur Fahrten & Reisen)
  vatRate: VatRate; // nur USt-Pflichtige (Vorsteuer)
  date: string;
  description: string;
  spread: boolean | null; // Antwort auf „Auf mehrere Jahre verteilen?“ (nur wenn Klaro fragt)
  usefulLife: string; // Nutzungsdauer in Jahren, Rohtext (nur bei Anlagen)
}

export type ExpenseFormErrors = Partial<
  Record<'categoryId' | 'amount' | 'km' | 'hours' | 'nights' | 'date' | 'spread' | 'usefulLife', string>
>;

export interface ExpenseValues {
  e1a_kz: string;
  category_label: string;
  amount: number; // Brutto
  amount_net: number | null; // Netto (nur USt-Pflichtige, ohne Kilometergeld)
  deductible_amount: number; // tatsächlich absetzbar
  is_bewirtung: boolean;
  km_driven: number | null;
  trip_hours: number | null;
  nights: number | null;
  reimbursed: boolean;
}

export interface AssetValues {
  category_label: string;
  amount: number; // Brutto
  amount_net: number | null; // Netto (nur USt-Pflichtige)
  useful_life_years: number;
}

export const findCategory = findCategoryById;

/** Reisedauer auf 0,1 Stunden gerundet – so wird sie auch gespeichert (trip_hours NUMERIC(6,1)). */
const tripHours = (raw: string) => Math.round(parseDecimal(raw) * 10) / 10;

const hasKmInput = (cat: ExpenseCategory | undefined, km: string) => !!cat?.hasKm && km.trim() !== '';

/** Brutto und Netto aus der Eingabe. Netto nur bei USt-Pflichtigen mit Steuersatz > 0. */
function amounts(input: ExpenseFormInput, isKleinunternehmer: boolean): { amount: number; amountNet: number | null } {
  const amount = round2(parseDecimal(input.amount));
  const amountNet = isKleinunternehmer || input.vatRate === 0 ? null : round2(amount / (1 + input.vatRate / 100));
  return { amount, amountNet };
}

/**
 * Wird die Eingabe eine Ausgabe oder eine Anlage?
 * - 'expense': sofort absetzbar (bis 1.000 €, oder keine Kategorie für Anlagen)
 * - 'asset': über die Nutzungsdauer verteilen (Geräte über 1.000 €, oder Nutzer hat „Ja“ gewählt)
 * - 'ask': Klaro muss fragen, ob der Kauf mehrere Jahre genutzt wird
 * Die 1.000-€-Grenze gilt netto, bei Kleinunternehmern brutto.
 */
export function entryKind(input: ExpenseFormInput, isKleinunternehmer: boolean): 'expense' | 'asset' | 'ask' {
  const cat = findCategory(input.categoryId);
  if (!cat?.asset || cat.calc || hasKmInput(cat, input.km)) return 'expense';
  const raw = parseDecimal(input.amount);
  if (Number.isNaN(raw) || raw <= 0) return 'expense';
  const { amount, amountNet } = amounts(input, isKleinunternehmer);
  if (!exceedsGwgLimit(amountNet ?? amount)) return 'expense';
  if (cat.asset === 'always') return 'asset';
  return input.spread === null ? 'ask' : input.spread ? 'asset' : 'expense';
}

export function validateExpenseForm(input: ExpenseFormInput, today: string, isKleinunternehmer: boolean): ExpenseFormErrors {
  const e: ExpenseFormErrors = {};
  const cat = findCategory(input.categoryId);
  if (!cat) e.categoryId = 'Bitte wähle eine Kategorie.';
  if (cat?.calc === 'tagesgeld') {
    const hours = tripHours(input.hours);
    if (Number.isNaN(hours) || hours <= 0 || hours > 24 * 366) e.hours = 'Bitte gib die Reisedauer in Stunden ein.';
    else if (calculateTagesgeld(hours) === 0) e.hours = 'Tagesgeld gibt es erst ab mehr als 3 Stunden.';
  } else if (cat?.calc === 'naechtigung') {
    const nights = Number(input.nights.trim());
    if (!input.nights.trim() || !Number.isInteger(nights) || nights < 1 || nights > 366) e.nights = 'Bitte gib die Anzahl der Nächte ein.';
  } else if (hasKmInput(cat, input.km)) {
    const km = parseDecimal(input.km);
    if (Number.isNaN(km) || km <= 0 || km > 99999) e.km = 'Bitte gib gültige Kilometer ein.';
  } else {
    const amount = parseDecimal(input.amount);
    if (Number.isNaN(amount) || amount <= 0) e.amount = 'Bitte gib einen Betrag größer 0 ein.';
    else if (amount > 99_999_999) e.amount = 'Dieser Betrag ist zu hoch.';
  }
  if (!input.date) e.date = 'Bitte gib ein Datum ein.';
  else if (input.date > today) e.date = 'Das Datum liegt in der Zukunft.';
  if (!e.categoryId && !e.amount && !cat?.calc) {
    const kind = entryKind(input, isKleinunternehmer);
    if (kind === 'ask') e.spread = 'Bitte wähle, ob du das mehrere Jahre nutzt.';
    if (kind === 'asset') {
      const lifeError = validateUsefulLife(input.usefulLife);
      if (lifeError) e.usefulLife = lifeError;
    }
  }
  return e;
}

/** Berechnet die zu speichernden Werte. Voraussetzung: validateExpenseForm ohne Fehler. */
export function computeExpenseValues(input: ExpenseFormInput, isKleinunternehmer: boolean): ExpenseValues {
  const cat = findCategory(input.categoryId)!;
  const isBewirtung = !!cat.isBewirtung;

  const reimbursed = !!cat.pauschalOnlyReimbursed && input.reimbursed;
  // Pauschalen (Kilometergeld, Tagesgeld, Nächtigung): keine Umsatzsteuer enthalten, voll absetzbar
  const flat = (amount: number, extra: Partial<ExpenseValues>): ExpenseValues => ({
    e1a_kz: cat.kz,
    category_label: cat.label,
    amount,
    amount_net: null,
    deductible_amount: amount,
    is_bewirtung: false,
    km_driven: null,
    trip_hours: null,
    nights: null,
    reimbursed,
    ...extra,
  });
  if (cat.calc === 'tagesgeld') {
    const hours = tripHours(input.hours);
    return flat(calculateTagesgeld(hours), { trip_hours: hours });
  }
  if (cat.calc === 'naechtigung') {
    const nights = Number(input.nights.trim());
    return flat(calculateNaechtigung(nights), { nights });
  }
  if (hasKmInput(cat, input.km)) {
    const km = round2(parseDecimal(input.km));
    return flat(calculateKilometergeld(km), { km_driven: km });
  }

  // USt-Pflichtige: absetzbar ist der Nettobetrag (Vorsteuer holt man sich vom Finanzamt zurück)
  const { amount, amountNet } = amounts(input, isKleinunternehmer);
  return {
    e1a_kz: cat.kz,
    category_label: cat.label,
    amount,
    amount_net: amountNet,
    deductible_amount: calculateDeductibleAmount({
      amount: amountNet ?? amount,
      isBewirtung,
      deductibleRate: cat.deductibleRate,
    }),
    is_bewirtung: isBewirtung,
    km_driven: null,
    trip_hours: null,
    nights: null,
    reimbursed,
  };
}

/** Werte für eine Anlage. Voraussetzung: validateExpenseForm ohne Fehler und entryKind = 'asset'. */
export function computeAssetValues(input: ExpenseFormInput, isKleinunternehmer: boolean): AssetValues {
  const cat = findCategory(input.categoryId)!;
  const { amount, amountNet } = amounts(input, isKleinunternehmer);
  return { category_label: cat.label, amount, amount_net: amountNet, useful_life_years: Number(input.usefulLife.trim()) };
}

export function validateReceiptFile(file: { size: number; type: string }): string | null {
  if (!RECEIPT_MIME_TYPES.includes(file.type)) return 'Bitte lade ein Foto (JPG, PNG, WebP, HEIC) oder ein PDF hoch.';
  if (file.size > MAX_RECEIPT_BYTES) return 'Der Beleg ist größer als 5 MB.';
  return null;
}

/** Summen je Kategorie, absteigend (für Übersichten/Diagramme). */
export function sumByCategory(
  expenses: readonly { category_label: string; deductible_amount: number | null; amount: number }[],
): { label: string; total: number }[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    map.set(e.category_label, (map.get(e.category_label) ?? 0) + Number(e.deductible_amount ?? e.amount));
  }
  return [...map.entries()].map(([label, total]) => ({ label, total: round2(total) })).sort((a, b) => b.total - a.total);
}

// ─── Summen je Gewinnermittlungsart ─────────────────────────

export interface ExpenseTotals {
  deductible: number; // Einnahmen-Ausgaben-Rechnung: alle absetzbaren Ausgaben
  // Pauschalierung: was § 17 EStG zusätzlich zum Pauschalsatz erlaubt
  pauschalExtras: { ku: number; basis: number };
  reimbursedTravel: number; // weiterverrechnete Reisekosten (mindern bei Pauschalierung die Basis)
}

type TotalsRow = { category_label: string; amount: number; deductible_amount: number | null; is_bewirtung: boolean; reimbursed: boolean };

/** Zählt diese Ausgabe neben der Pauschalierung? (Reisekosten nur, wenn weiterverrechnet.) */
export function countsAlongsidePauschal(row: Pick<TotalsRow, 'category_label' | 'reimbursed'>, pauschType: PauschType): boolean {
  const cat = findCategoryByLabel(row.category_label);
  if (!cat || !countsUnder(cat, 'pauschal', pauschType)) return false;
  return !cat.pauschalOnlyReimbursed || row.reimbursed;
}

export function expenseTotals(rows: readonly TotalsRow[]): ExpenseTotals {
  const t: ExpenseTotals = { deductible: 0, pauschalExtras: { ku: 0, basis: 0 }, reimbursedTravel: 0 };
  for (const r of rows) {
    const d = r.deductible_amount ?? calculateDeductibleAmount({ amount: r.amount, isBewirtung: r.is_bewirtung });
    t.deductible += d;
    if (countsAlongsidePauschal(r, 'ku')) t.pauschalExtras.ku += d;
    if (countsAlongsidePauschal(r, 'basis_15')) t.pauschalExtras.basis += d;
    if (r.reimbursed && findCategoryByLabel(r.category_label)?.pauschalOnlyReimbursed) t.reimbursedTravel += d;
  }
  return {
    deductible: round2(t.deductible),
    pauschalExtras: { ku: round2(t.pauschalExtras.ku), basis: round2(t.pauschalExtras.basis) },
    reimbursedTravel: round2(t.reimbursedTravel),
  };
}

/** Zusätzlich absetzbare Ausgaben für die gewählte Pauschalierung. */
export function pauschalExtrasFor(totals: Pick<ExpenseTotals, 'pauschalExtras'>, pauschType: PauschType | null | undefined): number {
  return pauschType === 'basis_15' || pauschType === 'basis_6' ? totals.pauschalExtras.basis : totals.pauschalExtras.ku;
}
