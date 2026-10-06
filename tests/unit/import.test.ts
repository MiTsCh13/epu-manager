import { describe, expect, it } from 'vitest';
import { isMonthFirstColumn, parseAmount, parseDate, parseDelimited, parseVatRate } from '@/lib/importParse';
import {
  amountsLookNet,
  buildHistory,
  buildRecords,
  guessAmountMode,
  buildReviewRows,
  canSpread,
  categoryValues,
  catTarget,
  findHeaderRow,
  guessCategoryValue,
  guessRoles,
  guessTarget,
  markDuplicates,
  matchTarget,
  readRows,
  resolveTarget,
  rowKind,
  summarize,
  type CategoryChoice,
  type ReadSettings,
  type SourceRow,
  type Target,
} from '@/lib/importMapping';
import type { CategoryContext } from '@/constants/expenseCategories';

const euer: CategoryContext = { businessType: 'neue_selbstaendige', profitMethod: 'euer', pauschType: null, smallApp: false };
const pauschal: CategoryContext = { businessType: 'neue_selbstaendige', profitMethod: 'pauschal', pauschType: 'ku', smallApp: false };
const TODAY = '2026-10-05';

function settings(table: unknown[][], patch: Partial<ReadSettings> = {}): ReadSettings {
  const headerRow = findHeaderRow(table as never);
  return { headerRow, roles: guessRoles(table as never, headerRow), amountMode: 'expense', fallbackYear: 2026, today: TODAY, ...patch };
}

const src = (patch: Partial<SourceRow>): SourceRow => ({
  line: 2, date: { iso: '2026-03-05', yearMissing: false }, dateText: '05.03.2026', description: '', amount: 100,
  direction: 'out', category: '', vatRate: null, reference: '', problem: null, ...patch,
});

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['€ 1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1234,5', 1234.5],
    ['1.500', 1500],
    ['-45,00', -45],
    ['−45,00 €', -45],
    ['(45,00)', -45],
    ['45,00-', -45],
    ["1'234.50", 1234.5],
    ['EUR 95', 95],
    [12.345, 12.35],
    ['45,-', 45],
    ['45,–', 45],
  ] as const)('%s → %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('leer → null, Text → NaN', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount('05.03.2026')).toBeNaN();
  });
});

describe('parseDate', () => {
  it.each([
    ['05.03.2026', '2026-03-05'],
    ['5.3.26', '2026-03-05'],
    ['2026-03-05', '2026-03-05'],
    ['05/03/2026', '2026-03-05'],
    ['5. März 2026', '2026-03-05'],
    ['05.03.2026 14:30', '2026-03-05'],
  ])('%s → %s', (input, iso) => {
    expect(parseDate(input, 2026)).toEqual({ iso, yearMissing: false });
  });

  it('Datum ohne Jahr nimmt das Vorgabejahr', () => {
    expect(parseDate('15.03.', 2025)).toEqual({ iso: '2025-03-15', yearMissing: true });
  });

  it('Excel-Seriennummer und Datumswert (UTC)', () => {
    expect(parseDate(46086, 2026)?.iso).toBe('2026-03-05');
    expect(parseDate(new Date(Date.UTC(2026, 2, 5)), 2026)?.iso).toBe('2026-03-05');
  });

  it('US-Format nur, wenn die Spalte es eindeutig zeigt', () => {
    expect(isMonthFirstColumn(['03/05/2026', '03/25/2026'])).toBe(true);
    expect(isMonthFirstColumn(['03/05/2026', '25/03/2026'])).toBe(false);
    expect(isMonthFirstColumn(['03.05.2026'])).toBe(false);
    expect(parseDate('03/05/2026', 2026, true)?.iso).toBe('2026-03-05');
    expect(parseDate('03.05.2026', 2026, true)?.iso).toBe('2026-05-03');
  });

  it('ungültige Tage und Text → null', () => {
    expect(parseDate('31.02.2026', 2026)).toBeNull();
    expect(parseDate('Miete', 2026)).toBeNull();
    expect(parseDate(12.5, 2026)).toBeNull();
  });
});

describe('parseVatRate', () => {
  it('erkennt österreichische Sätze', () => {
    expect(parseVatRate('20 %')).toBe(20);
    expect(parseVatRate(0.1)).toBe(10);
    expect(parseVatRate('0,13')).toBe(13);
    expect(parseVatRate(0)).toBe(0);
    expect(parseVatRate('19')).toBeNull();
  });
});

