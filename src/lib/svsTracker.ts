// Rechenmodell für „Gewinn & Rücklagen“:
// 1 Jahresrechnung (Umsatz → Einkünfte) → 2 SVS (vorläufig vs. endgültig) → 3 Einkommensteuer (inkl. Vorauszahlungen)
// → 4 Rücklage (was noch offen ist, getrennt nach SVS und Finanzamt) → 5 Zeitplan.
import { SVS_2026 } from '@/constants/svs2026';
import { EST_PREPAYMENT_DUE_DAY, EST_PREPAYMENT_DUE_MONTHS, TAX_RETURN_DEADLINE } from '@/constants/tax2026';
import type { AppAlert, BusinessType, IndustryType, PauschType, ProfitMethod } from '@/types';
import { round2 } from './money';
import { pauschalExtrasFor } from './expenses';
import { projectExpenseTotals, type RecurringYear } from './recurring';
import { calculateGrundfreibetrag, calculatePauschaleExpenses, getPauschRate } from './profit';
import {
  basisFromQuarterlyPrescription,
  calculateSvsYear,
  getSVSAlerts,
  getSVSPhase,
  getSVSYear,
  getVorlaeufigeBeitragsgrundlage,
  projectAnnualProfit,
  type SVSOptions,
  type SVSPhase,
  type SvsYearResult,
} from './svs';
import { calculateAdditionalIncomeTax } from './tax';

export interface YearFigures {
  revenueNet: number; // bezahlte Rechnungen netto
  revenueGross: number; // bezahlte Rechnungen brutto (für die Kleinunternehmergrenze)
  deductibleExpenses: number; // Einnahmen-Ausgaben-Rechnung: alle absetzbaren Ausgaben
  pauschalExtras: { ku: number; basis: number }; // Pauschalierung: zusätzlich absetzbare Ausgaben (§ 17 EStG)
  reimbursedTravel: number; // weiterverrechnete Reisekosten (mindern bei Pauschalierung die Basis)
  depreciation: number; // Abschreibung der Anlagen im ganzen Jahr (KZ 9130)
  svsPaid: number; // erfasste SVS-Zahlungen im Jahr
  /** Wiederkehrende Ausgaben: zählen in der Hochrechnung genau statt hochgerechnet */
  recurring?: RecurringYear | null;
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
  quarterlyPrescription: number | null; // SVS-Vorschreibung pro Quartal laut Brief
  /** Arbeitsplatzpauschale fürs ganze laufende Jahr bzw. das Vorjahr */
  arbeitsplatzpauschale?: number;
  arbeitsplatzpauschalePrevious?: number;
  /** Zu versteuerndes Einkommen aus Gehalt/Pension (für die Einkommensteuer) */
  otherIncome?: number;
  /** Einkommensteuer-Vorauszahlung pro Quartal laut Bescheid */
  estPrepaymentQuarterly?: number | null;
  /** Vom Nutzer geschätzter Jahresumsatz (netto) – ersetzt die Hochrechnung */
  revenueEstimate?: number | null;
  /** Steuerbescheid und SVS-Nachbemessung erledigt bis einschließlich dieses Jahres */
  assessedThroughYear?: number | null;
  current: YearFigures;
  previous: YearFigures | null;
  /** Steuer-Einstellungen des Vorjahres, falls sie sich geändert haben (sonst gelten die oben) */
  previousSettings?: PreviousYearSettings;
}

export interface PreviousYearSettings {
  exempt: boolean;
  profitMethod: ProfitMethod;
  pauschType: PauschType | null;
  industryType: IndustryType | null;
  otherIncome?: number;
}

