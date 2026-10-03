// Gewinnermittlung: Einnahmen-Ausgaben-Rechnung (EÜR) und Pauschalierung
import {
  BEWIRTUNG_DEDUCTIBLE_RATE,
  GRUNDFREIBETRAG_MAX,
  GRUNDFREIBETRAG_RATE,
  KILOMETERGELD_PER_KM,
  PAUSCH_RATES,
  PAUSCH_REVENUE_LIMITS,
} from '@/constants/tax2026';
import type { IndustryType, PauschType, ProfitMethod } from '@/types';
import { round2 } from './money';

export { GRUNDFREIBETRAG_MAX, GRUNDFREIBETRAG_RATE, PAUSCH_RATES };

export function getPauschRate(pauschType: PauschType, industryType: IndustryType = 'service'): number {
  return pauschType === 'ku' ? PAUSCH_RATES.ku[industryType] : PAUSCH_RATES[pauschType];
}

export function isPauschalierungAllowed(pauschType: PauschType, annualRevenue: number): boolean {
  return annualRevenue <= PAUSCH_REVENUE_LIMITS[pauschType];
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
  totalExpenses: number; // Summe absetzbarer Ausgaben (bei EÜR, inkl. Homeoffice-Pauschale)
  svsPayments: number; // SVS-Beiträge (immer absetzbar)
  homeofficePauschale?: number; // Arbeitsplatzpauschale (300 € oder 1.200 €), nur bei Pauschalierung separat
}): {
  grossProfit: number; // Einnahmen − Ausgaben (vor SVS)
  netProfit: number; // Gewinn nach SVS (und ggf. Homeoffice-Pauschale)
  taxableIncome: number; // Steuerpflichtiges Einkommen (nach Grundfreibetrag)
  grundfreibetrag: number; // Angewendeter Grundfreibetrag
  pauschaleExpenses?: number; // Bei Pauschalierung: berechnete pauschale Ausgaben
} {
  const { totalRevenue, svsPayments } = params;

  let grossProfit: number;
  let netProfit: number;
  let pauschaleExpenses: number | undefined;

  if (params.profitMethod === 'pauschal') {
    const rate = getPauschRate(params.pauschType ?? 'ku', params.industryType);
    pauschaleExpenses = round2(totalRevenue * rate);
    grossProfit = round2(totalRevenue - pauschaleExpenses);
    netProfit = round2(grossProfit - svsPayments - (params.homeofficePauschale ?? 0));
  } else {
    grossProfit = round2(totalRevenue - params.totalExpenses);
    netProfit = round2(grossProfit - svsPayments);
  }

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
