// Steuer-Einstellungen pro Kalenderjahr (Tabelle tax_years).
// Eine Zeile gilt ab ihrem Jahr bis zur nächsten Zeile; ohne frühere Zeile gelten die Felder im Profil.
import type { IndustryType, OtherIncomeKind, PauschType, Profile, TaxYear } from '@/types';
import { formatEuro } from './money';
import { getPauschRate } from './profit';

export const TAX_FIELDS = [
  'is_kleinunternehmer',
  'profit_method',
  'pausch_type',
  'industry_code',
  'svs_exempt',
  'home_office',
  'other_income_kind',
  'other_income_amount',
] as const;

export type TaxSettings = Pick<Profile, (typeof TAX_FIELDS)[number]>;

const pick = (source: TaxSettings): TaxSettings =>
  Object.fromEntries(TAX_FIELDS.map((k) => [k, source[k]])) as TaxSettings;

/** Zeile, die im Jahr gilt: die letzte bis einschließlich `year`. */
function rowFor(rows: readonly TaxYear[], year: number): TaxYear | null {
  let found: TaxYear | null = null;
  for (const r of rows) if (r.year <= year && (!found || r.year > found.year)) found = r;
  return found;
}

export function taxSettingsFor(profile: Profile, rows: readonly TaxYear[], year: number): TaxSettings {
  return pick(rowFor(rows, year) ?? profile);
}

/** Profil mit den Steuer-Einstellungen des Jahres – für alles, was bisher direkt das Profil gelesen hat. */
export function profileForYear(profile: Profile, rows: readonly TaxYear[], year: number): Profile {
  return { ...profile, ...taxSettingsFor(profile, rows, year) };
}

/** Jahr eines ISO-Datums (YYYY-MM-DD), sonst das laufende Jahr. */
export function yearOfDate(iso: string | null | undefined, today: Date = new Date()): number {
  const y = iso ? Number(iso.slice(0, 4)) : NaN;
  return Number.isInteger(y) && y > 1900 ? y : today.getFullYear();
}

export const sameTaxSettings = (a: TaxSettings, b: TaxSettings) =>
  TAX_FIELDS.every((k) => (k === 'other_income_amount' ? Number(a[k] ?? 0) === Number(b[k] ?? 0) : a[k] === b[k]));

// ─── Verlauf „Was sich wann geändert hat“ ───────────────────

function profitLabel(s: TaxSettings): string {
  if (s.profit_method !== 'pauschal') return 'Einnahmen-Ausgaben-Rechnung';
  const type = (s.pausch_type ?? 'ku') as PauschType;
  const rate = Math.round(getPauschRate(type, (s.industry_code as IndustryType | null) ?? undefined) * 100);
  return type === 'ku' ? `Kleinunternehmer-Pauschalierung ${rate} %` : `Basispauschalierung ${rate} %`;
}

function otherIncomeLabel(s: TaxSettings): string {
  const kind = s.other_income_kind as OtherIncomeKind | null;
  if (!kind || kind === 'none') return 'keine';
  const amount = s.other_income_amount == null ? '' : ` ${formatEuro(Number(s.other_income_amount), true)}`;
  return `${kind === 'employment' ? 'Gehalt' : 'Pension'}${amount}`;
}

const yesNo = (v: boolean | null) => (v === null ? 'offen' : v ? 'ja' : 'nein');

/** Einzelne Unterschiede in einfachen Worten, z. B. „Kleinunternehmer: nein“. */
export function describeTaxDiff(before: TaxSettings, after: TaxSettings): string[] {
  const out: string[] = [];
  if (before.is_kleinunternehmer !== after.is_kleinunternehmer) out.push(`Kleinunternehmer: ${yesNo(after.is_kleinunternehmer)}`);
  if (profitLabel(before) !== profitLabel(after)) out.push(`Gewinnermittlung: ${profitLabel(after)}`);
  if (before.svs_exempt !== after.svs_exempt) out.push(`Kleinstunternehmer-Ausnahme (SVS): ${yesNo(after.svs_exempt)}`);
  if (before.home_office !== after.home_office) out.push(`Arbeitsplatz zu Hause: ${yesNo(after.home_office)}`);
  if (otherIncomeLabel(before) !== otherIncomeLabel(after)) out.push(`Andere Einkünfte: ${otherIncomeLabel(after)}`);
  return out;
}

/** Änderungen je Jahr gegenüber dem Vorjahr, älteste zuerst. Jahre ohne echte Änderung fallen weg. */
export function taxChangeLog(profile: Profile, rows: readonly TaxYear[]): { year: number; changes: string[] }[] {
  return [...rows]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({ year: r.year, changes: describeTaxDiff(taxSettingsFor(profile, rows, r.year - 1), pick(r)) }))
    .filter((e) => e.changes.length > 0);
}

// ─── Ändern: „Ab wann gilt das?“ ────────────────────────────

/** `fix` = nur korrigieren (ab dem Jahr der bisherigen Angabe), sonst ab einem Kalenderjahr. */
export type TaxChangeStart = { kind: 'fix' } | { kind: 'from'; year: number };

