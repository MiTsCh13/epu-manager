import { describe, expect, it } from 'vitest';
import {
  advance,
  buildSeries,
  catchUpCount,
  dueDates,
  endDateNow,
  firstOnOrAfter,
  lastBefore,
  monthlyAverage,
  nextAfter,
  occurrence,
  projectExpenseTotals,
  recurringYear,
  remainingInYear,
  rescheduleNextDate,
  resumeNextDate,
  seriesStatus,
  type Schedule,
} from '@/lib/recurring';
import { buildSvsTracker, monthsElapsedInYear, type TrackerInput } from '@/lib/svsTracker';

const monthly = (over: Partial<Schedule> = {}): Schedule => ({
  start_date: '2026-01-15',
  interval_months: 1,
  next_date: '2026-02-15',
  end_date: null,
  paused: false,
  ...over,
});

describe('Termine', () => {
  it('occurrence: Stichtag bleibt, kürzere Monate → letzter Tag', () => {
    expect(occurrence('2026-01-31', 1, 1)).toBe('2026-02-28');
    expect(occurrence('2026-01-31', 1, 2)).toBe('2026-03-31');
    expect(occurrence('2028-01-31', 1, 1)).toBe('2028-02-29'); // Schaltjahr
    expect(occurrence('2026-11-30', 3, 1)).toBe('2027-02-28');
    expect(occurrence('2026-05-10', 12, 3)).toBe('2029-05-10');
  });

  it('nextAfter / firstOnOrAfter / lastBefore', () => {
    expect(nextAfter('2026-01-15', 1, '2026-01-15')).toBe('2026-02-15');
    expect(nextAfter('2026-01-15', 1, '2026-03-20')).toBe('2026-04-15');
    expect(nextAfter('2026-01-15', 3, '2026-01-01')).toBe('2026-01-15');
    expect(firstOnOrAfter('2026-01-15', 1, '2026-03-15')).toBe('2026-03-15');
    expect(firstOnOrAfter('2026-01-31', 1, '2026-02-28')).toBe('2026-02-28');
    expect(lastBefore('2026-01-15', 1, '2026-04-15')).toBe('2026-03-15');
    expect(lastBefore('2026-01-15', 1, '2026-01-15')).toBe('2026-01-15'); // nie vor dem Start
  });

  it('dueDates: alle offenen Termine bis heute, nachholen nach längerer Pause in Klaro', () => {
    expect(dueDates(monthly(), '2026-02-14')).toEqual([]);
    expect(dueDates(monthly(), '2026-02-15')).toEqual(['2026-02-15']);
    expect(dueDates(monthly(), '2026-05-01')).toEqual(['2026-02-15', '2026-03-15', '2026-04-15']);
  });

  it('dueDates: Enddatum, pausiert und beendet', () => {
    expect(dueDates(monthly({ end_date: '2026-03-31' }), '2026-12-31')).toEqual(['2026-02-15', '2026-03-15']);
    expect(dueDates(monthly({ paused: true }), '2026-12-31')).toEqual([]);
    expect(dueDates(monthly({ next_date: '2026-04-15', end_date: '2026-03-15' }), '2026-12-31')).toEqual([]);
  });

  it('seriesStatus', () => {
    expect(seriesStatus(monthly())).toBe('active');
    expect(seriesStatus(monthly({ paused: true }))).toBe('paused');
    expect(seriesStatus(monthly({ end_date: '2026-01-15' }))).toBe('ended');
    expect(seriesStatus(monthly({ end_date: '2026-01-15', paused: true }))).toBe('ended');
  });

  it('advance, Fortsetzen, Intervall ändern, Beenden', () => {
    expect(advance(monthly(), '2026-02-15')).toBe('2026-03-15');
    // Pause von Februar bis Mai: nichts nachholen, weiter ab dem nächsten Termin ab heute
    expect(resumeNextDate(monthly(), '2026-05-20')).toBe('2026-06-15');
    // Pausiert, bevor der nächste Termin kam → Termin bleibt
    expect(resumeNextDate(monthly({ next_date: '2026-06-15' }), '2026-05-01')).toBe('2026-06-15');
    // monatlich → quartalsweise: nächster Quartalstermin ab dem bisher nächsten Termin
    expect(rescheduleNextDate(monthly({ next_date: '2026-05-15' }), 3)).toBe('2026-07-15');
    expect(endDateNow(monthly({ next_date: '2026-05-15' }))).toBe('2026-04-15');
    expect(endDateNow(monthly())).toBe('2026-01-15');
  });

  it('remainingInYear: ab next_date bis Jahresende bzw. Enddatum', () => {
    const s = monthly({ next_date: '2026-10-15' });
    expect(remainingInYear(s, 2026)).toEqual(['2026-10-15', '2026-11-15', '2026-12-15']);
    expect(remainingInYear({ ...s, end_date: '2026-11-01' }, 2026)).toEqual(['2026-10-15']);
    expect(remainingInYear({ ...s, paused: true }, 2026)).toEqual([]);
    // jährlich, nächste Zahlung erst 2027
    expect(remainingInYear({ ...s, interval_months: 12, next_date: '2027-01-15' }, 2026)).toEqual([]);
  });

  it('catchUpCount: Hinweis im Formular', () => {
    expect(catchUpCount('2026-07-08', 1, null, '2026-10-08')).toBe(3);
    expect(catchUpCount('2026-07-08', 3, null, '2026-10-08')).toBe(1);
    expect(catchUpCount('2026-10-08', 1, null, '2026-10-08')).toBe(0);
    expect(catchUpCount('2026-07-08', 1, '2026-08-31', '2026-10-08')).toBe(1);
  });

  it('monthlyAverage: nur laufende Serien', () => {
    expect(
      monthlyAverage([
        { ...monthly(), amount: 30 },
        { ...monthly({ interval_months: 12 }), amount: 600 },
        { ...monthly({ paused: true }), amount: 999 },
      ]),
    ).toBe(80);
  });
});

