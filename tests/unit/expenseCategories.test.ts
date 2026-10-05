import { describe, expect, it } from 'vitest';
import {
  countsUnder,
  E1A_KZ_NAMES,
  EXPENSE_CATEGORIES,
  EXPENSE_TILES,
  findCategoryById,
  findCategoryByLabel,
  tileOf,
  tilesFor,
  type CategoryContext,
} from '@/constants/expenseCategories';

const euer: CategoryContext = { businessType: 'neue_selbstaendige', profitMethod: 'euer', pauschType: null, smallApp: false };
const ids = (ctx: CategoryContext, keep?: string) => tilesFor(ctx, keep).flatMap((t) => t.categories.map((c) => c.id));
const tileIds = (ctx: CategoryContext) => tilesFor(ctx).map((t) => t.tile.id);

describe('EXPENSE_CATEGORIES', () => {
  it('IDs und Labels sind eindeutig', () => {
    expect(new Set(EXPENSE_CATEGORIES.map((c) => c.id)).size).toBe(EXPENSE_CATEGORIES.length);
    expect(new Set(EXPENSE_CATEGORIES.map((c) => c.label)).size).toBe(EXPENSE_CATEGORIES.length);
  });

  it('jede Kennzahl ist eine Ausgaben-Kennzahl des E1a mit Bezeichnung', () => {
    for (const c of EXPENSE_CATEGORIES) expect(E1A_KZ_NAMES[c.kz], c.id).toBeTruthy();
    // 9090 ist im E1a „Übrige Erträge“ – eine Einnahme
    expect(EXPENSE_CATEGORIES.some((c) => c.kz === '9090')).toBe(false);
  });

  it('Bankgebühren auf 9230, Kreditzinsen auf 9220; Diäten und Öffi-Karte eigene Kennzahlen', () => {
    expect(findCategoryById('bankgebuehren')?.kz).toBe('9230');
    expect(findCategoryById('zinsen')?.kz).toBe('9220');
    expect(findCategoryById('tagesgeld')?.kz).toBe('9160');
    expect(findCategoryById('naechtigung')?.kz).toBe('9160');
    expect(findCategoryById('oeffi')?.kz).toBe('9165');
  });

  it('jede Kategorie erklärt, was dazugehört', () => {
    for (const c of EXPENSE_CATEGORIES) expect(c.hint.length, c.id).toBeGreaterThan(20);
  });

  it('genau eine Bewirtungs-Kategorie', () => {
    expect(EXPENSE_CATEGORIES.filter((c) => c.isBewirtung).map((c) => c.id)).toEqual(['bewirtung']);
  });

  it('SVS-Beiträge sind keine Ausgaben-Kategorie', () => {
    expect(EXPENSE_CATEGORIES.some((c) => /svs|sozialversicherung/i.test(c.label))).toBe(false);
  });

  it('findCategoryByLabel', () => {
    expect(findCategoryByLabel('Fahrten & Reisen')?.hasKm).toBe(true);
    expect(findCategoryByLabel('gibt es nicht')).toBeUndefined();
  });
});

describe('EXPENSE_TILES', () => {
  it('jede Kategorie liegt in genau einer Kachel; Kacheln mit mehreren Kategorien fragen nach', () => {
    for (const c of EXPENSE_CATEGORIES) expect(EXPENSE_TILES.filter((t) => t.categories.includes(c.id)), c.id).toHaveLength(1);
    for (const t of EXPENSE_TILES) if (t.categories.length > 1) expect(t.question, t.id).toBeTruthy();
    expect(tileOf('zinsen')?.id).toBe('bank');
  });

  it('Einnahmen-Ausgaben-Rechnung: 12 Kacheln (WKO nur Gewerbe, Büromöbel nur mit kleiner Arbeitsplatzpauschale)', () => {
    expect(tileIds(euer)).toHaveLength(12);
    expect(tileIds(euer)).not.toContain('wko');
    expect(tileIds({ ...euer, businessType: 'gewerbetreibend' })).toContain('wko');
    expect(tileIds(euer)).not.toContain('bueromoebel');
    expect(tileIds({ ...euer, smallApp: true })).toContain('bueromoebel');
    // Beim Bearbeiten bleibt die gespeicherte Kategorie sichtbar
    expect(ids(euer, 'wko')).toContain('wko');
  });

  it('KU-Pauschalierung: nur Öffi-Karte und (weiterverrechnete) Reisen', () => {
    const ku: CategoryContext = { ...euer, profitMethod: 'pauschal', pauschType: 'ku' };
    expect(ids(ku)).toEqual(['reisen', 'oeffi']);
  });

  it('Basispauschalierung: zusätzlich Waren und Fremdleistungen, keine Diäten', () => {
    const basis: CategoryContext = { ...euer, profitMethod: 'pauschal', pauschType: 'basis_15' };
    expect(ids(basis)).toEqual(['reisen', 'oeffi', 'waren', 'subauftraege']);
    expect(countsUnder(findCategoryById('tagesgeld')!, 'pauschal', 'basis_6')).toBe(false);
  });
});
