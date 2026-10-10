import { describe, expect, it } from 'vitest';
import { canonicalNumberFormat, formatInvoiceNumber, formatsOf, inferNumberFormat, nextInvoiceNumber, validateNumberFormat } from '@/lib/invoiceNumbers';

describe('formatInvoiceNumber', () => {
  it.each([
    ['{JJJJ}-{NNN}', '2026-001'],
    ['RE_{JJ}{NNNN}', 'RE_260001'],
    ['Rechn_{JJ}{NN}', 'Rechn_2601'],
    ['RE-{JJJJ}{NNN}', 'RE-2026001'],
    ['{JJJJ}/{MM}/{NN}', '2026/03/01'],
    ['{yyyy}-{nnn}', '2026-001'],
  ])('%s → %s', (format, expected) => {
    expect(formatInvoiceNumber(format, '2026-03-15', 1)).toBe(expected);
  });
  it('mehr Stellen als N, wenn nötig', () => {
    expect(formatInvoiceNumber('{JJJJ}-{NNN}', '2026-01-01', 1000)).toBe('2026-1000');
  });
});

describe('validateNumberFormat', () => {
  it('gültige Formate', () => {
    for (const f of ['{JJJJ}-{NNN}', 'RE_{JJ}{NNNN}', 'KL-{JJJJ}-{NNN}', 'R{NNNNN}', '{JJ}.{MM}.{NN}', '#{NNN}/{JJJJ}']) {
      expect(validateNumberFormat(f), f).toBeNull();
    }
  });
  it.each([
    ['', 'Format'],
    ['{JJJJ}-001', 'laufende Nummer'],
    ['{NNN}-{NN}', 'nur einmal'],
    ['{JJJJ}-{XX}-{NNN}', 'Unbekannter Baustein'],
    ['{MM}-{NNN}', 'Jahr'],
    ['RE {NNN}', 'Leerzeichen'],
    ['Rä-{NNN}', 'Umlaute'],
    ['{JJJJ}-' + 'X'.repeat(40) + '-{NNN}', 'Höchstens'],
  ])('%s → Fehler mit „%s“', (format, part) => {
    expect(validateNumberFormat(format)).toContain(part);
  });
});

describe('nextInvoiceNumber', () => {
  it('erste Nummer im Jahr', () => {
    expect(nextInvoiceNumber('{JJJJ}-{NNN}', '2026-05-01', [])).toBe('2026-001');
    expect(nextInvoiceNumber('RE_{JJ}{NNNN}', '2026-05-01', [])).toBe('RE_260001');
  });
  it('fortlaufend nach der höchsten Nummer, andere Jahre und fremde Nummern zählen nicht', () => {
    expect(nextInvoiceNumber('{JJJJ}-{NNN}', '2026-05-01', ['2026-001', '2026-007', '2025-099', 'KL-2025-050', 'RE-2026-090', 'x'])).toBe('2026-008');
    expect(nextInvoiceNumber('RE_{JJ}{NNNN}', '2026-05-01', ['RE_260011', 'RE_250099', 'RE_26001'])).toBe('RE_260012');
  });
  it('neues Jahr beginnt bei 1', () => {
    expect(nextInvoiceNumber('RE_{JJ}{NNNN}', '2027-01-02', ['RE_260011'])).toBe('RE_270001');
  });
  it('ohne Jahr im Format: läuft immer weiter', () => {
    expect(nextInvoiceNumber('R{NNNNN}', '2027-01-02', ['R00041', 'R00042'])).toBe('R00043');
  });
  it('mit Monat: Zählung pro Jahr, nicht pro Monat', () => {
    expect(nextInvoiceNumber('{JJJJ}{MM}-{NN}', '2026-04-01', ['202603-05'])).toBe('202604-06');
  });
  it('Formatwechsel mitten im Jahr: Zählung läuft über die früheren Formate weiter', () => {
    expect(nextInvoiceNumber('RE_{JJ}{NNNN}', '2026-05-01', ['2026-001', '2026-007'])).toBe('RE_260008');
    expect(nextInvoiceNumber('{JJJJ}-{NNN}', '2026-05-01', ['2026-003', 'KL-2026-012'])).toBe('2026-013');
  });
  it('Groß-/Kleinschreibung und Leerzeichen spielen keine Rolle', () => {
    expect(nextInvoiceNumber('RE-{NNN}', '2026-05-01', [' re-004 '])).toBe('RE-005');
  });
});

describe('inferNumberFormat', () => {
  const s = (reference: string, date = '2026-03-10') => ({ reference, date });
  it('erkennt Jahr und laufende Nummer', () => {
    expect(inferNumberFormat([s('RE_260012'), s('RE_260013'), s('RE_260014')])?.format).toBe('RE_{JJ}{NNNN}');
    expect(inferNumberFormat([s('2026-012'), s('2026-013')])?.format).toBe('{JJJJ}-{NNN}');
    expect(inferNumberFormat([s('Rechn_2601'), s('Rechn_2602')])?.format).toBe('Rechn_{JJ}{NN}');
    expect(inferNumberFormat([s('RE-2026001'), s('RE-2026002')])?.format).toBe('RE-{JJJJ}{NNN}');
  });
  it('Zahlung im Folgejahr: Nummer trägt das Vorjahr', () => {
    expect(inferNumberFormat([s('2025-098', '2026-01-08'), s('2026-001', '2026-01-20')])?.format).toBe('{JJJJ}-{NNN}');
  });
  it('ohne Jahr; unterschiedlich lange Nummern', () => {
    expect(inferNumberFormat([s('9'), s('10'), s('11')])).toEqual({ format: '{N}', example: '9' });
    expect(inferNumberFormat([s('R-0041'), s('R-0042')])?.format).toBe('R-{NNNN}');
  });
  it('kein eindeutiges Format → null', () => {
    expect(inferNumberFormat([s('RE_260012')])).toBeNull(); // nur eine Nummer
    expect(inferNumberFormat([s('A-1'), s('B-2'), s('C-3'), s('A-4')])).toBeNull();
    expect(inferNumberFormat([s('Überweisung'), s('Bar')])).toBeNull();
  });
});

describe('Formatwechsel zwischen eigenen Formaten und Schreibweise', () => {
  it('zählt über Formate bisheriger Klaro-Rechnungen weiter', () => {
    const numbers = ['RE_260007', 'RE_260008'];
    const known = formatsOf(numbers.map((reference) => ({ reference, date: '2026-04-01' })));
    expect(nextInvoiceNumber('INV-{JJJJ}-{NNN}', '2026-05-01', numbers, known)).toBe('INV-2026-009');
    expect(nextInvoiceNumber('INV-{JJJJ}-{NNN}', '2026-05-01', numbers)).toBe('INV-2026-001');
  });
  it('einheitliche Schreibweise zum Speichern', () => {
    expect(canonicalNumberFormat(' re_{ yy }{nnnn} ')).toBe('re_{JJ}{NNNN}');
    expect(canonicalNumberFormat('{jjjj}/{mm}/{NN}')).toBe('{JJJJ}/{MM}/{NN}');
  });
  it('ungültiges oder altes Format → Standardformat statt wörtlicher Nummer', () => {
    expect(formatInvoiceNumber('YYYY-NNN', '2026-05-01', 3)).toBe('2026-003');
  });
});
