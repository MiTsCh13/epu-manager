import { describe, expect, it } from 'vitest';
import {
  canSaveAsProduct,
  lineToProductForm,
  normalizeProduct,
  productDescription,
  productToLine,
  searchProducts,
  sortProducts,
  splitDescription,
  suggestProducts,
  validateProduct,
} from '@/lib/products';
import type { Product } from '@/types';

function product(patch: Partial<Product>): Product {
  return {
    id: crypto.randomUUID(),
    user_id: 'u',
    name: 'Beratung',
    details: '',
    unit: 'Std.',
    unit_price: 85,
    last_used_at: null,
    created_at: '2026-10-01T00:00:00Z',
    ...patch,
  };
}

describe('validateProduct', () => {
  const ok = { name: 'Beratung', details: '', unit: 'Std.', unit_price: '85,00' };

  it('akzeptiert gültige Angaben, auch Preis 0 und deutsches Komma', () => {
    expect(validateProduct(ok)).toEqual({});
    expect(validateProduct({ ...ok, unit_price: '0' })).toEqual({});
    expect(validateProduct({ ...ok, unit_price: '1.234,50' })).toEqual({});
  });

  it('verlangt Bezeichnung und gültigen Preis', () => {
    expect(validateProduct({ ...ok, name: '  ' }).name).toBeDefined();
    expect(validateProduct({ ...ok, unit_price: '' }).unit_price).toBeDefined();
    expect(validateProduct({ ...ok, unit_price: 'abc' }).unit_price).toBeDefined();
    expect(validateProduct({ ...ok, unit_price: '-5' }).unit_price).toBeDefined();
    expect(validateProduct({ ...ok, unit: 'x'.repeat(21) }).unit).toBeDefined();
    expect(validateProduct({ ...ok, details: 'x'.repeat(2001) }).details).toBeDefined();
    expect(validateProduct({ ...ok, unit_price: '99999999,999' }).unit_price).toBe('Dieser Preis ist zu hoch.');
  });

  it('erkennt Doppelte unabhängig von Groß-/Kleinschreibung', () => {
    expect(validateProduct({ ...ok, name: ' beratung ' }, [product({})]).name).toBe('Diese Bezeichnung gibt es schon.');
  });
});

describe('normalizeProduct', () => {
  it('trimmt, rundet und macht leere Einheit zu null', () => {
    expect(normalizeProduct({ name: ' Logo ', details: '- Entwurf\r\n- Reinzeichnung\n', unit: ' ', unit_price: '99,999' })).toEqual({
      name: 'Logo',
      details: '- Entwurf\n- Reinzeichnung',
      unit: null,
      unit_price: 100,
    });
  });
});

describe('Bezeichnung ↔ Produkt', () => {
  it('teilt mehrzeilige Bezeichnungen in Name und Details', () => {
    expect(splitDescription('Website\n- Startseite\n- Kontakt')).toEqual({ name: 'Website', details: '- Startseite\n- Kontakt' });
    expect(splitDescription('  Nur eine Zeile ')).toEqual({ name: 'Nur eine Zeile', details: '' });
  });

  it('setzt Name und Details wieder zusammen', () => {
    expect(productDescription({ name: 'Website', details: '- Startseite' })).toBe('Website\n- Startseite');
    expect(productDescription({ name: 'Website', details: '' })).toBe('Website');
  });

  it('übernimmt Text, Einheit und Preis in eine Position', () => {
    expect(productToLine(product({ unit_price: 12.5, unit: null }))).toEqual({ description: 'Beratung', unit: '', unit_price: '12,5' });
  });

  it('macht aus einer Position ein Produkt-Formular', () => {
    expect(lineToProductForm({ description: 'DJ-Set\n4 Stunden', quantity: '2', unit_price: '450', unit: 'pauschal' })).toEqual({
      name: 'DJ-Set',
      details: '4 Stunden',
      unit: 'pauschal',
      unit_price: '450',
    });
  });

  it('bietet „Als Produkt speichern“ nur für vollständige, neue Positionen an', () => {
    const list = [product({})];
    expect(canSaveAsProduct({ description: 'Workshop', quantity: '1', unit_price: '300' }, list)).toBe(true);
    expect(canSaveAsProduct({ description: 'BERATUNG', quantity: '1', unit_price: '90' }, list)).toBe(false);
    expect(canSaveAsProduct({ description: 'Workshop', quantity: '1', unit_price: '' }, list)).toBe(false);
    expect(canSaveAsProduct({ description: '', quantity: '1', unit_price: '300' }, list)).toBe(false);
  });
});

