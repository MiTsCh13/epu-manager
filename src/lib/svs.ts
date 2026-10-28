// SVS-Berechnungslogik (GSVG/FSVG). Alle Werte kommen aus src/constants/svs2026.ts.
//
// Grundprinzip: Die SVS schreibt zunächst vorläufige Beiträge vor. Sobald der
// Einkommensteuerbescheid vorliegt, wird nachbemessen – die Differenz wird nachverrechnet.
// Neugründer zahlen in den ersten 3 Jahren vorläufig nur auf Basis der Mindestbeitragsgrundlage.
// Gewerbetreibende (WKO-Mitglieder): In den ersten 2 Jahren ist die Krankenversicherung endgültig
// auf Mindestbasis (keine KV-Nachbemessung). Bei Neuen Selbständigen wird die KV ab Jahr 1
// nachbemessen (SVS). Die Selbständigenvorsorge wird nie nachbemessen (WKO).
// Endgültige Basis = Einkünfte laut Steuerbescheid (nach Grundfreibetrag)
//                    + im Jahr vorgeschriebene PV- und KV-Beiträge (Hinzurechnung).
import { SVS_2026 } from '@/constants/svs2026';
import type { AlertUrgency, AppAlert, BusinessType } from '@/types';
import { formatEuro, round2 } from './money';
import { calculateGrundfreibetrag } from './profit';
import { calculateAdditionalIncomeTax } from './tax';

export type SVSPhase = 'year1_2' | 'year3' | 'year4plus';

const MIN_BASIS_ANNUAL = round2(SVS_2026.minBasisMonthly * 12);
const MAX_BASIS_ANNUAL = round2(SVS_2026.maxBasisMonthly * 12);
const { health, pension, provision } = SVS_2026.rates;
const TOTAL_RATE = health + pension + provision;

export interface SVSOptions {
  businessType?: BusinessType;
  exempt?: boolean; // Kleinstunternehmer-Ausnahme (nur UV-Beitrag)
}

// ─── Phase ──────────────────────────────────────────────────

/** Kalenderjahr der Pflichtversicherung (Anmeldejahr = Jahr 1). */
export function getSVSYear(registrationDate: Date, today: Date = new Date()): number {
  return Math.max(1, today.getFullYear() - registrationDate.getFullYear() + 1);
}

export function getSVSPhase(registrationDate: Date, today: Date = new Date()): SVSPhase {
  return phaseOfYear(getSVSYear(registrationDate, today));
}

/** Phase eines Versicherungsjahres (Anmeldejahr = 1). */
export function phaseOfYear(year: number): SVSPhase {
  if (year <= 2) return 'year1_2'; // Mindestbeiträge, KV-Nachbemessung nur bei Neuen Selbständigen
  if (year === 3) return 'year3'; // Erste Nachbemessung (für Jahr 1) trifft ein
  return 'year4plus'; // Volle Nachbemessung KV + PV
}

/**
 * Bleibt die KV endgültig beim Mindestbeitrag?
 * Nur für Gewerbetreibende (WKO-Mitglieder) in Jahr 1–2 – Neue Selbständige werden ab Jahr 1 nachbemessen.
 */
export function isKvFixed(phase: SVSPhase, businessType?: BusinessType): boolean {
  return phase === 'year1_2' && businessType !== 'neue_selbstaendige';
}

// ─── Beiträge ───────────────────────────────────────────────

/**
 * Beitragsgrundlage = steuerlicher Gewinn + im Jahr vorgeschriebene SVS-Beiträge (Hinzurechnung).
 * Die SVS-Beiträge mindern zwar den Gewinn, aber nicht die Berechnungsbasis der SVS.
 */
export function calculateBeitragsgrundlage(netProfit: number, prescribedSvsContributions: number): number {
  return round2(netProfit + prescribedSvsContributions);
}

function clampBasis(annualBasis: number): number {
  return Math.min(Math.max(annualBasis, MIN_BASIS_ANNUAL), MAX_BASIS_ANNUAL);
}

/**
 * Jahresbeiträge für eine Beitragsgrundlage (≈ Gewinn vor SVS).
 * Unterhalb der Mindestbasis gilt die Mindestbasis, oberhalb der Höchstbasis wird gedeckelt.
 */
