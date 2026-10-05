import { describe, expect, it } from 'vitest';
import {
  computeAssetValues,
  countsAlongsidePauschal,
  expenseTotals,
  pauschalExtrasFor,
  computeExpenseValues,
  entryKind,
  findCategory,
  sumByCategory,
  validateExpenseForm,
  validateReceiptFile,
  type ExpenseFormInput,
} from '@/lib/expenses';

const today = '2026-10-03';
const base: ExpenseFormInput = { categoryId: 'buero', amount: '120', km: '', hours: '', nights: '', reimbursed: false, vatRate: 20, date: '2026-10-01', description: '', spread: null, usefulLife: '' };

describe('validateExpenseForm', () => {
  it('gültig', () => expect(validateExpenseForm(base, today, true)).toEqual({}));
  it('Pflichtfelder', () => {
    expect(validateExpenseForm({ ...base, categoryId: '', amount: '', date: '' }, today, true)).toEqual({
      categoryId: 'Bitte wähle eine Kategorie.',
      amount: 'Bitte gib einen Betrag größer 0 ein.',
      date: 'Bitte gib ein Datum ein.',
    });
  });
  it('Betrag ungültig / zu hoch, Datum in der Zukunft', () => {
    expect(validateExpenseForm({ ...base, amount: '-5' }, today, true).amount).toBeDefined();
    expect(validateExpenseForm({ ...base, amount: '100000000' }, today, true).amount).toBe('Dieser Betrag ist zu hoch.');
    expect(validateExpenseForm({ ...base, date: '2026-10-04' }, today, true).date).toBe('Das Datum liegt in der Zukunft.');
  });
  it('Fahrtkosten mit km: km statt Betrag geprüft', () => {
    expect(validateExpenseForm({ ...base, categoryId: 'reisen', amount: '', km: '180' }, today, true)).toEqual({});
    expect(validateExpenseForm({ ...base, categoryId: 'reisen', amount: '', km: '0' }, today, true).km).toBeDefined();
    expect(validateExpenseForm({ ...base, categoryId: 'reisen', amount: '', km: 'abc' }, today, true).km).toBeDefined();
    // ohne km (z. B. Zugticket) → Betrag Pflicht
    expect(validateExpenseForm({ ...base, categoryId: 'reisen', amount: '' }, today, true).amount).toBeDefined();
  });
});

describe('computeExpenseValues', () => {
  it('Kleinunternehmer: Brutto voll absetzbar', () => {
    expect(computeExpenseValues(base, true)).toEqual({
      e1a_kz: '9230',
      category_label: 'Büro & Software',
      amount: 120,
      amount_net: null,
      deductible_amount: 120,
      is_bewirtung: false,
      km_driven: null,
      trip_hours: null,
      nights: null,
      reimbursed: false,
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
      category_label: 'Fahrten & Reisen',
      amount: 90.25,
      amount_net: null,
      deductible_amount: 90.25,
      is_bewirtung: false,
      km_driven: 180.5,
      trip_hours: null,
      nights: null,
      reimbursed: false,
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
        { category_label: 'Geschäftsessen (50 %)', deductible_amount: 62.25, amount: 124.5 },
        { category_label: 'Büro & Software', deductible_amount: 714, amount: 714 },
        { category_label: 'Geschäftsessen (50 %)', deductible_amount: 9.3, amount: 18.6 },
        { category_label: 'Kurse & Fachbücher', deductible_amount: null, amount: 86.4 },
      ]),
    ).toEqual([
      { label: 'Büro & Software', total: 714 },
      { label: 'Kurse & Fachbücher', total: 86.4 },
      { label: 'Geschäftsessen (50 %)', total: 71.55 },
    ]);
  });
});

describe('Anlagen: Ausgabe oder auf mehrere Jahre verteilen', () => {
  const laptop = { ...base, categoryId: 'geraete', amount: '1500', vatRate: 20 as const };

  it('Geräte bis 1.000 € (netto bzw. bei Kleinunternehmern brutto) sofort absetzen', () => {
    expect(entryKind({ ...laptop, amount: '1000' }, true)).toBe('expense');
    // USt-pflichtig: 1.200 € brutto = 1.000 € netto → noch sofort
    expect(entryKind({ ...laptop, amount: '1200' }, false)).toBe('expense');
    // Kleinunternehmer: 1.200 € brutto → verteilen
    expect(entryKind({ ...laptop, amount: '1200' }, true)).toBe('asset');
  });

  it('Geräte über 1.000 € immer verteilen, andere Kategorien fragen nach', () => {
    expect(entryKind(laptop, true)).toBe('asset');
    const software = { ...base, amount: '1500' }; // Büro & Software
    expect(entryKind(software, true)).toBe('ask');
    expect(entryKind({ ...software, spread: true }, true)).toBe('asset');
    expect(entryKind({ ...software, spread: false }, true)).toBe('expense');
    expect(entryKind({ ...base, categoryId: 'miete', amount: '1500' }, true)).toBe('expense');
  });

  it('Validierung: Frage beantworten, Nutzungsdauer angeben', () => {
    expect(validateExpenseForm({ ...base, amount: '1500' }, today, true).spread).toBeDefined();
    expect(validateExpenseForm(laptop, today, true).usefulLife).toBeDefined();
    expect(validateExpenseForm({ ...laptop, usefulLife: '3' }, today, true)).toEqual({});
  });

  it('Werte für die Anlage: netto bei USt-Pflichtigen', () => {
    expect(computeAssetValues({ ...laptop, amount: '1800', usefulLife: '3' }, false)).toEqual({
      category_label: 'Geräte & Ausrüstung',
      amount: 1800,
      amount_net: 1500,
      useful_life_years: 3,
    });
    expect(computeAssetValues({ ...laptop, usefulLife: '5' }, true)).toMatchObject({ amount_net: null, useful_life_years: 5 });
  });
});

