// Rechenmodell für den SVS-Tracker: führt Gewinn, Hochrechnung, Rücklage, Fälligkeit, Nachzahlung und Alerts zusammen.
import { SVS_2026 } from '@/constants/svs2026';
import type { AppAlert, BusinessType, IndustryType, PauschType, ProfitMethod } from '@/types';
import { round2 } from './money';
import { calculateProfit } from './profit';
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
  const options = { businessType: input.businessType ?? undefined, exempt: input.exempt };

  // Gewinn bis heute und SVS-Berechnungsbasis (Gewinn + bezahlte SVS-Beiträge)
  const profitYtd = profitOf(input, current);
  const basisYtd = calculateBeitragsgrundlage(profitYtd, current.svsPaid);
  const months = monthsElapsedInYear(today);
  const projection = projectAnnualProfit({ currentProfit: basisYtd, monthsElapsed: months });
  const revenueProjected = projectAnnualProfit({ currentProfit: current.revenueNet, monthsElapsed: months }).projected;

  const contributions = calculateSVSContributions(projection.projected, options);
  const reserve = calculateReserveRecommendation(projection.projected, {
    ...options,
    ...(revenueProjected > 0 && { projectedRevenue: revenueProjected }),
  });
  const reserveOpen = round2(Math.max(0, reserve.totalReserve - current.svsPaid));

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
  const notInsured = input.exempt || contributions.basisGrundlage === 0;
  const warning = notInsured
    ? { hasWarning: false, estimatedNachzahlung: 0, message: '', urgency: 'info' as const }
    : getNachzahlungsWarning({ phase, projectedProfit: projection.projected, provisionalBasis });

  const alerts: AppAlert[] = getSVSAlerts({
    annualRevenue: current.revenueGross,
    isKleinunternehmer: input.isKleinunternehmer,
    phase,
    quarterlyAmount,
    today,
  });

  return {
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
    expectedBasis: contributions.basisGrundlage,
    quarterlyAmount,
    prescriptionKnown: prescription !== null && prescription > 0,
    nextDue: getNextSVSDueDate(today),
    warning,
    alerts,
    notInsured,
    thresholds: {
      svs: SVS_2026.registrationThreshold,
      incomeTax: SVS_2026.incomeTaxThreshold,
      kleinunternehmer: SVS_2026.kleinunternehmerThreshold,
    },
  };
}

export type SvsTrackerModel = ReturnType<typeof buildSvsTracker>;
