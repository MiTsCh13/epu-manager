import { describe, expect, it } from 'vitest';
import {
  computeExpenseValues,
  findCategory,
  sumByCategory,
  validateExpenseForm,
  validateReceiptFile,
  type ExpenseFormInput,
} from '@/lib/expenses';

const today = '2026-10-03';
const base: ExpenseFormInput = { categoryId: 'software', amount: '120', km: '', vatRate: 20, date: '2026-10-01', description: '' };

describe('validateExpenseForm', () => {
  it('gültig', () => expect(validateExpenseForm(base, today)).toEqual({}));
  it('Pflichtfelder', () => {
    expect(validateExpenseForm({ ...base, categoryId: '', amount: '', date: '' }, today)).toEqual({
      categoryId: 'Bitte wähle eine Kategorie.',
      amount: 'Bitte gib einen Betrag größer 0 ein.',
      date: 'Bitte gib ein Datum ein.',
    });
  });
  it('Betrag ungültig / zu hoch, Datum in der Zukunft', () => {
    expect(validateExpenseForm({ ...base, amount: '-5' }, today).amount).toBeDefined();
    expect(validateExpenseForm({ ...base, amount: '100000000' }, today).amount).toBe('Dieser Betrag ist zu hoch.');
    expect(validateExpenseForm({ ...base, date: '2026-10-04' }, today).date).toBe('Das Datum liegt in der Zukunft.');
  });
  it('Fahrtkosten mit km: km statt Betrag geprüft', () => {
    expect(validateExpenseForm({ ...base, categoryId: 'reisen', amount: '', km: '180' }, today)).toEqual({});
    expect(validateExpenseForm({ ...base, categoryId: 'reisen', amount: '', km: '0' }, today).km).toBeDefined();
    expect(validateExpenseForm({ ...base, categoryId: 'reisen', amount: '', km: 'abc' }, today).km).toBeDefined();
    // ohne km (z. B. Zugticket) → Betrag Pflicht
    expect(validateExpenseForm({ ...base, categoryId: 'reisen', amount: '' }, today).amount).toBeDefined();
  });
});

describe('computeExpenseValues', () => {
  it('Kleinunternehmer: Brutto voll absetzbar', () => {
    expect(computeExpenseValues(base, true)).toEqual({
      e1a_kz: '9230',
      category_label: 'Software & Abos',
      amount: 120,
      amount_net: null,
      deductible_amount: 120,
      is_bewirtung: false,
      km_driven: null,
    });
  });

  it('USt-pflichtig: Netto absetzbar (Vorsteuer separat)', () => {
    expect(computeExpenseValues(base, false)).toMatchObject({ amount: 120, amount_net: 100, deductible_amount: 100 });
    expect(computeExpenseValues({ ...base, vatRate: 0 }, false)).toMatchObject({ amount_net: null, deductible_amount: 120 });
  });

  it('Bewirtung: 50 % absetzbar (KU brutto, sonst netto)', () => {
    const b = { ...base, categoryId: 'bewirtung', amount: '124,50' };
    expect(computeExpenseValues(b, true)).toMatchObject({ amount: 124.5, deductible_amount: 62.25, is_bewirtung: true });
    expect(computeExpenseValues({ ...b, amount: '110', vatRate: 10 }, false)).toMatchObject({ amount_net: 100, deductible_amount: 50 });
  });

  it('Öffi-Jahreskarte: 50 %', () => {
    expect(computeExpenseValues({ ...base, categoryId: 'oeffi', amount: '365' }, true).deductible_amount).toBe(182.5);
  });

  it('Kilometergeld: 0,50 €/km, keine USt', () => {
    expect(computeExpenseValues({ ...base, categoryId: 'reisen', km: '180,5', amount: '' }, false)).toEqual({
      e1a_kz: '9160',
      category_label: 'Reisen & Fahrtkosten',
      amount: 90.25,
      amount_net: null,
      deductible_amount: 90.25,
      is_bewirtung: false,
      km_driven: 180.5,
    });
  });

  it('Fahrtkosten ohne km: normaler Betrag', () => {
    expect(computeExpenseValues({ ...base, categoryId: 'reisen', amount: '49,90' }, true)).toMatchObject({ amount: 49.9, km_driven: null });
  });
});

describe('Belege', () => {
  it.each([
    [{ size: 1000, type: 'image/jpeg' }, null],
    [{ size: 1000, type: 'application/pdf' }, null],
    [{ size: 1000, type: 'text/plain' }, 'Bitte lade ein Foto (JPG, PNG, WebP, HEIC) oder ein PDF hoch.'],
    [{ size: 6 * 1024 * 1024, type: 'image/png' }, 'Der Beleg ist größer als 5 MB.'],
  ])('%o', (file, expected) => expect(validateReceiptFile(file)).toBe(expected));
});

describe('Hilfsfunktionen', () => {
  it('findCategory', () => {
    expect(findCategory('bewirtung')?.isBewirtung).toBe(true);
    expect(findCategory('x')).toBeUndefined();
  });
  it('sumByCategory: absetzbare Beträge, absteigend', () => {
    expect(
      sumByCategory([
        { category_label: 'Bewirtung (50%)', deductible_amount: 62.25, amount: 124.5 },
        { category_label: 'Software & Abos', deductible_amount: 714, amount: 714 },
        { category_label: 'Bewirtung (50%)', deductible_amount: 9.3, amount: 18.6 },
        { category_label: 'Büromaterial', deductible_amount: null, amount: 86.4 },
      ]),
    ).toEqual([
      { label: 'Software & Abos', total: 714 },
      { label: 'Büromaterial', total: 86.4 },
      { label: 'Bewirtung (50%)', total: 71.55 },
    ]);
  });
});