describe('sortProducts / searchProducts', () => {
  const a = product({ name: 'Website-Wartung', last_used_at: '2026-10-01T00:00:00Z' });
  const b = product({ name: 'Beratung', last_used_at: '2026-10-20T00:00:00Z' });
  const c = product({ name: 'Anfahrt', unit: 'km', last_used_at: null });
  const d = product({ name: 'Logo', details: 'inkl. Beratung', last_used_at: null });

  it('zuletzt verwendet zuerst, dann alphabetisch', () => {
    expect(sortProducts([a, c, d, b]).map((p) => p.name)).toEqual(['Beratung', 'Website-Wartung', 'Anfahrt', 'Logo']);
  });

  it('sucht in Name, Details und Einheit, Namensanfang zuerst', () => {
    const list = sortProducts([a, b, c, d]);
    expect(searchProducts(list, 'ber').map((p) => p.name)).toEqual(['Beratung', 'Logo']);
    expect(searchProducts(list, 'km').map((p) => p.name)).toEqual(['Anfahrt']);
    expect(searchProducts(list, 'website wart').map((p) => p.name)).toEqual(['Website-Wartung']);
    expect(searchProducts(list, '  ')).toHaveLength(4);
  });
});

describe('suggestProducts', () => {
  const inv = (...items: object[]) => ({ line_items: items });

  it('schlägt Positionen vor, die auf mindestens zwei Rechnungen stehen – Preis von der neuesten', () => {
    const invoices = [
      inv({ description: 'Beratung', quantity: 2, unit_price: 90, total: 180, unit: 'Std.' }),
      inv({ description: 'beratung ', quantity: 1, unit_price: 80, total: 80 }, { description: 'Einmalig', quantity: 1, unit_price: 5, total: 5 }),
      inv({ description: 'Website\n- Startseite', quantity: 1, unit_price: 900, total: 900 }),
      inv({ description: 'Website\n- Kontakt', quantity: 1, unit_price: 950, total: 950 }),
    ];
    expect(suggestProducts(invoices, [])).toEqual([
      { key: 'beratung', count: 2, name: 'Beratung', details: '', unit: 'Std.', unit_price: '90' },
      { key: 'website', count: 2, name: 'Website', details: '- Startseite', unit: '', unit_price: '900' },
    ]);
  });

  it('zählt eine Rechnung nur einmal und lässt bestehende Produkte und kaputte Daten weg', () => {
    const invoices = [
      inv({ description: 'Anfahrt', quantity: 1, unit_price: 0.5, total: 0.5 }, { description: 'Anfahrt', quantity: 1, unit_price: 0.5, total: 0.5 }),
      inv({ description: 'Beratung', quantity: 1, unit_price: 90, total: 90 }),
      inv({ description: 'Beratung', quantity: 1, unit_price: 90, total: 90 }),
      inv({ description: 'Riesig', quantity: 1, unit_price: 1e9, total: 1e9 }),
      inv({ description: 'Riesig', quantity: 1, unit_price: 1e9, total: 1e9 }),
      inv({ description: `Lang\n${'x'.repeat(2001)}`, quantity: 1, unit_price: 1, total: 1 }),
      inv({ description: `Lang\n${'x'.repeat(2001)}`, quantity: 1, unit_price: 1, total: 1 }),
      { line_items: null },
      inv({ foo: 'bar' }),
    ];
    expect(suggestProducts(invoices, [product({ name: 'BERATUNG' })])).toEqual([]);
  });
});
