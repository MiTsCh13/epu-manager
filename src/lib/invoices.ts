// Rechnungs-Hilfsfunktionen: Anzeige-Status, Filter, Datumslogik
import type { InvoiceStatus, LineItem } from '@/types';
import { parseDecimal, round2 } from './money';

export type DisplayStatus = InvoiceStatus; // 'draft' | 'sent' | 'paid' | 'overdue'
export type InvoiceFilter = 'all' | 'open' | 'paid' | 'overdue';

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  draft: 'Entwurf',
  sent: 'Offen',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
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

/** Gesendete Rechnungen nach Fälligkeit gelten als überfällig (unabhängig vom gespeicherten Status). */
export function getDisplayStatus(
  invoice: { status: string; due_date: string | null },
  today: string = toISODate(new Date()),
): DisplayStatus {
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
