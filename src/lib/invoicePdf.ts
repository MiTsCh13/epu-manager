// Inhalte des Rechnungs-PDFs (§ 11 UStG) – reine Datenaufbereitung, unabhängig vom PDF-Layout.
import { KLEINUNTERNEHMER_NOTE } from '@/constants/tax2026';
import { countryName } from '@/constants/countries';
import { buildEpcPayload } from './epcQr';
import { formatDate } from './invoices';
import { descriptionLines, fillPlaceholders, normalizeTemplate, parseRichText, type PlaceholderValues, type RichBlock, type TemplateSettings } from './invoiceTemplates';
import { formatEuro as formatEuroIntl } from './money';

// Times und Helvetica (eingebaute PDF-Schriften) kennen keine geschützten Leerzeichen (Browser: U+202F, Node: U+00A0)
const formatEuro = (n: number) => formatEuroIntl(n).replace(/[\u00a0\u202f\u2009]/g, ' ');
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

export interface InvoicePdfItem {
  description: string;
  lines: { text: string; bullet: boolean }[]; // Bezeichnung zeilenweise, Aufzählungen erkannt
  quantity: string;
  unitPrice: string; // inkl. Einheit, z. B. „€ 150,00 / Std.“
  total: string;
}

export interface InvoicePdfData {
  template: TemplateSettings; // Gestaltung (aus dem Snapshot der Rechnung)
  isDraft: boolean;
  title: string; // „Rechnung“ | „Honorarnote“
  fileName: string;
  issuerName: string;
  issuerLines: string[]; // Zeilen im Kopf neben Name/Logo: Inhaber, wenn es einen Firmennamen gibt (Anschrift steht über dem Empfänger)
  senderLine: string; // Absenderzeile über dem Empfänger
  recipientLines: string[]; // inkl. Name
  meta: [string, string][];
  items: InvoicePdfItem[];
  totals: [string, string][];
  grandTotal: string;
  taxNote: string | null;
  /** Kleinunternehmer-Hinweis als Zeile in der Summe (sonst als Satz darunter) */
  taxNoteInTotals: boolean;
  intro: RichBlock[];
  closing: { title: string | null; blocks: RichBlock[]; boxed: boolean } | null;
  greeting: { text: string; signature: string } | null;
  paymentTerms: string | null;
  payment: {
    intro: string;
    rows: [string, string][]; // Empfänger (Kontoinhaber), IBAN, Verwendungszweck
    epcPayload: string | null; // Inhalt des QR-Codes
  } | null;
  qr: boolean;
  footerLines: string[];
  /** Fußzeile in drei Spalten: Anschrift, Bank, Kontakt (nur bei footer.style = 'columns') */
  footerColumns: string[][] | null;
  footerTinted: boolean;
  footerText: string | null;
}

const quantity = (q: number) => String(q).replace('.', ',');

