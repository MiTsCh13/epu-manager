// Assistent (Edge Function „assistant“): Anfrage aufbauen und die Antwort in Vorschläge für die bestehenden Formulare
// übersetzen – Fahrt → Ausgaben-Formular (Kilometergeld), Rechnung → Rechnungs-Editor. Gespeichert wird erst dort.
import { invokeFunction } from './functions';
import { formatDecimalInput } from './money';
import { productToLine } from './products';
import type { ReceiptPrefill } from './receiptPrefill';
import type { LineItemInput } from './invoices';
import type { Client, Product, Vehicle } from '@/types';
import type {
  AssistantResult,
  InvoiceResult,
  TripResult,
} from '../../supabase/functions/assistant/assistant';

export type { AssistantResult, InvoiceResult, TripResult };

export async function askAssistant(
  text: string,
  { clients, products, today }: { clients: Pick<Client, 'id' | 'name'>[]; products: Product[]; today: string },
): Promise<{ result: AssistantResult } | { error: string }> {
  const response = await invokeFunction<{ result: AssistantResult }>(
    'assistant',
    'Der Assistent ist gerade nicht erreichbar. Bitte versuche es später erneut.',
    {
      text,
      today,
      clients: clients.slice(0, 500).map((c) => ({ id: c.id, name: c.name })),
      products: products.slice(0, 500).map((p) => ({ id: p.id, name: p.name, unit: p.unit, unit_price: Number(p.unit_price) })),
    },
  );
  return response.error !== null ? { error: response.error } : { result: response.data.result };
}

/** Kurzer Ortsname für die Anzeige: „Hauptplatz 1, Linz, OO, Austria“ → „Hauptplatz 1, Linz“. */
export function shortPlace(label: string | null, fallback: string): string {
  if (!label) return fallback;
  const parts = label.split(',').map((p) => p.trim()).filter(Boolean);
  // Bundesland-Kürzel und Land am Ende weglassen
  while (parts.length > 1 && (/^[A-Z]{2}$/.test(parts.at(-1)!) || /^(Austria|Österreich|Germany|Deutschland|Italy|Switzerland)$/.test(parts.at(-1)!))) {
    parts.pop();
  }
  return parts.join(', ').replace(/^Vienna$/, 'Wien').replace(/, Vienna$/, ', Wien');
}

/** Fahrt → Vorschlag fürs Ausgaben-Formular (Kategorie „Fahrten & Reisen“ mit Kilometergeld). */
export function tripPrefill(trip: TripResult, roundTrip: boolean, today: string): ReceiptPrefill {
  const from = shortPlace(trip.from_label, trip.from);
  const to = shortPlace(trip.to_label, trip.to);
  const route = [from, to, roundTrip && from ? from : null].filter(Boolean).join(' – ');
  const km = trip.km !== null ? trip.km * (roundTrip ? 2 : 1) : null;
  const notes: string[] = [];
  if (trip.km_source === 'route') notes.push(`Strecke laut Routenplaner: ${trip.km} km pro Richtung – bitte prüf die Orte und die Kilometer.`);
  if (km === null) notes.push('Die Kilometer konnte Klaro nicht ermitteln – trag sie bitte ein.');
  return {
    form: {
      categoryId: 'reisen',
      km: km !== null ? formatDecimalInput(km) : '',
      vehicle: (trip.vehicle ?? 'car') as Vehicle,
      date: trip.date ?? today,
      description: [trip.purpose, route].filter(Boolean).join(': ').slice(0, 120) || 'Fahrt',
    },
    categoryReason: null,
    notes,
    likelyPrivate: false,
  };
}

export interface InvoicePrefill {
  clientId: string;
  serviceDate: string | null;
  rows: LineItemInput[];
}

/** Rechnung → Vorschlag für den Rechnungs-Editor. Preise: genannt, sonst aus dem Produkt, sonst leer. */
export function invoicePrefill(invoice: InvoiceResult, products: Product[]): InvoicePrefill {
  return {
    clientId: invoice.client_id ?? '',
    serviceDate: invoice.service_date,
    rows: invoice.items.map((item) => {
      const product = item.product_id ? products.find((p) => p.id === item.product_id) : undefined;
      const base = product ? productToLine(product) : { description: item.description, unit: item.unit, unit_price: '' };
      return {
        description: base.description || item.description,
        quantity: formatDecimalInput(item.quantity),
        unit: item.unit || base.unit,
        unit_price: item.unit_price !== null ? formatDecimalInput(item.unit_price) : base.unit_price,
      };
    }),
  };
}
