// Wiederkehrende Ausgaben: Termine einer Serie, fällige Zahlungen und was bis Jahresende noch kommt.
// Reine Logik ohne Supabase. Datumswerte sind ISO-Strings (YYYY-MM-DD) – die lassen sich direkt vergleichen.
import type { RecurringExpense, RecurringExpenseInsert } from '@/types';
import { expenseTotals, type ExpenseTotals, type ExpenseValues } from './expenses';
import { round2 } from './money';

export type IntervalMonths = 1 | 3 | 6 | 12;

export const INTERVAL_LABELS: Record<IntervalMonths, string> = {
  1: 'monatlich',
  3: 'quartalsweise',
  6: 'halbjährlich',
  12: 'jährlich',
};
export const INTERVALS = [1, 3, 6, 12] as const satisfies readonly IntervalMonths[];

export function intervalLabel(months: number): string {
  return INTERVAL_LABELS[months as IntervalMonths] ?? `alle ${months} Monate`;
}

/** Was eine Serie für die Termin-Rechnung braucht. */
export type Schedule = Pick<RecurringExpense, 'start_date' | 'interval_months' | 'next_date' | 'end_date' | 'paused'>;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * k-ter Termin ab dem Start (k = 0 ist der Start selbst). Der Stichtag bleibt der Tag des Starts;
 * in kürzeren Monaten gilt der letzte Tag (31.1. → 28.2. → 31.3.).
 */
export function occurrence(start: string, intervalMonths: number, k: number): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  const total = m - 1 + k * intervalMonths;
  const year = y + Math.floor(total / 12);
  const month = total - Math.floor(total / 12) * 12; // 0–11
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** Index des ersten Termins, der `pred` erfüllt (Termine steigen streng an). */
function firstIndex(start: string, intervalMonths: number, date: string, strict: boolean): number {
  const [sy, sm] = start.split('-').map(Number) as [number, number];
  const [y, m] = date.split('-').map(Number) as [number, number];
  let k = Math.max(0, Math.floor(((y - sy) * 12 + (m - sm)) / intervalMonths) - 1);
  const ok = (i: number) => (strict ? occurrence(start, intervalMonths, i) > date : occurrence(start, intervalMonths, i) >= date);
  while (!ok(k)) k++;
  return k;
}

/** Erster Termin nach `date`. */
export function nextAfter(start: string, intervalMonths: number, date: string): string {
  return occurrence(start, intervalMonths, firstIndex(start, intervalMonths, date, true));
}

/** Erster Termin an oder nach `date`. */
export function firstOnOrAfter(start: string, intervalMonths: number, date: string): string {
  return occurrence(start, intervalMonths, firstIndex(start, intervalMonths, date, false));
}

/** Letzter Termin vor `date` (mindestens der Start). */
export function lastBefore(start: string, intervalMonths: number, date: string): string {
  const k = firstIndex(start, intervalMonths, date, false);
  return occurrence(start, intervalMonths, Math.max(0, k - 1));
}

export type SeriesStatus = 'active' | 'paused' | 'ended';

/** Beendet = kein Termin mehr bis zum Enddatum. */
export function seriesStatus(s: Schedule): SeriesStatus {
  if (s.end_date && s.next_date > s.end_date) return 'ended';
  return s.paused ? 'paused' : 'active';
}

/** Offene Termine von next_date bis heute (pausiert/beendet: keine). `max` schützt vor Endlosschleifen bei uralten Starts. */
export function dueDates(s: Schedule, today: string, max = 60): string[] {
  if (seriesStatus(s) !== 'active') return [];
  const out: string[] = [];
  let d = s.next_date;
  while (d <= today && (!s.end_date || d <= s.end_date) && out.length < max) {
    out.push(d);
    d = nextAfter(s.start_date, s.interval_months, d);
  }
  return out;
}

/** Termine, die im Jahr noch kommen (ab next_date, inkl. schon fälliger, noch nicht gebuchter). Pausiert: keine. */
export function remainingInYear(s: Schedule, year: number): string[] {
  if (seriesStatus(s) !== 'active') return [];
  const yearEnd = `${year}-12-31`;
  const limit = s.end_date && s.end_date < yearEnd ? s.end_date : yearEnd;
  const out: string[] = [];
  let d = s.next_date < `${year}-01-01` ? firstOnOrAfter(s.start_date, s.interval_months, `${year}-01-01`) : s.next_date;
  while (d <= limit) {
    out.push(d);
    d = nextAfter(s.start_date, s.interval_months, d);
  }
  return out;
}

/** Nächster Termin, nachdem `date` erledigt ist (übernommen oder übersprungen). */
export function advance(s: Pick<Schedule, 'start_date' | 'interval_months'>, date: string): string {
  return nextAfter(s.start_date, s.interval_months, date);
}

