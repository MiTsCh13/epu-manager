import { describe, expect, it } from 'vitest';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_GROUPS, findCategoryByLabel } from '@/constants/expenseCategories';

describe('EXPENSE_CATEGORIES', () => {
  it('IDs und Labels sind eindeutig', () => {
    expect(new Set(EXPENSE_CATEGORIES.map((c) => c.id)).size).toBe(EXPENSE_CATEGORIES.length);
    expect(new Set(EXPENSE_CATEGORIES.map((c) => c.label)).size).toBe(EXPENSE_CATEGORIES.length);
  });

  it('jede Kategorie hat eine 4-stellige E1a-Kennzahl und eine gültige Gruppe', () => {
    const groups = new Set(EXPENSE_CATEGORY_GROUPS.map((g) => g.id));
    for (const c of EXPENSE_CATEGORIES) {
      expect(c.kz).toMatch(/^\d{4}$/);
      expect(groups.has(c.group)).toBe(true);
    }
  });

  it('genau eine Bewirtungs-Kategorie', () => {
    expect(EXPENSE_CATEGORIES.filter((c) => c.isBewirtung).map((c) => c.id)).toEqual(['bewirtung']);
  });

  it('SVS-Beiträge sind keine Ausgaben-Kategorie', () => {
    expect(EXPENSE_CATEGORIES.some((c) => /svs|sozialversicherung/i.test(c.label))).toBe(false);
  });

  it('findCategoryByLabel', () => {
    expect(findCategoryByLabel('Reisen & Fahrtkosten')?.hasKm).toBe(true);
    expect(findCategoryByLabel('gibt es nicht')).toBeUndefined();
  });
});