describe('Diäten und Nächtigung', () => {
  it('Tagesgeld aus der Reisedauer, ohne USt', () => {
    const t = { ...base, categoryId: 'tagesgeld', amount: '', hours: '10' };
    expect(validateExpenseForm(t, today, false)).toEqual({});
    expect(computeExpenseValues(t, false)).toMatchObject({ e1a_kz: '9160', category_label: 'Tagesgeld (Diäten)', amount: 25, amount_net: null, deductible_amount: 25, trip_hours: 10 });
    expect(computeExpenseValues({ ...t, hours: '4' }, true)).toMatchObject({ amount: 10 });
    expect(computeExpenseValues({ ...t, hours: '12' }, true)).toMatchObject({ amount: 30 });
  });

  it('Tagesgeld: nur ganze Stunden von 4 bis 12 (angefangene Stunden aufrunden)', () => {
    const t = { ...base, categoryId: 'tagesgeld', amount: '' };
    expect(validateExpenseForm({ ...t, hours: '3' }, today, true).hours).toMatch(/ab 4 angefangenen Stunden/);
    expect(validateExpenseForm({ ...t, hours: '13' }, today, true).hours).toMatch(/Höchstens 12 Stunden/);
    expect(validateExpenseForm({ ...t, hours: '9,5' }, today, true).hours).toMatch(/ganze Stunden/);
    expect(validateExpenseForm({ ...t, hours: '9.5' }, today, true).hours).toMatch(/ganze Stunden/);
    expect(validateExpenseForm({ ...t, hours: '' }, today, true).hours).toMatch(/ganze Stunden/);
    expect(validateExpenseForm({ ...t, hours: '4' }, today, true)).toEqual({});
  });

  it('Nächtigung pauschal pro Nacht', () => {
    const n = { ...base, categoryId: 'naechtigung', amount: '', nights: '2' };
    expect(validateExpenseForm(n, today, true)).toEqual({});
    expect(computeExpenseValues(n, true)).toMatchObject({ amount: 34, deductible_amount: 34, nights: 2 });
    expect(validateExpenseForm({ ...n, nights: '1,5' }, today, true).nights).toBeDefined();
  });

  it('weiterverrechnet wird nur bei Fahrten & Reisen gespeichert', () => {
    expect(computeExpenseValues({ ...base, reimbursed: true }, true).reimbursed).toBe(false);
    expect(computeExpenseValues({ ...base, categoryId: 'reisen', reimbursed: true }, true).reimbursed).toBe(true);
  });
});

describe('Summen je Gewinnermittlungsart', () => {
  const row = (category_label: string, d: number, reimbursed = false) => ({ category_label, amount: d, deductible_amount: d, is_bewirtung: false, reimbursed });
  const rows = [
    row('Büro & Software', 100),
    row('Öffi-Karte (50 %)', 500),
    row('Fahrten & Reisen', 300), // nicht weiterverrechnet → zählt bei Pauschalierung nicht
    row('Fahrten & Reisen', 200, true),
    row('Waren & Material', 1000),
    row('Subaufträge & Freelancer', 400),
  ];

  it('EÜR: alles; KU-Pauschalierung: Öffi + weiterverrechnete Reise; Basis zusätzlich Waren und Fremdleistungen', () => {
    const t = expenseTotals(rows);
    expect(t.deductible).toBe(2500);
    expect(t.pauschalExtras).toEqual({ ku: 700, basis: 2100 });
    expect(t.reimbursedTravel).toBe(200);
    // Ohne gespeicherten absetzbaren Betrag: nach den Regeln berechnen (Geschäftsessen 50 %)
    expect(expenseTotals([{ category_label: 'Geschäftsessen (50 %)', amount: 80, deductible_amount: null, is_bewirtung: true, reimbursed: false }]).deductible).toBe(40);
    expect(expenseTotals([]).deductible).toBe(0);
    // „weiterverrechnet“ zählt nur bei Reisekosten
    expect(expenseTotals([row('Büro & Software', 50, true)]).reimbursedTravel).toBe(0);
    expect(pauschalExtrasFor(t, 'ku')).toBe(700);
    expect(pauschalExtrasFor(t, 'basis_6')).toBe(2100);
  });

  it('countsAlongsidePauschal', () => {
    expect(countsAlongsidePauschal(row('Waren & Material', 1), 'ku')).toBe(false);
    expect(countsAlongsidePauschal(row('Waren & Material', 1), 'basis_15')).toBe(true);
    expect(countsAlongsidePauschal(row('Unbekannt', 1), 'basis_15')).toBe(false);
  });
});
