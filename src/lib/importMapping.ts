// Import: Spalten erkennen, Zeilen lesen, Kategorien zuordnen und daraus Einnahmen, Ausgaben, Anlagen und SVS-Beiträge bauen.
// Die Ausgaben laufen durch dieselben Regeln wie im Formular (Bewirtung 50 %, Öffi-Karte 50 %, Netto, Anlagen über 1.000 €).
import {
  EXPENSE_CATEGORIES,
  findCategoryById,
  isCategoryOffered,
  type CategoryContext,
} from '@/constants/expenseCategories';
import type { AssetInsert, ExpenseInsert, IncomeInsert, Quarter, SvsPaymentInsert, VatRate } from '@/types';
import { computeAssetValues, computeExpenseValues, entryKind, type ExpenseFormInput } from './expenses';
import { cellText, isEmptyRow, isMonthFirstColumn, normalizeText, parseAmount, parseDate, parseVatRate, type Cell, type ParsedDate, type Table } from './importParse';
import { formatDecimalInput, round2 } from './money';

/**
 * Stichwort in normalisiertem Text: mit Leerzeichen als Teilstring, mit „=“ nur als ganzes Wort, mit „*“ irgendwo im Wort,
 * sonst als Wortanfang („einnahm“ trifft „Einnahmen“, „=zug“ trifft nicht „Zugang“, „*datum“ trifft „Zahlungsdatum“).
 */
function hasKeyword(text: string, keywords: readonly string[]): boolean {
  const words = text.split(' ');
  return keywords.some((k) =>
    k.startsWith('=')
      ? words.includes(k.slice(1))
      : k.startsWith('*')
        ? words.some((w) => w.includes(k.slice(1)))
        : k.includes(' ')
          ? text.includes(k)
          : words.some((w) => w.startsWith(k)),
  );
}

// ─── Spalten ────────────────────────────────────────────────

export type ColumnRole = 'ignore' | 'date' | 'description' | 'amount' | 'income' | 'expense' | 'category' | 'vat' | 'reference';

export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  ignore: 'Nicht verwenden',
  date: 'Datum',
  description: 'Beschreibung',
  amount: 'Betrag',
  income: 'Einnahme (Betrag)',
  expense: 'Ausgabe (Betrag)',
  category: 'Kategorie / Art',
  vat: 'USt-Satz',
  reference: 'Rechnungsnummer',
};

// Stichwörter in Spaltenüberschriften (normalisiert, Wortanfang). Reihenfolge = Vorrang.
const HEADER_KEYWORDS: [ColumnRole, string[]][] = [
  ['vat', ['ust satz', 'ustsatz', 'mwst satz', 'steuersatz', 'ust %', 'mwst %', 'vat', 'ust', 'mwst', 'umsatzsteuer', 'vorsteuer']],
  ['reference', ['rechnungsnr', 'rechnungsnummer', 're nr', 'renr', 'rg nr', 'belegnr', 'belegnummer', 'beleg nr', 'rechnung nr', 'nr', 'nummer', 'invoice']],
  ['date', ['*datum', 'date', '=tag', 'valuta', 'buchungstag', 'zahlungseingang', 'bezahlt am']],
  ['income', ['einnahm', 'erloes', 'umsatz', 'eingang', 'zufluss']],
  ['expense', ['ausgab', 'aufwand', 'aufwendung', 'kosten', 'abfluss']],
  ['category', ['kategorie', 'konto', '=art', 'typ', 'gruppe', 'category', 'kennzahl', '=kz', 'sachkonto', 'bereich', 'zuordnung']],
  ['description', ['beschreibung', 'text', 'bezeichnung', 'verwendungszweck', 'buchungstext', 'zweck', 'notiz', 'details', 'lieferant', 'kunde', 'empfaenger', 'auftraggeber', 'name', 'vermerk', 'info', 'gegenstand', 'leistung', 'partner', 'firma', 'anmerkung']],
  ['amount', ['betrag', 'summe', 'brutto', 'amount', 'wert', 'eur', 'euro', 'gesamt', 'total', 'netto']],
];

function headerRole(header: string): { role: ColumnRole; score: number } | null {
  const h = normalizeText(header);
  if (!h) return null;
  const words = h.split(' ');
  if (words.includes('lfd') || words.includes('laufende')) return null; // laufende Nummer
  for (const [role, keywords] of HEADER_KEYWORDS) {
    if (hasKeyword(h, keywords)) {
      // Brutto vor Netto: Klaro rechnet selbst auf netto zurück.
      // Datum: Zuflussprinzip – Zahlungs-/Buchungsdatum vor Rechnungs-/Belegdatum.
      const score =
        role === 'date'
          ? /zahl|bezahlt|buchung|valuta|eingang|zufluss/.test(h) ? 3 : /rechnung|beleg|leistung/.test(h) ? 1 : 2
          : words.includes('brutto') ? 3 : words.includes('netto') ? 1 : 2;
      // „USt“ allein kann auch der USt-Betrag sein – das prüft guessRoles am Inhalt
      return { role, score };
    }
  }
  return null;
}

