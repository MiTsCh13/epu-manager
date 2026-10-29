import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, Eye, FileDown, Lock, Mail, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { downloadBlob, renderInvoicePdf } from '@/lib/renderInvoicePdf';
import { formatDate, getDisplayStatus } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { KLEINUNTERNEHMER_NOTE } from '@/constants/tax2026';
import { countryName } from '@/constants/countries';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MarkPaidModal } from './MarkPaidModal';
import { PdfPreviewModal } from './PdfPreviewModal';
import { SendInvoiceModal } from './SendInvoiceModal';
import type { Invoice, LineItem } from '@/types';

interface PartySnapshot {
  name?: string | null;
  full_name?: string | null;
  business_name?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  country?: string | null;
  uid_number?: string | null;
  iban?: string | null;
  is_kleinunternehmer?: boolean;
}

function Party({ title, party }: { title: string; party: PartySnapshot | null }) {
  if (!party) return null;
  const name = party.name ?? party.business_name ?? party.full_name;
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>
      <address className="mt-1 text-sm not-italic leading-relaxed text-slate-800">
        <span className="font-medium">{name}</span>
        {party.business_name && party.full_name && <><br />{party.full_name}</>}
        {party.address && <><br />{party.address}</>}
        {(party.zip_code || party.city) && <><br />{[party.zip_code, party.city].filter(Boolean).join(' ')}</>}
        {party.country && party.country !== 'AT' && <><br />{countryName(party.country)}</>}
        {party.uid_number && <><br />UID: {party.uid_number}</>}
      </address>
    </div>
  );
}

