import { describe, expect, it } from 'vitest';
import {
  CASH_TEXT,
  closingTextFor,
  contrastOnWhite,
  DEFAULT_TEMPLATE,
  descriptionLines,
  DESIGNS,
  fillPlaceholders,
  MIN_CONTRAST,
  normalizeTemplate,
  parseInline,
  parseRichText,
  tint,
} from '@/lib/invoiceTemplates';
import { parseLineItems } from '@/lib/invoices';

describe('normalizeTemplate', () => {
  it('leer, null oder kaputt → Standard', () => {
    expect(normalizeTemplate(null)).toEqual(DEFAULT_TEMPLATE);
    expect(normalizeTemplate({})).toEqual(DEFAULT_TEMPLATE);
    expect(normalizeTemplate('x')).toEqual(DEFAULT_TEMPLATE);
  });

  it('übernimmt Gültiges, ersetzt Ungültiges', () => {
    const t = normalizeTemplate({
      color: '#1E4E8C',
      font: 'comic-sans',
      header: { style: 'image', logoPath: 'u/logo.png', logoSize: 'xxl' },
      footer: { text: 'Firmenbuch FN 123' },
      payment: { days: 30, box: false },
      kuNote: 'irgendwo',
    });
    expect(t.color).toBe('#1e4e8c');
    expect(t.font).toBe('helvetica');
    expect(t.header).toMatchObject({ style: 'image', logoPath: 'u/logo.png', imagePath: null, logoSize: 'm' });
    expect(t.footer).toEqual({ style: 'lines', contact: '', bankExtra: '', tinted: true, text: 'Firmenbuch FN 123' });
    expect(t.payment).toEqual({ days: 30, terms: '', box: false, qr: true, cashText: CASH_TEXT });
    expect(t.kuNote).toBe('below');
  });

  it('Zahlungsziel nur ganze Tage 0–365', () => {
    expect(normalizeTemplate({ payment: { days: -3 } }).payment.days).toBe(14);
    expect(normalizeTemplate({ payment: { days: 7.5 } }).payment.days).toBe(14);
    expect(normalizeTemplate({ payment: { days: 0 } }).payment.days).toBe(0);
  });

  it('alle Designs sind vollständig und gut lesbar', () => {
    for (const d of DESIGNS) {
      expect(normalizeTemplate(d.settings)).toEqual(d.settings);
      expect(contrastOnWhite(d.settings.color)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe('Farbe', () => {
  it('Kontrast zu Weiß', () => {
    expect(contrastOnWhite('#000000')).toBe(21);
    expect(contrastOnWhite('#ffffff')).toBe(1);
    expect(contrastOnWhite('#ffeb3b')).toBeLessThan(MIN_CONTRAST); // Gelb: zu hell
  });
  it('tint mischt mit Weiß', () => {
    expect(tint('#000000', 0.5)).toBe('#808080');
    expect(tint('#1e4e8c', 0)).toBe('#1e4e8c');
  });
});

describe('Platzhalter', () => {
  const values = { Rechnungsnummer: 'RE-2026027', Zahlungsziel: '14 Tagen', Kunde: 'Anna' };
  it('ersetzt bekannte, unabhängig von Groß-/Kleinschreibung', () => {
    expect(fillPlaceholders('Bitte binnen {Zahlungsziel} mit „{rechnungsnummer}“, {Kunde}.', values)).toBe('Bitte binnen 14 Tagen mit „RE-2026027“, Anna.');
  });
  it('lässt Unbekanntes und fehlende Werte stehen', () => {
    expect(fillPlaceholders('{Fällig am} · {Foo}', values)).toBe('{Fällig am} · {Foo}');
  });
});

describe('Formatierung', () => {
  it('fett und kursiv', () => {
    expect(parseInline('Gesamt **1.280 €** – *freiwillig*.')).toEqual([
      { text: 'Gesamt ' },
      { text: '1.280 €', bold: true },
      { text: ' – ' },
      { text: 'freiwillig', italic: true },
      { text: '.' },
    ]);
  });

  it('Absätze, Aufzählungen, Zeilenumbrüche', () => {
    expect(parseRichText('Zeile 1\nZeile 2\n\n- eins\n• zwei\nDanach\n\n\n')).toEqual([
      { kind: 'paragraph', segments: [{ text: 'Zeile 1\nZeile 2' }] },
      { kind: 'list', items: [[{ text: 'eins' }], [{ text: 'zwei' }]] },
      { kind: 'paragraph', segments: [{ text: 'Danach' }] },
    ]);
    expect(parseRichText('')).toEqual([]);
    expect(parseRichText(null)).toEqual([]);
  });

  it('Bezeichnung einer Position', () => {
    expect(descriptionLines('Equipment\n• Mischpult\n- Lichtanlage\n\nInkl. Aufbau')).toEqual([
      { text: 'Equipment', bullet: false },
      { text: 'Mischpult', bullet: true },
      { text: 'Lichtanlage', bullet: true },
      { text: 'Inkl. Aufbau', bullet: false },
    ]);
  });
});

describe('Positionen mit Einheit', () => {
  it('Einheit wird gespeichert, leere fällt weg; Zeilen bleiben', () => {
    expect(
      parseLineItems([
        { description: ' DJ \n• Licht ', quantity: '4', unit_price: '150', unit: ' Std. ' },
        { description: 'Fahrt', quantity: '60', unit_price: '0,5', unit: '' },
      ]),
    ).toEqual([
      { description: 'DJ \n• Licht', quantity: 4, unit_price: 150, total: 600, unit: 'Std.' },
      { description: 'Fahrt', quantity: 60, unit_price: 0.5, total: 30 },
    ]);
  });
});

describe('closingTextFor', () => {
  it('Bar-Text aus der Vorlage, sonst der normale Text unten', () => {
    const s = normalizeTemplate({ closing: { text: 'Bitte überweisen.' } });
    expect(closingTextFor(s, 'transfer')).toBe('Bitte überweisen.');
    expect(closingTextFor(s, 'cash')).toBe(CASH_TEXT);
    expect(closingTextFor(normalizeTemplate({ payment: { cashText: 'Bar erhalten, danke!' } }), 'cash')).toBe('Bar erhalten, danke!');
  });
});