const dateShare = (rows: Table, col: number) => share(rows, col, (c) => parseDate(c, 2000) !== null);
const amountShare = (rows: Table, col: number) => share(rows, col, (c) => typeof c !== 'boolean' && !(c instanceof Date) && Number.isFinite(parseAmount(c) ?? NaN));
// USt-Satz: „20“, „20 %“, 0,2 – aber nicht „20,00“ (das ist ein USt-Betrag)
const isRateCell = (c: Cell) =>
  parseVatRate(c) !== null &&
  (typeof c === 'number' ? c < 1 || Number.isInteger(c) : /%|^\d{1,2}$|^0[,.]\d+$/.test(cellText(c)));
const vatShare = (rows: Table, col: number) => share(rows, col, isRateCell);

/** Anteil der nicht leeren Zellen einer Spalte, die `test` erfüllen (0, wenn die Spalte leer ist). */
function share(rows: Table, col: number, test: (c: Cell) => boolean): number {
  let filled = 0;
  let hits = 0;
  for (const r of rows) {
    const c = r[col] ?? null;
    if (cellText(c) === '') continue;
    filled++;
    if (test(c)) hits++;
  }
  return filled === 0 ? 0 : hits / filled;
}

/** Index der Überschriften-Zeile (in den ersten 10 Zeilen) oder -1, wenn die Tabelle keine hat. */
export function findHeaderRow(table: Table): number {
  const limit = Math.min(table.length, 10);
  for (let i = 0; i < limit; i++) {
    const row = table[i]!;
    const texts = row.map(cellText).filter((t) => t !== '');
    if (texts.length < 2) continue;
    const looksLikeData = row.some((c) => parseDate(c, 2000) !== null || (typeof c === 'number' && c !== 0));
    if (looksLikeData) continue;
    if (row.filter((c) => headerRole(cellText(c))).length >= 2) return i;
  }
  // Keine bekannten Überschriften: erste Zeile nur Text, darunter Daten → trotzdem Überschrift
  const first = table[0];
  if (first && table.length > 1 && first.every((c) => cellText(c) === '' || (parseDate(c, 2000) === null && Number.isNaN(parseAmount(c) ?? NaN)))) {
    const second = table[1]!;
    if (second.some((c) => parseDate(c, 2000) !== null || Number.isFinite(parseAmount(c) ?? NaN))) return 0;
  }
  return -1;
}

export function columnCount(table: Table): number {
  return table.reduce((n, r) => Math.max(n, r.length), 0);
}

