import { describe, expect, it } from 'vitest';
import { openInvoicesSummary, topCategories } from '@/lib/dashboard';

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
