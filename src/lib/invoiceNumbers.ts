// Rechnungsnummern nach eigenem Format, z. B. „RE_{JJ}{NNNN}“ → RE_260001. Reine Logik ohne Supabase.
//
// Bausteine: {JJJJ} Jahr, {JJ} Jahr zweistellig, {MM} Monat, {NNN} laufende Nummer (Anzahl N = Mindeststellen).
// Mit Jahr im Format beginnt die Zählung jedes Jahr neu, ohne Jahr läuft sie immer weiter.

export const DEFAULT_NUMBER_FORMAT = '{JJJJ}-{NNN}';

/** Fertige Formate zum Anklicken. */
export const NUMBER_FORMAT_PRESETS = ['{JJJJ}-{NNN}', 'RE-{JJJJ}-{NNN}', '{JJJJ}/{NNN}', 'RE{JJ}{NNNN}'] as const;

export const NUMBER_TOKENS = [
  { token: '{JJJJ}', hint: 'Jahr, z. B. 2026' },
  { token: '{JJ}', hint: 'Jahr kurz, z. B. 26' },
  { token: '{MM}', hint: 'Monat, z. B. 03' },
  { token: '{NNN}', hint: 'laufende Nummer, mit so vielen Stellen wie N' },
] as const;

/** Frühere feste Formate (vor dem eigenen Format) – ihre Nummern zählen beim Weiterzählen mit. */
const LEGACY_FORMATS = ['{JJJJ}-{NNN}', 'KL-{JJJJ}-{NNN}'];

type Part = { kind: 'text'; text: string } | { kind: 'year4' | 'year2' | 'month' } | { kind: 'counter'; width: number };

