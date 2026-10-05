// Import: Tabellen aus Excel (Zwischenablage, CSV, .xlsx) lesen – Zellen, Beträge, Datumsangaben, USt-Sätze.
// Bewusst tolerant: österreichische Excel-Tabellen sehen sehr unterschiedlich aus.
import type { VatRate } from '@/types';
import { VAT_RATES } from '@/constants/tax2026';
import { round2 } from './money';

export type Cell = string | number | boolean | Date | null;
export type Table = Cell[][];

/** Kleinbuchstaben, Umlaute ausgeschrieben, Satzzeichen → Leerzeichen. Für Stichwortsuche in Überschriften und Texten. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

export function cellText(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return isoFromUtc(cell) ?? '';
  return String(cell).trim();
}

export function isEmptyRow(row: readonly Cell[]): boolean {
  return row.every((c) => cellText(c) === '');
}

// ─── Text (Zwischenablage, CSV) ─────────────────────────────

/** Trennzeichen erkennen: Tab (aus Excel kopiert), sonst Semikolon (CSV aus deutschsprachigem Excel), sonst Komma. */
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
  if (sample.some((l) => l.includes('\t'))) return '\t';
  const count = (ch: string) => sample.reduce((n, l) => n + l.split(ch).length - 1, 0);
  return count(';') > 0 ? ';' : ',';
}

/** Text in Zeilen und Zellen zerlegen (mit Anführungszeichen nach CSV-Regeln). Leere Zeilen am Ende fallen weg. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c === '')) rows.pop();
  return rows;
}

// ─── Beträge ────────────────────────────────────────────────

/**
 * Betrag aus einer Zelle: „1.234,56“, „€ 1.234,56“, „1,234.56“, „-45,00“, „(45,00)“, „45,00-“, „1'234.50“.
 * Leer → null, nicht lesbar → NaN.
 */
export function parseAmount(cell: Cell | undefined): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? round2(cell) : NaN;
  if (typeof cell !== 'string') return NaN;
  let s = cell.replace(/[\s  '’]/g, '').replace(/€|eur(o)?/gi, '').replace(/[−–—]/g, '-');
  if (s === '' || s === '-') return null;
  s = s.replace(/[,.]-$/, ''); // „45,-“ = 45 Euro glatt
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Beide Zeichen: das hintere ist das Dezimaltrennzeichen
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // „1.500“ = Tausender
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const value = round2(Number(s));
  return negative ? -value : value;
}

// ─── Datum ──────────────────────────────────────────────────

export interface ParsedDate {
  iso: string; // JJJJ-MM-TT
  yearMissing: boolean; // „15.03.“ – Jahr kam aus der Voreinstellung
}

const pad = (n: number) => String(n).padStart(2, '0');

function validIso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Datumswerte aus .xlsx-Dateien sind Mitternacht UTC. */
function isoFromUtc(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return validIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

const MONTHS: Record<string, number> = {
  jaenner: 1, jan: 1, januar: 1, feb: 2, februar: 2, maer: 3, maerz: 3, mrz: 3, apr: 4, april: 4, mai: 5,
  jun: 6, juni: 6, jul: 7, juli: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10,
  nov: 11, november: 11, dez: 12, dezember: 12,
};

/**
 * Datum aus einer Zelle: Datumswert, Excel-Seriennummer, „5.3.2026“, „05.03.26“, „2026-03-05“, „05/03/2026“,
 * „5. März 2026“ oder „15.03.“ (Jahr aus `fallbackYear`). Nicht lesbar → null.
 */
export function parseDate(cell: Cell | undefined, fallbackYear: number, monthFirst = false): ParsedDate | null {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) {
    const iso = isoFromUtc(cell);
    return iso ? { iso, yearMissing: false } : null;
  }
  if (typeof cell === 'number') {
    // Excel-Seriennummer (Tage seit 30.12.1899); 36526 = 1.1.2000
    if (cell < 36526 || cell > 73051) return null;
    const iso = isoFromUtc(new Date(Math.round((cell - 25569) * 86_400_000)));
    return iso ? { iso, yearMissing: false } : null;
  }
  const s = String(cell).trim();
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return wrap(validIso(Number(m[1]), Number(m[2]), Number(m[3])), false);
  m = /^(\d{1,2})([./-])(\d{1,2})[./-](\d{4}|\d{2})(?:[ ,T].*)?$/.exec(s);
  if (m) {
    // „03/25/2026“ aus US-Tabellen: Monat zuerst (nur bei Schrägstrich, siehe isMonthFirstColumn)
    const [day, month] = monthFirst && m[2] === '/' ? [Number(m[3]), Number(m[1])] : [Number(m[1]), Number(m[3])];
    return wrap(validIso(year(m[4]!), month, day), false);
  }
  m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(s);
  if (m) return wrap(validIso(fallbackYear, Number(m[2]), Number(m[1])), true);
  m = /^(\d{1,2})\.?\s*([a-zäöü]+)\.?\s*(\d{4}|\d{2})?$/i.exec(s);
  if (m) {
    const month = MONTHS[normalizeText(m[2]!).replace(/ /g, '')];
    if (month) return wrap(validIso(m[3] ? year(m[3]) : fallbackYear, month, Number(m[1])), !m[3]);
  }
  return null;
}

function wrap(iso: string | null, yearMissing: boolean): ParsedDate | null {
  return iso ? { iso, yearMissing } : null;
}

/** US-Format in einer Spalte? Ja, wenn ein Datum mit „/“ an zweiter Stelle einen Wert über 12 hat (03/25/2026). */
export function isMonthFirstColumn(cells: readonly (Cell | undefined)[]): boolean {
  let monthFirst = false;
  for (const c of cells) {
    const m = typeof c === 'string' ? /^(\d{1,2})\/(\d{1,2})\/\d{2,4}/.exec(c.trim()) : null;
    if (!m) continue;
    if (Number(m[1]) > 12) return false; // eindeutig Tag zuerst
    if (Number(m[2]) > 12) monthFirst = true;
  }
  return monthFirst;
}

// ─── USt-Satz ───────────────────────────────────────────────

/** „20“, „20 %“, „0,2“, 0.1 → 20 bzw. 10. Nur österreichische Sätze; sonst null. */
export function parseVatRate(cell: Cell | undefined): VatRate | null {
  const raw = typeof cell === 'number' ? cell : parseAmount(typeof cell === 'string' ? cell.replace('%', '') : null);
  if (raw === null || Number.isNaN(raw)) return null;
  const pct = raw > 0 && raw < 1 ? Math.round(raw * 100) : Math.round(raw);
  return (VAT_RATES as readonly number[]).includes(pct) ? (pct as VatRate) : null;
}
