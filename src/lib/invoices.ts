// Rechnungs-Hilfsfunktionen: Anzeige-Status, Filter, Datumslogik
import type { Invoice, InvoiceStatus, LineItem } from '@/types';
import { formatDecimalInput, parseDecimal, round2 } from './money';

// 'cancelled' = stornierte Rechnung (auch wenn sie vorher bezahlt war), 'storno' = die Stornorechnung selbst
export type DisplayStatus = InvoiceStatus | 'storno';
export type InvoiceFilter = 'all' | 'open' | 'paid' | 'overdue';

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  draft: 'Entwurf',
  sent: 'Offen',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
  cancelled: 'Storniert',
  storno: 'Stornorechnung',
};

export const FILTER_LABELS: Record<InvoiceFilter, string> = {
  all: 'Alle',
  open: 'Offen',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
};

export const DEFAULT_PAYMENT_DAYS = 14;

/** Lokales Datum als ISO-String (YYYY-MM-DD), ohne Zeitzonen-Verschiebung. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return toISODate(new Date(y, m - 1, d + days));
}

/** „2026-10-03“ → „03.10.2026“ */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Gesendete Rechnungen nach Fälligkeit gelten als überfällig (unabhängig vom gespeicherten Status).
 * Stornorechnungen und stornierte Rechnungen haben einen eigenen Status – auch eine bezahlte Rechnung bleibt in der
 * Datenbank „paid“ (zählt in ihrem Jahr), wird aber als storniert angezeigt.
 */
export function getDisplayStatus(
  invoice: { status: string; due_date: string | null; cancels_invoice_id?: string | null; cancelled_at?: string | null },
  today: string = toISODate(new Date()),
): DisplayStatus {
  if (invoice.cancels_invoice_id) return 'storno';
  if (invoice.cancelled_at) return 'cancelled';
  const status = invoice.status as InvoiceStatus;
  if (status === 'sent' || status === 'overdue') {
    return invoice.due_date && invoice.due_date < today ? 'overdue' : 'sent';
  }
  return status;
}

export function matchesFilter(status: DisplayStatus, filter: InvoiceFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'open':
      return status === 'sent' || status === 'overdue';
    case 'paid':
      return status === 'paid';
    case 'overdue':
      return status === 'overdue';
  }
}

export function emptyLineItem(): LineItem {
  return { description: '', quantity: 1, unit_price: 0, total: 0 };
}

