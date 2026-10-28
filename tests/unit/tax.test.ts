import { describe, expect, it } from 'vitest';
import {
  calculateAdditionalIncomeTax,
  calculateIncomeTax,
  calculateInvoiceTotals,
  calculateLineItemTotal,
  calculateVat,
  getKleinunternehmerStatus,
  isValidVatRate,
  validateInvoiceUStG11,
  type UStG11Input,
} from '@/lib/tax';
import { formatDecimalInput, formatEuro, parseDecimal, round2 } from '@/lib/money';

describe('calculateIncomeTax (Tarif 2026)', () => {
  it.each([
    [-1000, 0],
    [0, 0],
    [13539, 0],
    [21992, 1690.6],
    [30000, 4093],
    [36458, 6030.4],
    [1200000, 593720.82],
  ])('%f € → %f €', (income, tax) => {
    expect(calculateIncomeTax(income)).toBe(tax);
  });
});

describe('calculateAdditionalIncomeTax', () => {
  it('ohne andere Einkünfte = normale Einkommensteuer', () => {
    expect(calculateAdditionalIncomeTax(30000, 0)).toBe(calculateIncomeTax(30000));
  });
  it('mit Gehalt: Steuer auf alles minus Steuer aufs Gehalt', () => {
    // Steuer(26.000) − Steuer(18.000) = 2.893,00 − 892,20
    expect(calculateAdditionalIncomeTax(8000, 18000)).toBe(2000.8);
  });
  it('Verlust senkt nicht unter 0', () => {
    expect(calculateAdditionalIncomeTax(-5000, 18000)).toBe(0);
  });
});

describe('Umsatzsteuer', () => {
  it('gültige Steuersätze', () => {
    expect([0, 10, 13, 20].every(isValidVatRate)).toBe(true);
    expect(isValidVatRate(19)).toBe(false);
  });

  it('calculateVat', () => {
    expect(calculateVat(100, 20)).toEqual({ net: 100, vat: 20, gross: 120 });
    expect(calculateVat(99.99, 13)).toEqual({ net: 99.99, vat: 13, gross: 112.99 });
    expect(calculateVat(50, 0)).toEqual({ net: 50, vat: 0, gross: 50 });
  });

  it('calculateLineItemTotal rundet auf Cent', () => {
    expect(calculateLineItemTotal(3, 0.1)).toBe(0.3);
    expect(calculateLineItemTotal(1.5, 95)).toBe(142.5);
  });

  it('calculateInvoiceTotals mit USt', () => {
    expect(
      calculateInvoiceTotals({
        lineItems: [
          { quantity: 20, unit_price: 95 },
          { quantity: 1, unit_price: 2800 },
        ],
        vatRate: 20,
        isKleinunternehmer: false,
      }),
    ).toEqual({ subtotal: 4700, vatRate: 20, vatAmount: 940, total: 5640 });
  });

  it('Kleinunternehmer: USt immer 0 %, egal was gewählt ist', () => {
    expect(
      calculateInvoiceTotals({ lineItems: [{ quantity: 1, unit_price: 1000 }], vatRate: 20, isKleinunternehmer: true }),
    ).toEqual({ subtotal: 1000, vatRate: 0, vatAmount: 0, total: 1000 });
  });
});

describe('getKleinunternehmerStatus', () => {
  it.each([
    [30000, 'ok'],
    [45000, 'ok'],
    [45001, 'approaching'],
    [55000, 'approaching'],
    [55001, 'tolerance'],
    [60500, 'tolerance'],
    [60501, 'exceeded'],
  ] as const)('%f € → %s', (revenue, status) => {
    expect(getKleinunternehmerStatus(revenue)).toBe(status);
  });
});

