// Rechnung übernehmen: Ergebnis von read-invoice-design → Klaro-Vorlage, Zusammenfassung fürs Vergleichen,
// Farbkandidaten aus dem Seitenbild. Reine Logik ohne Browser-APIs (Vitest).
import type { DesignResult } from '../../supabase/functions/read-invoice-design/design';
import { DEFAULT_TEMPLATE, FONTS, normalizeTemplate, PLACEHOLDERS, type TemplateSettings } from './invoiceTemplates';

export type { DesignResult };

/** Vorlage aus dem Ergebnis. Bild-Pfade setzt der Aufrufer, sobald die Bilder hochgeladen sind. */
export function designToTemplate(d: DesignResult, paths: { header: string | null; logo: string | null }): TemplateSettings {
  // Kopfbild ohne Bild ergibt keinen Sinn → klassisch
  const style = d.header_style === 'image' && !paths.header ? 'classic' : d.header_style;
  // „Mitte“ gibt es nur bei zentriert und Kopfbild
  const position = d.logo_position === 'center' && style !== 'centered' && style !== 'image' ? 'left' : d.logo_position;
  return normalizeTemplate({
    ...DEFAULT_TEMPLATE,
    color: d.color,
    font: d.font,
    header: { style, imagePath: paths.header, logoPath: paths.logo, logoPosition: position, logoSize: d.logo_size, tagline: d.tagline },
    intro: d.intro,
    closing: { title: d.closing_title, text: d.closing_text, boxed: d.closing_boxed },
    greeting: { text: d.greeting_text, signature: d.greeting_signature },
    footer: { style: d.footer_style, contact: d.footer_contact.join('\n'), bankExtra: d.footer_bank_extra.join('\n'), tinted: d.footer_tinted, text: d.footer_text },
    payment: { days: d.payment_days ?? DEFAULT_TEMPLATE.payment.days, terms: d.payment_terms, box: d.payment_box, qr: d.payment_box },
    table: { priceFirst: d.price_first },
    kuNote: d.ku_note,
  });
}

const HEADER_LABEL = { classic: 'klassisch', centered: 'zentriert', band: 'Farbbalken', image: 'Kopfbild' } as const;

/** Kurze Liste, was Klaro übernommen hat (für die Vergleichsansicht). */
export function adoptedSummary(t: TemplateSettings, d: Pick<DesignResult, 'payment_days'>): string[] {
  const out: string[] = [];
  const h = t.header;
  out.push(`Kopf: ${HEADER_LABEL[h.style]}${h.logoPath ? ', mit Logo' : ''}`);
  out.push(`Schrift: ${FONTS.find((f) => f.id === t.font)?.label ?? t.font}`);
  const placeholders = (text: string) => PLACEHOLDERS.filter((p) => text.includes(`{${p.key}}`)).map((p) => `{${p.key}}`);
  if (t.intro) out.push('Text über den Positionen');
  if (t.closing.text || t.closing.title) {
    const ph = placeholders(`${t.closing.title} ${t.closing.text}`);
    out.push(`Text unter den Positionen${t.closing.boxed ? ' in farbiger Box' : ''}${ph.length ? ` mit ${ph.join(', ')}` : ''}`);
  }
  if (t.greeting.text || t.greeting.signature) out.push(`Grußformel „${[t.greeting.text, t.greeting.signature].filter(Boolean).join(' ')}“`);
  const contacts = t.footer.contact.split('\n').filter(Boolean).length;
  out.push(`Fußzeile ${t.footer.style === 'columns' ? 'in drei Spalten' : 'zentriert'}${contacts ? `, ${contacts} Kontaktangabe${contacts === 1 ? '' : 'n'}` : ''}`);
  if (t.footer.bankExtra) out.push(`Bankangaben: ${t.footer.bankExtra.split('\n').filter(Boolean).join(', ')}`);
  if (d.payment_days !== null) out.push(`Zahlungsziel ${d.payment_days} Tage`);
  if (t.payment.terms) out.push(`Zahlungsbedingungen: ${t.payment.terms}`);
  return out;
}

/**
 * Häufigste kräftige Farben eines Bildes (RGBA-Pixel), z. B. Überschrift oder Logo – Weiß, Schwarz und Grau zählen nicht.
 * Ähnliche Farben werden zusammengefasst; Ergebnis als #rrggbb, häufigste zuerst.
 */
export function dominantColors(pixels: ArrayLike<number>, max = 6, minShare = 0.0005): string[] {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  let counted = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    if (pixels[i + 3]! < 128) continue;
    counted++;
    const hi = Math.max(r, g, b);
    if (hi - Math.min(r, g, b) < 40 || hi < 50) continue; // grau, weiß oder fast schwarz
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    buckets.set(key, { n: e.n + 1, r: e.r + r, g: e.g + g, b: e.b + b });
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  const result: { hex: string; rgb: [number, number, number]; n: number }[] = [];
  for (const e of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    if (e.n < counted * minShare || result.length >= max) break;
    const rgb: [number, number, number] = [e.r / e.n, e.g / e.n, e.b / e.n];
    // Nahe an einer schon gefundenen Farbe → gehört dazu
    if (result.some((c) => Math.abs(c.rgb[0] - rgb[0]) + Math.abs(c.rgb[1] - rgb[1]) + Math.abs(c.rgb[2] - rgb[2]) < 60)) continue;
    result.push({ hex: `#${rgb.map(hex).join('')}`, rgb, n: e.n });
  }
  return result.map((c) => c.hex);
}