export function calculateSVSContributions(
  annualProfit: number,
  options: SVSOptions = {},
): {
  health: number; // KV-Beitrag
  pension: number; // PV-Beitrag
  provision: number; // Selbständigenvorsorge
  accident: number; // UV-Fixbetrag
  total: number; // Gesamt
  basisGrundlage: number; // Verwendete Beitragsgrundlage
} {
  // Neue Selbständige unter der Versicherungsgrenze sind nicht pflichtversichert
  if (options.businessType === 'neue_selbstaendige' && annualProfit < SVS_2026.registrationThreshold) {
    return { health: 0, pension: 0, provision: 0, accident: 0, total: 0, basisGrundlage: 0 };
  }
  // Kleinstunternehmer-Ausnahme: nur Unfallversicherung
  if (options.exempt) {
    const accident = SVS_2026.accidentFixed;
    return { health: 0, pension: 0, provision: 0, accident, total: accident, basisGrundlage: 0 };
  }

  const basis = clampBasis(annualProfit);
  const h = round2(basis * health);
  const p = round2(basis * pension);
  const s = round2(basis * provision);
  const accident = SVS_2026.accidentFixed;
  return {
    health: h,
    pension: p,
    provision: s,
    accident,
    total: round2(h + p + s + accident),
    basisGrundlage: round2(basis),
  };
}

// ─── Hochrechnung ───────────────────────────────────────────

export function projectAnnualProfit(params: {
  currentProfit: number; // Gewinn YTD
  monthsElapsed: number; // Vergangene Monate im Jahr (Bruchteile erlaubt)
}): {
  projected: number; // Hochgerechneter Jahresgewinn
  low: number; // Konservative Schätzung (×0.85)
  high: number; // Optimistische Schätzung (×1.15)
} {
  const months = Math.min(Math.max(params.monthsElapsed, 0), 12);
  // Ohne vergangene Zeit ist keine Hochrechnung möglich → aktueller Stand
  const projected = months === 0 ? params.currentProfit : (params.currentProfit / months) * 12;
  return {
    projected: round2(projected),
    low: round2(projected * 0.85),
    high: round2(projected * 1.15),
  };
}

// ─── Rücklagen-Empfehlung ───────────────────────────────────

/**
 * Wie viel für SVS + Einkommensteuer des Jahres zurückgelegt werden sollte.
 * `projectedProfit` = hochgerechneter Jahresgewinn vor SVS.
 * Die Einkommensteuer ist vereinfacht: Gewinn − SVS − Grundfreibetrag, Tarif 2026, ohne Absetzbeträge.
 * Andere Einkünfte (Gehalt/Pension) erhöhen den Steuersatz: gerechnet wird nur die zusätzliche Steuer.
 */
export function calculateReserveRecommendation(
  projectedProfit: number,
  options: SVSOptions & { projectedRevenue?: number; otherIncome?: number } = {},
): {
  svsAmount: number; // Zurücklegen für SVS
  incomeTaxAmount: number; // Zurücklegen für Einkommensteuer (vereinfacht)
  totalReserve: number; // Gesamt empfohlene Rücklage
  perInvoiceRate: number; // Anteil pro Einnahme (0–1, auf ganze Prozent aufgerundet)
} {
  const svsAmount = calculateSVSContributions(projectedProfit, options).total;
  const profitAfterSvs = projectedProfit - svsAmount;
  const taxable = profitAfterSvs - calculateGrundfreibetrag(profitAfterSvs);
  const incomeTaxAmount = calculateAdditionalIncomeTax(taxable, options.otherIncome ?? 0);
  const totalReserve = round2(svsAmount + incomeTaxAmount);

  // Bezug: Einnahmen (falls bekannt), sonst Gewinn – beides auf ganze Prozent aufgerundet
  const base = options.projectedRevenue ?? projectedProfit;
  const perInvoiceRate = base > 0 ? Math.min(Math.ceil((totalReserve / base) * 100) / 100, 1) : 0;

  return { svsAmount, incomeTaxAmount, totalReserve, perInvoiceRate };
}

// ─── Nachzahlung ────────────────────────────────────────────

/**
 * Vorläufige Beitragsgrundlage, nach der die SVS aktuell vorschreibt.
 * Neugründer (Jahr 1–3): Mindestbasis. Danach vereinfacht: Gewinn des Vorjahres
 * (tatsächlich: letzter Einkommensteuerbescheid, aufgewertet).
 */
