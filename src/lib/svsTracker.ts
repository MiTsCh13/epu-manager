// Rechenmodell für den SVS-Tracker: führt Gewinn, Hochrechnung, Rücklage, Fälligkeit, Nachzahlung und Alerts zusammen.
import { SVS_2026 } from '@/constants/svs2026';
import type { AppAlert, BusinessType, IndustryType, PauschType, ProfitMethod } from '@/types';
import { round2 } from './money';
import { calculateGrundfreibetrag, calculateProfit } from './profit';
import {
  basisFromQuarterlyPrescription,
  calculateBeitragsgrundlage,
  calculateQuarterlyPrescription,
  calculateReserveRecommendation,
  calculateSVSContributions,
  getNachzahlungsWarning,
  getNextSVSDueDate,
  getSVSAlerts,
  getSVSPhase,
  getSVSYear,
  getVorlaeufigeBeitragsgrundlage,
  projectAnnualProfit,
  type SVSPhase,
} from './svs';

export interface YearFigures {
  revenueNet: number; // bezahlte Rechnungen netto
  revenueGross: number; // bezahlte Rechnungen brutto (für die Kleinunternehmergrenze)
  deductibleExpenses: number;
  svsPaid: number;
}

/** Eine Spalte der Jahresrechnung: Einnahmen → Ausgaben → SVS → Gewinn → Grundfreibetrag → ESt → was bleibt. */
export interface BreakdownColumn {
  revenue: number;
  expenses: number; // absetzbar bzw. pauschal
  basis: number; // Berechnungsbasis SVS = Gewinn vor SVS
  svs: number;
  profit: number; // Jahresgewinn (nach SVS)
  grundfreibetrag: number;
  taxable: number; // zu versteuerndes Einkommen
  incomeTax: number | null; // nur für das ganze Jahr sinnvoll
  remaining: number | null; // Gewinn − Einkommensteuer
}

export interface TrackerInput {
  today: Date;
  registrationDate: Date | null;
  businessType: BusinessType | null;
  exempt: boolean;
  isKleinunternehmer: boolean;
  profitMethod: ProfitMethod;
  pauschType: PauschType | null;
  industryType: IndustryType | null;
  quarterlyPrescription: number | null;
  current: YearFigures;
  previous: YearFigures | null;
}