describe('parseDelimited', () => {
  it('Tabulator aus der Zwischenablage', () => {
    expect(parseDelimited('Datum\tBetrag\n05.03.2026\t12,50\n')).toEqual([['Datum', 'Betrag'], ['05.03.2026', '12,50']]);
  });

  it('Semikolon-CSV mit Anführungszeichen und Komma als Dezimalzeichen', () => {
    expect(parseDelimited('﻿Datum;Text;Betrag\r\n05.03.2026;"Miete; März";"1.200,00"\r\n')).toEqual([
      ['Datum', 'Text', 'Betrag'],
      ['05.03.2026', 'Miete; März', '1.200,00'],
    ]);
  });

  it('Komma-CSV', () => {
    expect(parseDelimited('a,b\n1,"x ""y"""')).toEqual([['a', 'b'], ['1', 'x "y"']]);
  });
});

describe('Spalten erkennen', () => {
  it('Überschriften unter einer Titelzeile', () => {
    const table = [
      ['Einnahmen-Ausgaben-Rechnung 2026', null, null, null],
      ['Datum', 'Beschreibung', 'Kategorie', 'Betrag'],
      ['05.03.2026', 'Adobe', 'Software', '-59,99'],
    ];
    expect(findHeaderRow(table)).toBe(1);
    expect(guessRoles(table, 1)).toEqual(['date', 'description', 'category', 'amount']);
  });

  it('getrennte Einnahmen- und Ausgaben-Spalten; Brutto vor Netto; laufende Nummer wird ignoriert', () => {
    const table = [
      ['Lfd. Nr.', 'Datum', 'Text', 'Einnahmen', 'Ausgaben netto', 'Ausgaben brutto', 'USt %'],
      ['1', '05.03.2026', 'Kunde A', '1.000,00', '', '', '20'],
      ['2', '06.03.2026', 'Laptop', '', '1.000,00', '1.200,00', '20'],
    ];
    expect(guessRoles(table, 0)).toEqual(['ignore', 'date', 'description', 'income', 'ignore', 'expense', 'vat']);
  });

  it('„USt“ mit Beträgen ist kein USt-Satz', () => {
    const table = [
      ['Datum', 'Text', 'Netto', 'USt', 'Brutto'],
      ['05.03.2026', 'Kunde A', '100,00', '20,00', '120,00'],
    ];
    expect(guessRoles(table, 0)).toEqual(['date', 'description', 'ignore', 'ignore', 'amount']);
  });

  it('Zahlungsdatum vor Rechnungsdatum (Zuflussprinzip)', () => {
    const table = [
      ['Rechnungsdatum', 'Zahlungsdatum', 'Kunde', 'Betrag netto'],
      ['28.12.2025', '05.01.2026', 'Muster GmbH', '1.000'],
    ];
    expect(guessRoles(table, 0)).toEqual(['ignore', 'date', 'description', 'amount']);
    expect(amountsLookNet(table, 0, guessRoles(table, 0))).toBe(true);
  });

  it('Betragsspalte: Überschrift entscheidet vor einzelnen Gutschriften', () => {
    const expenses = [['Datum', 'Ausgabe', 'Betrag'], ['05.03.2026', 'A', '10'], ['06.03.2026', 'B', '-2'], ['07.03.2026', 'C', '5']];
    expect(guessAmountMode(expenses, 0, ['date', 'description', 'amount'], 'Tabelle1')).toBe('expense');
    const mixed = [['Datum', 'Text', 'Betrag'], ['05.03.2026', 'A', '10'], ['06.03.2026', 'B', '-2'], ['07.03.2026', 'C', '5'], ['08.03.2026', 'D', '-7']];
    expect(guessAmountMode(mixed, 0, ['date', 'description', 'amount'], 'Tabelle1')).toBe('signed');
    expect(guessAmountMode(mixed.slice(0, 4), 0, ['date', 'description', 'amount'], 'Tabelle1')).toBeNull();
  });

  it('ohne Überschrift nach Inhalt', () => {
    const table = [
      ['05.03.2026', 'Bahnticket Wien', '39,90'],
      ['06.03.2026', 'Druckerpapier', '12,00'],
    ];
    expect(findHeaderRow(table)).toBe(-1);
    expect(guessRoles(table, -1)).toEqual(['date', 'description', 'amount']);
  });
});

