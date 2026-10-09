// Rechnungs-Vorlagen: Aufbau der Einstellungen (invoice_templates.settings), Designs, Platzhalter und einfache
// Formatierung. Reine Logik ohne Supabase. Die Pflichtangaben nach § 11 UStG setzt Klaro immer selbst –
// eine Vorlage bestimmt nur Gestaltung und Zusatztexte.

export type HeaderStyle = 'classic' | 'centered' | 'band' | 'image';
export type FontId = 'helvetica' | 'inter' | 'times' | 'lora';
export type LogoPosition = 'left' | 'center' | 'right';
export type LogoSize = 's' | 'm' | 'l';
export type DesignId = 'klassisch' | 'modern' | 'elegant' | 'kopfbild';

export interface TemplateSettings {
  color: string; // Akzentfarbe #rrggbb
  font: FontId;
  header: {
    style: HeaderStyle;
    imagePath: string | null; // Kopfbild (nur style 'image'), Pfad im Bucket 'branding'
    logoPath: string | null;
    logoPosition: LogoPosition;
    logoSize: LogoSize;
    tagline: string; // Zusatz unter dem Namen, z. B. „Grafikdesign & Illustration“
  };
  intro: string; // Einleitung über den Positionen (Vorschlag für jede neue Rechnung)
  closing: {
    title: string; // Überschrift über dem Schlusstext
    text: string; // Schlusstext unter den Positionen (Vorschlag für jede neue Rechnung)
    boxed: boolean; // in einer farbigen Box
  };
  greeting: { text: string; signature: string }; // „Liebe Grüße,“ + hervorgehobene Zeile
  footer: {
    style: 'lines' | 'columns'; // zentrierte Zeilen oder drei Spalten auf farbigem Grund
    contact: string; // dritte Spalte: Telefon, E-Mail, Website …
    text: string; // freier Text (Vorschlag für jede neue Rechnung)
  };
  payment: {
    days: number; // Zahlungsziel in Tagen
    terms: string; // z. B. „2 % Skonto bei Zahlung binnen 7 Tagen“
    box: boolean; // Zahlungsbox mit Empfänger, IBAN, Verwendungszweck
    qr: boolean; // QR-Code zum Bezahlen in der Box
  };
  table: { priceFirst: boolean }; // Spalten: Preis vor Menge
  kuNote: 'totals' | 'below'; // Kleinunternehmer-Hinweis als Zeile in der Summe oder darunter
}

export const DEFAULT_TEMPLATE: TemplateSettings = {
  color: '#0f766e',
  font: 'helvetica',
  header: { style: 'classic', imagePath: null, logoPath: null, logoPosition: 'left', logoSize: 'm', tagline: '' },
  intro: '',
  closing: { title: '', text: '', boxed: false },
  greeting: { text: '', signature: '' },
  footer: { style: 'lines', contact: '', text: '' },
  payment: { days: 14, terms: '', box: true, qr: true },
  table: { priceFirst: false },
  kuNote: 'below',
};

export const FONTS: { id: FontId; label: string; hint: string }[] = [
  { id: 'helvetica', label: 'Helvetica', hint: 'sachlich' },
  { id: 'inter', label: 'Inter', hint: 'modern' },
  { id: 'times', label: 'Times', hint: 'klassisch' },
  { id: 'lora', label: 'Lora', hint: 'elegant' },
];

export const COLOR_SUGGESTIONS = ['#0f766e', '#1e4e8c', '#5b3cc4', '#b4235a', '#c2410c', '#1f2937'];

export interface Design {
  id: DesignId;
  label: string;
  description: string;
  settings: TemplateSettings;
}

