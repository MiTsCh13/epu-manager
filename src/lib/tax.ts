// Österreichische Einkommensteuer- und Umsatzsteuer-Logik
import {
  INCOME_TAX_BRACKETS_2026,
  KLEINBETRAGSRECHNUNG_LIMIT,
  RECIPIENT_UID_REQUIRED_ABOVE,
  VAT_RATES,
} from '@/constants/tax2026';
import { SVS_2026 } from '@/constants/svs2026';
import type { InvoiceNumberFormat, LineItem, VatRate } from '@/types';
import { round2 } from './money';

// ─── Einkommensteuer ────────────────────────────────────────

/** Einkommensteuer nach Tarif 2026 (§ 33 EStG) auf das zu versteuernde Einkommen. */
export function calculateIncomeTax(taxableIncome: number): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of INCOME_TAX_BRACKETS_2026) {
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upTo) - lower) * rate;
    lower = upTo;
  }
  return round2(tax);
}

// ─── Umsatzsteuer ───────────────────────────────────────────

export function isValidVatRate(rate: number): rate is VatRate {
  return (VAT_RATES as readonly number[]).includes(rate);
}

export function calculateVat(net: number, rate: VatRate): { net: number; vat: number; gross: number } {
  const vat = round2((net * rate) / 100);
  return { net: round2(net), vat, gross: round2(net + vat) };
}

export function calculateLineItemTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

export function calculateInvoiceTotals(params: {
  lineItems: Pick<LineItem, 'quantity' | 'unit_price'>[];
  vatRate: VatRate;
  isKleinunternehmer: boolean;
}): { subtotal: number; vatRate: VatRate; vatAmount: number; total: number } {
  const subtotal = round2(
    params.lineItems.reduce((sum, li) => sum + calculateLineItemTotal(li.quantity, li.unit_price), 0),
  );
  // Kleinunternehmer dürfen keine USt ausweisen
  const vatRate: VatRate = params.isKleinunternehmer ? 0 : params.vatRate;
  const { vat, gross } = calculateVat(subtotal, vatRate);
  return { subtotal, vatRate, vatAmount: vat, total: gross };
}

// ─── Kleinunternehmergrenze ─────────────────────────────────

export type KleinunternehmerStatus = 'ok' | 'approaching' | 'exceeded';

export function getKleinunternehmerStatus(annualRevenue: number): KleinunternehmerStatus {
  if (annualRevenue > SVS_2026.kleinunternehmerThreshold) return 'exceeded';
  if (annualRevenue > SVS_2026.kleinunternehmerWarningThreshold) return 'approaching';
  return 'ok';
}

// ─── Rechnungsnummern ───────────────────────────────────────

/** Nächste fortlaufende Nummer im Jahr, z. B. 2026-001 bzw. KL-2026-001. */
export function generateInvoiceNumber(
  format: InvoiceNumberFormat,
  year: number,
  existingNumbers: readonly string[],
): string {
  const prefix = format === 'KL-YYYY-NNN' ? `KL-${year}-` : `${year}-`;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const max = existingNumbers.reduce((acc, n) => {
    const match = pattern.exec(n);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ─── § 11 UStG Pflichtangaben ───────────────────────────────

export interface InvoiceParty {
  name?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  uid_number?: string | null;
}

export interface UStG11Input {
  issuer: InvoiceParty & { iban?: string | null; isKleinunternehmer: boolean };
  recipient: InvoiceParty | null;
  invoiceNumber: string;
  invoiceDate: string | null;
  lineItems: Pick<LineItem, 'description' | 'quantity'>[];
  total: number;
}

const hasText = (v: string | null | undefined): boolean => !!v && v.trim().length > 0;
const hasAddress = (p: InvoiceParty): boolean => hasText(p.address) && hasText(p.zip_code) && hasText(p.city);

/**
 * Prüft die Pflichtangaben nach § 11 UStG (plus IBAN als Klaro-Pflichtfeld).
 * Kleinbetragsrechnungen (≤ 400 € brutto) brauchen keine Empfängerangaben und keine UID.
 */
export function validateInvoiceUStG11(input: UStG11Input): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isKleinbetrag = input.total <= KLEINBETRAGSRECHNUNG_LIMIT;

  if (!hasText(input.issuer.name)) errors.push('Dein Name bzw. Firmenname fehlt.');
  if (!hasAddress(input.issuer)) errors.push('Deine vollständige Anschrift fehlt.');

  if (!isKleinbetrag) {
    if (!input.recipient || !hasText(input.recipient.name)) errors.push('Name des Kunden fehlt.');
    if (!input.recipient || !hasAddress(input.recipient)) errors.push('Vollständige Anschrift des Kunden fehlt.');
    if (!input.issuer.isKleinunternehmer && !hasText(input.issuer.uid_number)) {
      errors.push('Deine UID-Nummer fehlt (Pflicht für USt-pflichtige Rechnungen über 400 €).');
    }
    if (input.total > RECIPIENT_UID_REQUIRED_ABOVE && !hasText(input.recipient?.uid_number)) {
      warnings.push('Bei Rechnungen über 10.000 € an Unternehmen ist die UID-Nummer des Kunden Pflicht.');
    }
  }

  if (!hasText(input.invoiceNumber)) errors.push('Rechnungsnummer fehlt.');
  if (!hasText(input.invoiceDate)) errors.push('Rechnungsdatum fehlt.');
  if (input.lineItems.length === 0) errors.push('Mindestens eine Position ist erforderlich.');
  if (input.lineItems.some((li) => !hasText(li.description))) errors.push('Jede Position braucht eine Bezeichnung.');
  if (input.lineItems.some((li) => !(li.quantity > 0))) errors.push('Jede Position braucht eine Menge größer 0.');
  if (!hasText(input.issuer.iban)) errors.push('IBAN fehlt – ohne sie kann dein Kunde nicht überweisen.');

  return { valid: errors.length === 0, errors, warnings };
}
