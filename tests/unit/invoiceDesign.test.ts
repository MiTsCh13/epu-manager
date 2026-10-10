import { describe, expect, it } from 'vitest';
import { buildSchema, buildUserText, normalizeResult, parseRequest, type DesignResult } from '../../supabase/functions/read-invoice-design/design';
import { adoptedSummary, designToTemplate, dominantColors } from '@/lib/invoiceDesign';

const request = {
  page: 'QUJD',
  pageWidth: 595.3,
  pageHeight: 841.9,
  lines: [
    { x: 56, y: 100, size: 10, bold: false, font: 'ABCDEF+Arial-BoldMT', text: '  Rechnung  ' },
    { x: 'x', y: 1, size: 1, text: 'kaputt' },
    { x: 1, y: 1, size: 1, text: '   ' },
  ],
  images: [{ id: 'bild1', x: 390, y: 30, width: 150, height: 50, pixelWidth: 600, pixelHeight: 200, transparent: true }],
  colors: ['#F28E2C', 'rot', '#123'],
};

describe('read-invoice-design: Anfrage', () => {
  it('prüft und bereinigt', () => {
    const r = parseRequest(request);
    expect(typeof r).toBe('object');
    if (typeof r === 'string') return;
    expect(r.lines).toEqual([{ x: 56, y: 100, size: 10, bold: false, font: 'Arial-BoldMT', text: 'Rechnung' }]);
    expect(r.colors).toEqual(['#f28e2c']);
    expect(r.images[0]).toMatchObject({ id: 'bild1', transparent: true });
  });

  it('lehnt Ungültiges ab', () => {
    expect(parseRequest(null)).toBe('Ungültige Anfrage.');
    expect(parseRequest({ ...request, page: '' })).toBe('Die Rechnung fehlt.');
    expect(parseRequest({ ...request, page: 'äöü' })).toBe('Die Rechnung ist beschädigt.');
    expect(parseRequest({ ...request, pageWidth: 5 })).toBe('Ungültige Seitengröße.');
    expect(parseRequest({ ...request, images: [{ ...request.images[0], id: '../x' }] })).toBe('Ungültige Bilder.');
  });

  it('Schema: Bilder nur aus der Liste, ohne Bilder ein freies Feld (normalizeResult verwirft es)', () => {
    const s = buildSchema(['bild1']) as { properties: Record<string, unknown>; required: string[] };
    expect(s.properties.logo_image_id).toEqual({ anyOf: [{ type: 'string', enum: ['bild1'] }, { type: 'null' }] });
    expect(s.required).toContain('not_adopted');
    expect((buildSchema([]) as { properties: Record<string, unknown> }).properties.header_image_id).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
  });

  it('Nachricht enthält Bilder, Farben und Texte mit Position', () => {
    const r = parseRequest(request);
    if (typeof r === 'string') throw new Error(r);
    const text = buildUserText(r);
    expect(text).toContain('bild1: x=390 y=30 150×50 pt (600×200 Pixel, transparent)');
    expect(text).toContain('Farbkandidaten: #f28e2c');
    expect(text).toContain('y=100 x=56 10pt Arial-BoldMT: Rechnung');
  });
});

describe('read-invoice-design: Antwort absichern', () => {
  const box = { x: 20, y: 20, width: 120, height: 40, pixelWidth: 300, pixelHeight: 100, transparent: false };
  const page = { pageWidth: 595, pageHeight: 842, images: [{ ...box, id: 'bild1' }, { ...box, id: 'bild2' }] };

  it('unbekannte Bilder, Farben und Werte → sichere Standardwerte', () => {
    const r = normalizeResult(
      {
        header_style: 'image',
        header_image_id: 'bild9',
        header_crop_bottom: 110,
        logo_image_id: 'bild1',
        logo_crop: { x: 1, y: 1, width: 50, height: 50 },
        color: 'blau',
        font: 'comic',
        payment_days: 400,
        footer_contact: ['a', '', 'b', 'c', 'd', 'e', 'f'],
        not_adopted: 'kein Array',
      },
      page,
    );
    expect(r.header_image_id).toBeNull();
    expect(r.header_crop_bottom).toBe(110); // kein Bild → Ausschnitt
    expect(r.logo_image_id).toBe('bild1');
    expect(r.logo_crop).toBeNull(); // Bild vorhanden → kein Ausschnitt
    expect(r.color).toBe('#1f2937');
    expect(r.font).toBe('helvetica');
    expect(r.payment_days).toBeNull();
    expect(r.footer_contact).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r.not_adopted).toEqual([]);
    expect(r.is_invoice).toBe(true);
  });

  it('Logo-Ausschnitt bleibt auf der Seite, Logo = Kopfbild zählt nicht doppelt', () => {
    const r = normalizeResult({ header_image_id: 'bild1', logo_image_id: 'bild1', logo_crop: { x: 500, y: 10, width: 200, height: 40 } }, page);
    expect(r.logo_image_id).toBeNull();
    expect(r.logo_crop).toEqual({ x: 500, y: 10, width: 95, height: 40 });
  });
});

