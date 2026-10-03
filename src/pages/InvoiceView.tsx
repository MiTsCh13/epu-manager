import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { InvoiceDetail } from '@/components/invoices/InvoiceDetail';
import { InvoiceEditor } from '@/components/invoices/InvoiceEditor';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { Invoice } from '@/types';

/** /rechnungen/:id – Entwurf → Editor, ausgestellt → Detailansicht. */
export default function InvoiceView() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    const { data, error } = await supabase.from('invoices').select('*').eq('id', id!).maybeSingle();
    if (error) return setState('error');
    if (!data) return setState('notfound');
    setInvoice(data);
    setState('ready');
  }, [id]);

  // location.state ändert sich nach dem Ausstellen → neu laden
  useEffect(() => {
    void load();
  }, [load, location.state]);

  if (state === 'loading') {
    return (
      <div className="flex justify-center py-20 text-primary" role="status" aria-label="Rechnung wird geladen">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="space-y-3">
        <Alert type="critical">Die Rechnung konnte nicht geladen werden.</Alert>
        <Button variant="secondary" onClick={() => void load()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }
  if (state === 'notfound' || !invoice) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Rechnung nicht gefunden"
        description="Diese Rechnung gibt es nicht (mehr)."
        action={<Link to="/rechnungen" className="font-semibold text-primary hover:underline">Zu deinen Rechnungen</Link>}
      />
    );
  }
  return invoice.status === 'draft' ? (
    <InvoiceEditor key={invoice.id} invoice={invoice} />
  ) : (
    <InvoiceDetail invoice={invoice} onChanged={setInvoice} />
  );
}
