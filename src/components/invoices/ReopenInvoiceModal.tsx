import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { formatDate, getDisplayStatus } from '@/lib/invoices';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Invoice } from '@/types';

/** Noch nicht verschickte Rechnung zurück zum Entwurf holen – die Nummer bleibt, es braucht keine Stornorechnung. */
export function ReopenInvoiceModal({ invoice, onClose, onReopened }: { invoice: Invoice | null; onClose: () => void; onReopened: (invoice: Invoice) => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (invoice) setConfirmed(false);
  }, [invoice]);

  const docLabel = invoice?.is_honorarnote ? 'Honorarnote' : 'Rechnung';

  async function handleReopen() {
    if (!invoice || !confirmed) return;
    setBusy(true);
    const { error } = await supabase.rpc('reopen_invoice', { p_invoice: invoice.id });
    if (error) {
      setBusy(false);
      toast.error(error.code === '23514' ? error.message : `Die ${docLabel} konnte nicht zurückgeholt werden. Bitte versuch es erneut.`);
      return;
    }
    const { data, error: loadError } = await supabase.from('invoices').select('*').eq('id', invoice.id).single();
    setBusy(false);
    if (loadError) {
      toast.error('Sie ist wieder ein Entwurf, die Seite konnte aber nicht aktualisiert werden. Bitte lade sie neu.');
      onClose();
      return;
    }
    toast.success(`${invoice.invoice_number} ist wieder ein Entwurf`);
    onReopened(data);
  }

  return (
    <Modal
      open={!!invoice}
      onClose={() => !busy && onClose()}
      title={`${docLabel} zurück zum Entwurf?`}
      description={invoice && `${docLabel} ${invoice.invoice_number} vom ${formatDate(invoice.invoice_date)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button loading={busy} disabled={!confirmed} onClick={() => void handleReopen()}>
            Zurück zum Entwurf
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          Dann kannst du die {docLabel} ausbessern und danach wieder ausstellen. Die Nummer bleibt gleich, und du brauchst
          keine Stornorechnung (Gegenrechnung, die eine Rechnung aufhebt).
        </p>
        <p>
          <strong>Nur wenn sie noch niemand bekommen hat:</strong> Klaro merkt sich nur, was du als verschickt markierst. Hast
          du die {docLabel} schon auf einem anderen Weg weitergegeben, z. B. das PDF geschickt oder ausgedruckt, nimm bitte
          „Stornieren“.
        </p>
        {invoice && getDisplayStatus(invoice) === 'overdue' && (
          <Alert type="warning">Diese {docLabel} ist schon überfällig. Prüf bitte genau, ob dein Kunde sie nicht doch schon hat.</Alert>
        )}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span className="font-medium text-slate-900">Ich habe diese {docLabel} noch niemandem gegeben oder geschickt.</span>
        </label>
      </div>
    </Modal>
  );
}