describe('read-invoice-design: keine Kundendaten in der Vorlage', () => {
  const img = (id: string, y: number, width: number, height: number) => ({ id, x: 0, y, width, height, pixelWidth: 100, pixelHeight: 100, transparent: false });
  const req = {
    pageWidth: 595,
    pageHeight: 842,
    images: [img('bild1', 0, 595, 150), img('bild2', 300, 595, 300), img('bild3', 20, 120, 40), img('bild4', 200, 120, 40)],
    lines: [
      { x: 42, y: 178, size: 6.5, bold: false, font: '', text: 'Erika Muster · Hauptplatz 1 · 4020 Linz' },
      { x: 43, y: 190, size: 9, bold: false, font: '', text: 'Anna Huber' },
      { x: 43, y: 201, size: 9, bold: false, font: '', text: 'Teststraße 3' },
      { x: 43, y: 212, size: 9, bold: false, font: '', text: 'Österreich' },
    ],
  };

  it('Kopfbild und Logo nur aus dem Bereich über dem Anschriftfeld', () => {
    expect(normalizeResult({ header_image_id: 'bild1', logo_image_id: 'bild3' }, req)).toMatchObject({ header_image_id: 'bild1', logo_image_id: 'bild3' });
    expect(normalizeResult({ header_image_id: 'bild2', logo_image_id: 'bild4' }, req)).toMatchObject({ header_image_id: null, logo_image_id: null });
    expect(normalizeResult({ header_crop_bottom: 260 }, req).header_crop_bottom).toBeNull();
    expect(normalizeResult({ header_crop_bottom: 120 }, req).header_crop_bottom).toBe(120);
    // Logo-Ausschnitt höchstens halbe Seitenbreite und 150 pt hoch
    expect(normalizeResult({ logo_crop: { x: 0, y: 0, width: 595, height: 260 } }, req).logo_crop).toBeNull();
  });

  it('Name des Kunden in Texten → {Kunde}; Land, Straße und eigener Name bleiben', () => {
    const r = normalizeResult(
      { intro: 'Liebe Anna Huber, danke!', closing_text: 'Zahlbar in Österreich.', greeting_signature: 'Erika Muster' },
      req,
    );
    expect(r.intro).toBe('Liebe {Kunde}, danke!');
    expect(r.closing_text).toBe('Zahlbar in Österreich.');
    expect(r.greeting_signature).toBe('Erika Muster');
  });
});

describe('designToTemplate', () => {
  const base = normalizeResult({}, { pageWidth: 595, pageHeight: 842, images: [] });
  const d: DesignResult = {
    ...base,
    header_style: 'image',
    logo_position: 'left',
    color: '#045a85',
    font: 'times',
    closing_title: 'Danke!',
    closing_text: 'Bitte binnen {Zahlungsziel} mit „{Rechnungsnummer}“.',
    closing_boxed: true,
    greeting_text: 'Liebe Grüße,',
    greeting_signature: 'Max',
    footer_style: 'columns',
    footer_contact: ['Tel. 1', 'www.x.at'],
    footer_bank_extra: ['BIC: X'],
    payment_days: 30,
    price_first: true,
    ku_note: 'totals',
  };

  it('übernimmt alles in die Vorlage', () => {
    const t = designToTemplate(d, { header: 'u/kopf.jpg', logo: 'u/logo.png' });
    expect(t).toMatchObject({
      color: '#045a85',
      font: 'times',
      header: { style: 'image', imagePath: 'u/kopf.jpg', logoPath: 'u/logo.png' },
      closing: { title: 'Danke!', boxed: true },
      footer: { style: 'columns', contact: 'Tel. 1\nwww.x.at', bankExtra: 'BIC: X' },
      payment: { days: 30, box: false },
      table: { priceFirst: true },
      kuNote: 'totals',
    });
  });

  it('Kopfbild ohne Bild → klassisch, Logo „Mitte“ nur wo möglich', () => {
    expect(designToTemplate(d, { header: null, logo: null }).header.style).toBe('classic');
    expect(designToTemplate({ ...d, header_style: 'classic', logo_position: 'center' }, { header: null, logo: 'l' }).header.logoPosition).toBe('left');
  });

  it('Zusammenfassung für den Vergleich', () => {
    const t = designToTemplate(d, { header: 'k', logo: 'l' });
    expect(adoptedSummary(t, d)).toEqual([
      'Kopf: Kopfbild, mit Logo',
      'Schrift: Times',
      'Text unter den Positionen in farbiger Box mit {Rechnungsnummer}, {Zahlungsziel}',
      'Grußformel „Liebe Grüße, Max“',
      'Fußzeile in drei Spalten, 2 Kontaktangaben',
      'Bankangaben: BIC: X',
      'Zahlungsziel 30 Tage',
    ]);
  });
});

describe('dominantColors', () => {
  const px = (r: number, g: number, b: number, n: number, a = 255) => Array.from({ length: n }, () => [r, g, b, a]).flat();

  it('kräftige Farben, häufigste zuerst; Weiß, Grau, Transparenz zählen nicht', () => {
    const pixels = [...px(255, 255, 255, 5000), ...px(128, 128, 128, 500), ...px(4, 90, 133, 300), ...px(242, 142, 44, 100), ...px(200, 0, 0, 900, 0)];
    expect(dominantColors(pixels)).toEqual(['#045a85', '#f28e2c']);
  });

  it('ähnliche Töne werden eine Farbe', () => {
    expect(dominantColors([...px(4, 90, 133, 300), ...px(10, 95, 140, 200)])).toHaveLength(1);
  });
});