describe('readRows', () => {
  it('eine Betragsspalte mit Vorzeichen; Summenzeilen und leere Zeilen fallen weg', () => {
    const table = [
      ['Datum', 'Text', 'Betrag'],
      ['05.03.2026', 'Honorar Kunde A', '1.500,00'],
      ['06.03.2026', 'Adobe', '-59,99'],
      [null, null, null],
      ['', 'Summe', '1.440,01'],
    ];
    const rows = readRows(table, settings(table, { amountMode: 'signed' }));
    expect(rows.map((r) => [r.direction, r.amount, r.line])).toEqual([
      ['in', 1500, 2],
      ['out', 59.99, 3],
    ]);
  });

  it('Einnahme und Ausgabe in einer Zeile ergeben zwei Einträge; Minus in der Ausgabenspalte zählt als Ausgabe', () => {
    const table = [
      ['Datum', 'Text', 'Einnahmen', 'Ausgaben'],
      ['05.03.2026', 'Markt', '200,00', '-30,00'],
    ];
    const rows = readRows(table, settings(table));
    expect(rows.map((r) => [r.direction, r.amount])).toEqual([
      ['in', 200],
      ['out', 30],
    ]);
  });

  it('meldet fehlendes oder falsches Datum, Zukunft und unlesbare Beträge', () => {
    const table = [
      ['Datum', 'Text', 'Betrag'],
      ['', 'Ohne Datum', '10'],
      ['32.13.2026', 'Kaputt', '10'],
      ['05.12.2026', 'Zukunft', '10'],
      ['05.03.2026', 'Text statt Zahl', 'zehn'],
    ];
    const rows = readRows(table, settings(table));
    expect(rows.map((r) => r.problem)).toEqual([
      'Datum fehlt',
      'Datum „32.13.2026“ nicht erkannt',
      'Datum liegt in der Zukunft',
      'Betrag „zehn“ nicht erkannt',
    ]);
  });

  it('Gutschrift in einer Ausgabenliste wird markiert – auch wenn Ausgaben mit Minus geschrieben sind', () => {
    const positive = [['Datum', 'Text', 'Betrag'], ['05.03.2026', 'A', '10'], ['06.03.2026', 'Storno', '-4'], ['07.03.2026', 'C', '5']];
    expect(readRows(positive, settings(positive, { amountMode: 'expense' })).map((r) => r.problem !== null)).toEqual([false, true, false]);
    const negative = [['Datum', 'Text', 'Ausgaben'], ['05.03.2026', 'A', '-10'], ['06.03.2026', 'Storno', '4'], ['07.03.2026', 'C', '-5']];
    const rows = readRows(negative, settings(negative));
    expect(rows.map((r) => [r.amount, r.problem !== null])).toEqual([[10, false], [4, true], [5, false]]);
  });

  it('mehrere Beschreibungsspalten werden verbunden', () => {
    const table = [
      ['Datum', 'Kunde', 'Leistung', 'Betrag'],
      ['05.03.2026', 'Muster GmbH', 'Website', '800'],
    ];
    expect(readRows(table, settings(table, { amountMode: 'income' }))[0]!.description).toBe('Muster GmbH · Website');
  });
});

