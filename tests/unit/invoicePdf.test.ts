import { describe, expect, it } from 'vitest';
import { buildInvoicePdfData, invoiceFileName } from '@/lib/invoicePdf';
import type { Invoice } from '@/types';

// Intl formatiert „€ 1,00“ mit geschütztem Leerzeichen – für lesbare Erwartungen normalisieren
const build = (i: Invoice) => JSON.parse(JSON.stringify(buildInvoicePdfData(i)).replace(/\u00a0/g, ' ')) as ReturnType<typeof buildInvoicePdfData>;

const base = {
  id: 'x',
  user_id: 'u',
  client_id: 'c',
  invoice_number: '2026-003',
  invoice_date: '2026-04-10',
  due_date: '2026-04-24',
  service_date_from: '2026-04-01',
  service_date_to: null,
  status: 'sent',
  is_honorarnote: false,
  line_items: [
    { description: 'Wartung & Support', quantity: 20, unit_price: 95, total: 1900 },
    { description: 'Buchungsmodul', quantity: 1.5, unit_price: 1000, total: 1500 },
  ],
  subtotal: 3400,
  vat_rate: 0,
  vat_amount: 0,
  total: 3400,
  notes: 'Vielen Dank!',
  footer_text: 'Fußzeile',
  paid_at: null,
  created_at: '2026-04-10',
  client_snapshot: { name: 'Alpenblick Hotel GmbH', address: 'Hauptplatz 5', zip_code: '6020', city: 'Innsbruck', country: 'AT', uid_number: 'ATU12345678' },
  issuer_snapshot: {
    full_name: 'Max Mustermann',
    business_name: 'Klaro Test GmbH',
    address: 'Mariahilfer Straße 1',
    zip_code: '1060',
    city: 'Wien',
    country: 'AT',
    uid_number: null,
    iban: 'AT61 1904 3002 3457 3201',
    account_holder: 'Klaro Test GmbH Konto',
    is_kleinunternehmer: true,
  },
} as unknown as Invoice;

describe('buildInvoicePdfData – §11 UStG Pflichtangaben', () => {
  const d = build(base);

  it('1. Name und Anschrift des Leistenden', () => {
    expect(d.issuerName).toBe('Klaro Test GmbH');
    // Anschrift nicht im Kopf (steht in Absenderzeile und Fußzeile), nur der Inhaber neben dem Firmennamen
    expect(d.issuerLines).toEqual(['Max Mustermann']);
    expect(d.senderLine).toBe('Klaro Test GmbH · Mariahilfer Straße 1 · 1060 Wien');
  });
  it('2. Name und Anschrift des Empfängers', () => {
    expect(d.recipientLines).toEqual(['Alpenblick Hotel GmbH', 'Hauptplatz 5', '6020 Innsbruck']);
  });
  it('3./4. Datum, fortlaufende Nummer, Leistungsdatum, Fälligkeit, Kunden-UID', () => {
    expect(d.meta).toEqual([
      ['Rechnungsnummer', '2026-003'],
      ['Rechnungsdatum', '10.04.2026'],
      ['Leistungsdatum', '01.04.2026'],
      ['Zahlbar bis', '24.04.2026'],
      ['UID-Nr. Kunde', 'ATU12345678'],
    ]);
  });
  it('5./6. Menge, Bezeichnung, Entgelt', () => {
    expect(d.items[1]).toEqual({
      description: 'Buchungsmodul',
      lines: [{ text: 'Buchungsmodul', bullet: false }],
      quantity: '1,5',
      unitPrice: '€ 1.000,00',
      total: '€ 1.500,00',
    });
    expect(d.grandTotal).toBe('€ 3.400,00');
  });
  it('7./8. Kleinunternehmer: Steuerbefreiungshinweis, keine USt-Zeile', () => {
    expect(d.taxNote).toContain('§ 6 Abs. 1 Z 27 UStG');
    expect(d.totals).toEqual([['Summe netto', '€ 3.400,00']]);
  });
  it('10. IBAN mit Kontoinhaber (Empfängerüberprüfung) und EPC-QR-Code', () => {
    expect(d.payment?.intro).toBe('Bitte überweisen Sie € 3.400,00 bis 24.04.2026 an:');
    expect(d.payment?.rows).toEqual([
      ['Empfänger', 'Klaro Test GmbH Konto'],
      ['IBAN', 'AT61 1904 3002 3457 3201'],
      ['Verwendungszweck', '2026-003'],
    ]);
    expect(d.payment?.epcPayload).toBe(
      ['BCD', '002', '1', 'SCT', '', 'Klaro Test GmbH Konto', 'AT611904300234573201', 'EUR3400.00', '', '', 'Rechnung 2026-003'].join('\n'),
    );
    expect(d.footerLines).toEqual([
      'Klaro Test GmbH · Mariahilfer Straße 1 · 1060 Wien',
      'Klaro Test GmbH Konto · IBAN AT61 1904 3002 3457 3201',
    ]);
  });
  it('Texte und Dateiname', () => {
    expect(d.title).toBe('Rechnung');
    expect(d.isDraft).toBe(false);
    expect(d.closing).toEqual({ title: null, blocks: [{ kind: 'paragraph', segments: [{ text: 'Vielen Dank!' }] }], boxed: false });
    expect(d.footerText).toBe('Fußzeile');
    expect(d.fileName).toBe('Rechnung_2026-003.pdf');
  });
});