describe('validateInvoiceUStG11', () => {
  const valid: UStG11Input = {
    issuer: {
      name: 'Klaro Test GmbH',
      address: 'Mariahilfer Straße 1',
      zip_code: '1060',
      city: 'Wien',
      iban: 'AT61 1904 3002 3457 3201',
      isKleinunternehmer: true,
    },
    recipient: { name: 'Alpenblick Hotel GmbH', address: 'Hauptplatz 5', zip_code: '6020', city: 'Innsbruck' },
    invoiceNumber: '2026-001',
    invoiceDate: '2026-10-03',
    serviceDate: '2026-09-30',
    lineItems: [{ description: 'Website', quantity: 1 }],
    total: 4200,
  };

  it('vollständige Rechnung ist gültig', () => {
    expect(validateInvoiceUStG11(valid)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('meldet fehlende Pflichtangaben', () => {
    const r = validateInvoiceUStG11({
      issuer: { isKleinunternehmer: false, name: ' ' },
      recipient: null,
      invoiceNumber: '',
      invoiceDate: null,
      serviceDate: null,
      lineItems: [],
      total: 500,
    });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual([
      'Dein Name bzw. Firmenname fehlt.',
      'Deine vollständige Anschrift fehlt.',
      'Name des Kunden fehlt.',
      'Vollständige Anschrift des Kunden fehlt.',
      'Deine UID-Nummer fehlt (Pflicht für USt-pflichtige Rechnungen über 400 €).',
      'Rechnungsnummer fehlt.',
      'Rechnungsdatum fehlt.',
      'Leistungsdatum bzw. Leistungszeitraum fehlt.',
      'Mindestens eine Position ist erforderlich.',
      'IBAN fehlt – ohne sie kann dein Kunde nicht überweisen.',
    ]);
  });

  it('Positionen brauchen Bezeichnung und Menge > 0', () => {
    const r = validateInvoiceUStG11({ ...valid, lineItems: [{ description: '', quantity: 0 }] });
    expect(r.errors).toEqual(['Jede Position braucht eine Bezeichnung.', 'Jede Position braucht eine Menge größer 0.']);
  });

  it('Kleinbetragsrechnung (≤ 400 €): keine Empfängerangaben nötig', () => {
    expect(validateInvoiceUStG11({ ...valid, recipient: null, total: 400 }).valid).toBe(true);
  });

  it('Empfänger ohne vollständige Adresse', () => {
    const r = validateInvoiceUStG11({ ...valid, recipient: { name: 'Huber', city: 'Salzburg' } });
    expect(r.errors).toEqual(['Vollständige Anschrift des Kunden fehlt.']);
  });

  it('USt-pflichtig mit UID ist gültig', () => {
    const r = validateInvoiceUStG11({ ...valid, issuer: { ...valid.issuer, isKleinunternehmer: false, uid_number: 'ATU12345678' } });
    expect(r.valid).toBe(true);
  });

  it('über 10.000 €: Warnung bei fehlender Kunden-UID', () => {
    expect(validateInvoiceUStG11({ ...valid, total: 12000 }).warnings).toHaveLength(1);
    expect(
      validateInvoiceUStG11({ ...valid, total: 12000, recipient: { ...valid.recipient, uid_number: 'ATU1' } }).warnings,
    ).toEqual([]);
  });
});

describe('money', () => {
  it('round2 vermeidet Float-Artefakte', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
  it('formatEuro im österreichischen Format', () => {
    expect(formatEuro(1234.5)).toMatch(/1\.234,50/);
    expect(formatEuro(1234.5, true)).toMatch(/1\.235/);
    expect(formatEuro(1234.5, true)).not.toMatch(/,/);
  });
});

describe('parseDecimal / formatDecimalInput', () => {
  it.each([
    ['95', 95],
    ['1234,5', 1234.5],
    ['1.234,50', 1234.5],
    ['1234.50', 1234.5],
    ['1.234', 1234],
    ['€ 1.200', 1200],
    ['0,333', 0.333],
    ['-5', -5],
  ])('%s → %f', (input, expected) => expect(parseDecimal(input)).toBe(expected));
  it.each(['', 'abc', '1,2,3', '12a'])('ungültig: „%s“', (input) => expect(parseDecimal(input)).toBeNaN());
  it('formatDecimalInput', () => expect(formatDecimalInput(1234.5)).toBe('1234,5'));
});