// Zeitpunkt (UTC) als Tag in Österreich – unabhängig von der Zeitzone des Geräts
const VIENNA_DATE = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Ausgestellte Rechnung (unveränderbar): Ansicht + Status-Aktionen. */
export function InvoiceDetail({ invoice, onChanged }: { invoice: Invoice; onChanged: (inv: Invoice) => void }) {
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const closeEmail = useCallback(() => setEmailing(false), []);

  async function handleDownload() {
    setDownloading(true);
    try {
      const { blob, fileName } = await renderInvoicePdf(invoice);
      downloadBlob(blob, fileName);
    } catch {
      toast.error('Das PDF konnte nicht erstellt werden. Bitte versuche es erneut.');
    }
    setDownloading(false);
  }
  const status = getDisplayStatus(invoice);
  const items = (invoice.line_items as unknown as LineItem[]) ?? [];
  const issuer = invoice.issuer_snapshot as PartySnapshot | null;
  const recipient = invoice.client_snapshot as PartySnapshot | null;
  const docLabel = invoice.is_honorarnote ? 'Honorarnote' : 'Rechnung';
  const isKU = issuer?.is_kleinunternehmer ?? Number(invoice.vat_rate) === 0;

  return (
    <PageWrapper
      title={`${docLabel} ${invoice.invoice_number}`}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          {status === 'paid' && invoice.paid_at && <span>Bezahlt am {formatDate(invoice.paid_at)}</span>}
          {(status === 'sent' || status === 'overdue') && invoice.due_date && <span>Fällig am {formatDate(invoice.due_date)}</span>}
          {invoice.emailed_at && (
            <span className="inline-flex items-center gap-1">
              <MailCheck className="h-4 w-4" aria-hidden="true" />
              Per E-Mail verschickt am {VIENNA_DATE.format(new Date(invoice.emailed_at))}
            </span>
          )}
        </span>
      }
      actions={
        <>
          <Link to="/rechnungen" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Alle Rechnungen
          </Link>
          <Button variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={() => setPreviewing(true)}>
            Vorschau
          </Button>
          <Button
            variant={status === 'paid' ? 'primary' : 'secondary'}
            icon={<FileDown className="h-4 w-4" />}
            loading={downloading}
            onClick={() => void handleDownload()}
          >
            PDF herunterladen
          </Button>
          <Button variant="secondary" icon={<Mail className="h-4 w-4" />} onClick={() => setEmailing(true)}>
            Per E-Mail senden
          </Button>
          {(status === 'sent' || status === 'overdue') && (
            <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setPaying(true)}>
              Als bezahlt markieren
            </Button>
          )}
        </>
      }
    >
      <article className="space-y-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <Party title="Von" party={issuer} />
          <Party title="An" party={recipient} />
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {[
            ['Nummer', invoice.invoice_number],
            ['Datum', formatDate(invoice.invoice_date)],
            [
              'Leistung',
              invoice.service_date_to
                ? `${formatDate(invoice.service_date_from)} – ${formatDate(invoice.service_date_to)}`
                : formatDate(invoice.service_date_from ?? invoice.invoice_date),
            ],
            invoice.payment_method === 'cash' ? ['Bezahlung', 'bar'] : ['Zahlbar bis', formatDate(invoice.due_date) || '–'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pl-5 font-medium sm:pl-0">Bezeichnung</th>
                <th className="py-2 text-right font-medium">Menge</th>
                <th className="py-2 text-right font-medium">Einzelpreis</th>
                <th className="py-2 pr-5 text-right font-medium sm:pr-0">Summe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((li, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 pl-5 sm:pl-0">{li.description}</td>
                  <td className="py-2 text-right tabular-nums">{String(li.quantity).replace('.', ',')}</td>
                  <td className="py-2 text-right tabular-nums">{formatEuro(li.unit_price)}</td>
                  <td className="py-2 pr-5 text-right tabular-nums sm:pr-0">{formatEuro(li.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-slate-600">
            <dt>Summe netto</dt>
            <dd className="tabular-nums">{formatEuro(Number(invoice.subtotal))}</dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>USt {Number(invoice.vat_rate)} %</dt>
            <dd className="tabular-nums">{formatEuro(Number(invoice.vat_amount))}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
            <dt>Gesamt</dt>
            <dd className="tabular-nums">{formatEuro(Number(invoice.total))}</dd>
          </div>
        </dl>

        {isKU && <p className="text-sm text-slate-600">{KLEINUNTERNEHMER_NOTE}</p>}
        {invoice.notes && <p className="whitespace-pre-line text-sm text-slate-700">{invoice.notes}</p>}
        {issuer?.iban && invoice.payment_method !== 'cash' && <p className="text-sm text-slate-600">Bitte überweise den Betrag auf: {issuer.iban}</p>}
        {invoice.footer_text && <p className="whitespace-pre-line border-t border-slate-100 pt-4 text-xs text-slate-500">{invoice.footer_text}</p>}
      </article>

      <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Ausgestellte Rechnungen sind unveränderbar. Kunden- und Absenderdaten sind auf dem Stand vom Ausstellungstag.
      </p>

      <PdfPreviewModal invoice={previewing ? invoice : null} onClose={() => setPreviewing(false)} />

      <SendInvoiceModal
        invoice={emailing ? invoice : null}
        onClose={closeEmail}
        onSent={async () => {
          const { data, error } = await supabase
            .from('invoices')
            .update({ emailed_at: new Date().toISOString() })
            .eq('id', invoice.id)
            .select()
            .single();
          if (error) toast.error('Konnte nicht als verschickt gemerkt werden.');
          else {
            toast.success(`${invoice.invoice_number} als verschickt gemerkt`);
            onChanged(data);
          }
          setEmailing(false);
        }}
      />

      <MarkPaidModal
        invoice={paying ? { invoice_number: invoice.invoice_number, total: Number(invoice.total) } : null}
        onClose={() => setPaying(false)}
        onConfirm={async (paidAt) => {
          const { data, error } = await supabase
            .from('invoices')
            .update({ status: 'paid', paid_at: paidAt })
            .eq('id', invoice.id)
            .select()
            .single();
          if (error) toast.error('Status konnte nicht geändert werden.');
          else {
            toast.success(`${invoice.invoice_number} als bezahlt markiert`);
            onChanged(data);
          }
          setPaying(false);
        }}
      />
    </PageWrapper>
  );
}
