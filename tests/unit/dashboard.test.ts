import { describe, expect, it } from 'vitest';
import { monthlyRevenue, openInvoicesSummary, topCategories } from '@/lib/dashboard';

describe('monthlyRevenue', () => {
  it('letzte 6 Monate inkl. Jahreswechsel, nach Zahlungsdatum, netto', () => {
    const r = monthlyRevenue(
      [
        { subtotal: 1000, paid_at: '2026-02-10T10:00:00+00:00' },
        { subtotal: 500, paid_at: '2026-02-28' },
        { subtotal: 300, paid_at: '2025-11-05' },
        { subtotal: 999, paid_at: '2025-09-30' }, // außerhalb
        { subtotal: 50, paid_at: null },
      ],
      new Date(2026, 2, 15), // März 2026
    );
    expect(r.map((m) => m.label)).toEqual(['Okt', 'Nov', 'Dez', 'Jän', 'Feb', 'Mär']);
    expect(r.map((m) => m.total)).toEqual([0, 300, 0, 0, 1500, 0]);
    expect(r[0]!.key).toBe('2025-10');
  });
  it('Anzahl Monate einstellbar', () => {
    expect(monthlyRevenue([], new Date(2026, 9, 3), 3).map((m) => m.key)).toEqual(['2026-08', '2026-09', '2026-10']);
  });
});

describe('openInvoicesSummary', () => {
  it('zählt gesendete + überfällige, ignoriert Entwürfe und bezahlte', () => {
    expect(
      openInvoicesSummary(
        [
          { status: 'sent', due_date: '2026-10-10', total: 890 },
          { status: 'sent', due_date: '2026-08-19', total: 2280 },
          { status: 'overdue', due_date: '2026-08-01', total: 100 },
          { status: 'draft', due_date: null, total: 1200 },
          { status: 'paid', due_date: '2026-01-01', total: 4200 },
        ],
        '2026-10-03',
      ),
    ).toEqual({ count: 3, total: 3270, overdueCount: 2 });
  });
});

describe('topCategories', () => {
  const e = (label: string, v: number) => ({ category_label: label, deductible_amount: v, amount: v });
  it('≤ N Kategorien unverändert', () => {
    expect(topCategories([e('A', 10), e('B', 20)])).toEqual([
      { label: 'B', total: 20 },
      { label: 'A', total: 10 },
    ]);
  });
  it('Rest als „Weitere“', () => {
    const r = topCategories([e('A', 60), e('B', 50), e('C', 40), e('D', 30), e('E', 20), e('F', 10), e('G', 5.5)]);
    expect(r).toHaveLength(6);
    expect(r[5]).toEqual({ label: 'Weitere', total: 15.5 });
  });
});