describe('Zuordnung', () => {
  it.each([
    ['SVS Beitrag Q1', 'svs'],
    ['Einkommensteuer-Vorauszahlung', 'skip'],
    ['Privatentnahme', 'skip'],
    ['Adobe Creative Cloud', catTarget('buero')],
    ['MacBook Pro', catTarget('geraete')],
    ['ÖBB Ticket', catTarget('reisen')],
    ['Klimaticket', catTarget('oeffi')],
    ['Geschäftsessen Kunde', catTarget('bewirtung')],
    ['WKO Grundumlage', catTarget('wko')],
    ['Kontoführung', catTarget('bankgebuehren')],
    ['Büro & Software', catTarget('buero')],
  ] as const)('%s → %s', (text, target) => {
    expect(guessTarget(text)).toBe(target);
  });

  it('keine falschen Treffer bei ähnlichen Wörtern', () => {
    expect(guessTarget('Privatkunde Huber')).toBeNull();
    expect(guessTarget('Zugangsdaten')).toBeNull();
  });

  it('Kategorie-Werte: unbekannte Einnahmen-Werte werden Einnahme, sonst automatisch nach Beschreibung', () => {
    expect(guessCategoryValue('Projekt X', new Set(['in']))).toBe('income');
    expect(guessCategoryValue('Lastschrift', new Set(['out']))).toBe('auto');
    const values = categoryValues([src({ category: 'A', amount: 10 }), src({ category: 'A', amount: 5 }), src({ category: 'B' })]);
    expect(values.map((v) => [v.value, v.count, v.total])).toEqual([
      ['A', 2, 15],
      ['B', 1, 100],
    ]);
  });

  it('Einnahmen bleiben Einnahmen; „Honorar“ in einer Ausgabe wird keine Einnahme', () => {
    expect(resolveTarget(src({ direction: 'in', description: 'Laptop verkauft' }), {}, euer).target).toBe('income');
    expect(resolveTarget(src({ description: 'Honorar Freelancer' }), {}, euer).target).toBe(catTarget('subauftraege'));
  });

  it('Kategorie-Spalte geht vor Beschreibung und kann eine Einnahme festlegen', () => {
    const map: Record<string, Target> = { Erlös: 'income', Div: catTarget('kurse') };
    expect(resolveTarget(src({ category: 'Erlös' }), map, euer).target).toBe('income');
    expect(resolveTarget(src({ category: 'Div', description: 'Adobe' }), map, euer).target).toBe(catTarget('kurse'));
  });

  it('Pauschalierung: was im Pauschalsatz steckt, wird nicht übernommen', () => {
    const r = resolveTarget(src({ description: 'Adobe' }), {}, pauschal);
    expect(r.target).toBe('skip');
    expect(r.note).toContain('Pauschal');
    expect(resolveTarget(src({ description: 'Klimaticket' }), {}, pauschal).target).toBe(catTarget('oeffi'));
    expect(resolveTarget(src({ description: 'SVS' }), {}, pauschal).target).toBe('svs');
  });

  it('„Automatisch“ in der Kategorie-Spalte: die Beschreibung entscheidet', () => {
    const map: Record<string, CategoryChoice> = { Lastschrift: 'auto' };
    expect(resolveTarget(src({ category: 'Lastschrift', description: 'SVS Beitrag Q1' }), map, euer).target).toBe('svs');
    expect(resolveTarget(src({ category: 'Lastschrift', description: 'Bankomat Behebung' }), map, euer).target).toBe('skip');
    expect(resolveTarget(src({ category: 'Lastschrift', description: 'Einkauf Billa' }), map, euer).target).toBe(catTarget('sonstiges'));
  });

  it('Einnahme bleibt Einnahme, auch wenn die Kategorie anders zugeordnet wurde – mit Hinweis', () => {
    const r = resolveTarget(src({ direction: 'in', category: 'Software' }), { Software: catTarget('buero') }, euer);
    expect(r.target).toBe('income');
    expect(r.note).toContain('Einnahme');
  });

  it('WKO nur für Gewerbetreibende – sonst Sonstiges', () => {
    expect(resolveTarget(src({ description: 'WKO Grundumlage' }), {}, euer).target).toBe(catTarget('sonstiges'));
  });
});

