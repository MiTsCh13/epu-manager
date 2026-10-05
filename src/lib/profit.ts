// Gewinnermittlung: Einnahmen-Ausgaben-Rechnung (EÜR) und Pauschalierung
import {
  ARBEITSPLATZPAUSCHALE,
  BEWIRTUNG_DEDUCTIBLE_RATE,
  GRUNDFREIBETRAG_MAX,
  GRUNDFREIBETRAG_RATE,
  KILOMETERGELD_PER_KM,
  NAECHTIGUNG_PAUSCHAL,
  PAUSCH_RATES,
  PAUSCH_REVENUE_LIMITS,
  TAGESGELD,
} from '@/constants/tax2026';
import type { IndustryType, OtherIncomeKind, PauschType, ProfitMethod } from '@/types';
import { round2 } from './money';

export { GRUNDFREIBETRAG_MAX, GRUNDFREIBETRAG_RATE, PAUSCH_RATES };

export function getPauschRate(pauschType: PauschType, industryType: IndustryType = 'service'): number {
  return pauschType === 'ku' ? PAUSCH_RATES.ku[industryType] : PAUSCH_RATES[pauschType];
}

export function isPauschalierungAllowed(pauschType: PauschType, annualRevenue: number): boolean {
  return annualRevenue <= PAUSCH_REVENUE_LIMITS[pauschType];
}

/** Pauschale Ausgaben: Satz × Umsatz; weiterverrechnete Reisekosten zählen nicht zum Umsatz für die Pauschale. */
export function calculatePauschaleExpenses(revenue: number, rate: number, reimbursedTravel = 0): number {
  return round2(Math.max(revenue - reimbursedTravel, 0) * rate);
}

/** Grundfreibetrag: 15 % des Gewinns, max. 4.950 €; bei Verlust 0. */
export function calculateGrundfreibetrag(profit: number): number {
  return round2(Math.min(Math.max(profit, 0) * GRUNDFREIBETRAG_RATE, GRUNDFREIBETRAG_MAX));
}

export function calculateProfit(params: {
  profitMethod: ProfitMethod;
  pauschType?: PauschType;
  industryType?: IndustryType; // Für KU-Pauschalierung
  totalRevenue: number; // Summe aller Einnahmen (netto)
  totalExpenses: number; // Summe absetzbarer Ausgaben (bei EÜR)
  svsPayments: number; // SVS-Beiträge (immer absetzbar)
  // Nur Pauschalierung: Ausgaben, die § 17 EStG zusätzlich erlaubt (z. B. Öffi-Karte, bei Basispauschalierung Waren)
  pauschalExtras?: number;
  // Nur Pauschalierung: an Kund:innen weiterverrechnete Reisekosten – sie mindern die Basis für den Pauschalsatz
  reimbursedTravel?: number;
  arbeitsplatzpauschale?: number; // 300 € bzw. 1.200 € – bei allen Gewinnermittlungsarten zusätzlich absetzbar
}): {
  grossProfit: number; // Einnahmen − Ausgaben (vor SVS)
  netProfit: number; // Gewinn nach SVS und Arbeitsplatzpauschale
  taxableIncome: number; // Steuerpflichtiges Einkommen (nach Grundfreibetrag)
  grundfreibetrag: number; // Angewendeter Grundfreibetrag
  pauschaleExpenses?: number; // Bei Pauschalierung: Pauschalsatz × Umsatz (ohne weiterverrechnete Reisekosten)
} {
  const { totalRevenue, svsPayments } = params;

  let grossProfit: number;
  let pauschaleExpenses: number | undefined;

  if (params.profitMethod === 'pauschal') {
    const rate = getPauschRate(params.pauschType ?? 'ku', params.industryType);
    pauschaleExpenses = calculatePauschaleExpenses(totalRevenue, rate, params.reimbursedTravel ?? 0);
    grossProfit = round2(totalRevenue - pauschaleExpenses - (params.pauschalExtras ?? 0));
  } else {
    grossProfit = round2(totalRevenue - params.totalExpenses);
  }
  const netProfit = round2(grossProfit - svsPayments - (params.arbeitsplatzpauschale ?? 0));

  const grundfreibetrag = calculateGrundfreibetrag(netProfit);
  const taxableIncome = round2(netProfit - grundfreibetrag);

  return {
    grossProfit,
    netProfit,
    taxableIncome,
    grundfreibetrag,
    ...(pauschaleExpenses !== undefined && { pauschaleExpenses }),
  };
}