/** Tage zwischen zwei ISO-Daten. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

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
  const template = normalizeTemplate(invoice.template_snapshot);
  const isDraft = invoice.status === 'draft';
  const title = invoice.is_honorarnote ? 'Honorarnote' : 'Rechnung';
  const isKU = issuer.is_kleinunternehmer ?? Number(invoice.vat_rate) === 0;

  const issuerName = issuer.business_name || issuer.full_name || '';
  // Kontoinhaber exakt wie bei der Bank (Empfängerüberprüfung) – Fallback: Name des Unternehmens
  const accountHolder = issuer.account_holder || issuerName;
  const issuerAddress = addressLines(issuer);
  // Die Anschrift steht in der Absenderzeile über dem Empfänger und in der Fußzeile – im Kopf nicht noch einmal
  const issuerLines = issuer.business_name && issuer.full_name && issuer.full_name !== issuer.business_name ? [issuer.full_name] : [];
  const isCash = invoice.payment_method === 'cash';

  const service = invoice.service_date_to
    ? `${formatDate(invoice.service_date_from)} – ${formatDate(invoice.service_date_to)}`
    : formatDate(invoice.service_date_from ?? invoice.invoice_date);

  const meta: [string, string][] = [
    [invoice.is_honorarnote ? 'Honorarnoten-Nummer' : 'Rechnungsnummer', invoice.invoice_number],
    [invoice.is_honorarnote ? 'Ausstellungsdatum' : 'Rechnungsdatum', formatDate(invoice.invoice_date)],
    [invoice.service_date_to ? 'Leistungszeitraum' : 'Leistungsdatum', service],
  ];
  if (isCash) meta.push(['Bezahlung', 'bar']);
  else if (invoice.due_date) meta.push(['Zahlbar bis', formatDate(invoice.due_date)]);
  if (issuer.uid_number) meta.push(['UID-Nr.', issuer.uid_number]);
  if (recipient?.uid_number) meta.push(['UID-Nr. Kunde', recipient.uid_number]);

  const days = invoice.due_date ? daysBetween(invoice.invoice_date, invoice.due_date) : template.payment.days;
  const values: PlaceholderValues = {
    Rechnungsnummer: invoice.invoice_number,
    Rechnungsbetrag: formatEuro(Number(invoice.total)),
    Zahlungsziel: days === 1 ? '1 Tag' : `${days} Tagen`,
    'Fällig am': invoice.due_date ? formatDate(invoice.due_date) : undefined,
    Kunde: recipient?.name ?? undefined,
  };
  const fill = (text: string | null | undefined) => fillPlaceholders(text ?? '', values).trim();

  const vatRate = Number(invoice.vat_rate);
  const totals: [string, string][] = [['Summe netto', formatEuro(Number(invoice.subtotal))]];
  if (!isKU) totals.push([`USt ${vatRate} %`, formatEuro(Number(invoice.vat_amount))]);

  const closingBlocks = parseRichText(fill(invoice.notes));
  const closingTitle = fill(template.closing.title) || null;
  // Höchstens 5 Kontaktzeilen – die Fußzeile soll nicht die halbe Seite füllen
  const contact = template.footer.contact.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);
  const bankExtra = template.footer.bankExtra.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4);
  // Steht schon „Bank: Erste Bank“ in den Zusatzzeilen, heißt der Kontoinhaber „Name: …“ (sonst zwei „Bank:“-Zeilen)
  const isBankName = (l: string) => /^bank\s*:/i.test(l);
  const bankNames = bankExtra.filter(isBankName);
  const holderLines = bankNames.length ? [...bankNames, `Name: ${accountHolder}`] : [`Bank: ${accountHolder}`];
  const bankLines = issuer.iban ? [...holderLines, `IBAN: ${issuer.iban}`, ...bankExtra.filter((l) => !isBankName(l))] : bankExtra;

  return {
    template,
    isDraft,
    title,
    fileName: invoiceFileName(title, invoice.invoice_number, isDraft),
    issuerName,
    issuerLines,
    senderLine: [issuerName, ...issuerAddress].join(' · '),
    recipientLines: recipient ? [recipient.name ?? '', ...addressLines(recipient)].filter(Boolean) : [],
    meta,
    items: items.map((li) => {
      const unit = li.unit?.trim() || '';
      const flat = unit.toLowerCase() === 'pauschal';
      return {
        description: li.description,
        lines: descriptionLines(li.description),
        quantity: flat && li.quantity === 1 ? 'pauschal' : quantity(li.quantity),
        unitPrice: formatEuro(li.unit_price) + (unit && !flat ? ` / ${unit}` : ''),
        total: formatEuro(li.total),
      };
    }),
    totals,
    grandTotal: formatEuro(Number(invoice.total)),
    taxNote: isKU
      ? KLEINUNTERNEHMER_NOTE
      : vatRate === 0
        ? 'Steuerfreie Leistung – keine Umsatzsteuer ausgewiesen.'
        : null,
    taxNoteInTotals: isKU && template.kuNote === 'totals',
    intro: parseRichText(fill(invoice.intro_text)),
    closing: closingBlocks.length || closingTitle ? { title: closingTitle, blocks: closingBlocks, boxed: template.closing.boxed } : null,
    greeting: template.greeting.text || template.greeting.signature ? { text: fill(template.greeting.text), signature: fill(template.greeting.signature) } : null,
    // Bar bezahlt: keine Zahlungsbedingungen, keine Zahlungsbox, kein QR-Code
    paymentTerms: isCash ? null : fill(template.payment.terms) || null,
    payment: !isCash && issuer.iban && template.payment.box
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
    qr: template.payment.qr,
    footerLines: [
      [issuerName, ...issuerAddress].join(' · '),
      [issuer.uid_number && `UID ${issuer.uid_number}`, issuer.iban && `${accountHolder} · IBAN ${issuer.iban}`, ...bankExtra].filter(Boolean).join(' · '),
      contact.join(' · '),
    ].filter(Boolean),
    footerColumns:
      template.footer.style === 'columns'
        ? [
            [issuerName, ...issuerAddress].filter(Boolean),
            [...bankLines, ...(issuer.uid_number ? [`UID: ${issuer.uid_number}`] : [])],
            contact,
          ]
        : null,
    footerTinted: template.footer.tinted,
    footerText: fill(invoice.footer_text) || null,
  };
}