/** Anteil des Jahres in Monaten (z. B. 3. Oktober ≈ 9,07). */
export function monthsElapsedInYear(today: Date): number {
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear() + 1, 0, 1);
  return ((today.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 12;
}

function profitOf(input: TrackerInput, y: YearFigures): number {
  return calculateProfit({
    profitMethod: input.profitMethod,
    pauschType: input.pauschType ?? undefined,
    industryType: input.industryType ?? undefined,
    totalRevenue: y.revenueNet,
    totalExpenses: y.deductibleExpenses,
    svsPayments: y.svsPaid,
  }).netProfit;
}

export function buildSvsTracker(input: TrackerInput) {
  const { today, current } = input;
  const reg = input.registrationDate;
  const svsYear = reg ? getSVSYear(reg, today) : 1;
  const phase: SVSPhase = reg ? getSVSPhase(reg, today) : 'year1_2';

  // Gewinn bis heute und SVS-Berechnungsbasis (Gewinn + bezahlte SVS-Beiträge)
  const profitYtd = profitOf(input, current);
  const basisYtd = calculateBeitragsgrundlage(profitYtd, current.svsPaid);
  const months = monthsElapsedInYear(today);
  const projection = projectAnnualProfit({ currentProfit: basisYtd, monthsElapsed: months });
  const revenueProjected = projectAnnualProfit({ currentProfit: current.revenueNet, monthsElapsed: months }).projected;

  // Kleinstunternehmer-Ausnahme gilt nur im GSVG und nur, solange Gewinn und Umsatz unter den Grenzen bleiben
  const exemptRequested = input.exempt && input.businessType === 'gewerbetreibend';
  const exemptionLost =
    exemptRequested &&
    (projection.projected > SVS_2026.registrationThreshold || revenueProjected > SVS_2026.exemptionRevenueLimit);
  const options = { businessType: input.businessType ?? undefined, exempt: exemptRequested && !exemptionLost };

  const contributions = calculateSVSContributions(projection.projected, options);
  const reserve = calculateReserveRecommendation(projection.projected, {
    ...options,
    ...(revenueProjected > 0 && { projectedRevenue: revenueProjected }),
  });
  const reserveOpen = round2(Math.max(0, reserve.totalReserve - current.svsPaid));

  // Jahresrechnung: bisher (YTD) und hochgerechnet (gleicher Faktor für Einnahmen und Ausgaben)
  const factor = months > 0 ? 12 / months : 1;
  const expensesYtd = round2(current.revenueNet - basisYtd);
  const column = (revenue: number, expenses: number, basis: number, svs: number, incomeTax: number | null): BreakdownColumn => {
    const profit = round2(basis - svs);
    const grundfreibetrag = calculateGrundfreibetrag(profit);
    return {
      revenue: round2(revenue),
      expenses: round2(expenses),
      basis: round2(basis),
      svs: round2(svs),
      profit,
      grundfreibetrag,
      taxable: round2(profit - grundfreibetrag),
      incomeTax,
      remaining: incomeTax === null ? null : round2(profit - incomeTax),
    };
  };
  const breakdown = {
    ytd: column(current.revenueNet, expensesYtd, basisYtd, current.svsPaid, null),
    projected: column(revenueProjected, expensesYtd * factor, projection.projected, contributions.total, reserve.incomeTaxAmount),
  };

  // Vorläufige Basis: aus der echten Vorschreibung, sonst aus Phase/Vorjahr geschätzt
  const previousBasis = input.previous ? calculateBeitragsgrundlage(profitOf(input, input.previous), input.previous.svsPaid) : undefined;
  const prescription = input.quarterlyPrescription;
  const provisionalBasis =
    prescription !== null && prescription > 0
      ? basisFromQuarterlyPrescription(prescription)
      : getVorlaeufigeBeitragsgrundlage(phase, previousBasis);
  const quarterlyAmount =
    prescription !== null && prescription > 0 ? prescription : calculateQuarterlyPrescription(phase, previousBasis, options);

  // Keine Nachbemessung bei Ausnahme bzw. Neuen Selbständigen unter der Versicherungsgrenze
  const notInsured = options.exempt || contributions.basisGrundlage === 0;
  const warning = notInsured
    ? { hasWarning: false, estimatedNachzahlung: 0, message: '', urgency: 'info' as const }
    : getNachzahlungsWarning({ phase, projectedProfit: projection.projected, provisionalBasis });

  const alerts: AppAlert[] = getSVSAlerts({
    annualRevenue: current.revenueGross,
    isKleinunternehmer: input.isKleinunternehmer,
    phase,
    quarterlyAmount,
    exemptionLost,
    today,
  });

  return {
    breakdown,
    svsYear,
    phase,
    profitYtd,
    basisYtd,
    projection,
    revenueProjected,
    contributions,
    reserve,
    reserveOpen,
    provisionalBasis,
    // SVS-Jahresbeitrag (inkl. UV) auf die vorläufige bzw. die erwartete Basis – für das Nachzahlungs-Radar
    provisionalSvs: calculateSVSContributions(provisionalBasis, options).total,
    expectedBasis: contributions.basisGrundlage,
    expectedSvs: contributions.total,
    quarterlyAmount,
    prescriptionKnown: prescription !== null && prescription > 0,
    nextDue: getNextSVSDueDate(today),
    warning,
    alerts,
    notInsured,
    exemptionLost,
    thresholds: {
      svs: SVS_2026.registrationThreshold,
      incomeTax: SVS_2026.incomeTaxThreshold,
      kleinunternehmer: SVS_2026.kleinunternehmerThreshold,
    },
  };
}

export type SvsTrackerModel = ReturnType<typeof buildSvsTracker>;