describe('buildInvoicePdfData – Varianten', () => {
  it('USt-pflichtig: Steuersatz, Steuerbetrag, eigene UID (9.)', () => {
    const d = build({
      ...base,
      vat_rate: 20,
      vat_amount: 680,
      total: 4080,
      issuer_snapshot: { ...(base.issuer_snapshot as object), is_kleinunternehmer: false, uid_number: 'ATU87654321' },
    } as unknown as Invoice);
    expect(d.totals).toEqual([
      ['Summe netto', '€ 3.400,00'],
      ['USt 20 %', '€ 680,00'],
    ]);
    expect(d.taxNote).toBeNull();
    expect(d.meta).toContainEqual(['UID-Nr.', 'ATU87654321']);
    expect(d.footerLines[1]).toBe('UID ATU87654321 · Klaro Test GmbH Konto · IBAN AT61 1904 3002 3457 3201');
  });

  it('USt-pflichtig mit 0 %: Hinweis auf Steuerfreiheit', () => {
    const d = build({
      ...base,
      issuer_snapshot: { ...(base.issuer_snapshot as object), is_kleinunternehmer: false },
    } as unknown as Invoice);
    expect(d.taxNote).toContain('Steuerfreie Leistung');
  });

  it('Honorarnote, Entwurf, Leistungszeitraum, Ausland, ohne Fälligkeit/IBAN', () => {
    const d = build({
      ...base,
      is_honorarnote: true,
      status: 'draft',
      invoice_number: 'KL 2026/001',
      service_date_to: '2026-04-30',
      due_date: null,
      client_snapshot: { name: 'Muster AG', zip_code: '80331', city: 'München', country: 'DE' },
      issuer_snapshot: { full_name: 'Nora Neu', address: 'Neubaugasse 7', zip_code: '1070', city: 'Wien' },
    } as unknown as Invoice);
    expect(d.title).toBe('Honorarnote');
    expect(d.isDraft).toBe(true);
    expect(d.fileName).toBe('Entwurf_Honorarnote_KL_2026_001.pdf');
    expect(d.meta).toContainEqual(['Leistungszeitraum', '01.04.2026 – 30.04.2026']);
    expect(d.meta).toContainEqual(['Honorarnoten-Nummer', 'KL 2026/001']);
    expect(d.meta.map(([k]) => k)).toContain('Ausstellungsdatum');
    expect(d.meta.map(([k]) => k)).not.toContain('Zahlbar bis');
    expect(d.recipientLines).toEqual(['Muster AG', '80331 München', 'Deutschland']);
    expect(d.issuerName).toBe('Nora Neu');
    expect(d.issuerLines).toEqual([]);
    expect(d.payment).toBeNull();
    // ohne is_kleinunternehmer im Snapshot: aus USt-Satz 0 abgeleitet
    expect(d.taxNote).toContain('§ 6 Abs. 1 Z 27');
  });

  it('IBAN ohne Fälligkeit, fehlende Snapshots und Positionen', () => {
    const d = build({
      ...base,
      due_date: null,
      client_snapshot: null,
      issuer_snapshot: null,
      line_items: null,
      vat_rate: 20,
    } as unknown as Invoice);
    expect(d.recipientLines).toEqual([]);
    expect(d.items).toEqual([]);
    expect(d.issuerName).toBe('');
    expect(d.footerLines).toEqual([]);
    expect(d.taxNote).toBeNull();
    const e = build({ ...base, due_date: null } as unknown as Invoice);
    expect(e.payment?.intro).toBe('Bitte überweisen Sie € 3.400,00 an:');
    // ohne eigenen Kontoinhaber: Name des Unternehmens
    const f = build({ ...base, issuer_snapshot: { ...(base.issuer_snapshot as object), account_holder: null } } as unknown as Invoice);
    expect(f.payment?.rows[0]).toEqual(['Empfänger', 'Klaro Test GmbH']);
  });

  it('ohne Leistungsdatum: Rechnungsdatum als Fallback', () => {
    expect(build({ ...base, service_date_from: null } as unknown as Invoice).meta).toContainEqual(['Leistungsdatum', '10.04.2026']);
  });

  it('Empfänger ohne Namen', () => {
    const d = build({ ...base, client_snapshot: { city: 'Wien' } } as unknown as Invoice);
    expect(d.recipientLines).toEqual(['Wien']);
  });

  it('invoiceFileName', () => {
    expect(invoiceFileName('Rechnung', '2026-001', false)).toBe('Rechnung_2026-001.pdf');
  });
});