/** Spaltenrollen vorschlagen: zuerst nach Überschrift, dann nach Inhalt (Datum, Betrag, längster Text). */
export function guessRoles(table: Table, headerRow: number): ColumnRole[] {
  const cols = columnCount(table);
  const headers = headerRow >= 0 ? table[headerRow]! : [];
  const data = table.slice(headerRow + 1).filter((r) => !isEmptyRow(r)).slice(0, 50);
  const roles: ColumnRole[] = Array(cols).fill('ignore');
  const best = new Map<ColumnRole, { col: number; score: number }>();

  for (let c = 0; c < cols; c++) {
    const hit = headerRole(cellText(headers[c]));
    if (!hit) continue;
    let { role } = hit;
    // Inhalt muss passen: „USt“ mit Beträgen ist der USt-Betrag (wird nicht gebraucht), Datum muss Datum sein …
    if (role === 'vat' && vatShare(data, c) < 0.8) continue;
    if (role === 'date' && dateShare(data, c) < 0.5) continue;
    if ((role === 'amount' || role === 'income' || role === 'expense') && amountShare(data, c) < 0.5) {
      if (role !== 'amount') role = 'category'; // z. B. Spalte „Ausgabenart“ mit Text
      else continue;
    }
    if (role === 'description') {
      roles[c] = 'description';
      continue;
    }
    const prev = best.get(role);
    if (!prev || hit.score > prev.score) best.set(role, { col: c, score: hit.score });
  }
  for (const [role, { col }] of best) roles[col] = role;

  // Einnahme- und Ausgabe-Spalte ersetzen eine allgemeine Betragsspalte
  if (roles.includes('income') || roles.includes('expense')) {
    const i = roles.indexOf('amount');
    if (i >= 0) roles[i] = 'ignore';
  }

  const unassigned = (c: number) => roles[c] === 'ignore' && !headerRole(cellText(headers[c]));
  if (!roles.includes('date')) {
    const c = range(cols).filter(unassigned).find((i) => dateShare(data, i) >= 0.8);
    if (c !== undefined) roles[c] = 'date';
  }
  if (!roles.some((r) => r === 'amount' || r === 'income' || r === 'expense')) {
    const c = range(cols).filter(unassigned).find((i) => amountShare(data, i) >= 0.8 && dateShare(data, i) < 0.5);
    if (c !== undefined) roles[c] = 'amount';
  }
  if (!roles.includes('description')) {
    const textLen = (i: number) => data.reduce((n, r) => n + (typeof r[i] === 'string' && Number.isNaN(parseAmount(r[i]) ?? NaN) ? cellText(r[i]).length : 0), 0);
    const c = range(cols).filter(unassigned).sort((a, b) => textLen(b) - textLen(a))[0];
    if (c !== undefined && textLen(c) > 0) roles[c] = 'description';
  }
  return roles;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Steht in der gewählten Betragsspalte „netto“ (und nicht „brutto“)? Dann rechnet Klaro die USt dazu. */
export function amountsLookNet(table: Table, headerRow: number, roles: readonly ColumnRole[]): boolean {
  if (headerRow < 0) return false;
  const headers = roles.flatMap((r, i) => (r === 'amount' || r === 'income' || r === 'expense' ? [normalizeText(cellText(table[headerRow]?.[i]))] : []));
  return headers.length > 0 && headers.every((h) => h.split(' ').some((w) => w.startsWith('netto')) && !h.includes('brutto'));
}

/** Fehlt etwas Wichtiges in der Zuordnung? */
export function rolesProblem(roles: readonly ColumnRole[]): string | null {
  if (!roles.includes('date')) return 'Welche Spalte enthält das Datum?';
  if (!roles.some((r) => r === 'amount' || r === 'income' || r === 'expense')) return 'Welche Spalte enthält den Betrag?';
  return null;
}

/**
 * Mehrere Blätter mit gleichem Aufbau (z. B. eines pro Monat) zu einer Tabelle verbinden:
 * Überschrift vom ersten Blatt, bei den weiteren fällt alles bis einschließlich ihrer Überschrift weg.
 */
export function combineTables(tables: readonly Table[]): Table {
  const [first, ...rest] = tables;
  if (!first) return [];
  return [...first, ...rest.flatMap((t) => t.slice(findHeaderRow(t) + 1))];
}

/** Betragsspalte: Was steht drin? Gemischte Vorzeichen → beides; sonst Hinweis aus Überschriften oder Blattname; sonst null (fragen). */
export function guessAmountMode(table: Table, headerRow: number, roles: readonly ColumnRole[], sheetName: string): AmountMode | null {
  const c = roles.indexOf('amount');
  if (c < 0) return null;
  // Überschriften und Blattname zuerst: eine Gutschrift in einer Ausgabenliste macht daraus noch keine gemischte Liste
  const context = normalizeText([sheetName, ...table.slice(0, headerRow + 1).flat().map(cellText)].join(' '));
  const income = hasKeyword(context, ['einnahm', 'erloes', 'umsatz', 'honorar']);
  const expense = hasKeyword(context, ['ausgab', 'aufwand', 'kosten', 'beleg']);
  if (income && !expense) return 'income';
  if (expense && !income) return 'expense';
  const values = table.slice(headerRow + 1).map((r) => parseAmount(r[c] ?? null)).filter((v): v is number => v !== null && !Number.isNaN(v) && v !== 0);
  const negatives = values.filter((v) => v < 0).length;
  // Beides nur, wenn beide Vorzeichen nennenswert vorkommen (nicht bei einzelnen Gutschriften)
  if (negatives >= 2 && values.length - negatives >= 2) return 'signed';
  return null;
}

// ─── Zeilen lesen ───────────────────────────────────────────

/** Was eine einzelne Betragsspalte bedeutet. */
export type AmountMode = 'expense' | 'income' | 'signed';

export interface ReadSettings {
  headerRow: number;
  roles: readonly ColumnRole[];
  amountMode: AmountMode;
  fallbackYear: number; // für Datumsangaben ohne Jahr („15.03.“)
  today: string; // ISO
}

export interface SourceRow {
  line: number; // Zeilennummer in der Tabelle (ab 1, wie in Excel)
  date: ParsedDate | null;
  dateText: string;
  description: string;
  amount: number; // positiv
  direction: 'in' | 'out';
  category: string; // Rohtext aus der Kategorie-Spalte
  vatRate: VatRate | null;
  reference: string;
  problem: string | null; // Zeile kann so nicht übernommen werden
}

const SUM_ROW = /^(summe|gesamt|total|zwischensumme|saldo|uebertrag|endsumme|jahressumme)/;

/** Liest alle Datenzeilen. Leere Zeilen, Summenzeilen und Zeilen ohne Betrag fallen still weg. */
export function readRows(table: Table, s: ReadSettings): SourceRow[] {
  const col = (role: ColumnRole) => s.roles.indexOf(role);
  const descCols = s.roles.flatMap((r, i) => (r === 'description' ? [i] : []));
  const [cDate, cAmount, cIn, cOut, cCat, cVat, cRef] = [col('date'), col('amount'), col('income'), col('expense'), col('category'), col('vat'), col('reference')] as const;
  const out: SourceRow[] = [];
  const data = table.slice(s.headerRow + 1);
  const monthFirst = cDate >= 0 && isMonthFirstColumn(data.map((r) => r[cDate]));
  // Ausgaben stehen oft durchgehend mit Minus da. Hat eine einzelne Zeile das andere Vorzeichen, ist es eine Gutschrift.
  const mostlyNegative = (c: number) => {
    const v = c >= 0 ? data.map((r) => parseAmount(r[c] ?? null)).filter((x): x is number => x !== null && !Number.isNaN(x) && x !== 0) : [];
    return v.filter((x) => x < 0).length > v.length / 2;
  };
  const outNegative = mostlyNegative(cIn >= 0 || cOut >= 0 ? cOut : cAmount);
  const refund = (a: number) => (a < 0) !== outNegative;
  const REFUND = 'Gutschrift oder Rückerstattung? Bitte von Hand erfassen';

  table.forEach((row, index) => {
    if (index <= s.headerRow || isEmptyRow(row)) return;
    const get = (c: number) => (c >= 0 ? (row[c] ?? null) : null);
    const description = descCols.map((c) => cellText(get(c))).filter(Boolean).join(' · ');
    const category = cellText(get(cCat));
    const dateText = cellText(get(cDate));
    const date = parseDate(get(cDate), s.fallbackYear, monthFirst);
    if (!date && SUM_ROW.test(normalizeText(`${description} ${category} ${dateText}`))) return;

    // Beträge: getrennte Einnahme-/Ausgabe-Spalten oder eine Betragsspalte
    const amounts: { amount: number; direction: 'in' | 'out'; problem: string | null }[] = [];
    if (cIn >= 0 || cOut >= 0) {
      const a = parseAmount(get(cIn));
      const b = parseAmount(get(cOut));
      if (a !== null && a !== 0) {
        amounts.push(
          Number.isNaN(a)
            ? { amount: 0, direction: 'in', problem: `Betrag „${cellText(get(cIn))}“ nicht erkannt` }
            : a < 0
              ? { amount: -a, direction: 'in', problem: 'Negative Einnahme – Gutschriften bitte von Hand erfassen' }
              : { amount: a, direction: 'in', problem: null },
        );
      }
      if (b !== null && b !== 0) {
        amounts.push(
          Number.isNaN(b)
            ? { amount: 0, direction: 'out', problem: `Betrag „${cellText(get(cOut))}“ nicht erkannt` }
            : { amount: Math.abs(b), direction: 'out', problem: refund(b) ? REFUND : null },
        );
      }
    } else {
      const a = parseAmount(get(cAmount));
      if (a !== null && a !== 0) {
        if (Number.isNaN(a)) amounts.push({ amount: 0, direction: s.amountMode === 'income' ? 'in' : 'out', problem: `Betrag „${cellText(get(cAmount))}“ nicht erkannt` });
        else if (s.amountMode === 'signed') amounts.push({ amount: Math.abs(a), direction: a > 0 ? 'in' : 'out', problem: null });
        else if (s.amountMode === 'income' && a < 0) amounts.push({ amount: -a, direction: 'in', problem: 'Negative Einnahme – Gutschriften bitte von Hand erfassen' });
        else if (s.amountMode === 'income') amounts.push({ amount: a, direction: 'in', problem: null });
        else amounts.push({ amount: Math.abs(a), direction: 'out', problem: refund(a) ? REFUND : null });
      }
    }

    for (const a of amounts) {
      let problem = a.problem;
      if (!problem && !date) problem = dateText ? `Datum „${dateText}“ nicht erkannt` : 'Datum fehlt';
      if (!problem && date && date.iso > s.today) problem = 'Datum liegt in der Zukunft';
      if (!problem && a.amount > 99_999_999) problem = 'Betrag ist zu hoch';
      out.push({
        line: index + 1,
        date,
        dateText,
        description,
        amount: a.amount,
        direction: a.direction,
        category,
        vatRate: parseVatRate(get(cVat)),
        reference: cellText(get(cRef)),
        problem,
      });
    }
  });
  return out;
}

// ─── Zuordnung ──────────────────────────────────────────────

/** Wohin eine Zeile kommt: Einnahme, SVS-Beitrag, Ausgaben-Kategorie oder gar nicht. */
export type Target = 'income' | 'svs' | 'skip' | `cat:${string}`;

/** Zuordnung eines Werts der Kategorie-Spalte: ein Ziel oder „automatisch“ (Stichwörter in der Beschreibung). */
export type CategoryChoice = Target | 'auto';

export const catTarget = (id: string): Target => `cat:${id}`;
export const targetCategoryId = (t: Target): string | null => (t.startsWith('cat:') ? t.slice(4) : null);

// Stichwörter (normalisiert) → Ziel. Reihenfolge = Vorrang: Spezielles vor Allgemeinem.
const TARGET_KEYWORDS: [Target, string[]][] = [
  ['skip', ['einkommensteuer', 'est vorauszahlung', 'est vz', 'privatentnahme', 'privateinlage', 'privat entnahme', 'privat einlage', 'umsatzsteuer', 'ust zahlung', 'ust vorauszahlung', '=uva', 'finanzamt', 'umbuchung', 'saldo', 'uebertrag', 'eigenueberweisung', 'kredittilgung', 'tilgung', 'bankomat', 'behebung', 'bargeldbehebung']],
  ['svs', ['svs', 'sozialversicherung', 'gsvg', 'fsvg', 'sva', 'pensionsversicherung', 'krankenversicherung sv']],
  ['income', ['einnahme', 'erloes', 'umsatz', 'zahlungseingang', 'honorar', 'gage']],
  [catTarget('wko'), ['wko', 'wirtschaftskammer', 'grundumlage', 'kammerumlage']],
  [catTarget('oeffi'), ['klimaticket', 'jahreskarte', 'monatskarte', 'wochenkarte', 'oeffi', 'wiener linien']],
  [catTarget('tagesgeld'), ['diaet', 'diaeten', 'tagesgeld', 'taggeld', 'verpflegungsmehraufwand']],
  [catTarget('naechtigung'), ['naechtigungsgeld', 'naechtigungspauschale', 'naechtigung pauschal']],
  [catTarget('bewirtung'), ['bewirtung', 'geschaeftsessen', 'kundenessen', 'restaurant', '=essen']],
  [catTarget('zinsen'), ['zinsen', 'kreditzins', 'sollzins']],
  [catTarget('bankgebuehren'), ['bankspesen', 'bankgebuehr', '=bank', 'kontofuehrung', 'spesen', 'gebuehr', 'kartengebuehr']],
  [catTarget('versicherung'), ['versicherung', 'haftpflicht', 'rechtsschutz', 'steuerberat', 'buchhaltung', 'rechtsanwalt', 'anwalt', 'notar', 'beratung']],
  [catTarget('miete'), ['miete', 'leasing', 'coworking', 'pacht', 'bueromiete']],
  [catTarget('buero'), ['buero', 'software', '=abo', 'abonnement', 'adobe', 'microsoft', 'office', 'telefon', 'handyvertrag', 'handyrechnung', 'mobilfunk', 'internet', 'porto', '=post', 'domain', 'hosting', 'website', 'webseite', 'cloud', 'dropbox', 'icloud', 'papier', 'druckerpatrone', 'toner', 'canva', 'notion', 'zoom', 'lizenz software']],
  [catTarget('geraete'), ['laptop', 'notebook', 'computer', '=pc', 'macbook', 'iphone', 'handy', 'smartphone', 'kamera', 'objektiv', 'monitor', 'bildschirm', 'drucker', 'tablet', 'ipad', 'werkzeug', 'geraet', 'hardware', 'ausruestung', 'moebel', 'schreibtisch']],
  [catTarget('reisen'), ['fahrt', 'reise', 'bahn', 'oebb', '=zug', 'zugticket', 'westbahn', 'flug', 'taxi', '=uber', 'parken', 'parkgebuehr', 'garage', 'hotel', 'kilometergeld', 'km geld', 'maut', 'vignette', 'tanken', 'treibstoff', 'benzin', 'diesel']],
  [catTarget('werbung'), ['werbung', 'marketing', 'inserat', 'anzeige', 'ads', 'flyer', 'visitenkarte', 'werbegeschenk', '=messe', 'messestand', 'social media']],
  [catTarget('kurse'), ['kurs', 'seminar', 'fortbildung', 'weiterbildung', 'schulung', 'workshop', 'fachbuch', 'buch', 'buecher', 'zeitschrift', 'konferenz', 'webinar', 'ausbildung']],
  [catTarget('subauftraege'), ['subauftrag', 'subunternehm', 'fremdleistung', 'freelancer', 'werkvertrag', 'fremdpersonal']],
  [catTarget('lizenzen'), ['lizenz', 'provision', 'bildrechte', 'stockfoto', 'stock', 'fonts', 'schriftart', 'musikrechte', 'akm']],
  [catTarget('waren'), ['waren', 'wareneinkauf', 'material', 'rohstoff']],
  [catTarget('sonstiges'), ['sonstig', 'diverse', 'divers', 'andere']],
];

/** Ziel aus einem Text (Kategorie oder Beschreibung) erraten. Kein Treffer → null. */
export function guessTarget(text: string, exclude: readonly Target[] = []): Target | null {
  const t = normalizeText(text);
  if (!t) return null;
  for (const [target, keywords] of TARGET_KEYWORDS) {
    if (!exclude.includes(target) && hasKeyword(t, keywords)) return target;
  }
  // Kategorie-Namen aus Klaro (z. B. aus einem früheren Export) direkt erkennen
  const byLabel = EXPENSE_CATEGORIES.find((c) => normalizeText(c.label) === t);
  return byLabel ? catTarget(byLabel.id) : null;
}

/**
 * Vorschlag für einen Wert der Kategorie-Spalte. `directions` = Richtungen der Zeilen mit diesem Wert.
 * Ohne Treffer „automatisch“: Dann entscheidet je Zeile die Beschreibung (z. B. bei Spalten wie „Lastschrift“).
 */
export function guessCategoryValue(value: string, directions: ReadonlySet<'in' | 'out'>): CategoryChoice {
  const guess = guessTarget(value);
  if (guess) return guess;
  if (directions.size === 1 && directions.has('in')) return 'income';
  return 'auto';
}

export interface CategoryValueSummary {
  value: string;
  count: number;
  total: number;
  directions: Set<'in' | 'out'>;
}

/** Unterschiedliche Werte der Kategorie-Spalte mit Anzahl und Summe (häufigste zuerst). */
export function categoryValues(rows: readonly SourceRow[]): CategoryValueSummary[] {
  const map = new Map<string, CategoryValueSummary>();
  for (const r of rows) {
    if (!r.category) continue;
    const v = map.get(r.category) ?? { value: r.category, count: 0, total: 0, directions: new Set() };
    v.count++;
    v.total = round2(v.total + r.amount);
    v.directions.add(r.direction);
    map.set(r.category, v);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export interface ResolvedTarget {
  target: Target;
  note: string | null; // Erklärung, wenn Klaro vom Vorschlag abweicht
}

/**
 * Endgültiges Ziel einer Zeile: Zuordnung der Kategorie-Spalte, sonst Stichwörter in der Beschreibung.
 * Einnahmen bleiben Einnahmen (außer „Nicht übernehmen“). Ausgaben-Kategorien, die nicht zählen, werden angepasst.
 */
export function resolveTarget(row: SourceRow, categoryMap: Readonly<Record<string, CategoryChoice>>, ctx: CategoryContext): ResolvedTarget {
  const choice = row.category ? categoryMap[row.category] : undefined;
  const fromCategory = choice === 'auto' ? undefined : choice;
  // „Honorar an Freelancer“ in einer Ausgabenzeile ist keine Einnahme – nur die Kategorie-Spalte darf das festlegen
  const mapped = fromCategory ?? guessTarget(row.description, row.direction === 'out' ? ['income'] : []);

  if (mapped === 'skip') return { target: 'skip', note: fromCategory ? null : 'Sieht privat bzw. nach Steuerzahlung aus – zählt nicht als Betriebsausgabe' };
  if (mapped === 'income') return { target: 'income', note: null };
  if (row.direction === 'in') {
    // Betrag steht in der Tabelle als Einnahme – das hat Vorrang vor der Kategorie
    return { target: 'income', note: fromCategory ? 'Steht in deiner Tabelle als Einnahme – deshalb als Einnahme übernommen' : null };
  }
  if (mapped === 'svs') return { target: 'svs', note: null };

  const cat = mapped ? findCategoryById(targetCategoryId(mapped) ?? '') : undefined;
  if (cat && isCategoryOffered(cat, ctx)) return { target: catTarget(cat.id), note: null };
  if (cat && ctx.profitMethod === 'pauschal') {
    return { target: 'skip', note: `„${cat.label}“ ist bei Pauschalierung schon im Pauschalsatz enthalten` };
  }
  const fallback = findCategoryById('sonstiges')!;
  if (isCategoryOffered(fallback, ctx)) return { target: catTarget('sonstiges'), note: null };
  return { target: 'skip', note: 'Bei Pauschalierung schon im Pauschalsatz enthalten' };
}

// ─── Prüfen ─────────────────────────────────────────────────

export interface ReviewRow extends SourceRow {
  id: number;
  target: Target;
  note: string | null;
  include: boolean;
  duplicate: boolean;
  spread: boolean; // „Auf mehrere Jahre verteilen“ bei Büro & Software / Sonstiges über 1.000 €
  usefulLife: number; // Nutzungsdauer, falls Anlage
  reimbursed: boolean; // Reisekosten an Kund:innen weiterverrechnet (zählt bei Pauschalierung)
  defaultVat: VatRate; // USt-Satz, wenn die Tabelle keinen angibt (nur USt-Pflichtige)
}

// Ohne Umsatzsteuer: Versicherungen, Bankgebühren, Zinsen, Kammerumlage (Beratung in „Versicherung & Beratung“ hat USt)
const NO_VAT_CATEGORIES = new Set(['versicherung', 'bankgebuehren', 'zinsen', 'wko', 'tagesgeld', 'naechtigung']);
const HAS_VAT_WORDS = /beratung|steuerberat|buchhaltung|anwalt|notar|kanzlei/;

/** USt-Satz der Zeile: laut Tabelle, sonst je nach Kategorie 0 % oder die Vorgabe. Kleinunternehmer: immer 0. */
export function effectiveVat(r: Pick<ReviewRow, 'vatRate' | 'defaultVat' | 'target' | 'description'>, isKU: boolean): VatRate {
  if (isKU) return 0;
  if (r.vatRate !== null) return r.vatRate;
  const id = targetCategoryId(r.target);
  if (r.target === 'svs' || (id && NO_VAT_CATEGORIES.has(id) && !(id === 'versicherung' && HAS_VAT_WORDS.test(normalizeText(r.description))))) return 0;
  return r.defaultVat;
}

/** Vorgeschlagene Nutzungsdauer nach Stichwort (wie die Auswahl im Formular). */
export function guessUsefulLife(text: string): number {
  const t = normalizeText(text);
  if (/\b(auto|pkw|kfz|fahrzeug|elektroauto)/.test(t)) return 8;
  if (/\b(moebel|schreibtisch|stuhl|regal|kasten|einrichtung)/.test(t)) return 10;
  if (/\b(kamera|objektiv|drucker|werkzeug|maschine)/.test(t)) return 5;
  return 3;
}

/**
 * Zeilen für die Prüfansicht. `amountsNet`: Die Tabelle enthält Nettobeträge – Klaro rechnet die USt dazu,
 * damit überall (wie im Formular) brutto gespeichert ist.
 */
export function buildReviewRows(
  rows: readonly SourceRow[],
  categoryMap: Readonly<Record<string, CategoryChoice>>,
  ctx: CategoryContext,
  vat: { isKU: boolean; defaultVat: VatRate; amountsNet?: boolean },
): ReviewRow[] {
  return rows.map((r, id) => {
    const { target, note } = resolveTarget(r, categoryMap, ctx);
    const row: ReviewRow = {
      ...r,
      id,
      target,
      note,
      include: !r.problem && target !== 'skip',
      duplicate: false,
      spread: false,
      usefulLife: guessUsefulLife(r.description),
      reimbursed: false,
      defaultVat: vat.defaultVat,
    };
    if (vat.amountsNet && !vat.isKU) row.amount = round2(r.amount * (1 + effectiveVat(row, false) / 100));
    return row;
  });
}

export type EntryKind = 'income' | 'svs' | 'expense' | 'asset' | 'skip';

export interface ExistingEntry {
  kind: 'income' | 'expense' | 'svs';
  date: string;
  amount: number; // brutto
  reference?: string | null; // Rechnungsnummer (Klaro-Rechnungen, übernommene Einnahmen)
}

const INCOME_DATE_TOLERANCE_DAYS = 7;
const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

const dupKind = (k: EntryKind): ExistingEntry['kind'] | null => (k === 'asset' ? 'expense' : k === 'skip' ? null : k);

/**
 * Markiert Zeilen, die es in Klaro schon gibt, und nimmt sie aus dem Import: gleiche Art und gleicher Betrag am selben Tag.
 * Einnahmen auch bis zu 7 Tage daneben (Kontoauszug bucht später als das eingetragene Zahlungsdatum) oder mit gleicher
 * Rechnungsnummer. Jeder Eintrag in Klaro zählt nur einmal: Gibt es ihn einmal in Klaro und zweimal in der Datei, ist
 * nur einer ein Duplikat.
 */
export function markDuplicates(rows: ReviewRow[], existing: readonly ExistingEntry[], isKU: boolean): ReviewRow[] {
  const unused = existing.map((e) => ({ ...e, day: dayNumber(e.date) }));
  const take = (i: number) => (i >= 0 ? (unused.splice(i, 1), true) : false);
  return rows.map((r) => {
    const kind = dupKind(rowKind(r, isKU));
    if (!kind || !r.date) return r;
    const day = dayNumber(r.date.iso);
    const same = (e: (typeof unused)[number]) => e.kind === kind && Math.abs(e.amount - r.amount) < 0.005;
    const found =
      take(unused.findIndex((e) => same(e) && e.day === day)) ||
      (kind === 'income' &&
        (take(unused.findIndex((e) => e.kind === 'income' && !!r.reference && e.reference === r.reference)) ||
          take(unused.findIndex((e) => same(e) && Math.abs(e.day - day) <= INCOME_DATE_TOLERANCE_DAYS))));
    return found ? { ...r, duplicate: true, include: false } : r;
  });
}

// ─── Werte bauen ────────────────────────────────────────────

function expenseInput(r: ReviewRow, categoryId: string): ExpenseFormInput {
  return {
    categoryId,
    amount: formatDecimalInput(r.amount),
    km: '',
    hours: '',
    nights: '',
    reimbursed: r.reimbursed,
    vatRate: effectiveVat(r, false),
    date: r.date?.iso ?? '',
    description: r.description,
    spread: r.spread,
    usefulLife: String(r.usefulLife),
  };
}

/** Wird die Zeile Einnahme, SVS-Beitrag, sofort absetzbare Ausgabe oder Anlage? */
export function rowKind(r: ReviewRow, isKU: boolean): EntryKind {
  if (r.target === 'income' || r.target === 'svs' || r.target === 'skip') return r.target;
  return entryKind(expenseInput(r, targetCategoryId(r.target)!), isKU) === 'asset' ? 'asset' : 'expense';
}

/** Kann der Nutzer bei dieser Zeile „auf mehrere Jahre verteilen“ wählen? (Büro & Software, Sonstiges über 1.000 €) */
export function canSpread(r: ReviewRow, isKU: boolean): boolean {
  const cat = findCategoryById(targetCategoryId(r.target) ?? '');
  return cat?.asset === 'ask' && entryKind({ ...expenseInput(r, cat.id), spread: null }, isKU) === 'ask';
}

export interface ImportRecords {
  incomes: Omit<IncomeInsert, 'import_id'>[];
  expenses: Omit<ExpenseInsert, 'import_id'>[];
  assets: Omit<AssetInsert, 'import_id'>[];
  svs_payments: Omit<SvsPaymentInsert, 'import_id'>[];
}

const quarterOf = (iso: string): Quarter => (['Q1', 'Q2', 'Q3', 'Q4'] as const)[Math.floor((Number(iso.slice(5, 7)) - 1) / 3)]!;

/** Datensätze für alle ausgewählten Zeilen (aus buildReviewRows). */
export function buildRecords(rows: readonly ReviewRow[], isKU: boolean): ImportRecords {
  const rec: ImportRecords = { incomes: [], expenses: [], assets: [], svs_payments: [] };
  for (const r of rows) {
    if (!r.include || r.problem || !r.date || r.target === 'skip') continue;
    const date = r.date.iso;
    const vatRate = effectiveVat(r, isKU);
    if (r.target === 'income') {
      const net = vatRate === 0 ? null : round2(r.amount / (1 + vatRate / 100));
      rec.incomes.push({ description: r.description || 'Einnahme', amount: r.amount, amount_net: net, income_date: date, reference: r.reference || null });
      continue;
    }
    if (r.target === 'svs') {
      rec.svs_payments.push({ amount: r.amount, payment_date: date, year: Number(date.slice(0, 4)), quarter: quarterOf(date), notes: r.description || null });
      continue;
    }
    const cat = findCategoryById(targetCategoryId(r.target)!)!;
    const input = expenseInput(r, cat.id);
    const description = r.description || cat.label;
    if (rowKind(r, isKU) === 'asset') {
      rec.assets.push({ ...computeAssetValues(input, isKU), description, purchase_date: date });
    } else if (cat.calc) {
      // Diäten/Nächtigung aus der alten Tabelle: Betrag ist schon gerechnet, Pauschalen enthalten keine USt
      rec.expenses.push({
        e1a_kz: cat.kz, category_label: cat.label, amount: r.amount, amount_net: null, deductible_amount: r.amount,
        is_bewirtung: false, km_driven: null, trip_hours: null, nights: null, reimbursed: false, description, expense_date: date,
      });
    } else {
      rec.expenses.push({ ...computeExpenseValues(input, isKU), description, expense_date: date });
    }
  }
  return rec;
}

export interface ImportSummary {
  incomes: { count: number; total: number };
  expenses: { count: number; total: number };
  assets: { count: number; total: number };
  svs_payments: { count: number; total: number };
  skipped: number;
}

export function summarize(rows: readonly ReviewRow[], isKU: boolean): ImportSummary {
  const s: ImportSummary = {
    incomes: { count: 0, total: 0 }, expenses: { count: 0, total: 0 }, assets: { count: 0, total: 0 }, svs_payments: { count: 0, total: 0 }, skipped: 0,
  };
  for (const r of rows) {
    const kind = rowKind(r, isKU);
    if (!r.include || r.problem || kind === 'skip') {
      s.skipped++;
      continue;
    }
    const bucket = kind === 'income' ? s.incomes : kind === 'svs' ? s.svs_payments : kind === 'asset' ? s.assets : s.expenses;
    bucket.count++;
    bucket.total = round2(bucket.total + r.amount);
  }
  return s;
}
