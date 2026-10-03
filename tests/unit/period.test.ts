import { describe, expect, it } from 'vitest';
import { daysInRange, periodLabel, resolvePeriod, revenueBuckets } from '@/lib/period';

const today = new Date(2026, 9, 3); // 03.10.2026

describe('resolvePeriod', () => {
  it.each([
    ['year', { from: '2026-01-01', to: '2026-10-03' }],
    ['last6m', { from: '2026-05-01', to: '2026-10-03' }],
    ['lastMonth', { from: '2026-09-01', to: '2026-09-30' }],
    ['thisMonth', { from: '2026-10-01', to: '2026-10-03' }],
    ['last30d', { from: '2026-09-04', to: '2026-10-03' }],
  ] as const)('%s', (preset, expected) => expect(resolvePeriod(preset, today)).toEqual(expected));

  it('letzter Monat im Jänner → Dezember Vorjahr', () => {
    expect(resolvePeriod('lastMonth', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('custom: übernimmt, tauscht vertauschte Daten, Fallback heute', () => {
    expect(resolvePeriod('custom', today, { from: '2026-02-01', to: '2026-03-15' })).toEqual({ from: '2026-02-01', to: '2026-03-15' });
    expect(resolvePeriod('custom', today, { from: '2026-03-15', to: '2026-02-01' })).toEqual({ from: '2026-02-01', to: '2026-03-15' });
    expect(resolvePeriod('custom', today)).toEqual({ from: '2026-10-03', to: '2026-10-03' });
  });
});

describe('periodLabel', () => {
  it.each([
    ['year', { from: '2026-01-01', to: '2026-10-03' }, '2026'],
    ['thisMonth', { from: '2026-10-01', to: '2026-10-03' }, 'Oktober 2026'],
    ['lastMonth', { from: '2026-09-01', to: '2026-09-30' }, 'September 2026'],
    ['last6m', { from: '2026-05-01', to: '2026-10-03' }, 'den letzten 6 Monaten'],
    ['last30d', { from: '2026-09-04', to: '2026-10-03' }, 'den letzten 30 Tagen'],
    ['custom', { from: '2026-02-01', to: '2026-03-15' }, '01.02.2026 – 15.03.2026'],
  ] as const)('%s', (preset, range, label) => expect(periodLabel(preset, range)).toBe(label));
});

describe('revenueBuckets', () => {
  const paid = [
    { subtotal: 1000, paid_at: '2026-09-10T08:00:00+00:00' },
    { subtotal: 500, paid_at: '2026-09-10' },
    { subtotal: 200, paid_at: '2026-10-02' },
    { subtotal: 999, paid_at: '2025-12-31' },
    { subtotal: 1, paid_at: null },
  ];

  it('daysInRange', () => {
    expect(daysInRange({ from: '2026-09-04', to: '2026-10-03' })).toBe(30);
    expect(daysInRange({ from: '2028-02-28', to: '2028-03-01' })).toBe(3);
  });

  it('bis 45 Tage: je Tag', () => {
    const r = revenueBuckets(paid, { from: '2026-09-04', to: '2026-10-03' });
    expect(r.granularity).toBe('day');
    expect(r.buckets).toHaveLength(30);
    expect(r.buckets.find((b) => b.key === '2026-09-10')).toEqual({ key: '2026-09-10', label: '10.9.', total: 1500 });
    expect(r.buckets.at(-2)!.total).toBe(200);
  });

  it('länger: je Monat, Jahreswechsel mit Jahreszahl', () => {
    const r = revenueBuckets(paid, { from: '2025-11-15', to: '2026-10-03' });
    expect(r.granularity).toBe('month');
    expect(r.buckets.map((b) => b.label)).toEqual(['Nov 25', 'Dez 25', 'Jän 26', 'Feb 26', 'Mär 26', 'Apr 26', 'Mai 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26', 'Okt 26']);
    expect(r.buckets[1]!.total).toBe(999);
    expect(r.buckets[10]!.total).toBe(1500);
  });

  it('innerhalb eines Jahres: ohne Jahreszahl; Zahlungen außerhalb ignoriert', () => {
    const r = revenueBuckets(paid, { from: '2026-01-01', to: '2026-10-03' });
    expect(r.buckets[0]!.label).toBe('Jän');
    expect(r.buckets.reduce((s, b) => s + b.total, 0)).toBe(1700);
  });
});