/** Rechnungsjahr aus dem Datum (für die fortlaufende Nummer). */
export function invoiceYear(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

// ─── Formular ───────────────────────────────────────────────

export interface LineItemInput {
  description: string;
  quantity: string; // Rohtext aus dem Eingabefeld (deutsches Komma erlaubt)
  unit_price: string;
  unit?: string; // z. B. „Std.“ (optional)
}

export interface InvoiceFormInput {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  serviceFrom: string;
  serviceTo: string;
  items: LineItemInput[];
}

export interface InvoiceFormErrors {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  serviceTo?: string;
  items?: string;
  itemErrors?: Record<number, { quantity?: string; unit_price?: string }>;
}

// Leer = weder Bezeichnung noch Preis (die Menge ist bei neuen Zeilen mit „1“ vorbelegt)
const isBlankRow = (i: LineItemInput) => !i.description.trim() && !i.unit_price.trim();

/**
 * Menge per Pfeil um ±1 ändern. Nach unten nicht unter 1 – sonst bleibt der Text unverändert (kleinere Mengen
 * wie 0,5 nur per Eingabe). Kommazahlen bleiben erhalten (1,5 → 2,5); ungültiger Text zählt nach oben als 0.
 */
export function stepQuantity(value: string, delta: 1 | -1): string {
  const parsed = parseDecimal(value);
  const q = Number.isNaN(parsed) ? 0 : parsed;
  if (delta < 0 && q - 1 < 1) return value;
  // Gleitkomma glätten (0,1 + 1), ohne Nachkommastellen der Eingabe abzuschneiden
  return formatDecimalInput(Math.round((q + delta) * 1e6) / 1e6);
}

/** Eingabezeilen → Positionen (leere Zeilen werden ignoriert, ungültige Zahlen als 0). */
export function parseLineItems(items: LineItemInput[]): LineItem[] {
  return items
    .filter((i) => !isBlankRow(i))
    .map((i) => {
      const quantity = parseDecimal(i.quantity);
      const unitPrice = parseDecimal(i.unit_price);
      const q = Number.isNaN(quantity) ? 0 : quantity;
      const p = Number.isNaN(unitPrice) ? 0 : unitPrice;
      const unit = i.unit?.trim();
      // Mehrzeilige Bezeichnung: Zeilen behalten, nur Leerraum am Rand entfernen
      const description = i.description.replace(/\r\n/g, '\n').trim();
      return { description, quantity: q, unit_price: p, total: round2(q * p), ...(unit && { unit }) };
    });
}

/** Prüft die Formularwerte (für Entwurf und Ausstellen). §11-Pflichtangaben prüft validateInvoiceUStG11. */
export function validateInvoiceForm(input: InvoiceFormInput): InvoiceFormErrors {
  const e: InvoiceFormErrors = {};
  if (!input.invoiceNumber.trim()) e.invoiceNumber = 'Bitte gib eine Rechnungsnummer ein.';
  if (!input.invoiceDate) e.invoiceDate = 'Bitte gib ein Rechnungsdatum ein.';
  if (input.dueDate && input.invoiceDate && input.dueDate < input.invoiceDate) {
    e.dueDate = 'Die Fälligkeit kann nicht vor dem Rechnungsdatum liegen.';
  }
  if (input.serviceTo && input.serviceFrom && input.serviceTo < input.serviceFrom) {
    e.serviceTo = 'Das Ende muss nach dem Beginn liegen.';
  }

  const itemErrors: NonNullable<InvoiceFormErrors['itemErrors']> = {};
  input.items.forEach((item, idx) => {
    if (isBlankRow(item)) return;
    const q = parseDecimal(item.quantity);
    const p = parseDecimal(item.unit_price);
    const errs: { quantity?: string; unit_price?: string } = {};
    if (Number.isNaN(q) || q <= 0) errs.quantity = 'Ungültige Menge';
    if (Number.isNaN(p) || p < 0) errs.unit_price = 'Ungültiger Preis';
    if (errs.quantity || errs.unit_price) itemErrors[idx] = errs;
  });
  if (Object.keys(itemErrors).length > 0) e.itemErrors = itemErrors;
  if (input.items.every(isBlankRow)) e.items = 'Füge mindestens eine Position hinzu.';
  return e;
}

export function hasFormErrors(e: InvoiceFormErrors): boolean {
  return Object.keys(e).length > 0;
}

// ─── Stornieren ─────────────────────────────────────────────

/** Datum der Stornorechnung: heute – aber nie vor dem Datum der Originalrechnung. */
export function stornoDate(invoiceDate: string, today: string = toISODate(new Date())): string {
  return invoiceDate > today ? invoiceDate : today;
}

/**
 * Korrigierte Rechnung als Entwurf: Inhalte der stornierten Rechnung, neue Nummer und heutiges Datum, gleiches
 * Zahlungsziel. Beträge, USt und Absender rechnet die Datenbank beim Speichern bzw. Ausstellen neu.
 */
export function correctionDraftFrom(
  original: Pick<
    Invoice,
    | 'client_id' | 'invoice_date' | 'due_date' | 'is_honorarnote' | 'line_items' | 'vat_rate' | 'service_date_from'
    | 'service_date_to' | 'payment_method' | 'template_id' | 'intro_text' | 'notes' | 'footer_text'
  >,
  invoiceNumber: string,
  today: string = toISODate(new Date()),
) {
  const days = original.due_date
    ? Math.round((Date.parse(`${original.due_date}T00:00:00Z`) - Date.parse(`${original.invoice_date}T00:00:00Z`)) / 86_400_000)
    : null;
  return {
    status: 'draft' as const,
    invoice_number: invoiceNumber,
    invoice_date: today,
    due_date: days === null ? null : addDays(today, days),
    client_id: original.client_id,
    is_honorarnote: original.is_honorarnote,
    line_items: original.line_items,
    vat_rate: original.vat_rate,
    service_date_from: original.service_date_from,
    service_date_to: original.service_date_to,
    payment_method: original.payment_method,
    template_id: original.template_id,
    intro_text: original.intro_text,
    notes: original.notes,
    footer_text: original.footer_text,
  };
}
