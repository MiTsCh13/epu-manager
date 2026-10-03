// Zeiträume für Filter (Dashboard-Diagramme) und Umsatz-Buckets je nach Zeitspanne
import { addDays, formatDate, toISODate } from './invoices';
import { round2 } from './money';

export type PeriodPreset = 'year' | 'last6m' | 'lastMonth' | 'thisMonth' | 'last30d' | 'custom';

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'year', label: 'Aktuelles Jahr' },
  { value: 'last6m', label: 'Letzte 6 Monate' },
  { value: 'lastMonth', label: 'Letzter Monat' },
  { value: 'thisMonth', label: 'Aktueller Monat' },
  { value: 'last30d', label: 'Letzte 30 Tage' },
  { value: 'custom', label: 'Zeitraum wählen' },
];

export interface DateRange {
  from: string; // ISO-Datum, inklusive
  to: string; // ISO-Datum, inklusive
}

const MONTHS_LONG = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function resolvePeriod(preset: PeriodPreset, today: Date, custom?: DateRange): DateRange {
  const t = toISODate(today);
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case 'year':
      return { from: `${y}-01-01`, to: t };
    case 'last6m':
      return { from: toISODate(new Date(y, m - 5, 1)), to: t };
    case 'lastMonth':
      return { from: toISODate(new Date(y, m - 1, 1)), to: toISODate(new Date(y, m, 0)) };
    case 'thisMonth':
      return { from: toISODate(new Date(y, m, 1)), to: t };
    case 'last30d':
      return { from: addDays(t, -29), to: t };
    case 'custom': {
      const from = custom?.from || t;
      const to = custom?.to || t;
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

/** Lesbare Beschreibung, z. B. „Oktober 2026“, „2026“, „01.09.2026 – 15.09.2026“. */
export function periodLabel(preset: PeriodPreset, range: DateRange): string {
  const [fy, fm] = range.from.split('-').map(Number) as [number, number];
  switch (preset) {
    case 'year':
      return String(fy);
    case 'lastMonth':
    case 'thisMonth':
      return `${MONTHS_LONG[fm - 1]} ${fy}`;
    case 'last6m':
      return 'den letzten 6 Monaten';
    case 'last30d':
      return 'den letzten 30 Tagen';
    case 'custom':
      return `${formatDate(range.from)} – ${formatDate(range.to)}`;
  }
}

export function daysInRange(range: DateRange): number {
  const [a, b] = [range.from, range.to].map((d) => {
    const [y, m, day] = d.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  }) as [number, number];
  return Math.round((b - a) / 86_400_000) + 1;
}

export const DAILY_MAX_DAYS = 45;

/**
 * Umsatz (netto, nach Zahlungseingang) je Tag (bis 45 Tage) bzw. je Monat.
 */
export function revenueBuckets(
  paid: readonly { subtotal: number; paid_at: string | null }[],
  range: DateRange,
): { granularity: 'day' | 'month'; buckets: { key: string; label: string; total: number }[] } {
  const daily = daysInRange(range) <= DAILY_MAX_DAYS;
  const buckets: { key: string; label: string; total: number }[] = [];
  if (daily) {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      const [, mm, dd] = d.split('-');
      buckets.push({ key: d, label: `${Number(dd)}.${Number(mm)}.`, total: 0 });
    }
  } else {
    const [fy, fm] = range.from.split('-').map(Number) as [number, number];
    const [ty, tm] = range.to.split('-').map(Number) as [number, number];
    const multiYear = fy !== ty;
    for (let y = fy, mo = fm; y < ty || (y === ty && mo <= tm); mo === 12 ? ((y += 1), (mo = 1)) : (mo += 1)) {
      const label = MONTHS_SHORT[mo - 1]! + (multiYear ? ` ${String(y).slice(2)}` : '');
      buckets.push({ key: `${y}-${String(mo).padStart(2, '0')}`, label, total: 0 });
    }
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const inv of paid) {
    if (!inv.paid_at) continue;
    const day = inv.paid_at.slice(0, 10);
    if (day < range.from || day > range.to) continue;
    const i = index.get(daily ? day : day.slice(0, 7));
    if (i !== undefined) buckets[i]!.total += Number(inv.subtotal);
  }
  return { granularity: daily ? 'day' : 'month', buckets: buckets.map((b) => ({ ...b, total: round2(b.total) })) };
}