describe('buildInvoicePdfData – Vorlage', () => {
  const template = {
    color: '#1e4e8c',
    font: 'times',
    header: { style: 'image' },
    closing: { title: 'Danke, {Kunde}!', boxed: true },
    greeting: { text: 'Liebe Grüße,', signature: 'Max // Klaro' },
    footer: { style: 'columns', contact: 'Tel. 0660 123\nwww.klaro.at' },
    payment: { box: false, terms: '2 % Skonto bis {Fällig am}' },
    table: { priceFirst: true },
    kuNote: 'totals',
  };
  const d = build({
    ...base,
    template_snapshot: template,
    intro_text: 'Hiermit stelle ich in Rechnung:',
    notes: 'Bitte überweise **{Rechnungsbetrag}** binnen {Zahlungsziel} mit „{Rechnungsnummer}“.\n\n*Trinkgeld freiwillig.*',
    line_items: [
      { description: 'DJ-Tätigkeit', quantity: 4, unit_price: 150, total: 600, unit: 'Std.' },
      { description: 'Equipment\n• Mischpult\n- Lichtanlage', quantity: 1, unit_price: 650, total: 650, unit: 'pauschal' },
    ],
  } as unknown as Invoice);

  it('Platzhalter, Formatierung, Einleitung', () => {
    expect(d.intro).toEqual([{ kind: 'paragraph', segments: [{ text: 'Hiermit stelle ich in Rechnung:' }] }]);
    expect(d.closing?.title).toBe('Danke, Alpenblick Hotel GmbH!');
    expect(d.closing?.boxed).toBe(true);
    expect(d.closing?.blocks).toEqual([
      { kind: 'paragraph', segments: [{ text: 'Bitte überweise ' }, { text: '€ 3.400,00', bold: true }, { text: ' binnen 14 Tagen mit „2026-003“.' }] },
      { kind: 'paragraph', segments: [{ text: 'Trinkgeld freiwillig.', italic: true }] },
    ]);
    expect(d.paymentTerms).toBe('2 % Skonto bis 24.04.2026');
    expect(d.greeting).toEqual({ text: 'Liebe Grüße,', signature: 'Max // Klaro' });
  });

  it('Einheiten und mehrzeilige Positionen', () => {
    expect(d.items[0]).toMatchObject({ quantity: '4', unitPrice: '€ 150,00 / Std.' });
    expect(d.items[1]).toMatchObject({
      quantity: 'pauschal',
      unitPrice: '€ 650,00',
      lines: [
        { text: 'Equipment', bullet: false },
        { text: 'Mischpult', bullet: true },
        { text: 'Lichtanlage', bullet: true },
      ],
    });
  });

  it('Kleinunternehmer-Hinweis in der Summe, keine Zahlungsbox, Fußzeile in Spalten', () => {
    expect(d.taxNoteInTotals).toBe(true);
    expect(d.taxNote).toContain('§ 6 Abs. 1 Z 27 UStG');
    expect(d.payment).toBeNull();
    expect(d.footerColumns).toEqual([
      ['Klaro Test GmbH', 'Max Mustermann', 'Mariahilfer Straße 1', '1060 Wien'].filter((l) => l !== 'Max Mustermann'),
      ['Bank: Klaro Test GmbH Konto', 'IBAN: AT61 1904 3002 3457 3201'],
      ['Tel. 0660 123', 'www.klaro.at'],
    ]);
    expect(d.template.font).toBe('times');
  });
});

