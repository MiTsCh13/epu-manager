import { describe, expect, it } from 'vitest';
import {
  addDays,
  emptyLineItem,
  formatDate,
  hasFormErrors,
  parseLineItems,
  validateInvoiceForm,
  getDisplayStatus,
  invoiceYear,
  matchesFilter,
  toISODate,
} from '@/lib/invoices';

describe('Datum', () => {
  it('toISODate ohne Zeitzonen-Verschiebung', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('addDays über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-10-03', 14)).toBe('2026-10-17');
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
    expect(addDays('2028-02-20', 10)).toBe('2028-03-01');
  });
  it('formatDate', () => {
    expect(formatDate('2026-10-03')).toBe('03.10.2026');
    expect(formatDate('2026-10-03T12:00:00Z')).toBe('03.10.2026');
    expect(formatDate(null)).toBe('');
  });
  it('invoiceYear', () => expect(invoiceYear('2027-01-02')).toBe(2027));
});

describe('getDisplayStatus', () => {
  const today = '2026-10-03';
  it.each([
    [{ status: 'draft', due_date: '2026-01-01' }, 'draft'],
    [{ status: 'paid', due_date: '2026-01-01' }, 'paid'],
    [{ status: 'sent', due_date: '2026-10-03' }, 'sent'], // Fälligkeitstag selbst noch nicht überfällig
    [{ status: 'sent', due_date: '2026-10-02' }, 'overdue'],
    [{ status: 'sent', due_date: null }, 'sent'],
    [{ status: 'overdue', due_date: '2026-12-01' }, 'sent'], // gespeichertes „overdue“ wird neu bewertet
  ] as const)('%o → %s', (inv, expected) => {
    expect(getDisplayStatus(inv, today)).toBe(expected);
  });
  it('verwendet standardmäßig heute', () => {
    expect(getDisplayStatus({ status: 'sent', due_date: '2000-01-01' })).toBe('overdue');
  });
});

describe('matchesFilter', () => {
  it.each([
    ['all', ['draft', 'sent', 'paid', 'overdue']],
    ['open', ['sent', 'overdue']],
    ['paid', ['paid']],
    ['overdue', ['overdue']],
  ] as const)('%s', (filter, expected) => {
    const all = ['draft', 'sent', 'paid', 'overdue'] as const;
    expect(all.filter((s) => matchesFilter(s, filter))).toEqual(expected);
  });
});

it('emptyLineItem', () => {
  expect(emptyLineItem()).toEqual({ description: '', quantity: 1, unit_price: 0, total: 0 });
});

describe('parseLineItems', () => {
  it('liest deutsche Zahlen, ignoriert leere Zeilen, ungültig → 0', () => {
    expect(
      parseLineItems([
        { description: ' Workshop ', quantity: '1,5', unit_price: '1.200,00' },
        { description: '', quantity: '', unit_price: '' },
        { description: 'Kaputt', quantity: 'x', unit_price: 'y' },
      ]),
    ).toEqual([
      { description: 'Workshop', quantity: 1.5, unit_price: 1200, total: 1800 },
      { description: 'Kaputt', quantity: 0, unit_price: 0, total: 0 },
    ]);
  });
});

describe('validateInvoiceForm', () => {
  const valid = {
    invoiceNumber: '2026-009',
    invoiceDate: '2026-10-03',
    dueDate: '2026-10-17',
    serviceFrom: '2026-09-01',
    serviceTo: '2026-09-30',
    items: [{ description: 'Beratung', quantity: '2', unit_price: '95' }],
  };

  it('gültig', () => {
    expect(validateInvoiceForm(valid)).toEqual({});
    expect(hasFormErrors({})).toBe(false);
  });

  it('Pflichtfelder und Datumsreihenfolge', () => {
    const e = validateInvoiceForm({ ...valid, invoiceNumber: ' ', invoiceDate: '', serviceTo: '2026-08-01' });
    expect(Object.keys(e).sort()).toEqual(['invoiceDate', 'invoiceNumber', 'serviceTo']);
    expect(validateInvoiceForm({ ...valid, dueDate: '2026-10-01' }).dueDate).toBeDefined();
    expect(hasFormErrors(e)).toBe(true);
  });

  it('optionale Daten dürfen leer sein', () => {
    expect(validateInvoiceForm({ ...valid, dueDate: '', serviceTo: '' })).toEqual({});
  });

  it('Positionen: mindestens eine, gültige Zahlen', () => {
    expect(validateInvoiceForm({ ...valid, items: [{ description: '', quantity: '', unit_price: '' }] }).items).toBeDefined();
    // Neue Zeile mit vorbelegter Menge „1“ gilt als leer
    expect(validateInvoiceForm({ ...valid, items: [{ description: '', quantity: '1', unit_price: '' }] })).toEqual({
      items: 'Füge mindestens eine Position hinzu.',
    });
    const e = validateInvoiceForm({
      ...valid,
      items: [
        { description: 'A', quantity: '0', unit_price: '-1' },
        { description: 'B', quantity: '1', unit_price: 'abc' },
        { description: 'C', quantity: 'zwei', unit_price: '5' },
      ],
    });
    expect(e.itemErrors).toEqual({
      0: { quantity: 'Ungültige Menge', unit_price: 'Ungültiger Preis' },
      1: { unit_price: 'Ungültiger Preis' },
      2: { quantity: 'Ungültige Menge' },
    });
  });
});
