// Inhalte des Rechnungs-PDFs (§ 11 UStG) – reine Datenaufbereitung, unabhängig vom PDF-Layout.
import { KLEINUNTERNEHMER_NOTE } from '@/constants/tax2026';
import { countryName } from '@/constants/countries';
import { buildEpcPayload } from './epcQr';
import { formatDate } from './invoices';
import { formatEuro } from './money';
import type { Invoice, LineItem } from '@/types';

export interface PartySnapshot {
  name?: string | null;
  full_name?: string | null;
  business_name?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  country?: string | null;
  uid_number?: string | null;
  email?: string | null;
  phone?: string | null;
  iban?: string | null;
  account_holder?: string | null;
  is_kleinunternehmer?: boolean;
}

export interface InvoicePdfData {
  isDraft: boolean;
  title: string; // „Rechnung“ | „Honorarnote“
  fileName: string;
  issuerName: string;
  issuerLines: string[]; // Anschrift (ohne Name)
  senderLine: string; // Absenderzeile über dem Empfänger
  recipientLines: string[]; // inkl. Name
  meta: [string, string][];
  items: { description: string; quantity: string; unitPrice: string; total: string }[];
  totals: [string, string][];
  grandTotal: string;
  taxNote: string | null;
  notes: string | null;
  payment: {
    intro: string;
    rows: [string, string][]; // Empfänger (Kontoinhaber), IBAN, Verwendungszweck
    epcPayload: string | null; // Inhalt des QR-Codes
  } | null;
  footerLines: string[];
  footerText: string | null;
}

const quantity = (q: number) => String(q).replace('.', ',');

function addressLines(p: PartySnapshot): string[] {
  const place = [p.zip_code, p.city].filter(Boolean).join(' ');
  return [p.address, place, p.country && p.country !== 'AT' ? countryName(p.country) : null].filter(
    (l): l is string => !!l,
  );
}

/** Dateiname-tauglich: „Rechnung_2026-001.pdf“ */
export function invoiceFileName(title: string, invoiceNumber: string, isDraft: boolean): string {
  const safe = invoiceNumber.replace(/[^\w.-]+/g, '_');
  return `${isDraft ? 'Entwurf_' : ''}${title}_${safe}.pdf`;
}

export function buildInvoicePdfData(invoice: Invoice): InvoicePdfData {
  const issuer = (invoice.issuer_snapshot ?? {}) as PartySnapshot;
  const recipient = invoice.client_snapshot as PartySnapshot | null;
  const items = (invoice.line_items as unknown as LineItem[]) ?? [];
  const isDraft = invoice.status === 'draft';
  const title = invoice.is_honorarnote ? 'Honorarnote' : 'Rechnung';
  const isKU = issuer.is_kleinunternehmer ?? Number(invoice.vat_rate) === 0;

  const issuerName = issuer.business_name || issuer.full_name || '';
  // Kontoinhaber exakt wie bei der Bank (Empfängerüberprüfung) – Fallback: Name des Unternehmens
  const accountHolder = issuer.account_holder || issuerName;
  const issuerAddress = addressLines(issuer);
  const issuerLines = [
    ...(issuer.business_name && issuer.full_name ? [issuer.full_name] : []),
    ...issuerAddress,
  ];

  const service = invoice.service_date_to
    ? `${formatDate(invoice.service_date_from)} – ${formatDate(invoice.service_date_to)}`
    : formatDate(invoice.service_date_from ?? invoice.invoice_date);

  const meta: [string, string][] = [
    [`${title}snummer`, invoice.invoice_number],
    [`${title}sdatum`, formatDate(invoice.invoice_date)],
    [invoice.service_date_to ? 'Leistungszeitraum' : 'Leistungsdatum', service],
  ];
  if (invoice.due_date) meta.push(['Zahlbar bis', formatDate(invoice.due_date)]);
  if (issuer.uid_number) meta.push(['UID-Nr.', issuer.uid_number]);
  if (recipient?.uid_number) meta.push(['UID-Nr. Kunde', recipient.uid_number]);

  const vatRate = Number(invoice.vat_rate);
  const totals: [string, string][] = [['Summe netto', formatEuro(Number(invoice.subtotal))]];
  if (!isKU) totals.push([`USt ${vatRate} %`, formatEuro(Number(invoice.vat_amount))]);

  return {
    isDraft,
    title,
    fileName: invoiceFileName(title, invoice.invoice_number, isDraft),
    issuerName,
    issuerLines,
    senderLine: [issuerName, ...issuerAddress].join(' · '),
    recipientLines: recipient ? [recipient.name ?? '', ...addressLines(recipient)].filter(Boolean) : [],
    meta,
    items: items.map((li) => ({
      description: li.description,
      quantity: quantity(li.quantity),
      unitPrice: formatEuro(li.unit_price),
      total: formatEuro(li.total),
    })),
    totals,
    grandTotal: formatEuro(Number(invoice.total)),
    taxNote: isKU
      ? KLEINUNTERNEHMER_NOTE
      : vatRate === 0
        ? 'Steuerfreie Leistung – keine Umsatzsteuer ausgewiesen.'
        : null,
    notes: invoice.notes,
    payment: issuer.iban
      ? {
          intro: `Bitte überweisen Sie ${formatEuro(Number(invoice.total))}${invoice.due_date ? ` bis ${formatDate(invoice.due_date)}` : ''} an:`,
          rows: [
            ['Empfänger', accountHolder],
            ['IBAN', issuer.iban],
            ['Verwendungszweck', invoice.invoice_number],
          ],
          epcPayload: buildEpcPayload({
            name: accountHolder,
            iban: issuer.iban,
            amount: Number(invoice.total),
            remittance: `${title} ${invoice.invoice_number}`,
          }),
        }
      : null,
    footerLines: [
      [issuerName, ...issuerAddress].join(' · '),
      [issuer.uid_number && `UID ${issuer.uid_number}`, issuer.iban && `${accountHolder} · IBAN ${issuer.iban}`].filter(Boolean).join(' · '),
    ].filter(Boolean),
    footerText: invoice.footer_text,
  };
}