/** Fortsetzen nach einer Pause: ab dem nächsten Termin ab heute, ohne die Pause nachzuholen. */
export function resumeNextDate(s: Pick<Schedule, 'start_date' | 'interval_months' | 'next_date'>, today: string): string {
  const fromToday = firstOnOrAfter(s.start_date, s.interval_months, today);
  return fromToday > s.next_date ? fromToday : s.next_date;
}

/** Intervall geändert: Termine neu ab dem Start, weiter ab dem bisher nächsten offenen Termin. */
export function rescheduleNextDate(s: Pick<Schedule, 'start_date' | 'next_date'>, intervalMonths: number): string {
  return firstOnOrAfter(s.start_date, intervalMonths, s.next_date);
}

/** Beenden: Enddatum = letzter schon erledigter Termin – danach schlägt Klaro nichts mehr vor. */
export function endDateNow(s: Pick<Schedule, 'start_date' | 'interval_months' | 'next_date'>): string {
  return lastBefore(s.start_date, s.interval_months, s.next_date);
}

// ─── Serie anlegen und buchen ───────────────────────────────

/** Neue Serie aus den Werten der ersten Zahlung. */
export function buildSeries(
  values: ExpenseValues,
  opts: { description: string; startDate: string; intervalMonths: IntervalMonths; endDate: string | null; autoBook: boolean },
): RecurringExpenseInsert {
  return {
    description: opts.description,
    category_label: values.category_label,
    e1a_kz: values.e1a_kz,
    amount: values.amount,
    amount_net: values.amount_net,
    deductible_amount: values.deductible_amount,
    is_bewirtung: values.is_bewirtung,
    reimbursed: values.reimbursed,
    interval_months: opts.intervalMonths,
    start_date: opts.startDate,
    next_date: nextAfter(opts.startDate, opts.intervalMonths, opts.startDate),
    end_date: opts.endDate,
    auto_book: opts.autoBook,
  };
}

/** Wie viele Zahlungen ab `startDate` bis heute schon fällig wären (ohne die erste) – Hinweis im Formular. */
export function catchUpCount(startDate: string, intervalMonths: number, endDate: string | null, today: string): number {
  return dueDates(
    { start_date: startDate, interval_months: intervalMonths, next_date: nextAfter(startDate, intervalMonths, startDate), end_date: endDate, paused: false },
    today,
  ).length;
}

/** Ungefähre Kosten pro Monat aller laufenden Serien (pausierte und beendete zählen nicht). */
export function monthlyAverage(series: readonly (Schedule & { amount: number })[]): number {
  return round2(series.filter((s) => seriesStatus(s) === 'active').reduce((sum, s) => sum + Number(s.amount) / s.interval_months, 0));
}

// ─── Hochrechnung ───────────────────────────────────────────

type TotalsRow = Parameters<typeof expenseTotals>[0][number];

export interface RecurringYear {
  booked: ExpenseTotals; // im Jahr schon gebuchte Zahlungen aus Serien – zählen genau, nicht hochgerechnet
  upcoming: ExpenseTotals; // was bis Jahresende noch kommt
  upcomingCount: number;
  upcomingAmount: number; // absetzbar
}

/** Wiederkehrende Ausgaben eines Jahres: gebucht (aus `bookedRows`, also recurring_id gesetzt) und noch kommend. */
export function recurringYear(
  series: readonly (Schedule & Omit<TotalsRow, 'amount' | 'deductible_amount'> & { amount: number; deductible_amount: number })[],
  bookedRows: readonly TotalsRow[],
  year: number,
): RecurringYear {
  const upcomingRows: TotalsRow[] = series.flatMap((s) =>
    remainingInYear(s, year).map(() => ({
      category_label: s.category_label,
      amount: Number(s.amount),
      deductible_amount: Number(s.deductible_amount),
      is_bewirtung: s.is_bewirtung,
      reimbursed: s.reimbursed,
    })),
  );
  const upcoming = expenseTotals(upcomingRows);
  return { booked: expenseTotals(bookedRows), upcoming, upcomingCount: upcomingRows.length, upcomingAmount: upcoming.deductible };
}

/**
 * Ausgaben fürs ganze Jahr: Einmaliges wird hochgerechnet (× factor), Serien zählen genau (gebucht + noch kommend).
 * Ohne Serien entspricht das der bisherigen Hochrechnung.
 */
export function projectExpenseTotals(total: ExpenseTotals, recurring: RecurringYear | null | undefined, factor: number): ExpenseTotals {
  const b = recurring?.booked;
  const u = recurring?.upcoming;
  const part = (t: number, booked = 0, upcoming = 0) => round2((t - booked) * factor + booked + upcoming);
  return {
    deductible: part(total.deductible, b?.deductible, u?.deductible),
    pauschalExtras: {
      ku: part(total.pauschalExtras.ku, b?.pauschalExtras.ku, u?.pauschalExtras.ku),
      basis: part(total.pauschalExtras.basis, b?.pauschalExtras.basis, u?.pauschalExtras.basis),
    },
    reimbursedTravel: part(total.reimbursedTravel, b?.reimbursedTravel, u?.reimbursedTravel),
  };
}