// ─── Arbeitsplatzpauschale ──────────────────────────────────

export interface ArbeitsplatzpauschaleResult {
  amount: number; // für das Jahr (bei Betriebsbeginn anteilig)
  size: 'gross' | 'klein' | null;
  kz: '9217' | '9215' | null; // E1a-Kennzahl
  months: number; // angerechnete Monate
}

/**
 * Arbeitsplatzpauschale für ein Kalenderjahr. Nur wer von zu Hause arbeitet (kein anderer Raum außer Haus).
 * Groß (1.200 €), außer es gibt ein Gehalt über dem Grenzwert – dann klein (300 €). Pensionen zählen nicht.
 * Im Jahr der Anmeldung: 1/12 pro angefangenem Monat.
 */
export function calculateArbeitsplatzpauschale(params: {
  homeOffice: boolean | null;
  otherIncomeKind: OtherIncomeKind | null;
  otherIncomeAmount: number | null;
  year: number;
  registrationDate?: Date | null;
}): ArbeitsplatzpauschaleResult {
  if (!params.homeOffice) return { amount: 0, size: null, kz: null, months: 0 };
  const reg = params.registrationDate;
  if (reg && reg.getFullYear() > params.year) return { amount: 0, size: null, kz: null, months: 0 };
  const months = reg && reg.getFullYear() === params.year ? 12 - reg.getMonth() : 12;
  const klein = params.otherIncomeKind === 'employment' && (params.otherIncomeAmount ?? 0) > ARBEITSPLATZPAUSCHALE.otherIncomeLimit;
  const annual = klein ? ARBEITSPLATZPAUSCHALE.klein : ARBEITSPLATZPAUSCHALE.gross;
  return { amount: round2((annual * months) / 12), size: klein ? 'klein' : 'gross', kz: klein ? '9215' : '9217', months };
}

/** Zu versteuerndes Jahreseinkommen aus Gehalt bzw. Pension (0, wenn keine oder unbeantwortet). */
export function otherIncomeAmount(kind: OtherIncomeKind | null, amount: number | null): number {
  return kind && kind !== 'none' ? Math.max(amount ?? 0, 0) : 0;
}

// ─── Ausgaben-Sonderregeln ──────────────────────────────────

/** Absetzbarer Betrag: Bewirtung 50 %, sonst `deductibleRate` der Kategorie (Standard 100 %). */
export function calculateDeductibleAmount(params: {
  amount: number;
  isBewirtung?: boolean;
  deductibleRate?: number;
}): number {
  const rate = params.isBewirtung ? BEWIRTUNG_DEDUCTIBLE_RATE : (params.deductibleRate ?? 1);
  return round2(params.amount * rate);
}

/**
 * Tagesgeld für eine Geschäftsreise: 30 € je volle 24 Stunden; für den Rest (und eintägige Reisen) ab MEHR als
 * 3 Stunden 2,50 € pro angefangener Stunde, höchstens 30 €.
 */
export function calculateTagesgeld(hours: number): number {
  if (!(hours > 0)) return 0;
  const fullDays = Math.floor(hours / 24);
  const rest = hours - fullDays * 24;
  const restAmount = rest > TAGESGELD.minHours ? Math.min(Math.ceil(rest) * TAGESGELD.perStartedHour, TAGESGELD.perDay) : 0;
  return round2(fullDays * TAGESGELD.perDay + restAmount);
}

/** Nächtigungsgeld ohne Beleg: Pauschale × Nächte. */
export function calculateNaechtigung(nights: number): number {
  return round2(Math.max(Math.floor(nights), 0) * NAECHTIGUNG_PAUSCHAL);
}

/** Kilometergeld: km × amtlicher Satz. */
export function calculateKilometergeld(km: number): number {
  return round2(Math.max(km, 0) * KILOMETERGELD_PER_KM);
}

/**
 * Summe der absetzbaren Ausgaben. Verwendet immer `deductible_amount`, nie `amount` direkt.
 * Fehlt der Wert (sollte dank DB-Trigger nicht vorkommen), wird er nach den Regeln berechnet.
 */
export function sumDeductibleExpenses(
  expenses: readonly { amount: number; deductible_amount: number | null; is_bewirtung: boolean }[],
): number {
  return round2(
    expenses.reduce(
      (sum, e) =>
        sum + (e.deductible_amount ?? calculateDeductibleAmount({ amount: e.amount, isBewirtung: e.is_bewirtung })),
      0,
    ),
  );
}