describe('Werte bauen', () => {
  const vatKU = { isKU: true, defaultVat: 20 as const };
  const vatRegular = { isKU: false, defaultVat: 20 as const };

  it('Kleinunternehmer: Einnahme brutto, Bewirtung 50 %, SVS mit Quartal, Gerät über 1.000 € wird Anlage', () => {
    const rows = buildReviewRows(
      [
        src({ direction: 'in', description: 'Kunde A', amount: 1500, reference: '2026-007' }),
        src({ description: 'Geschäftsessen', amount: 80 }),
        src({ description: 'SVS Q2', amount: 900, date: { iso: '2026-05-28', yearMissing: false } }),
        src({ description: 'MacBook', amount: 2400 }),
        src({ description: 'Privatentnahme', amount: 500 }),
      ],
      {},
      euer,
      vatKU,
    );
    const rec = buildRecords(rows, true);
    expect(rec.incomes).toEqual([{ description: 'Kunde A', amount: 1500, amount_net: null, income_date: '2026-03-05', reference: '2026-007' }]);
    expect(rec.expenses).toHaveLength(1);
    expect(rec.expenses[0]).toMatchObject({ category_label: 'Geschäftsessen (50 %)', amount: 80, deductible_amount: 40, is_bewirtung: true });
    expect(rec.svs_payments).toEqual([{ amount: 900, payment_date: '2026-05-28', year: 2026, quarter: 'Q2', notes: 'SVS Q2' }]);
    expect(rec.assets).toEqual([
      { category_label: 'Geräte & Ausrüstung', amount: 2400, amount_net: null, useful_life_years: 3, description: 'MacBook', purchase_date: '2026-03-05' },
    ]);
    expect(summarize(rows, true)).toMatchObject({ incomes: { count: 1, total: 1500 }, assets: { count: 1 }, skipped: 1 });
  });

  it('USt-Pflichtig: Netto aus Satz der Tabelle oder Vorgabe; 1.200 € brutto = 1.000 € netto bleibt sofort absetzbar', () => {
    const rows = buildReviewRows(
      [src({ direction: 'in', amount: 1200 }), src({ description: 'Laptop', amount: 1200 }), src({ description: 'Fachbuch', amount: 110, vatRate: 10 })],
      {},
      euer,
      vatRegular,
    );
    const rec = buildRecords(rows, false);
    expect(rec.incomes[0]!.amount_net).toBe(1000);
    expect(rec.expenses.map((e) => [e.category_label, e.amount_net, e.deductible_amount])).toEqual([
      ['Geräte & Ausrüstung', 1000, 1000],
      ['Kurse & Fachbücher', 100, 100],
    ]);
    expect(rec.assets).toHaveLength(0);
  });

  it('USt-Pflichtig: Versicherung, Bank und WKO ohne USt, Steuerberatung mit; Nettobeträge bekommen die USt dazu', () => {
    const rows = buildReviewRows(
      [src({ description: 'Haftpflichtversicherung', amount: 300 }), src({ description: 'Steuerberatung', amount: 600 }), src({ description: 'Kontoführung', amount: 12 })],
      {},
      euer,
      vatRegular,
    );
    expect(buildRecords(rows, false).expenses.map((e) => e.amount_net)).toEqual([null, 500, null]);
    const net = buildReviewRows([src({ direction: 'in', amount: 1000 }), src({ description: 'Kontoführung', amount: 12 })], {}, euer, { ...vatRegular, amountsNet: true });
    expect(net.map((r) => r.amount)).toEqual([1200, 12]);
  });

  it('Pauschalierung: Reisekosten zählen nur weiterverrechnet', () => {
    const [row] = buildReviewRows([src({ description: 'ÖBB Ticket', amount: 50 })], {}, pauschal, vatKU);
    expect(row!.target).toBe(catTarget('reisen'));
    expect(buildRecords([row!], true).expenses[0]!.reimbursed).toBe(false);
    expect(buildRecords([{ ...row!, reimbursed: true }], true).expenses[0]!.reimbursed).toBe(true);
  });

  it('Büro & Software über 1.000 €: sofort absetzbar, außer „auf mehrere Jahre verteilen“', () => {
    const [row] = buildReviewRows([src({ description: 'Software-Lizenz Adobe', amount: 1500 })], {}, euer, vatKU);
    expect(canSpread(row!, true)).toBe(true);
    expect(rowKind(row!, true)).toBe('expense');
    expect(rowKind({ ...row!, spread: true }, true)).toBe('asset');
  });

  it('Diäten mit fertigem Betrag: keine USt, voll absetzbar', () => {
    const rows = buildReviewRows([src({ description: 'Diäten Graz', amount: 30 })], {}, euer, vatRegular);
    expect(buildRecords(rows, false).expenses[0]).toMatchObject({ category_label: 'Tagesgeld (Diäten)', amount: 30, amount_net: null, deductible_amount: 30 });
  });

  it('Zeilen mit Problem oder abgewählt werden nicht übernommen', () => {
    const rows = buildReviewRows([src({ problem: 'Datum fehlt', date: null }), src({ description: 'Adobe' })], {}, euer, vatKU);
    expect(rows[0]!.include).toBe(false);
    rows[1] = { ...rows[1]!, include: false };
    const rec = buildRecords(rows, true);
    expect(rec.expenses).toHaveLength(0);
  });

  it('Duplikate: gleiche Art, gleiches Datum, gleicher Betrag – nur so oft wie in Klaro vorhanden', () => {
    const rows = buildReviewRows(
      [src({ description: 'Kaffee', amount: 4.5 }), src({ description: 'Kaffee', amount: 4.5 }), src({ direction: 'in', amount: 4.5 })],
      {},
      euer,
      vatKU,
    );
    const marked = markDuplicates(rows, [{ kind: 'expense', date: '2026-03-05', amount: 4.5 }], true);
    expect(marked.map((r) => [r.duplicate, r.include])).toEqual([
      [true, false],
      [false, true],
      [false, true],
    ]);
  });

  it('Duplikate bei Einnahmen: bis 7 Tage daneben oder gleiche Rechnungsnummer', () => {
    const rows = buildReviewRows(
      [
        src({ direction: 'in', amount: 1500, date: { iso: '2026-03-08', yearMissing: false } }),
        src({ direction: 'in', amount: 900, reference: '2026-004' }),
        src({ direction: 'in', amount: 700, date: { iso: '2026-03-20', yearMissing: false } }),
      ],
      {},
      euer,
      vatKU,
    );
    const existing = [
      { kind: 'income' as const, date: '2026-03-05', amount: 1500 },
      { kind: 'income' as const, date: '2026-02-01', amount: 950, reference: '2026-004' },
      { kind: 'income' as const, date: '2026-03-05', amount: 700 },
    ];
    expect(markDuplicates(rows, existing, true).map((r) => r.duplicate)).toEqual([true, true, false]);
  });
});

