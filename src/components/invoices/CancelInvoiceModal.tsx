import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { invoiceErrorMessage } from '@/hooks/useInvoices';
import { useUsedInvoiceNumbers } from '@/hooks/useUsedInvoiceNumbers';
import { correctionDraftFrom, formatDate, stornoDate, toISODate } from '@/lib/invoices';
import { DEFAULT_NUMBER_FORMAT, nextInvoiceNumber } from '@/lib/invoiceNumbers';
import { formatEuro } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Invoice } from '@/types';

/**
 * Rechnung stornieren: Klaro legt eine Stornorechnung mit der nächsten fortlaufenden Nummer an (Minus-Beträge,
 * Verweis auf die Originalrechnung) und markiert das Original als storniert. Optional gleich eine korrigierte
 * Rechnung als Entwurf.
 */
export function CancelInvoiceModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const used = useUsedInvoiceNumbers(!!invoice);
  const [withCorrection, setWithCorrection] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (invoice) setWithCorrection(true);
  }, [invoice]);

  const docLabel = invoice?.is_honorarnote ? 'Honorarnote' : 'Rechnung';
  const date = invoice ? stornoDate(invoice.invoice_date) : toISODate(new Date());
  const format = profile?.invoice_number_format ?? DEFAULT_NUMBER_FORMAT;
  const stornoNumber = used ? nextInvoiceNumber(format, date, used.numbers, used.formats) : null;

  async function handleCancel() {
    if (!invoice || !used || !stornoNumber) return;
    setBusy(true);
    const { data: stornoId, error } = await supabase.rpc('cancel_invoice', {
      p_invoice: invoice.id,
      p_number: stornoNumber,
      p_date: date,
    });
    if (error || !stornoId) {
      setBusy(false);
      toast.error(
        error?.code === '23505'
          ? 'Die Nummer wurde inzwischen vergeben. Bitte lade die Seite neu und versuch es noch einmal.'
          : error?.code === '23514'
            ? error.message
            : 'Die Rechnung konnte nicht storniert werden. Bitte versuch es erneut.',
      );
      return;
    }

    if (withCorrection) {
      const draftNumber = nextInvoiceNumber(format, toISODate(new Date()), [...used.numbers, stornoNumber], used.formats);
      const { data: draft, error: draftError } = await supabase
        .from('invoices')
        .insert(correctionDraftFrom(invoice, draftNumber))
        .select('id')
        .single();
      setBusy(false);
      if (draftError || !draft) {
        toast.error(
          `Storniert – die korrigierte Rechnung konnte aber nicht angelegt werden. ${invoiceErrorMessage(draftError ?? { message: '' }, 'Leg sie bitte neu an.')}`,
        );
        navigate(`/rechnungen/${stornoId}`);
        return;
      }
      toast.success(`Stornorechnung ${stornoNumber} erstellt. Jetzt kannst du die Rechnung korrigieren.`);
      navigate(`/rechnungen/${draft.id}`);
      return;
    }

    setBusy(false);
    toast.success(`Stornorechnung ${stornoNumber} erstellt`);
    navigate(`/rechnungen/${stornoId}`);
  }

  return (
    <Modal
      open={!!invoice}
      onClose={() => !busy && onClose()}
      title={`${docLabel} stornieren?`}
      description={invoice && `${docLabel} ${invoice.invoice_number} vom ${formatDate(invoice.invoice_date)} über ${formatEuro(Number(invoice.total))}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="danger" loading={busy} disabled={!stornoNumber} onClick={() => void handleCancel()}>
            Stornieren
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          Eine ausgestellte {docLabel} darf man nicht löschen. Klaro erstellt deshalb eine <strong>Stornorechnung</strong>
          {stornoNumber ? (
            <>
              {' '}
              mit der Nummer <strong>{stornoNumber}</strong>
            </>
          ) : null}
          : dieselben Positionen mit Minus-Beträgen und dem Hinweis, welche {docLabel} sie storniert.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Schick die Stornorechnung deinem Kunden – erst dann ist die Stornierung wirksam.
          </li>
          {invoice?.status === 'paid' ? (
            <li>
              Die {docLabel} war schon bezahlt: Die Stornorechnung zählt am {formatDate(date)} als Minus-Einnahme (z. B.
              weil du das Geld zurückzahlst oder mit einer neuen Rechnung verrechnest).
            </li>
          ) : (
            <>
              <li>Die {docLabel} ist dann nicht mehr offen und zählt nicht zu deinen Einnahmen.</li>
              <li>
                <strong>Hat dein Kunde schon bezahlt?</strong> Dann markier die {docLabel} zuerst als bezahlt und storniere
                sie danach – sonst fehlt die Zahlung in deinen Einnahmen.
              </li>
            </>
          )}
          <li>Das lässt sich nicht rückgängig machen.</li>
        </ul>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            checked={withCorrection}
            onChange={(e) => setWithCorrection(e.target.checked)}
          />
          <span>
            <span className="font-medium text-slate-900">Gleich eine korrigierte {docLabel} anlegen</span>
            <span className="block text-slate-600">Als Entwurf mit denselben Positionen – du änderst nur, was falsch war.</span>
          </span>
        </label>
        {!used && <Alert type="info">Die nächste Nummer wird ermittelt …</Alert>}
      </div>
    </Modal>
  );
}