export interface TaxChangePlan {
  /** Neue Profilwerte (gelten vor der ersten Jahres-Einstellung) */
  profile: TaxSettings | null;
  /** Jahres-Einstellungen anlegen oder ersetzen */
  upsert: (TaxSettings & { year: number })[];
  /** Jahres-Einstellungen, die wegfallen (gleich wie das Jahr davor) */
  remove: number[];
}

/** Ab welchem Jahr gilt die Einstellung, die im Jahr `year` wirkt? null = seit Beginn (Profil). */
export function settingSince(rows: readonly TaxYear[], year: number): number | null {
  return rowFor(rows, year)?.year ?? null;
}

const ACCOUNTING = ['is_kleinunternehmer', 'profit_method', 'pausch_type', 'industry_code'] as const;

const sameField = (k: (typeof TAX_FIELDS)[number], a: TaxSettings, b: TaxSettings) =>
  k === 'other_income_amount' ? Number(a[k] ?? 0) === Number(b[k] ?? 0) : a[k] === b[k];

/** Nur die tatsächlich geänderten Angaben, z. B. { home_office: false }. */
export function changedTaxFields(before: TaxSettings, after: TaxSettings): Partial<TaxSettings> {
  const out: Record<string, unknown> = {};
  for (const k of TAX_FIELDS) if (!sameField(k, before, after)) out[k] = after[k];
  return out as Partial<TaxSettings>;
}

/** Ergibt die Änderung in einem anderen Jahr eine unmögliche Kombination (z. B. KU-Pauschalierung ohne Kleinunternehmer)? */
function inconsistent(s: TaxSettings): boolean {
  if (s.pausch_type === 'ku' && !s.is_kleinunternehmer) return true;
  if (s.profit_method === 'pauschal') return !s.pausch_type || (s.pausch_type === 'ku' && !s.industry_code);
  return s.pausch_type !== null || s.industry_code !== null;
}

/**
 * Änderung auf ein Jahr anwenden. Passt die geänderte Gewinnermittlung dort nicht zusammen (z. B. KU-Pauschalierung
 * in einem Jahr ohne Kleinunternehmerregelung), behält das Jahr seine eigene – sie war dort bewusst so eingestellt.
 */
function applyChanges(s: TaxSettings, changes: Partial<TaxSettings>): TaxSettings {
  const out = { ...s, ...changes };
  if (!inconsistent(out)) return out;
  for (const k of ACCOUNTING) (out as Record<string, unknown>)[k] = s[k];
  return out;
}

/**
 * Was beim Speichern passiert. `current` = Werte, die das Formular für `currentYear` zeigt, `next` = neue Werte.
 * Übernommen werden nur die geänderten Angaben – ab dem Startjahr in alle weiteren Jahres-Einstellungen,
 * andere Angaben bleiben je Jahr, wie sie sind. Passt die Gewinnermittlung in einem Jahr nicht dazu, bleibt sie dort. Jahres-Einstellungen, die dem Jahr davor gleichen, fallen weg.
 * - Ab Jahr Y: Y bekommt eine eigene Einstellung (Stand von Y + Änderung).
 * - Korrigieren: ab dem Jahr der Angabe, die heuer gilt; gilt sie seit Beginn, auch im Profil.
 */
export function planTaxChange(
  profile: Profile,
  rows: readonly TaxYear[],
  current: TaxSettings,
  next: TaxSettings,
  start: TaxChangeStart,
  currentYear: number,
): TaxChangePlan {
  const changes = changedTaxFields(current, next);
  const original = new Map(rows.map((r) => [r.year, pick(r)]));
  const settings = new Map(original);
  let base = pick(profile);
  const startYear = start.kind === 'fix' ? settingSince(rows, currentYear) : start.year;

  if (startYear === null) base = applyChanges(base, changes);
  else if (!settings.has(startYear)) settings.set(startYear, taxSettingsFor(profile, rows, startYear));
  for (const [year, s] of settings) if (startYear === null || year >= startYear) settings.set(year, applyChanges(s, changes));

  // Unnötige Zeilen weglassen: gleich wie das Jahr davor
  const years = [...settings.keys()].sort((a, b) => a - b);
  let previous = base;
  for (const year of years) {
    const s = settings.get(year)!;
    if (sameTaxSettings(previous, s)) settings.delete(year);
    else previous = s;
  }

  const upsert = [...settings]
    .filter(([year, s]) => !original.has(year) || !sameTaxSettings(original.get(year)!, s))
    .map(([year, s]) => ({ ...s, year }))
    .sort((a, b) => a.year - b.year);
  const remove = [...original.keys()].filter((y) => !settings.has(y)).sort((a, b) => a - b);
  return { profile: sameTaxSettings(base, pick(profile)) ? null : base, upsert, remove };
}

/** Eigene Jahres-Einstellungen nach `year` – die Änderung wird dort ebenfalls übernommen. */
export const laterSettings = (rows: readonly TaxYear[], year: number) =>
  rows
    .filter((r) => r.year > year)
    .map((r) => r.year)
    .sort((a, b) => a - b);