/** Eine Spalte der Jahresrechnung: Umsatz − Ausgaben − Abschreibung − Arbeitsplatzpauschale − SVS − Grundfreibetrag = Einkünfte. */
export interface YearColumn {
  revenue: number;
  expenses: number; // absetzbar bzw. pauschal
  depreciation: number; // Abschreibung der Anlagen (nur Einnahmen-Ausgaben-Rechnung)
  arbeitsplatzpauschale: number;
  svs: number; // im Jahr bezahlt (steuerlich zählt die Zahlung)
  gewinn: number;
  grundfreibetrag: number;
  einkuenfte: number; // Einkünfte aus Gewerbebetrieb bzw. selbständiger Arbeit
  incomeTax: number; // bis heute: anteilig mit dem Jahres-Durchschnittssteuersatz
}

export type Payee = 'svs' | 'finanzamt';

export interface ReserveItem {
  id: string;
  payee: Payee;
  label: string;
  note: string;
  amount: number; // negativ = Gutschrift
}

export type TimelineStatus = 'paid' | 'next' | 'open' | 'estimate' | 'info';

export interface TimelineEvent {
  id: string;
  payee: Payee | null;
  group: string; // Überschrift, z. B. „2026“, „Offen aus 2025“
  date: Date | null; // konkretes Fälligkeitsdatum, falls bekannt
  dateLabel: string;
  title: string;
  amount: number | null;
  status: TimelineStatus;
  note: string;
}

const DAY = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (d: Date) => d.toLocaleDateString('de-AT');

/** Anteil des Jahres in Monaten (z. B. 3. Oktober ≈ 9,07). */
export function monthsElapsedInYear(today: Date): number {
  // Mit der Uhrzeit laut Kalender rechnen (als wäre sie UTC) – sonst kürzt die Sommerzeit das Jahr je nach
  // Zeitzone um eine Stunde und das Ergebnis hinge davon ab, wo der Code läuft (Browser in Wien vs. Server in UTC)
  const y = today.getFullYear();
  const now = Date.UTC(y, today.getMonth(), today.getDate(), today.getHours(), today.getMinutes(), today.getSeconds(), today.getMilliseconds());
  return ((now - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1))) * 12;
}

/** Versicherte Monate im Kalenderjahr (Anmeldemonat zählt voll). */
export function insuredMonths(registrationDate: Date | null, year: number): number {
  if (!registrationDate || registrationDate.getFullYear() < year) return 12;
  if (registrationDate.getFullYear() > year) return 0;
  return 12 - registrationDate.getMonth();
}

/** SVS-Fälligkeiten eines Jahres (letzter Tag im Feb/Mai/Aug/Nov), ab der Anmeldung. */
export function svsDueDates(year: number, registrationDate: Date | null): Date[] {
  return SVS_2026.quarterlyDueMonths
    .map((m) => new Date(year, m, 0))
    .filter((d) => !registrationDate || d >= DAY(registrationDate));
}

/** Fälligkeiten der Einkommensteuer-Vorauszahlungen eines Jahres. */
export function estPrepaymentDueDates(year: number): Date[] {
  return EST_PREPAYMENT_DUE_MONTHS.map((m) => new Date(year, m - 1, EST_PREPAYMENT_DUE_DAY));
}

function column(
  revenue: number,
  expenses: number,
  depreciation: number,
  arbeitsplatzpauschale: number,
  svs: number,
): Omit<YearColumn, 'incomeTax'> {
  const gewinn = round2(revenue - expenses - depreciation - arbeitsplatzpauschale - svs);
  const grundfreibetrag = calculateGrundfreibetrag(gewinn);
  return {
    revenue: round2(revenue),
    expenses: round2(expenses),
    depreciation: round2(depreciation),
    arbeitsplatzpauschale: round2(arbeitsplatzpauschale),
    svs: round2(svs),
    gewinn,
    grundfreibetrag,
    einkuenfte: round2(gewinn - grundfreibetrag),
  };
}

