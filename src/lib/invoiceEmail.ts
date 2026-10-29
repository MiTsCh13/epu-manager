// Rechnung per E-Mail: Vorschlag für Empfänger, Betreff und Text sowie Links für Gmail, Outlook.com und das Mail-Programm.
// Klaro verschickt selbst nichts – die Mail geht über das Teilen-Menü (Handy) bzw. das Postfach des Nutzers.
import { formatDate, toISODate } from './invoices';
import { formatEuro } from './money';
import type { PartySnapshot } from './invoicePdf';
import type { Invoice } from '@/types';

export interface InvoiceEmail {
  to: string;
  subject: string;
  body: string;
}

// Geschützte Leerzeichen aus Intl (z. B. „€ 120,00“) in Mail-Programmen als normales Leerzeichen zeigen
const plain = (s: string) => s.replace(/[\u00a0\u202f\u2009]/g, ' ');

/** Vorschlag für die Mail zur Rechnung – an den Kunden gerichtet, daher in der Sie-Form. */
export function buildInvoiceEmail(
  invoice: Pick<Invoice, 'invoice_number' | 'is_honorarnote' | 'total' | 'due_date' | 'status' | 'payment_method' | 'client_snapshot' | 'issuer_snapshot'> &
    Partial<Pick<Invoice, 'cancels_invoice_id' | 'cancels_invoice_number' | 'cancels_invoice_date'>>,
  today: Date = new Date(),
): InvoiceEmail {
  const client = (invoice.client_snapshot ?? null) as PartySnapshot | null;
  const issuer = (invoice.issuer_snapshot ?? null) as PartySnapshot | null;
  const doc = invoice.is_honorarnote ? 'Honorarnote' : 'Rechnung';
  const sender = issuer?.business_name || issuer?.full_name || '';
  const amount = plain(formatEuro(Number(invoice.total)));

  const payment =
    invoice.payment_method === 'cash' || invoice.status === 'paid'
      ? 'Der Betrag ist bereits bezahlt – vielen Dank!'
      : invoice.due_date && invoice.due_date < toISODate(today)
        ? `Die Zahlungsfrist ist bereits abgelaufen – bitte überweisen Sie den Betrag umgehend auf das in der ${doc} angegebene Konto.`
        : invoice.due_date
        ? `Bitte überweisen Sie den Betrag bis ${formatDate(invoice.due_date)} auf das in der ${doc} angegebene Konto.`
        : `Bitte überweisen Sie den Betrag auf das in der ${doc} angegebene Konto.`;

  const greeting = client?.name ? `Guten Tag ${client.name},` : 'Guten Tag,';
  // Stornorechnung: keine Zahlungsaufforderung, sondern Verweis auf die stornierte Rechnung
  const message = invoice.cancels_invoice_id
    ? `anbei erhalten Sie die Stornorechnung ${invoice.invoice_number} zu meiner ${doc} ${invoice.cancels_invoice_number ?? ''} vom ${formatDate(invoice.cancels_invoice_date)}. Die ${doc} ist damit storniert.`
    : `anbei erhalten Sie meine ${doc} ${invoice.invoice_number} über ${amount}. ${payment}`;
  const signature = [issuer?.full_name, issuer?.business_name && issuer.business_name !== issuer.full_name ? issuer.business_name : null]
    .filter(Boolean)
    .join('\n');

  return {
    to: client?.email?.trim() ?? '',
    subject: [`${invoice.cancels_invoice_id ? 'Stornorechnung' : doc} ${invoice.invoice_number}`, sender].filter(Boolean).join(' – '),
    body: [greeting, '', message, '', 'Freundliche Grüße', signature]
      .join('\n')
      .trimEnd(),
  };
}

const query = (params: Record<string, string>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

export type MailProvider = 'gmail' | 'outlook' | 'outlook365' | 'mailto';

/** Link, der eine neue Mail mit Empfänger, Betreff und Text öffnet (ohne Anhang – den hängt der Nutzer selbst an). */
export function composeUrl(provider: MailProvider, mail: InvoiceEmail): string {
  switch (provider) {
    case 'gmail':
      return `https://mail.google.com/mail/?${query({ view: 'cm', fs: '1', to: mail.to, su: mail.subject, body: mail.body })}`;
    case 'outlook':
      return `https://outlook.live.com/mail/0/deeplink/compose?${query({ to: mail.to, subject: mail.subject, body: mail.body })}`;
    case 'outlook365':
      // Firmen-Postfächer (Microsoft 365) laufen über eine andere Adresse als private Outlook.com-Konten
      return `https://outlook.office.com/mail/deeplink/compose?${query({ to: mail.to, subject: mail.subject, body: mail.body })}`;
    case 'mailto':
      // Empfänger gehört in den Pfad (@ unkodiert – ältere Outlook-Versionen lesen %40 nicht); Zeilenumbrüche als %0D%0A (RFC 6068)
      return `mailto:${encodeURIComponent(mail.to).replace(/%40/g, '@')}?${query({ subject: mail.subject, body: mail.body.replace(/\r?\n/g, '\r\n') })}`;
  }
}

/** Grobe Plausibilitätsprüfung der Empfängeradresse (leer ist erlaubt – dann trägt der Nutzer sie im Mail-Programm ein). */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
