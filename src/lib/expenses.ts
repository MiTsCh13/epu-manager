// Ausgaben erfassen: Beträge berechnen (Kilometergeld, Netto, Bewirtung 50 %) und Eingaben prüfen.
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/constants/expenseCategories';
import type { VatRate } from '@/types';
import { calculateDeductibleAmount, calculateKilometergeld } from './profit';
import { parseDecimal, round2 } from './money';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export interface ExpenseFormInput {
  categoryId: string;
  amount: string; // Brutto, Rohtext
  km: string; // nur bei Fahrtkosten
  vatRate: VatRate; // nur USt-Pflichtige (Vorsteuer)
  date: string;
  description: string;
}

export type ExpenseFormErrors = Partial<Record<'categoryId' | 'amount' | 'km' | 'date', string>>;

export interface ExpenseValues {
  e1a_kz: string;
  category_label: string;
  amount: number; // Brutto
  amount_net: number | null; // Netto (nur USt-Pflichtige, ohne Kilometergeld)
  deductible_amount: number; // tatsächlich absetzbar
  is_bewirtung: boolean;
  km_driven: number | null;
}

export function findCategory(id: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find((c) => c.id === id);
}

const hasKmInput = (cat: ExpenseCategory | undefined, km: string) => !!cat?.hasKm && km.trim() !== '';

export function validateExpenseForm(input: ExpenseFormInput, today: string): ExpenseFormErrors {
  const e: ExpenseFormErrors = {};
  const cat = findCategory(input.categoryId);
  if (!cat) e.categoryId = 'Bitte wähle eine Kategorie.';
  if (hasKmInput(cat, input.km)) {
    const km = parseDecimal(input.km);
    if (Number.isNaN(km) || km <= 0 || km > 99999) e.km = 'Bitte gib gültige Kilometer ein.';
  } else {
    const amount = parseDecimal(input.amount);
    if (Number.isNaN(amount) || amount <= 0) e.amount = 'Bitte gib einen Betrag größer 0 ein.';
    else if (amount > 99_999_999) e.amount = 'Dieser Betrag ist zu hoch.';
  }
  if (!input.date) e.date = 'Bitte gib ein Datum ein.';
  else if (input.date > today) e.date = 'Das Datum liegt in der Zukunft.';
  return e;
}

/** Berechnet die zu speichernden Werte. Voraussetzung: validateExpenseForm ohne Fehler. */
export function computeExpenseValues(input: ExpenseFormInput, isKleinunternehmer: boolean): ExpenseValues {
  const cat = findCategory(input.categoryId)!;
  const isBewirtung = !!cat.isBewirtung;

  if (hasKmInput(cat, input.km)) {
    // Kilometergeld: pauschal, keine Umsatzsteuer enthalten
    const km = round2(parseDecimal(input.km));
    const amount = calculateKilometergeld(km);
    return {
      e1a_kz: cat.kz,
      category_label: cat.label,
      amount,
      amount_net: null,
      deductible_amount: amount,
      is_bewirtung: false,
      km_driven: km,
    };
  }

  const amount = round2(parseDecimal(input.amount));
  // USt-Pflichtige: absetzbar ist der Nettobetrag (Vorsteuer holt man sich vom Finanzamt zurück)
  const amountNet = isKleinunternehmer || input.vatRate === 0 ? null : round2(amount / (1 + input.vatRate / 100));
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
  };
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