describe('buildInvoicePdfData – Barzahlung', () => {
  const cash = build({ ...base, payment_method: 'cash', due_date: null, notes: 'Betrag von {Rechnungsbetrag} bar erhalten.' } as unknown as Invoice);

  it('keine Zahlungsaufforderung: ohne Zahlbar bis, Zahlungsbox, QR-Code und Zahlungsbedingungen', () => {
    expect(cash.meta).toContainEqual(['Bezahlung', 'bar']);
    expect(cash.meta.map(([k]) => k)).not.toContain('Zahlbar bis');
    expect(cash.payment).toBeNull();
    expect(build({ ...base, payment_method: 'cash', template_snapshot: { payment: { terms: '2 % Skonto' } } } as unknown as Invoice).paymentTerms).toBeNull();
  });
  it('Text unten mit Platzhaltern', () => {
    expect(cash.closing?.blocks).toEqual([{ kind: 'paragraph', segments: [{ text: 'Betrag von € 3.400,00 bar erhalten.' }] }]);
  });
  it('Überweisung bleibt wie bisher', () => {
    const d = build({ ...base, payment_method: 'transfer' } as unknown as Invoice);
    expect(d.payment).not.toBeNull();
    expect(d.meta).toContainEqual(['Zahlbar bis', '24.04.2026']);
  });
});

describe('buildInvoicePdfData – Stornorechnung', () => {
  const storno = build({
    ...base,
    invoice_number: '2026-009',
    invoice_date: '2026-05-02',
    due_date: null,
    status: 'cancelled',
    notes: null,
    intro_text: null,
    line_items: [{ description: 'Wartung & Support', quantity: 20, unit_price: -95, total: -1900 }],
    subtotal: -1900,
    total: -1900,
    cancels_invoice_id: 'orig',
    cancels_invoice_number: '2026-003',
    cancels_invoice_date: '2026-04-10',
  } as unknown as Invoice);

  it('Titel, eigene Nummer und Verweis auf Nummer + Datum der Originalrechnung', () => {
    expect(storno.title).toBe('Stornorechnung');
    expect(storno.fileName).toBe('Stornorechnung_2026-009.pdf');
    expect(storno.meta.slice(0, 3)).toEqual([
      ['Nummer', '2026-009'],
      ['Datum', '02.05.2026'],
      ['Storno zu', 'Rechnung 2026-003 vom 10.04.2026'],
    ]);
    expect(JSON.stringify(storno.intro)).toContain('Rechnung 2026-003 vom 10.04.2026 vollständig storniert');
  });

  it('Minus-Beträge, keine Zahlungsaufforderung, kein QR-Code', () => {
    expect(storno.grandTotal).toBe('-€ 1.900,00');
    expect(storno.items[0]!.total).toMatch(/^-/);
    expect(storno.payment).toBeNull();
    expect(storno.paymentTerms).toBeNull();
    expect(storno.meta.map(([k]) => k)).not.toContain('Zahlbar bis');
  });
});
