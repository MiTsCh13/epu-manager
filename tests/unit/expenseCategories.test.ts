import { describe, expect, it } from 'vitest';
import { categoriesFor, E1A_KZ_NAMES, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_GROUPS, findCategoryByLabel } from '@/constants/expenseCategories';

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

  it('jede Kennzahl ist eine Ausgaben-Kennzahl des E1a mit Bezeichnung', () => {
    for (const c of EXPENSE_CATEGORIES) expect(E1A_KZ_NAMES[c.kz], c.id).toBeTruthy();
    // 9090 ist im E1a „Übrige Erträge“ – eine Einnahme
    expect(EXPENSE_CATEGORIES.some((c) => c.kz === '9090')).toBe(false);
    expect(findCategoryByLabel('Sonstige Ausgaben')?.kz).toBe('9230');
  });

  it('jede Kategorie erklärt, was dazugehört', () => {
    for (const c of EXPENSE_CATEGORIES) expect(c.hint.length, c.id).toBeGreaterThan(20);
  });

  it('WKO-Grundumlage nur für Gewerbetreibende (außer beim Bearbeiten)', () => {
    const ids = (list: { id: string }[]) => list.map((c) => c.id);
    expect(ids(categoriesFor('gewerbetreibend'))).toContain('wko');
    expect(ids(categoriesFor('neue_selbstaendige'))).not.toContain('wko');
    expect(ids(categoriesFor(null))).not.toContain('wko');
    expect(ids(categoriesFor('neue_selbstaendige', 'wko'))).toContain('wko');
    expect(categoriesFor('neue_selbstaendige')).toHaveLength(EXPENSE_CATEGORIES.length - 1);
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