/** Fertige Designs zum Start – danach ist alles anpassbar. */
export const DESIGNS: Design[] = [
  {
    id: 'klassisch',
    label: 'Klassisch',
    description: 'Name oben links, ruhig und sachlich.',
    settings: DEFAULT_TEMPLATE,
  },
  {
    id: 'modern',
    label: 'Modern',
    description: 'Farbiger Balken oben, klare Schrift.',
    settings: {
      ...DEFAULT_TEMPLATE,
      color: '#1e4e8c',
      font: 'inter',
      header: { ...DEFAULT_TEMPLATE.header, style: 'band' },
      footer: { ...DEFAULT_TEMPLATE.footer, style: 'columns' },
    },
  },
  {
    id: 'elegant',
    label: 'Elegant',
    description: 'Mittig gesetzt, mit Serifenschrift.',
    settings: {
      ...DEFAULT_TEMPLATE,
      color: '#1f2937',
      font: 'lora',
      header: { ...DEFAULT_TEMPLATE.header, style: 'centered', logoPosition: 'center' },
      closing: { title: '', text: 'Vielen Dank für die gute Zusammenarbeit!', boxed: false },
      greeting: { text: 'Mit freundlichen Grüßen', signature: '' },
    },
  },
  {
    id: 'kopfbild',
    label: 'Mit Kopfbild',
    description: 'Bild über die ganze Breite, Texte in einer Box.',
    settings: {
      ...DEFAULT_TEMPLATE,
      color: '#1e4e8c',
      font: 'times',
      header: { ...DEFAULT_TEMPLATE.header, style: 'image' },
      intro: 'Vielen Dank für Ihren Auftrag! Hiermit stelle ich folgende Leistungen in Rechnung:',
      closing: {
        title: 'Vielen Dank für Ihr Vertrauen!',
        text: 'Bitte überweisen Sie den Rechnungsbetrag innerhalb von {Zahlungsziel} mit dem Verwendungszweck „{Rechnungsnummer}“ auf das unten genannte Konto.',
        boxed: true,
      },
      greeting: { text: 'Liebe Grüße,', signature: '' },
      footer: { ...DEFAULT_TEMPLATE.footer, style: 'columns' },
      payment: { ...DEFAULT_TEMPLATE.payment, box: false },
      table: { priceFirst: true },
      kuNote: 'totals',
    },
  },
];

// ─── Einlesen mit Standardwerten ────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const path = (v: unknown) => (typeof v === 'string' && v ? v : null);

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Gespeicherte Einstellungen (auch alte, unvollständige oder kaputte) → vollständige Einstellungen. */
export function normalizeTemplate(raw: unknown): TemplateSettings {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_TEMPLATE;
  const h = isObj(r.header) ? r.header : {};
  const c = isObj(r.closing) ? r.closing : {};
  const g = isObj(r.greeting) ? r.greeting : {};
  const f = isObj(r.footer) ? r.footer : {};
  const p = isObj(r.payment) ? r.payment : {};
  const t = isObj(r.table) ? r.table : {};
  const days = Number(p.days);
  return {
    color: isHexColor(r.color) ? r.color.toLowerCase() : d.color,
    font: oneOf(r.font, ['helvetica', 'inter', 'times', 'lora'] as const, d.font),
    header: {
      style: oneOf(h.style, ['classic', 'centered', 'band', 'image'] as const, d.header.style),
      imagePath: path(h.imagePath),
      logoPath: path(h.logoPath),
      logoPosition: oneOf(h.logoPosition, ['left', 'center', 'right'] as const, d.header.logoPosition),
      logoSize: oneOf(h.logoSize, ['s', 'm', 'l'] as const, d.header.logoSize),
      tagline: str(h.tagline, ''),
    },
    intro: str(r.intro, ''),
    closing: { title: str(c.title, ''), text: str(c.text, ''), boxed: bool(c.boxed, false) },
    greeting: { text: str(g.text, ''), signature: str(g.signature, '') },
    footer: { style: oneOf(f.style, ['lines', 'columns'] as const, 'lines'), contact: str(f.contact, ''), text: str(f.text, '') },
    payment: {
      days: Number.isInteger(days) && days >= 0 && days <= 365 ? days : d.payment.days,
      terms: str(p.terms, ''),
      box: bool(p.box, true),
      qr: bool(p.qr, true),
    },
    table: { priceFirst: bool(t.priceFirst, false) },
    kuNote: oneOf(r.kuNote, ['totals', 'below'] as const, d.kuNote),
  };
}