describe('Kategorie-Vorschläge', () => {
  it('lernt aus bisherigen Ausgaben – vor allgemeinen Stichwörtern, aber nach SVS/Privat', () => {
    const history = buildHistory([
      { description: 'Hetzner Server', category_label: 'Büro & Software' },
      { description: 'Druckerei Huber Flyer', category_label: 'Werbung' },
      { description: 'Druckerei Huber Plakate', category_label: 'Werbung' },
      { description: 'Huber Zufall', category_label: 'Sonstige Ausgaben' }, // Sonstiges lehrt nichts
    ]);
    const r = resolveTarget(src({ description: 'Druckerei Huber' }), {}, euer, history);
    expect(r.target).toBe(catTarget('werbung'));
    expect(r.reason).toContain('bisherigen Ausgaben');
    expect(resolveTarget(src({ description: 'SVS Huber' }), {}, euer, history).target).toBe('svs');
  });

  it('nennt das Wort, an dem Klaro die Kategorie erkannt hat', () => {
    expect(matchTarget('Abo Adobe Creative Cloud')).toEqual({ target: catTarget('buero'), word: 'Abo' });
    expect(resolveTarget(src({ description: 'OMV Tankstelle' }), {}, euer).reason).toBe('erkannt an „OMV“');
  });

  it('ohne Treffer: Sonstige Ausgaben, als unklar markiert', () => {
    const r = resolveTarget(src({ description: 'XY 4711' }), {}, euer);
    expect(r).toMatchObject({ target: catTarget('sonstiges'), unclear: true });
    expect(resolveTarget(src({ description: 'Diverses' }), {}, euer).unclear).toBe(false);
  });
});

describe('Stichwörter ohne Falsch-Treffer', () => {
  it.each([
    ['Bankomatzahlung Adobe', catTarget('buero')],
    ['Bankomat Behebung', 'skip'],
    ['Hotel drei Nächte', catTarget('reisen')],
    ['Seminar drei Tage', catTarget('kurse')],
    ['Kontoführung Erste Bank', catTarget('bankgebuehren')],
    ['USt-Vorauszahlung Q1', 'skip'],
  ] as const)('%s → %s', (text, target) => {
    expect(guessTarget(text)).toBe(target);
  });

  it('„Umsatzsteuer“ im Text einer Ausgabe ist keine Steuerzahlung und keine Einnahme', () => {
    expect(resolveTarget(src({ description: 'Laptop inkl. Umsatzsteuer' }), {}, euer).target).toBe(catTarget('geraete'));
  });

  it.each(['Erste Bank Überweisung', 'Buchung 4711', 'Kursdifferenz', 'Stockerau Lieferung', 'DIN A1 Plakat Druck'])('%s → keine Kategorie', (text) => {
    expect([null, catTarget('werbung')]).toContain(guessTarget(text));
  });

  it('Historie zählt nur eindeutige, wiederholte Wörter', () => {
    const history = buildHistory([
      { description: 'Fahrt Wien Graz', category_label: 'Fahrten & Reisen' },
      { description: 'Fahrt Wien Linz', category_label: 'Fahrten & Reisen' },
      { description: 'Musterfirma Projekt', category_label: 'Subaufträge & Freelancer' },
    ]);
    expect(resolveTarget(src({ description: 'Billa Wien' }), {}, euer, history).unclear).toBe(true); // Ortsname zählt nicht
    expect(resolveTarget(src({ description: 'Musterfirma' }), {}, euer, history).unclear).toBe(true); // nur einmal gesehen
  });
});
