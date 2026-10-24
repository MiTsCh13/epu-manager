// Leistungen & Produkte: gespeicherte Positionen, die man beim Rechnungschreiben auswählt.
// Bezeichnung einer Position = Name (erste Zeile) + Details (weitere Zeilen, z. B. „- Aufzählung“).
import type { LineItem, Product } from '@/types';
import type { LineItemInput } from './invoices';
import { formatDecimalInput, parseDecimal, round2 } from './money';

export interface ProductFormData {
  name: string;
  details: string;
  unit: string;
  unit_price: string; // Rohtext (deutsches Komma erlaubt)
}

export type ProductFormErrors = Partial<Record<keyof ProductFormData, string>>;

export const EMPTY_PRODUCT_FORM: ProductFormData = { name: '', details: '', unit: '', unit_price: '' };

export const PRODUCT_NAME_MAX = 200;
export const PRODUCT_UNIT_MAX = 20;
export const PRODUCT_DETAILS_MAX = 2000;
/** NUMERIC(10,2) */
const PRICE_LIMIT = 100_000_000;

/** Gleicher Schlüssel wie der eindeutige Index in der Datenbank: Groß-/Kleinschreibung und Rand-Leerzeichen egal. */
export function productKey(name: string): string {
  return name.trim().toLowerCase();
}

export function validateProduct(data: ProductFormData, others: Pick<Product, 'name'>[] = []): ProductFormErrors {
  const e: ProductFormErrors = {};
  const name = data.name.trim();
  if (!name) e.name = 'Bitte gib eine Bezeichnung ein.';
  else if (name.length > PRODUCT_NAME_MAX) e.name = `Höchstens ${PRODUCT_NAME_MAX} Zeichen.`;
  else if (others.some((p) => productKey(p.name) === productKey(name))) e.name = 'Diese Bezeichnung gibt es schon.';
  if (data.details.trim().length > PRODUCT_DETAILS_MAX) e.details = `Höchstens ${PRODUCT_DETAILS_MAX} Zeichen.`;
  if (data.unit.trim().length > PRODUCT_UNIT_MAX) e.unit = `Höchstens ${PRODUCT_UNIT_MAX} Zeichen.`;
  const price = parseDecimal(data.unit_price);
  if (!data.unit_price.trim()) e.unit_price = 'Bitte gib einen Preis ein.';
  else if (Number.isNaN(price) || price < 0) e.unit_price = 'Bitte gib einen gültigen Preis ein (z. B. 85,00).';
  else if (round2(price) >= PRICE_LIMIT) e.unit_price = 'Dieser Preis ist zu hoch.';
  return e;
}

export function normalizeProduct(data: ProductFormData) {
  return {
    name: data.name.trim(),
    details: data.details.replace(/\r\n/g, '\n').trim(),
    unit: data.unit.trim() || null,
    unit_price: round2(parseDecimal(data.unit_price)),
  };
}

export function productToForm(p: Product): ProductFormData {
  return { name: p.name, details: p.details, unit: p.unit ?? '', unit_price: formatDecimalInput(Number(p.unit_price)) };
}

/** Bezeichnung einer Position → Name (erste Zeile) + Details (Rest). */
export function splitDescription(description: string): { name: string; details: string } {
  const lines = description.replace(/\r\n/g, '\n').trim().split('\n');
  return { name: (lines[0] ?? '').trim(), details: lines.slice(1).join('\n').trim() };
}

export function productDescription(p: Pick<Product, 'name' | 'details'>): string {
  return p.details.trim() ? `${p.name}\n${p.details.trim()}` : p.name;
}

/** Felder einer Rechnungsposition aus einem Produkt – die Menge bleibt, wie sie ist. */
export function productToLine(p: Product): Pick<LineItemInput, 'description' | 'unit' | 'unit_price'> {
  return { description: productDescription(p), unit: p.unit ?? '', unit_price: formatDecimalInput(Number(p.unit_price)) };
}

/** Position aus dem Rechnungs-Editor → Formular „Als Produkt speichern“. */
export function lineToProductForm(row: LineItemInput): ProductFormData {
  const { name, details } = splitDescription(row.description);
  const price = parseDecimal(row.unit_price);
  return { name, details, unit: row.unit?.trim() ?? '', unit_price: Number.isNaN(price) ? '' : formatDecimalInput(price) };
}

/** Lässt sich die Position als Produkt speichern (Bezeichnung + gültiger Preis) und gibt es sie noch nicht? */
export function canSaveAsProduct(row: LineItemInput, products: Pick<Product, 'name'>[]): boolean {
  const { name } = splitDescription(row.description);
  const price = parseDecimal(row.unit_price);
  return !!name && !Number.isNaN(price) && price >= 0 && !products.some((p) => productKey(p.name) === productKey(name));
}

/** Zuletzt verwendete zuerst, nie verwendete danach alphabetisch. */
export function sortProducts<T extends Pick<Product, 'name' | 'last_used_at'>>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.last_used_at && b.last_used_at) return b.last_used_at.localeCompare(a.last_used_at);
    if (a.last_used_at) return -1;
    if (b.last_used_at) return 1;
    return a.name.localeCompare(b.name, 'de');
  });
}

/**
 * Suche für Liste und Vorschläge: alle Wörter müssen vorkommen (Name, Details, Einheit).
 * Treffer am Anfang des Namens zuerst, sonst bleibt die Reihenfolge der Liste.
 */
export function searchProducts<T extends Pick<Product, 'name' | 'details' | 'unit'>>(list: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return list;
  const hits = list.filter((p) => {
    const text = `${p.name} ${p.details} ${p.unit ?? ''}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const q = query.trim().toLowerCase();
  return [...hits.filter((p) => p.name.toLowerCase().startsWith(q)), ...hits.filter((p) => !p.name.toLowerCase().startsWith(q))];
}

export interface ProductSuggestion extends ProductFormData {
  key: string;
  count: number;
}

/**
 * Häufige Positionen aus bisherigen Rechnungen als Startpunkt für die Produktliste: mindestens zweimal verwendet,
 * noch nicht als Produkt gespeichert. Preis und Einheit von der neuesten Rechnung (Liste neueste zuerst übergeben).
 */
export function suggestProducts(
  invoices: { line_items: unknown }[],
  products: Pick<Product, 'name'>[],
  limit = 10,
): ProductSuggestion[] {
  const existing = new Set(products.map((p) => productKey(p.name)));
  const found = new Map<string, ProductSuggestion>();
  for (const inv of invoices) {
    if (!Array.isArray(inv.line_items)) continue;
    const seenHere = new Set<string>();
    for (const item of inv.line_items as Partial<LineItem>[]) {
      if (typeof item?.description !== 'string' || typeof item.unit_price !== 'number') continue;
      const { name, details } = splitDescription(item.description);
      const key = productKey(name);
      if (!name || name.length > PRODUCT_NAME_MAX || details.length > PRODUCT_DETAILS_MAX) continue;
      if (item.unit_price < 0 || item.unit_price >= PRICE_LIMIT || existing.has(key) || seenHere.has(key)) continue;
      seenHere.add(key);
      const hit = found.get(key);
      if (hit) hit.count++;
      else {
        found.set(key, {
          key,
          count: 1,
          name,
          details,
          unit: (item.unit ?? '').slice(0, PRODUCT_UNIT_MAX),
          unit_price: formatDecimalInput(item.unit_price),
        });
      }
    }
  }
  return [...found.values()]
    .filter((s) => s.count >= 2)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'))
    .slice(0, limit);
}