export function buildSvsTracker(input: TrackerInput) {
  const { today, current } = input;
  const year = today.getFullYear();
  const todayStart = DAY(today);
  const reg = input.registrationDate;
  const svsYear = reg ? getSVSYear(reg, today) : 1;
  const phase: SVSPhase = reg ? getSVSPhase(reg, today) : 'year1_2';
  const months = monthsElapsedInYear(today);
  const insured = insuredMonths(reg, year);
  const otherIncome = input.otherIncome ?? 0;
  const app = input.arbeitsplatzpauschale ?? 0;
  const prevSettings: PreviousYearSettings = input.previousSettings ?? {
    exempt: input.exempt,
    profitMethod: input.profitMethod,
    pauschType: input.pauschType,
    industryType: input.industryType,
    otherIncome,
  };
  const rateOf = (s: Pick<PreviousYearSettings, 'profitMethod' | 'pauschType' | 'industryType'>) =>
    s.profitMethod === 'pauschal' ? getPauschRate(s.pauschType ?? 'ku', s.industryType ?? undefined) : null;
  const pauschRate = rateOf(input);
  const prevPauschRate = rateOf(prevSettings);
  // Pauschalierung: Satz × Umsatz (ohne weiterverrechnete Reisekosten) + zusätzlich erlaubte Ausgaben
  const expensesWith = (
    rate: number | null,
    pauschType: PauschType | null,
    revenue: number,
    figures: Pick<YearFigures, 'deductibleExpenses' | 'pauschalExtras' | 'reimbursedTravel'>,
  ) =>
    rate !== null
      ? round2(calculatePauschaleExpenses(revenue, rate, figures.reimbursedTravel) + pauschalExtrasFor(figures, pauschType))
      : round2(figures.deductibleExpenses);
  const expensesFor = (revenue: number, figures: Pick<YearFigures, 'deductibleExpenses' | 'pauschalExtras' | 'reimbursedTravel'>) =>
    expensesWith(pauschRate, input.pauschType, revenue, figures);
  // Abschreibung steht fürs ganze Jahr fest (keine Hochrechnung); bei Pauschalierung im Pauschalsatz enthalten
  const depreciationFor = (figures: YearFigures, rate: number | null = pauschRate) => (rate !== null ? 0 : figures.depreciation);
  const depreciationFull = depreciationFor(current);

  // ─── Umsatz bis Jahresende ───
  const revenueProjected = projectAnnualProfit({ currentProfit: current.revenueNet, monthsElapsed: months }).projected;
  const revenueEstimated = input.revenueEstimate != null;
  const revenueExpected = revenueEstimated ? round2(input.revenueEstimate!) : revenueProjected;
  const factor = months > 0 ? 12 / months : 1;
  // Einmaliges hochrechnen, wiederkehrende Ausgaben genau zählen (gebucht + was bis Jahresende noch kommt)
  const projectedTotals = projectExpenseTotals(
    { deductible: current.deductibleExpenses, pauschalExtras: current.pauschalExtras, reimbursedTravel: current.reimbursedTravel },
    current.recurring,
    factor,
  );
  const expensesExpected = expensesFor(revenueExpected, { ...projectedTotals, deductibleExpenses: projectedTotals.deductible });

  // ─── Vorjahr (für die vorläufige Basis ab Jahr 4 und für offene Beträge) ───
  const prevYear = year - 1;
  const prevSvsYear = svsYear - 1;
  const hasPrevious = !!input.previous && !!reg && reg.getFullYear() <= prevYear;
  const prevColumn = hasPrevious
    ? column(
        input.previous!.revenueNet,
        expensesWith(prevPauschRate, prevSettings.pauschType, input.previous!.revenueNet, input.previous!),
        depreciationFor(input.previous!, prevPauschRate),
        input.arbeitsplatzpauschalePrevious ?? 0,
        input.previous!.svsPaid,
      )
    : null;

  // ─── Kleinstunternehmer-Ausnahme: nur GSVG und nur unter den Grenzen ───
  const exemptRequested = input.exempt && input.businessType === 'gewerbetreibend';
  const exemptionLost =
    exemptRequested &&
    (revenueExpected - expensesExpected - depreciationFull - app > SVS_2026.registrationThreshold || revenueExpected > SVS_2026.exemptionRevenueLimit);
  const options: SVSOptions = { businessType: input.businessType ?? undefined, exempt: exemptRequested && !exemptionLost };

  // ─── Vorläufige SVS (Quartalsvorschreibungen) ───
  const prescription = input.quarterlyPrescription !== null && input.quarterlyPrescription > 0 ? input.quarterlyPrescription : null;
  const previousBasis = prevColumn ? round2(prevColumn.einkuenfte + prevColumn.svs) : undefined;
  const provisionalBasisAnnual = prescription
    ? basisFromQuarterlyPrescription(prescription)
    : getVorlaeufigeBeitragsgrundlage(phase, previousBasis);
  const provisionalReason: 'prescription' | 'minimum' | 'previous' = prescription
    ? 'prescription'
    : phase === 'year4plus' && previousBasis !== undefined
      ? 'previous'
      : 'minimum';
  const provisionalBasis = round2((provisionalBasisAnnual * insured) / 12);
  const dueDates = svsDueDates(year, reg);
  const provisionalOnly = calculateSvsYear({ einkuenfte: 0, provisionalBasis, months: insured, svsYear, options });
  const quarterlyAmount = prescription ?? (dueDates.length ? round2(provisionalOnly.provisional.total / dueDates.length) : 0);
  const quartersDue = dueDates.filter((d) => d < todayStart).length;
  const quartersOpen = dueDates.length - quartersDue;

  // SVS, die im Jahr bezahlt wird: erfasste Zahlungen, mindestens aber die fälligen Quartale (falls nicht erfasst)
  const dueSoFar = round2(quartersDue * quarterlyAmount);
  const svsPaidYtd = round2(Math.max(current.svsPaid, dueSoFar));
  const svsUnrecorded = round2(Math.max(0, dueSoFar - current.svsPaid));
  const extraPaid = round2(Math.max(0, current.svsPaid - dueSoFar)); // Nachzahlungen für Vorjahre
  const svsPaidFull = round2(svsPaidYtd + quartersOpen * quarterlyAmount);

  // ─── 1 Jahresrechnung ───
  const fullBase = column(revenueExpected, expensesExpected, depreciationFull, app, svsPaidFull);
  const incomeTaxFull = calculateAdditionalIncomeTax(fullBase.einkuenfte, otherIncome);
  const averageTaxRate = fullBase.einkuenfte > 0 ? incomeTaxFull / fullBase.einkuenfte : 0;
  // Bis heute: Abschreibung und Arbeitsplatzpauschale anteilig nach Monaten
  const ytdShare = Math.min(months, 12) / 12;
  const ytdBase = column(
    current.revenueNet,
    expensesFor(current.revenueNet, current),
    round2(depreciationFull * ytdShare),
    round2(app * ytdShare),
    svsPaidYtd,
  );
  const full: YearColumn = { ...fullBase, incomeTax: incomeTaxFull };
  const ytd: YearColumn = { ...ytdBase, incomeTax: round2(Math.max(0, ytdBase.einkuenfte) * averageTaxRate) };

  // ─── 2 SVS ───
  const svs: SvsYearResult = calculateSvsYear({
    einkuenfte: full.einkuenfte,
    provisionalBasis,
    extraPrescribed: extraPaid,
    months: insured,
    svsYear,
    options,
  });

  // ─── 3 Einkommensteuer ───
  const prepaymentQuarterly = input.estPrepaymentQuarterly && input.estPrepaymentQuarterly > 0 ? input.estPrepaymentQuarterly : 0;
  const prepaymentDates = estPrepaymentDueDates(year);
  const prepaymentTotal = round2(prepaymentQuarterly * prepaymentDates.length);
  const prepaymentPaid = round2(prepaymentQuarterly * prepaymentDates.filter((d) => d < todayStart).length);
  const incomeTax = {
    total: incomeTaxFull,
    prepaymentQuarterly,
    prepaymentTotal,
    prepaymentPaid,
    open: round2(incomeTaxFull - prepaymentTotal),
  };

  // ─── Offen aus dem Vorjahr (bis der Steuerbescheid als erledigt markiert ist) ───
  const previousOpen = hasPrevious && (input.assessedThroughYear ?? 0) < prevYear;
  const previous = previousOpen
    ? (() => {
        const col = prevColumn!;
        // Vorläufige Basis des Vorjahres kennt Klaro nur in der Gründungsphase sicher (Mindestbasis)
        const prevMonths = insuredMonths(reg, prevYear);
        const svsResult =
          prevSvsYear <= 3
            ? calculateSvsYear({
                einkuenfte: col.einkuenfte,
                provisionalBasis: SVS_2026.minBasisMonthly * prevMonths,
                months: prevMonths,
                svsYear: prevSvsYear,
                options: { businessType: options.businessType, exempt: prevSettings.exempt && input.businessType === 'gewerbetreibend' },
              })
            : null;
        // Wer Vorauszahlungen zahlt, hat die Vorjahressteuer meist schon großteils vorausbezahlt
        const tax = prepaymentQuarterly > 0 ? null : calculateAdditionalIncomeTax(col.einkuenfte, prevSettings.otherIncome ?? 0);
        return { year: prevYear, column: col, svs: svsResult, incomeTax: tax };
      })()
    : null;

  // ─── 4 Rücklage ───
  const items: ReserveItem[] = [];
  if (quartersOpen > 0) {
    const next = dueDates[quartersDue]!; // quartersOpen > 0
    items.push({
      id: 'svs-quarters',
      payee: 'svs',
      label: quartersOpen === 1 ? `${dueDates.length === 4 ? '4.' : 'Letztes'} Quartal ${year}` : `Restliche ${quartersOpen} Quartale ${year}`,
      note: `nächste fällig am ${fmt(next)}`,
      amount: round2(quartersOpen * quarterlyAmount),
    });
  }
  if (previous?.svs && Math.abs(previous.svs.difference) >= 1) {
    items.push({
      id: 'svs-previous',
      payee: 'svs',
      label: previous.svs.difference > 0 ? `Nachzahlung ${prevYear}` : `Gutschrift ${prevYear}`,
      note: `nach deinem Steuerbescheid ${prevYear}`,
      amount: previous.svs.difference,
    });
  }
  if (!svs.notInsured && Math.abs(svs.difference) >= 1) {
    items.push({
      id: 'svs-current',
      payee: 'svs',
      label: svs.difference > 0 ? `Nachzahlung ${year}` : `Gutschrift ${year}`,
      note: `nach deinem Steuerbescheid ${year}`,
      amount: svs.difference,
    });
  }
  const prepaymentsOpen = round2(prepaymentTotal - prepaymentPaid);
  if (prepaymentsOpen > 0) {
    items.push({
      id: 'est-prepayments',
      payee: 'finanzamt',
      label: `Vorauszahlungen ${year}`,
      note: `noch ${Math.round(prepaymentsOpen / prepaymentQuarterly)} × ${prepaymentQuarterly.toLocaleString('de-AT')} €`,
      amount: prepaymentsOpen,
    });
  }
  if (previous?.incomeTax && previous.incomeTax >= 1) {
    items.push({ id: 'est-previous', payee: 'finanzamt', label: `Einkommensteuer ${prevYear}`, note: `nach deinem Steuerbescheid ${prevYear}`, amount: previous.incomeTax });
  }
  items.push({
    id: 'est-current',
    payee: 'finanzamt',
    label: `Einkommensteuer ${year}`,
    note: prepaymentTotal > 0 ? 'Rest nach Vorauszahlungen' : `nach deinem Steuerbescheid ${year}`,
    amount: incomeTax.open,
  });
  const sumOf = (payee: Payee) => round2(items.filter((i) => i.payee === payee).reduce((s, i) => s + i.amount, 0));
  const reserve = { items, svs: sumOf('svs'), finanzamt: sumOf('finanzamt'), total: round2(sumOf('svs') + sumOf('finanzamt')) };

  // Was nach SVS und Steuer bleibt – nur mit echten Ausgaben aussagekräftig (nicht bei Pauschalierung)
  const remaining = pauschRate === null ? round2(full.revenue - full.expenses - svs.final.total - incomeTaxFull) : null;

  // ─── 5 Zeitplan ───
  const events: TimelineEvent[] = [];
  const g = String(year);
  dueDates.forEach((d, i) =>
    events.push({
      id: `svs-q${i}`,
      payee: 'svs',
      group: g,
      date: d,
      dateLabel: fmt(d),
      title: `SVS-Vorschreibung ${i + 1}. Quartal`,
      amount: quarterlyAmount,
      status: d < todayStart ? 'paid' : 'open',
      note: '',
    }),
  );
  if (prepaymentQuarterly > 0) {
    prepaymentDates.forEach((d, i) =>
      events.push({
        id: `est-q${i}`,
        payee: 'finanzamt',
        group: g,
        date: d,
        dateLabel: fmt(d),
        title: `Einkommensteuer-Vorauszahlung ${i + 1}. Quartal`,
        amount: prepaymentQuarterly,
        status: d < todayStart ? 'paid' : 'open',
        note: '',
      }),
    );
  }
  // innerhalb des Jahres nach Datum sortieren und den nächsten offenen Termin markieren
  events.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  const nextOpen = events.find((e) => e.status === 'open');
  if (nextOpen) nextOpen.status = 'next';

  if (previous) {
    const gp = `Offen aus ${prevYear}`;
    events.push({
      id: 'prev-assessment',
      payee: 'finanzamt',
      group: gp,
      date: null,
      dateLabel: 'demnächst',
      title: `Steuerbescheid ${prevYear}`,
      amount: null,
      status: 'info',
      note: `Kommt nach deiner Steuererklärung ${prevYear}. Danach meldet das Finanzamt deine Einkünfte automatisch an die SVS.`,
    });
    if (previous.incomeTax && previous.incomeTax >= 1) {
      events.push({ id: 'prev-est', payee: 'finanzamt', group: gp, date: null, dateLabel: '1 Monat danach', title: `Einkommensteuer ${prevYear}`, amount: previous.incomeTax, status: 'estimate', note: 'Fällig einen Monat nach dem Bescheid.' });
    }
    if (previous.svs && Math.abs(previous.svs.difference) >= 1) {
      events.push({
        id: 'prev-svs',
        payee: 'svs',
        group: gp,
        date: null,
        dateLabel: 'danach',
        title: previous.svs.difference > 0 ? `SVS-Nachzahlung ${prevYear}` : `SVS-Gutschrift ${prevYear}`,
        amount: previous.svs.difference,
        status: 'estimate',
        note: `Kommt mit der nächsten Quartalsvorschreibung nach dem Bescheid.${prevSvsYear <= 3 ? ' In den ersten drei Jahren kannst du sie auf Antrag in Raten zahlen.' : ''}`,
      });
    }
  }

  const gn = String(year + 1);
  events.push({
    id: 'tax-return',
    payee: 'finanzamt',
    group: gn,
    date: new Date(year + 1, TAX_RETURN_DEADLINE.month - 1, TAX_RETURN_DEADLINE.day),
    dateLabel: fmt(new Date(year + 1, TAX_RETURN_DEADLINE.month - 1, TAX_RETURN_DEADLINE.day)),
    title: `Steuererklärung ${year} abgeben`,
    amount: null,
    status: 'info',
    note: 'Frist über FinanzOnline. Mit Steuerberatung gilt meist eine längere Frist.',
  });
  events.push({
    id: 'est-current',
    payee: 'finanzamt',
    group: gn,
    date: null,
    dateLabel: `ca. Sommer ${year + 1}`,
    title: prepaymentTotal > 0 ? `Einkommensteuer ${year} (Rest)` : `Einkommensteuer ${year}`,
    amount: incomeTax.open,
    status: 'estimate',
    note: 'Fällig einen Monat nach deinem Steuerbescheid.',
  });
  if (!svs.notInsured && Math.abs(svs.difference) >= 1) {
    events.push({
      id: 'svs-current',
      payee: 'svs',
      group: gn,
      date: null,
      dateLabel: 'danach',
      title: svs.difference > 0 ? `SVS-Nachzahlung ${year}` : `SVS-Gutschrift ${year}`,
      amount: svs.difference,
      status: 'estimate',
      note: `Die SVS rechnet ${year} mit deinen echten Einkünften nach und verrechnet die Differenz mit der nächsten Quartalsvorschreibung.`,
    });
  }
  const nextSvsYear = svsYear + 1;
  const outlook =
    nextSvsYear <= 3
      ? `${year + 1} ist dein ${nextSvsYear}. Jahr: Die SVS verrechnet vorläufig weiter den Mindestbeitrag.`
      : nextSvsYear === 4
        ? `${year + 1} ist dein 4. Jahr: Ab jetzt rechnet die SVS vorläufig mit deinen Einkünften von vor drei Jahren statt mit dem Mindestbeitrag. Die Quartale werden höher, Nachzahlungen dafür kleiner.`
        : `Die SVS rechnet ${year + 1} vorläufig mit deinen Einkünften ${year - 2}.`;
  const prepaymentOutlook =
    prepaymentQuarterly === 0 && incomeTaxFull >= 1
      ? ` Nach deinem Steuerbescheid ${year} verlangt das Finanzamt Einkommensteuer-Vorauszahlungen, ca. ${Math.round(incomeTaxFull / 4).toLocaleString('de-AT')} € pro Quartal.`
      : prepaymentQuarterly > 0
        ? ' Die Vorauszahlungen passt das Finanzamt nach jedem Bescheid an.'
        : '';
  events.push({ id: 'outlook', payee: null, group: gn, date: null, dateLabel: `${year + 1} laufend`, title: `Was sich ${year + 1} ändert`, amount: null, status: 'info', note: outlook + prepaymentOutlook });

  // ─── Hinweise (Umsatzgrenze, Fälligkeit, Ausnahme). Phasen-Hinweise ersetzt der Zeitplan. ───
  const alerts: AppAlert[] = getSVSAlerts({
    annualRevenue: current.revenueGross,
    isKleinunternehmer: input.isKleinunternehmer,
    phase,
    quarterlyAmount,
    exemptionLost,
    today,
  }).filter((a) => !a.id.startsWith('phase-'));

  // Im Folgejahr gibt es immer vier Fälligkeiten (ohne Anmeldedatum wird nichts gefiltert)
  const nextDue = dueDates.find((d) => d >= todayStart) ?? svsDueDates(year + 1, null)[0]!;

  return {
    year,
    svsYear,
    phase,
    monthsElapsed: months,
    insuredMonths: insured,
    pauschRate,
    revenue: { projected: revenueProjected, expected: revenueExpected, estimated: revenueEstimated },
    recurring: { upcomingCount: current.recurring?.upcomingCount ?? 0, upcomingAmount: current.recurring?.upcomingAmount ?? 0 },
    ytd,
    full,
    averageTaxRate,
    svs: {
      ...svs,
      exempt: !!options.exempt,
      quarterlyAmount,
      prescriptionKnown: prescription !== null,
      provisionalReason,
      quartersDue,
      quartersOpen,
      paidYtd: svsPaidYtd,
      unrecorded: svsUnrecorded,
      extraPaid,
      nextDue,
    },
    incomeTax,
    previous,
    reserve,
    remaining,
    timeline: events,
    alerts,
    exemptionLost,
  };
}

export type SvsTrackerModel = ReturnType<typeof buildSvsTracker>;
