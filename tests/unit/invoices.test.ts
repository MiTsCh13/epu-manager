import { describe, expect, it } from 'vitest';
import {
  addDays,
  emptyLineItem,
  formatDate,
  hasFormErrors,
  parseLineItems,
  validateInvoiceForm,
  stepQuantity,
  stornoDate,
  correctionDraftFrom,
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

describe('stepQuantity', () => {
  it.each([
    ['1', 1, '2'],
    ['2', -1, '1'],
    ['1', -1, '1'],
    ['1,5', 1, '2,5'],
    ['2,5', -1, '1,5'],
    ['1,5', -1, '1,5'],
    ['0,5', 1, '1,5'],
    ['', 1, '1'],
    ['abc', 1, '1'],
    ['0,1', 1, '1,1'],
    ['', -1, ''],
    ['abc', -1, 'abc'],
    ['0,5', -1, '0,5'],
    ['1,2345', 1, '2,2345'],
  ] as const)('%s %i → %s', (value, delta, expected) => {
    expect(stepQuantity(value, delta)).toBe(expected);
  });
});

describe('Stornieren', () => {
  it('Anzeige-Status: Stornorechnung und stornierte (auch bezahlte) Rechnung', () => {
    expect(getDisplayStatus({ status: 'paid', due_date: null, cancels_invoice_id: 'o' })).toBe('storno');
    expect(getDisplayStatus({ status: 'cancelled', due_date: null, cancels_invoice_id: 'o' })).toBe('storno');
    expect(getDisplayStatus({ status: 'paid', due_date: null, cancelled_at: '2026-10-29T10:00:00Z' })).toBe('cancelled');
    expect(getDisplayStatus({ status: 'cancelled', due_date: '2000-01-01', cancelled_at: '2026-10-29T10:00:00Z' })).toBe('cancelled');
    expect(matchesFilter('cancelled', 'open')).toBe(false);
    expect(matchesFilter('storno', 'paid')).toBe(false);
  });

  it('stornoDate: heute, aber nie vor dem Rechnungsdatum', () => {
    expect(stornoDate('2026-10-01', '2026-10-29')).toBe('2026-10-29');
    expect(stornoDate('2026-11-05', '2026-10-29')).toBe('2026-11-05');
  });

  it('correctionDraftFrom: Entwurf mit neuer Nummer, heute, gleiches Zahlungsziel', () => {
    const d = correctionDraftFrom(
      {
        client_id: 'c',
        invoice_date: '2026-10-01',
        due_date: '2026-10-15',
        is_honorarnote: false,
        line_items: [{ description: 'A', quantity: 1, unit_price: 10, total: 10 }],
        vat_rate: 20,
        service_date_from: '2026-09-30',
        service_date_to: null,
        payment_method: 'transfer',
        template_id: 't',
        intro_text: 'Hallo',
        notes: null,
        footer_text: null,
      },
      '2026-012',
      '2026-10-29',
    );
    expect(d).toMatchObject({ status: 'draft', invoice_number: '2026-012', invoice_date: '2026-10-29', due_date: '2026-11-12', client_id: 'c', service_date_from: '2026-09-30' });
    expect(correctionDraftFrom({ ...d, invoice_date: '2026-10-01', due_date: null } as never, 'x', '2026-10-29').due_date).toBeNull();
  });
});
