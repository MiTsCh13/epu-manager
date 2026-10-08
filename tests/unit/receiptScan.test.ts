import { describe, expect, it } from 'vitest';
import { buildPrefill, scanCategories, type ScanResult } from '@/lib/receiptPrefill';
import { buildHistory } from '@/lib/importMapping';
import type { CategoryContext } from '@/constants/expenseCategories';
import {
  buildSchema,
  buildUserText,
  normalizeResult,
  parseRequest,
} from '../../supabase/functions/read-receipt/receipt';

const euer: CategoryContext = { businessType: 'neue_selbstaendige', profitMethod: 'euer', pauschType: null, smallApp: false };
const pauschalKU: CategoryContext = { businessType: 'neue_selbstaendige', profitMethod: 'pauschal', pauschType: 'ku', smallApp: false };
const TODAY = '2026-10-06';

const maus: ScanResult = {
  kind: 'expense',
  vendor: 'MediaMarkt',
  date: '2026-01-20',
  total: 43.98,
  currency: 'EUR',
  vat_country: 'AT',
  vat: [{ rate: 20, amount: 5.83 }],
  description: 'Logitech Maus',
  category_id: 'geraete',
  category_reason: 'Eine Computermaus ist Arbeitsausrüstung.',
  likely_private: false,
  svs_quarter: null,
  notes: [],
};

describe('scanCategories', () => {
  it('ohne Tagesgeld/Nächtigung, mit allem, was es grundsätzlich gibt – auch bei Pauschalierung', () => {
    const ids = scanCategories(pauschalKU).map((c) => c.id);
    expect(ids).toContain('geraete');
    expect(ids).toContain('reisen');
    expect(ids).not.toContain('tagesgeld');
    expect(ids).not.toContain('naechtigung');
    expect(ids).not.toContain('wko'); // nur für Gewerbetreibende
    expect(ids).not.toContain('bueromoebel'); // nur mit kleiner Arbeitsplatzpauschale
    expect(scanCategories(euer)[0]).toHaveProperty('hint');
  });
});

describe('buildPrefill', () => {
  it('übernimmt Betrag, Datum, USt und Kategorie', () => {
    const p = buildPrefill(maus, { ctx: euer, isKU: false, today: TODAY });
    expect(p.form).toEqual({ description: 'Logitech Maus – MediaMarkt', amount: '43,98', date: '2026-01-20', vatRate: 20, categoryId: 'geraete' });
    expect(p.categoryReason).toBe('Eine Computermaus ist Arbeitsausrüstung.');
    expect(p.notes).toEqual([]);
  });

  it('Kleinunternehmer: USt immer 0 %', () => {
    expect(buildPrefill(maus, { ctx: euer, isKU: true, today: TODAY }).form.vatRate).toBe(0);
  });

  it('ohne ausgewiesene USt 0 %, bei mehreren Sätzen der mit der meisten Steuer plus Hinweis', () => {
    expect(buildPrefill({ ...maus, vat: [] }, { ctx: euer, isKU: false, today: TODAY }).form.vatRate).toBe(0);
    // Sätze, die es in Österreich nicht gibt, und ausländische Aussteller → 0 % mit Hinweis
    const odd = buildPrefill({ ...maus, vat: [{ rate: 7, amount: 1 }] }, { ctx: euer, isKU: false, today: TODAY });
    expect(odd.form.vatRate).toBe(0);
    expect(odd.notes.join(' ')).toContain('Ausländische Umsatzsteuer');
    expect(buildPrefill({ ...maus, vat_country: 'DE' }, { ctx: euer, isKU: false, today: TODAY }).form.vatRate).toBe(0);
    expect(buildPrefill({ ...maus, vat_country: null }, { ctx: euer, isKU: false, today: TODAY }).form.vatRate).toBe(20);
    const mixed = buildPrefill(
      { ...maus, vat: [{ rate: 10, amount: 1 }, { rate: 20, amount: 3 }] },
      { ctx: euer, isKU: false, today: TODAY },
    );
    expect(mixed.form.vatRate).toBe(20);
    expect(mixed.notes.join(' ')).toContain('mehrere Umsatzsteuersätze');
    const nullAmounts = buildPrefill({ ...maus, vat: [{ rate: 13, amount: null }] }, { ctx: euer, isKU: false, today: TODAY });
    expect(nullAmounts.form.vatRate).toBe(13);
  });

  it('Fremdwährung: kein Betrag, Hinweis zum Umrechnen', () => {
    const p = buildPrefill({ ...maus, currency: 'USD' }, { ctx: euer, isKU: false, today: TODAY });
    expect(p.form.amount).toBeUndefined();
    expect(p.notes[0]).toContain('USD');
  });

  it('Datum in der Zukunft wird nicht übernommen', () => {
    const p = buildPrefill({ ...maus, date: '2026-12-24' }, { ctx: euer, isKU: false, today: TODAY });
    expect(p.form.date).toBeUndefined();
    expect(p.notes.join(' ')).toContain('Zukunft');
  });

  it('Beschreibung ohne doppelten Händler, fehlende Teile', () => {
    expect(buildPrefill({ ...maus, description: 'MediaMarkt Gutschein' }, { ctx: euer, isKU: false, today: TODAY }).form.description).toBe('MediaMarkt Gutschein');
    expect(buildPrefill({ ...maus, vendor: null }, { ctx: euer, isKU: false, today: TODAY }).form.description).toBe('Logitech Maus');
    expect(buildPrefill({ ...maus, description: '' }, { ctx: euer, isKU: false, today: TODAY }).form.description).toBe('MediaMarkt');
  });

  it('bisherige Ausgaben gewinnen vor dem Vorschlag von Claude', () => {
    const history = buildHistory([
      { description: 'Mediamarkt Kabel', category_label: 'Büro & Software' },
      { description: 'Mediamarkt Tastatur', category_label: 'Büro & Software' },
    ]);
    const p = buildPrefill(maus, { ctx: euer, isKU: false, today: TODAY, history });
    expect(p.form.categoryId).toBe('buero');
    expect(p.categoryReason).toContain('bisher eingeordnet');
  });

  it('Pauschalierung: Kategorie, die nicht extra zählt, wird nicht vorgewählt – mit Hinweis', () => {
    const p = buildPrefill(maus, { ctx: pauschalKU, isKU: true, today: TODAY });
    expect(p.form.categoryId).toBe('');
    expect(p.categoryReason).toBeNull();
    expect(p.notes[0]).toContain('Pauschalsatz');
  });

  it('ohne Kategorie bleibt die Auswahl leer', () => {
    const p = buildPrefill({ ...maus, category_id: null, category_reason: '' }, { ctx: euer, isKU: false, today: TODAY });
    expect(p.form.categoryId).toBe('');
    expect(p.categoryReason).toBeNull();
  });

  it('vermutlich privat wird weitergegeben', () => {
    expect(buildPrefill({ ...maus, likely_private: true }, { ctx: euer, isKU: false, today: TODAY }).likelyPrivate).toBe(true);
  });
});