describe('Serie anlegen und buchen', () => {
  const values = {
    e1a_kz: '9230',
    category_label: 'Software & Abos',
    amount: 60,
    amount_net: 50,
    deductible_amount: 50,
    is_bewirtung: false,
    km_driven: null,
    vehicle: null,
    trip_hours: null,
    nights: null,
    reimbursed: false,
  };

  it('buildSeries: nächster Termin nach der ersten Zahlung', () => {
    const s = buildSeries(values, { description: 'Adobe', startDate: '2026-01-31', intervalMonths: 1, endDate: null, autoBook: true });
    expect(s).toMatchObject({ next_date: '2026-02-28', interval_months: 1, amount: 60, amount_net: 50, deductible_amount: 50, auto_book: true });
  });
});

describe('Hochrechnung', () => {
  const series = (over: Partial<Schedule> = {}) => ({
    ...monthly(over),
    category_label: 'Software & Abos',
    amount: 60,
    deductible_amount: 50,
    is_bewirtung: false,
    reimbursed: false,
  });
  const row = { category_label: 'Software & Abos', amount: 60, deductible_amount: 50, is_bewirtung: false, reimbursed: false };

  it('recurringYear: gebucht und noch kommend', () => {
    const r = recurringYear([series({ next_date: '2026-10-15' }), series({ paused: true })], [row, row], 2026);
    expect(r.booked.deductible).toBe(100);
    expect(r.upcomingCount).toBe(3);
    expect(r.upcoming.deductible).toBe(150);
    expect(r.upcomingAmount).toBe(150);
  });

  it('projectExpenseTotals: Einmaliges × Faktor, Serien genau', () => {
    const total = { deductible: 1100, pauschalExtras: { ku: 0, basis: 0 }, reimbursedTravel: 0 };
    const rec = recurringYear([series({ next_date: '2026-10-15' })], Array(9).fill(row), 2026);
    // 1.100 € gesamt, davon 450 € aus der Serie → 650 × 1,5 + 450 + 150
    expect(projectExpenseTotals(total, rec, 1.5).deductible).toBe(1575);
    // Ohne Serien wie bisher
    expect(projectExpenseTotals(total, null, 1.5).deductible).toBe(1650);
  });

  it('Jahresversicherung im Jänner wird nicht mehr hochgerechnet', () => {
    const base: TrackerInput = {
      today: new Date(2026, 9, 4),
      registrationDate: new Date(2025, 2, 1),
      businessType: 'gewerbetreibend',
      exempt: false,
      isKleinunternehmer: true,
      profitMethod: 'euer',
      pauschType: null,
      industryType: null,
      quarterlyPrescription: null,
      revenueEstimate: 42000,
      current: { revenueNet: 31800, revenueGross: 31800, deductibleExpenses: 600, pauschalExtras: { ku: 0, basis: 0 }, reimbursedTravel: 0, depreciation: 0, svsPaid: 1447.29 },
      previous: null,
    };
    const scaled = Math.round(((600 * 12) / monthsElapsedInYear(base.today)) * 100) / 100;
    expect(buildSvsTracker(base).full.expenses).toBe(scaled);
    const insurance = { ...series({ start_date: '2026-01-10', next_date: '2027-01-10', interval_months: 12 }), amount: 600, deductible_amount: 600 };
    const recurring = recurringYear([insurance], [{ ...row, amount: 600, deductible_amount: 600 }], 2026);
    const m = buildSvsTracker({ ...base, current: { ...base.current, recurring } });
    expect(m.full.expenses).toBe(600);
    expect(m.recurring).toEqual({ upcomingCount: 0, upcomingAmount: 0 });
  });
});