export function getVorlaeufigeBeitragsgrundlage(phase: SVSPhase, previousYearProfit?: number): number {
  if (phase !== 'year4plus' || previousYearProfit === undefined) return MIN_BASIS_ANNUAL;
  return round2(clampBasis(previousYearProfit));
}

/**
 * Vorläufige Beitragsgrundlage aus dem Betrag der aktuellen SVS-Quartalsvorschreibung zurückrechnen
 * (Quartal × 4 − UV) / Beitragssatz. Genauer als jede Schätzung, weil es die echte Vorschreibung ist.
 */
export function basisFromQuarterlyPrescription(quarterlyAmount: number): number {
  const annual = Math.max(quarterlyAmount * 4 - SVS_2026.accidentFixed, 0);
  return round2(clampBasis(annual / TOTAL_RATE));
}

/** Vorläufige Quartalsvorschreibung (inkl. UV). */
export function calculateQuarterlyPrescription(
  phase: SVSPhase,
  previousYearProfit?: number,
  options: SVSOptions = {},
): number {
  const basis = getVorlaeufigeBeitragsgrundlage(phase, previousYearProfit);
  return round2(calculateSVSContributions(basis, options).total / 4);
}

export function getNachzahlungsWarning(params: {
  phase: SVSPhase;
  projectedProfit: number;
  previousYearProfit?: number; // Gewinn aus Vorjahr (für Nachbemessungs-Schätzung)
  provisionalBasis?: number; // bekannte vorläufige Basis (z. B. aus der Vorschreibung) – hat Vorrang
  businessType?: BusinessType;
}): {
  hasWarning: boolean;
  estimatedNachzahlung: number;
  message: string;
  urgency: AlertUrgency;
} {
  const { phase, projectedProfit } = params;
  const finalBasis = clampBasis(projectedProfit);
  const provisionalBasis = params.provisionalBasis ?? getVorlaeufigeBeitragsgrundlage(phase, params.previousYearProfit);
  // Selbständigenvorsorge wird nie nachbemessen; Gewerbetreibende Jahr 1–2: auch KV bleibt auf Mindestbasis
  const rate = isKvFixed(phase, params.businessType) ? pension : pension + health;
  const estimatedNachzahlung = round2(Math.max(0, finalBasis - provisionalBasis) * rate);

  if (estimatedNachzahlung === 0) {
    return {
      hasWarning: false,
      estimatedNachzahlung: 0,
      message: 'Nach aktuellem Stand ist keine SVS-Nachzahlung für dieses Jahr zu erwarten.',
      urgency: 'info',
    };
  }

  const amount = formatEuro(estimatedNachzahlung, true);
  const profit = formatEuro(projectedProfit, true);
  const basis = formatEuro(finalBasis, true);
  const base = `Dein Jahresgewinn liegt voraussichtlich bei ${profit}. Die SVS wird deinen Beitrag auf Basis ${basis} nachbemessen. Erwartete Nachzahlung: ${amount}.`;

  const urgency: AlertUrgency =
    estimatedNachzahlung >= SVS_2026.nachzahlungCriticalAmount ? 'critical' : phase === 'year1_2' ? 'info' : 'warning';
  const timing =
    phase === 'year1_2'
      ? ' Die Nachzahlung kommt erst, wenn dein Einkommensteuerbescheid vorliegt – meist 2 bis 3 Jahre später. Leg das Geld jetzt schon zur Seite.'
      : ' Stelle sicher, dass du genug zurückgelegt hast.';

  return { hasWarning: true, estimatedNachzahlung, message: base + timing, urgency };
}

// ─── Vorläufig vs. endgültig (ein Kalenderjahr) ─────────────

export interface SvsAmounts {
  pv: number;
  kv: number;
  sv: number; // Selbständigenvorsorge
  uv: number; // Unfallversicherung
  total: number;
}