const MAX_LENGTH = 40;
const LITERAL = /^[A-Za-z0-9_\-./#]*$/;

/** Format zerlegen; null bei unbekannten Bausteinen. */
function parseFormat(format: string): Part[] | null {
  const parts: Part[] = [];
  const re = /\{([^{}]*)\}/g;
  let last = 0;
  for (let m = re.exec(format); m; m = re.exec(format)) {
    if (m.index > last) parts.push({ kind: 'text', text: format.slice(last, m.index) });
    const t = m[1]!.trim().toUpperCase();
    if (t === 'JJJJ' || t === 'YYYY') parts.push({ kind: 'year4' });
    else if (t === 'JJ' || t === 'YY') parts.push({ kind: 'year2' });
    else if (t === 'MM') parts.push({ kind: 'month' });
    else if (/^N{1,8}$/.test(t)) parts.push({ kind: 'counter', width: t.length });
    else return null;
    last = m.index + m[0].length;
  }
  if (last < format.length) parts.push({ kind: 'text', text: format.slice(last) });
  return parts;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

function render(parts: Part[], year: number, month: number, counter: number): string {
  return parts
    .map((p) => {
      if (p.kind === 'text') return p.text;
      if (p.kind === 'year4') return String(year);
      if (p.kind === 'year2') return pad(year % 100, 2);
      if (p.kind === 'month') return pad(month, 2);
      return p.kind === 'counter' ? pad(counter, p.width) : '';
    })
    .join('');
}

/** Einheitliche Schreibweise zum Speichern: „{ yy }-{nnn}“ → „{JJ}-{NNN}“. */
export function canonicalNumberFormat(format: string): string {
  const parts = parseFormat(format.trim());
  if (!parts) return format.trim();
  return parts
    .map((p) =>
      p.kind === 'text' ? p.text : p.kind === 'year4' ? '{JJJJ}' : p.kind === 'year2' ? '{JJ}' : p.kind === 'month' ? '{MM}' : `{${'N'.repeat(p.kind === 'counter' ? p.width : 3)}}`,
    )
    .join('');
}

/** Fehlermeldung für ein ungültiges Format, sonst null. */
export function validateNumberFormat(format: string): string | null {
  const f = format.trim();
  if (!f) return 'Bitte gib ein Format ein, z. B. {JJJJ}-{NNN}.';
  const parts = parseFormat(f);
  if (!parts) return 'Unbekannter Baustein in { }. Erlaubt sind {JJJJ}, {JJ}, {MM} und {NNN}.';
  const counters = parts.filter((p) => p.kind === 'counter').length;
  if (counters === 0) return 'Es fehlt die laufende Nummer {NNN} – sonst wäre jede Nummer gleich.';
  if (counters > 1) return 'Die laufende Nummer {NNN} darf nur einmal vorkommen.';
  if (parts.some((p) => p.kind === 'month') && !parts.some((p) => p.kind === 'year4' || p.kind === 'year2')) {
    return 'Mit Monat {MM} brauchst du auch das Jahr {JJJJ} oder {JJ} – sonst gäbe es Nummern doppelt.';
  }
  if (parts.some((p) => p.kind === 'text' && !LITERAL.test(p.text))) {
    return 'Erlaubt sind Buchstaben (ohne Umlaute), Ziffern und - _ . / # – keine Leerzeichen.';
  }
  if (render(parts, 2026, 12, 1).length > MAX_LENGTH) return `Höchstens ${MAX_LENGTH} Zeichen.`;
  return null;
}

/** Nummer im Format für ein Datum (ISO) und eine laufende Nummer, z. B. für die Vorschau. */
export function formatInvoiceNumber(format: string, isoDate: string, counter: number): string {
  // Ungültig (auch alte Werte wie „YYYY-NNN“ ohne { }) → Standardformat statt wörtlicher Nummer
  const parts = validateNumberFormat(format) ? parseFormat(DEFAULT_NUMBER_FORMAT)! : parseFormat(format.trim())!;
  return render(parts, Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)), counter);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Regex für Nummern dieses Formats; mit Jahr nur Nummern des Jahres. Gruppe 1 = laufende Nummer. */
function numberPattern(parts: Part[], year: number): RegExp {
  const src = parts
    .map((p) => {
      if (p.kind === 'text') return escape(p.text);
      if (p.kind === 'year4') return String(year);
      if (p.kind === 'year2') return pad(year % 100, 2);
      if (p.kind === 'month') return '(?:0[1-9]|1[0-2])';
      return p.kind === 'counter' ? `(\\d{${p.width},})` : '';
    })
    .join('');
  return new RegExp(`^${src}$`, 'i');
}

/**
 * Nächste fortlaufende Nummer für ein Rechnungsdatum. Zählt nach der höchsten vergebenen Nummer weiter –
 * auch über frühere Formate (2026-007 → RE_260008), damit ein Formatwechsel mitten im Jahr den Nummernkreis
 * nicht neu beginnt. `knownFormats`: Formate bisheriger Klaro-Rechnungen (siehe formatsOf).
 */
export function nextInvoiceNumber(
  format: string,
  isoDate: string,
  existingNumbers: readonly string[],
  knownFormats: readonly string[] = [],
): string {
  const year = Number(isoDate.slice(0, 4));
  const formats = [...new Set([format, ...LEGACY_FORMATS, ...knownFormats])];
  const patterns = formats.flatMap((f) => {
    const parts = parseFormat(f);
    return parts ? [numberPattern(parts, year)] : [];
  });
  let max = 0;
  for (const n of existingNumbers) {
    const value = n.trim();
    for (const p of patterns) {
      const m = p.exec(value);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return formatInvoiceNumber(format, isoDate, max + 1);
}

// ─── Format aus bestehenden Nummern erkennen (Import) ───────

/**
 * Format einer einzelnen Nummer, z. B. „RE_260012“ vom 3.2.2026 → „RE_{JJ}{NNNN}“; null ohne Ziffern.
 * Das Datum ist bei übernommenen Einnahmen der Zahlungstag – die Nummer kann also auch das Vorjahr tragen.
 */
function guessFormat(reference: string, isoDate: string): string | null {
  const ref = reference.trim();
  const last = /(\d+)(\D*)$/.exec(ref);
  if (!last || ref.length > MAX_LENGTH) return null;
  const head = ref.slice(0, last.index);
  const digits = last[1]!;
  const suffix = last[2]!;
  if (!LITERAL.test(head.replace(/\d/g, '')) || !LITERAL.test(suffix)) return null;

  const paid = Number(isoDate.slice(0, 4));
  let fallback: string | null = null;
  for (const year of [String(paid), String(paid - 1)]) {
    const yy = year.slice(2);
    // Jahr als eigene Zifferngruppe vor der laufenden Nummer: RE-2026-012, 26/012
    const prefix = head.replace(/(^|\D)(\d+)(?=\D|$)/g, (m, before: string, d: string) =>
      d === year ? `${before}{JJJJ}` : d === yy ? `${before}{JJ}` : m,
    );
    if (/\d/.test(prefix)) continue; // andere Ziffern davor kennen wir nicht
    // Jahr am Anfang der letzten Zifferngruppe: 2026012, 260012 (danach mindestens zwei Stellen laufende Nummer)
    let counter = digits;
    let yearToken = '';
    if (!/\{JJ(JJ)?\}/.test(prefix)) {
      if (digits.length >= 6 && digits.startsWith(year)) [yearToken, counter] = ['{JJJJ}', digits.slice(4)];
      else if (digits.length >= 4 && digits.startsWith(yy)) [yearToken, counter] = ['{JJ}', digits.slice(2)];
    }
    const format = `${prefix}${yearToken}{${'N'.repeat(Math.min(8, counter.length))}}${suffix}`;
    if (/\{JJ/.test(format)) return format;
    fallback ??= format;
  }
  return fallback;
}

/** Formate, in denen diese Nummern geschrieben sind – für Klaro-Rechnungen, deren Format bekannt ist. */
export function formatsOf(samples: readonly { reference: string; date: string }[]): string[] {
  const out = new Set<string>();
  for (const s of samples) {
    const f = guessFormat(s.reference, s.date);
    if (f && !validateNumberFormat(f)) out.add(f.replace(/\{N+\}/, '{N}'));
  }
  return [...out];
}

/**
 * Häufigstes Format übernommener Rechnungsnummern. Nur wenn es eindeutig ist: mindestens zwei Nummern
 * und mindestens drei Viertel davon passen. Unterschiedlich lange laufende Nummern (9, 10 …) zählen als
 * dasselbe Format; die Mindeststellen kommen von der kürzesten.
 */
export function inferNumberFormat(samples: readonly { reference: string; date: string }[]): { format: string; example: string } | null {
  const groups = new Map<string, { count: number; width: number; example: string }>();
  let total = 0;
  for (const s of samples) {
    if (!s.reference.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) continue;
    total++;
    const f = guessFormat(s.reference, s.date);
    if (!f) continue;
    const width = /\{(N+)\}/.exec(f)![1]!.length;
    const key = f.replace(/\{N+\}/, '{N}');
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.width = Math.min(g.width, width);
    } else groups.set(key, { count: 1, width, example: s.reference.trim() });
  }
  const best = [...groups.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (!best || best[1].count < 2 || best[1].count < total * 0.75) return null;
  const format = best[0].replace('{N}', `{${'N'.repeat(best[1].width)}}`);
  return validateNumberFormat(format) ? null : { format, example: best[1].example };
}