// ─── Farbe ──────────────────────────────────────────────────

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrast zu Weiß (1–21). Ab 3 gut lesbar für Überschriften, Summen und weiße Schrift auf der Farbe. */
export function contrastOnWhite(hex: string): number {
  return Math.round((1.05 / (luminance(hex) + 0.05)) * 100) / 100;
}

export const MIN_CONTRAST = 3;

/** Sehr helle Fläche in der Akzentfarbe (Box, Fußzeile): Farbe mit Weiß gemischt. */
export function tint(hex: string, amount = 0.9): string {
  const mix = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount) + 255 * amount);
  return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, '0')).join('')}`;
}

// ─── Platzhalter ────────────────────────────────────────────

export const PLACEHOLDERS = [
  { key: 'Rechnungsnummer', hint: 'z. B. 2026-007' },
  { key: 'Rechnungsbetrag', hint: 'z. B. € 1.280,00' },
  { key: 'Zahlungsziel', hint: 'z. B. 14 Tagen' },
  { key: 'Fällig am', hint: 'Datum, bis wann bezahlt wird' },
  { key: 'Kunde', hint: 'Name deiner Kundin bzw. deines Kunden' },
] as const;

export type PlaceholderValues = Partial<Record<(typeof PLACEHOLDERS)[number]['key'], string>>;

/** „{Rechnungsnummer}“ usw. ersetzen; Unbekanntes und Platzhalter ohne Wert bleiben stehen. */
export function fillPlaceholders(text: string, values: PlaceholderValues): string {
  return text.replace(/\{([^{}]+)\}/g, (match, key: string) => {
    const k = PLACEHOLDERS.find((p) => p.key.toLowerCase() === key.trim().toLowerCase())?.key;
    const v = k ? values[k] : undefined;
    return v ?? match;
  });
}

// ─── Einfache Formatierung ──────────────────────────────────

export interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}
export type RichBlock = { kind: 'paragraph'; segments: Segment[] } | { kind: 'list'; items: Segment[][] };

const BULLET = /^\s*[-•*]\s+/;

/** **fett** und *kursiv* innerhalb einer Zeile. */
export function parseInline(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2]!, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/**
 * Text → Absätze und Aufzählungen. Leerzeile = neuer Absatz, Zeilen mit „-“ oder „•“ = Aufzählung,
 * **fett**, *kursiv*. Einzelne Zeilenumbrüche bleiben erhalten.
 */
export function parseRichText(text: string | null | undefined): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const chunk of (text ?? '').replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ kind: 'paragraph', segments: parseInline(para.join('\n')) });
      para = [];
    };
    for (const line of lines) {
      if (BULLET.test(line)) {
        flush();
        const item = parseInline(line.replace(BULLET, ''));
        const prev = blocks[blocks.length - 1];
        if (prev?.kind === 'list' && para.length === 0) prev.items.push(item);
        else blocks.push({ kind: 'list', items: [item] });
      } else {
        para.push(line.trim());
      }
    }
    flush();
  }
  return blocks;
}

/** Bezeichnung einer Position: erste Zeile + weitere Zeilen, Aufzählungspunkte erkannt. */
export function descriptionLines(description: string): { text: string; bullet: boolean }[] {
  return description
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => (BULLET.test(l) ? { text: l.replace(BULLET, '').trim(), bullet: true } : { text: l.trim(), bullet: false }));
}

/** Gängige Einheiten für Positionen (frei eingebbar). */
export const UNIT_SUGGESTIONS = ['Std.', 'Tag', 'Stück', 'km', 'pauschal', 'm²', 'Monat'];