export interface SvsYearResult {
  provisional: SvsAmounts; // vorläufig verrechnet (Quartalsvorschreibungen)
  final: SvsAmounts; // endgültig nach dem Steuerbescheid
  hinzurechnung: number; // wieder dazugezählte PV- und KV-Beiträge
  basisRaw: number; // Einkünfte + Hinzurechnung, vor Mindest-/Höchstgrenze
  basis: number; // endgültige Beitragsgrundlage (Jahr)
  minBasis: number;
  maxBasis: number;
  difference: number; // > 0 Nachzahlung, < 0 Gutschrift
  notInsured: boolean; // Neue Selbständige unter der Versicherungsgrenze bzw. Ausnahme
  kvFixed: boolean; // KV bleibt beim Mindestbeitrag (Gewerbetreibende Jahr 1–2)
}

const amounts = (pv: number, kv: number, sv: number, uv: number): SvsAmounts => ({
  pv: round2(pv),
  kv: round2(kv),
  sv: round2(sv),
  uv: round2(uv),
  total: round2(pv + kv + sv + uv),
});

/**
 * SVS eines Kalenderjahres: vorläufig verrechnet vs. endgültig nach dem Steuerbescheid.
 * - `einkuenfte`: Einkünfte laut Steuerbescheid (Gewinn nach SVS und Grundfreibetrag)
 * - `provisionalBasis`: vorläufige Beitragsgrundlage fürs ganze Jahr (bzw. die versicherten Monate)
 * - `extraPrescribed`: im Jahr zusätzlich vorgeschriebene Nachzahlungen für Vorjahre (zählen zur Hinzurechnung)
 * - `months`: versicherte Monate im Jahr (Anmeldejahr anteilig)
 * - `svsYear`: Kalenderjahr der Versicherung (Anmeldejahr = 1) – Gewerbetreibende: in Jahr 1–2 bleibt die KV beim Mindestbeitrag
 */
export function calculateSvsYear(params: {
  einkuenfte: number;
  provisionalBasis: number;
  extraPrescribed?: number;
  months?: number;
  svsYear: number;
  options?: SVSOptions;
}): SvsYearResult {
  const months = params.months ?? 12;
  const minBasis = round2(SVS_2026.minBasisMonthly * months);
  const maxBasis = round2(SVS_2026.maxBasisMonthly * months);
  const uv = (SVS_2026.accidentFixed * months) / 12;
  const B0 = Math.min(Math.max(params.provisionalBasis, minBasis), maxBasis);
  const kvFixed = isKvFixed(phaseOfYear(params.svsYear), params.options?.businessType);

  if (params.options?.exempt) {
    const onlyUv = amounts(0, 0, 0, uv);
    return { provisional: onlyUv, final: onlyUv, hinzurechnung: 0, basisRaw: 0, basis: 0, minBasis, maxBasis, difference: 0, notInsured: true, kvFixed };
  }

  const provisional = amounts(B0 * pension, B0 * health, B0 * provision, uv);
  const hinzurechnung = round2(provisional.pv + provisional.kv + (params.extraPrescribed ?? 0));
  const basisRaw = round2(params.einkuenfte + hinzurechnung);
  const notInsured =
    params.options?.businessType === 'neue_selbstaendige' && basisRaw < (SVS_2026.registrationThreshold * months) / 12;
  const basis = round2(Math.min(Math.max(basisRaw, minBasis), maxBasis));
  const final = notInsured
    ? amounts(0, 0, 0, 0)
    : amounts(basis * pension, kvFixed ? provisional.kv : basis * health, provisional.sv, uv);

  return {
    provisional,
    final,
    hinzurechnung,
    basisRaw,
    basis: notInsured ? 0 : basis,
    minBasis,
    maxBasis,
    difference: round2(final.total - provisional.total),
    notInsured,
    kvFixed,
  };
}

// ─── Fälligkeiten & Alerts ──────────────────────────────────

