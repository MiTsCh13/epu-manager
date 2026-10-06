// Ausgaben erfassen: Beträge berechnen (Kilometergeld, Diäten, Netto, Bewirtung 50 %) und Eingaben prüfen.
// Über 1.000 € wird aus einem Gerät eine Anlage, die über mehrere Jahre abgeschrieben wird.
import { countsUnder, findCategoryById, findCategoryByLabel, type CategoryContext, type ExpenseCategory } from '@/constants/expenseCategories';
import { TAGESGELD_INPUT_HOURS } from '@/constants/tax2026';
import type { BusinessType, OtherIncomeKind, PauschType, Profile, ProfitMethod, VatRate, Vehicle } from '@/types';
import { exceedsGwgLimit, validateUsefulLife } from './assets';
import {
  calculateArbeitsplatzpauschale,
  calculateDeductibleAmount,
  calculateKilometergeld,
  calculateNaechtigung,
  calculateTagesgeld,
  otherIncomeAmount,
} from './profit';
import { parseDecimal, round2 } from './money';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export interface ExpenseFormInput {
  categoryId: string;
  amount: string; // Brutto, Rohtext
  km: string; // nur bei Fahrtkosten
  vehicle?: Vehicle; // Kilometergeld: Auto (Standard), Motorrad/Moped, Fahrrad
  hours: string; // angefangene Stunden an einem Reisetag, ganze Zahl 4–12 (nur Tagesgeld)
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
  vehicle: Vehicle | null; // nur mit km_driven
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
    const { min, max } = TAGESGELD_INPUT_HOURS;
    const hours = Number(input.hours.trim());
    if (!input.hours.trim() || !Number.isInteger(hours)) e.hours = 'Bitte gib ganze Stunden ein – angefangene Stunden aufrunden.';
    else if (hours < min) e.hours = `Tagesgeld gibt es erst ab mehr als ${min - 1} Stunden, also ab ${min} angefangenen Stunden.`;
    else if (hours > max) e.hours = `Höchstens ${max} Stunden pro Tag – bei mehrtägigen Reisen einen Eintrag pro Tag.`;
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
    vehicle: null,
    trip_hours: null,
    nights: null,
    reimbursed,
    ...extra,
  });
  if (cat.calc === 'tagesgeld') {
    const hours = Number(input.hours.trim());
    return flat(calculateTagesgeld(hours), { trip_hours: hours });
  }
  if (cat.calc === 'naechtigung') {
    const nights = Number(input.nights.trim());
    return flat(calculateNaechtigung(nights), { nights });
  }
  if (hasKmInput(cat, input.km)) {
    const km = round2(parseDecimal(input.km));
    const vehicle = input.vehicle ?? 'car';
    return flat(calculateKilometergeld(km, vehicle, input.date), { km_driven: km, vehicle });
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
    vehicle: null,
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

// ─── Mehrere Ausgaben auf einmal umkategorisieren ───────────

export type RecategorizeResult =
  | { ok: true; values: Pick<ExpenseValues, 'e1a_kz' | 'category_label' | 'is_bewirtung' | 'deductible_amount' | 'reimbursed'> }
  | { ok: false; reason: string };

/**
 * Neue Kategorie für eine bestehende Ausgabe – mit denselben Regeln wie im Formular (Bewirtung 50 %, Öffi-Karte 50 %).
 * Berechnete Einträge (Kilometergeld, Diäten, Nächtigung) und Geräte über 1.000 € (werden Anlagen) gehen nur einzeln.
 */
export function recategorize(
  e: { amount: number; amount_net: number | null; km_driven: number | null; trip_hours: number | null; nights: number | null; reimbursed: boolean },
  cat: ExpenseCategory,
): RecategorizeResult {
  if (e.km_driven || e.trip_hours || e.nights) return { ok: false, reason: 'berechnet (Kilometer, Tagesgeld oder Nächte)' };
  if (cat.calc) return { ok: false, reason: 'Diäten und Nächtigung brauchen Stunden bzw. Nächte' };
  const base = e.amount_net ?? e.amount;
  if (cat.asset === 'always' && exceedsGwgLimit(base)) return { ok: false, reason: 'über 1.000 € – wird eine Anlage' };
  return {
    ok: true,
    values: {
      e1a_kz: cat.kz,
      category_label: cat.label,
      is_bewirtung: !!cat.isBewirtung,
      deductible_amount: calculateDeductibleAmount({ amount: base, isBewirtung: cat.isBewirtung, deductibleRate: cat.deductibleRate }),
      reimbursed: !!cat.pauschalOnlyReimbursed && e.reimbursed,
    },
  };
}

// ─── Suchen und sortieren ───────────────────────────────────

export type ListSort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export const LIST_SORT_LABELS: Record<ListSort, string> = {
  'date-desc': 'Neueste zuerst',
  'date-asc': 'Älteste zuerst',
  'amount-desc': 'Höchster Betrag',
  'amount-asc': 'Niedrigster Betrag',
};

/** Sucht in Text-Feldern und im Betrag („59,99“ oder „59.99“), sortiert nach Datum oder Betrag. */
export function searchAndSort<T>(
  items: readonly T[],
  query: string,
  sort: ListSort,
  get: (item: T) => { date: string; amount: number; texts: readonly (string | null | undefined)[] },
): T[] {
  const q = query.trim().toLowerCase();
  // „1.234,56“ → „1234.56“ (wie toFixed); „59,99“ → „59.99“
  const qAmount = q.includes(',') ? q.replace(/\./g, '').replace(',', '.') : q;
  const matches = (item: T) => {
    if (!q) return true;
    const { amount, texts } = get(item);
    return texts.some((t) => t?.toLowerCase().includes(q)) || amount.toFixed(2).includes(qAmount);
  };
  const dir = sort.endsWith('asc') ? 1 : -1;
  return items.filter(matches).sort((a, b) => {
    const x = get(a);
    const y = get(b);
    return dir * (sort.startsWith('date') ? x.date.localeCompare(y.date) : x.amount - y.amount);
  });
}

/** Wer erfasst: Kategorien und Pauschalierungs-Regeln aus dem Profil. */
export function categoryContextFor(
  profile: Pick<Profile, 'business_type' | 'profit_method' | 'pausch_type' | 'home_office' | 'other_income_kind' | 'other_income_amount'> | null,
): CategoryContext {
  const otherKind = (profile?.other_income_kind ?? null) as OtherIncomeKind | null;
  return {
    businessType: (profile?.business_type as BusinessType | null) ?? null,
    profitMethod: (profile?.profit_method ?? 'euer') as ProfitMethod,
    pauschType: (profile?.pausch_type ?? null) as PauschType | null,
    smallApp:
      calculateArbeitsplatzpauschale({
        homeOffice: profile?.home_office ?? null,
        otherIncomeKind: otherKind,
        otherIncomeAmount: otherIncomeAmount(otherKind, profile?.other_income_amount == null ? null : Number(profile.other_income_amount)),
        year: new Date().getFullYear(),
      }).size === 'klein',
  };
}
