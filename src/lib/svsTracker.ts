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
  incomeTax: number; // bisher: anteilig mit dem Jahres-Steuersatz
  remaining: number; // Gewinn − Einkommensteuer
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
  /** Arbeitsplatzpauschale fürs ganze laufende Jahr bzw. das Vorjahr */
  arbeitsplatzpauschale?: number;
  arbeitsplatzpauschalePrevious?: number;
  /** Zu versteuerndes Einkommen aus Gehalt/Pension (für die Einkommensteuer) */
  otherIncome?: number;
  current: YearFigures;
  previous: YearFigures | null;
}

/** Anteil des Jahres in Monaten (z. B. 3. Oktober ≈ 9,07). */
export function monthsElapsedInYear(today: Date): number {
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear() + 1, 0, 1);
  return ((today.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 12;
}

function profitOf(input: TrackerInput, y: YearFigures, arbeitsplatzpauschale: number): number {
  return calculateProfit({
    profitMethod: input.profitMethod,
    pauschType: input.pauschType ?? undefined,
    industryType: input.industryType ?? undefined,
    totalRevenue: y.revenueNet,
    totalExpenses: y.deductibleExpenses,
    svsPayments: y.svsPaid,
    arbeitsplatzpauschale,
  }).netProfit;
}

export function buildSvsTracker(input: TrackerInput) {
  const { today, current } = input;
  const reg = input.registrationDate;
  const svsYear = reg ? getSVSYear(reg, today) : 1;
  const phase: SVSPhase = reg ? getSVSPhase(reg, today) : 'year1_2';

  // Gewinn bis heute und SVS-Berechnungsbasis (Gewinn + bezahlte SVS-Beiträge).
  // Die Arbeitsplatzpauschale gilt fürs Jahr – bis heute zählt der anteilige Teil.
  const months = monthsElapsedInYear(today);
  const profitYtd = profitOf(input, current, round2(((input.arbeitsplatzpauschale ?? 0) * months) / 12));
  const basisYtd = calculateBeitragsgrundlage(profitYtd, current.svsPaid);
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
    otherIncome: input.otherIncome ?? 0,
  });
  const reserveOpen = round2(Math.max(0, reserve.totalReserve - current.svsPaid));

  // Jahresrechnung: bisher (YTD) und hochgerechnet (gleicher Faktor für Einnahmen und Ausgaben)
  const factor = months > 0 ? 12 / months : 1;
  const expensesYtd = round2(current.revenueNet - basisYtd);
  const column = (revenue: number, expenses: number, basis: number, svs: number, incomeTax: number): BreakdownColumn => {
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
      remaining: round2(profit - incomeTax),
    };
  };
  const projectedColumn = column(revenueProjected, expensesYtd * factor, projection.projected, contributions.total, reserve.incomeTaxAmount);
  // Einkommensteuer bisher: anteilig mit dem Durchschnittssteuersatz des ganzen Jahres.
  // (Der Stufentarif gilt fürs Jahr – auf den Gewinn bis heute angewendet, wäre die Steuer viel zu niedrig.)
  const averageTaxRate = projectedColumn.profit > 0 ? reserve.incomeTaxAmount / projectedColumn.profit : 0;
  const incomeTaxYtd = round2(Math.max(0, round2(basisYtd - current.svsPaid)) * averageTaxRate);
  const breakdown = {
    ytd: column(current.revenueNet, expensesYtd, basisYtd, current.svsPaid, incomeTaxYtd),
    projected: projectedColumn,
  };

  // Vorläufige Basis: aus der echten Vorschreibung, sonst aus Phase/Vorjahr geschätzt
  const previousBasis = input.previous ? calculateBeitragsgrundlage(profitOf(input, input.previous, input.arbeitsplatzpauschalePrevious ?? 0), input.previous.svsPaid) : undefined;
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