/** Nächste Quartalsfälligkeit (letzter Tag von Feb/Mai/Aug/Nov) ab `today` (inklusive). */
export function getNextSVSDueDate(today: Date = new Date()): Date {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const year of [start.getFullYear(), start.getFullYear() + 1]) {
    for (const month of SVS_2026.quarterlyDueMonths) {
      const due = new Date(year, month, 0); // Tag 0 des Folgemonats = letzter Tag des Monats
      if (due >= start) return due;
    }
  }
  /* v8 ignore next */
  throw new Error('Keine SVS-Fälligkeit gefunden');
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getSVSAlerts(params: {
  annualRevenue: number;
  isKleinunternehmer: boolean;
  phase: SVSPhase;
  quarterlyAmount: number;
  /** Ausnahme beantragt, aber Gewinn oder Umsatz liegen voraussichtlich über der Grenze */
  exemptionLost?: boolean;
  today?: Date;
}): AppAlert[] {
  const alerts: AppAlert[] = [];
  const today = params.today ?? new Date();

  if (params.exemptionLost) {
    alerts.push({
      id: 'exemption-lost',
      urgency: 'critical',
      message: `Du bist von der SVS-Pflichtversicherung ausgenommen – dein Gewinn (über ${formatEuro(SVS_2026.registrationThreshold, true)}) oder Umsatz (über ${formatEuro(SVS_2026.exemptionRevenueLimit, true)}) liegt aber voraussichtlich über der Grenze. Dann fällt die Ausnahme für das ganze Jahr weg und die SVS verrechnet die vollen Beiträge nach. Klaro rechnet deshalb mit vollen Beiträgen.`,
    });
  }

  if (params.isKleinunternehmer) {
    if (params.annualRevenue > SVS_2026.kleinunternehmerToleranceLimit) {
      alerts.push({
        id: 'ku-exceeded',
        urgency: 'critical',
        message: `Dein Umsatz liegt über ${formatEuro(SVS_2026.kleinunternehmerToleranceLimit, true)} (Kleinunternehmergrenze plus 10 % Toleranz). Ab der Rechnung, mit der du diese Grenze überschritten hast, musst du Umsatzsteuer verrechnen – auch für den Rest des Jahres. Diesen Wechsel mitten im Jahr bildet Klaro nicht ab, es rechnet weiter das ganze Jahr als Kleinunternehmer. Wende dich bitte an deine Steuerberatung: Du brauchst eine UID-Nummer, gibst ab dann Umsatzsteuer-Voranmeldungen ab, und die Rechnung, mit der du die Grenze überschritten hast, muss eventuell korrigiert werden.`,
      });
    } else if (params.annualRevenue > SVS_2026.kleinunternehmerThreshold) {
      alerts.push({
        id: 'ku-tolerance',
        urgency: 'warning',
        message: `Du hast die Kleinunternehmergrenze (${formatEuro(SVS_2026.kleinunternehmerThreshold, true)}) überschritten, liegst aber noch in der Toleranz von 10 %. Heuer bleibst du Kleinunternehmer, solange dein Umsatz nicht über ${formatEuro(SVS_2026.kleinunternehmerToleranceLimit, true)} steigt. Ab nächstem Jahr musst du Umsatzsteuer verrechnen – stell das in den Einstellungen bei „Ab ${today.getFullYear() + 1}“ um.`,
      });
    } else if (params.annualRevenue > SVS_2026.kleinunternehmerWarningThreshold) {
      alerts.push({
        id: 'ku-approaching',
        urgency: 'warning',
        message: `Du näherst dich der Kleinunternehmergrenze (${formatEuro(SVS_2026.kleinunternehmerThreshold, true)}). Überschreitest du sie um höchstens 10 % (bis ${formatEuro(SVS_2026.kleinunternehmerToleranceLimit, true)}), bleibst du heuer noch Kleinunternehmer – ab nächstem Jahr müsstest du dann Umsatzsteuer verrechnen.`,
      });
    }
  }

  if (params.phase === 'year3') {
    alerts.push({
      id: 'phase-year3',
      urgency: 'warning',
      message:
        'Dieses Jahr kommt deine erste PV-Nachbemessung. Stelle sicher, dass du genug zurückgelegt hast.',
    });
  } else if (params.phase === 'year4plus') {
    alerts.push({
      id: 'phase-year4plus',
      urgency: 'warning',
      message: 'Du bist in der vollen Nachbemessungsphase. Prüfe deinen Rücklagentopf.',
    });
  }

  const due = getNextSVSDueDate(today);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilDue = Math.round((due.getTime() - start.getTime()) / DAY_MS);
  if (daysUntilDue <= SVS_2026.dueReminderDays) {
    alerts.push({
      id: 'svs-due',
      urgency: 'info',
      message: `Deine SVS-Quartalsvorschreibung (ca. ${formatEuro(params.quarterlyAmount, true)}) ist am ${due.toLocaleDateString('de-AT')} fällig.`,
    });
  }

  return alerts;
}