describe('read-receipt: Anfrage prüfen', () => {
  const ok = { mediaType: 'application/pdf', data: 'QUJD', categories: [{ id: 'geraete', label: 'Geräte', hint: 'Laptop' }], today: TODAY };

  it('nimmt gültige Anfragen an', () => {
    expect(parseRequest(ok)).toEqual({ ...ok, categories: [{ id: 'geraete', label: 'Geräte', hint: 'Laptop' }] });
    expect(parseRequest({ ...ok, mediaType: 'image/jpeg' })).toMatchObject({ mediaType: 'image/jpeg' });
  });

  it('lehnt ungültige Anfragen mit deutscher Meldung ab', () => {
    expect(parseRequest(null)).toBe('Ungültige Anfrage.');
    expect(parseRequest({ ...ok, mediaType: 'image/heic' })).toContain('nicht lesen');
    expect(parseRequest({ ...ok, data: '' })).toBe('Der Beleg fehlt.');
    expect(parseRequest({ ...ok, data: 'A'.repeat(7_500_001) })).toContain('5 MB');
    expect(parseRequest({ ...ok, data: 'kein base64!' })).toBe('Der Beleg ist beschädigt.');
    expect(parseRequest({ ...ok, mediaType: 'image/png', data: 'A'.repeat(7_000_000) })).toContain('Foto ist zu groß');
    expect(parseRequest({ ...ok, categories: [] })).toBe('Ungültige Kategorien.');
    expect(parseRequest({ ...ok, categories: [{ id: 'DROP TABLE', label: 'x', hint: 'y' }] })).toBe('Ungültige Kategorien.');
    expect(parseRequest({ ...ok, categories: [null] })).toBe('Ungültige Kategorien.');
  });

  it('ungültiges Datum → heute (Server)', () => {
    const r = parseRequest({ ...ok, today: 'gestern' });
    expect(typeof r === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(r.today)).toBe(true);
  });
});

describe('read-receipt: Schema und Text', () => {
  it('Kategorie-Enum aus den übergebenen Kategorien, alle Felder Pflicht', () => {
    const schema = buildSchema(['geraete', 'buero']) as { required: string[]; properties: Record<string, { anyOf?: { enum?: string[] }[] }> };
    expect(schema.required).toContain('category_id');
    expect(schema.properties.category_id!.anyOf![0]!.enum).toEqual(['geraete', 'buero']);
  });

  it('Text enthält Datum und Kategorien', () => {
    const t = buildUserText([{ id: 'geraete', label: 'Geräte', hint: 'Laptop' }], TODAY);
    expect(t).toContain('2026-10-06');
    expect(t).toContain('- geraete: Geräte – Laptop');
  });
});

describe('read-receipt: Antwort absichern', () => {
  it('lässt plausible Werte durch und rundet', () => {
    const r = normalizeResult({ ...maus, vat_country: 'at', total: 43.9849, currency: 'eur', notes: ['  a  ', '', 'b', 'c', 'd'] }, ['geraete']);
    expect(r.total).toBe(43.98);
    expect(r.currency).toBe('EUR');
    expect(r.vat_country).toBe('AT');
    expect(r.notes).toEqual(['a', 'b']);
    expect(r.category_id).toBe('geraete');
  });

  it('verwirft Unplausibles', () => {
    const r = normalizeResult(
      {
        kind: 'irgendwas', vendor: '  ', vat_country: 'Austria', date: '20.01.2026', total: -5, currency: 'Euro',
        vat: [{ rate: 120, amount: 1 }, { rate: 'x' }, null, { rate: 10, amount: 'y' }],
        description: 7, category_id: 'erfunden', category_reason: null, likely_private: 'ja', svs_quarter: 'Q5', notes: 'nein',
      },
      ['geraete'],
    );
    expect(r).toEqual({
      kind: 'expense', vendor: null, vat_country: null, date: null, total: null, currency: null, vat: [{ rate: 10, amount: null }],
      description: '', category_id: null, category_reason: '', likely_private: false, svs_quarter: null, notes: [],
    });
    expect(normalizeResult(null, []).kind).toBe('expense');
    expect(normalizeResult({ vat: 'x', svs_quarter: 'Q3', kind: 'svs' }, []).svs_quarter).toBe('Q3');
  });
});
