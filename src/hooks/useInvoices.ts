import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Invoice } from '@/types';

export type InvoiceListItem = Pick<
  Invoice,
  | 'id' | 'invoice_number' | 'invoice_date' | 'due_date' | 'status' | 'total' | 'subtotal' | 'is_honorarnote' | 'paid_at'
  | 'cancelled_at' | 'cancels_invoice_id' | 'cancels_invoice_number'
> & { clientName: string | null };

type ActionResult = { error: string | null };

/** Fehlermeldung für Rechnungs-Schreibzugriffe (DB-Trigger liefern bereits deutsche Texte). */
export function invoiceErrorMessage(err: { code?: string; message: string }, fallback: string): string {
  if (err.code === '23505') return 'Diese Rechnungsnummer gibt es bereits. Bitte wähle eine andere.';
  // 42501 = RLS: Testphase abgelaufen (Paywall serverseitig)
  if (err.code === '42501') return 'Deine Testphase ist abgelaufen. Mit Klaro Pro kannst du wieder Rechnungen erstellen.';
  if (err.code === '23514' && /Rechnung/.test(err.message)) return err.message;
  return fallback;
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, due_date, status, total, subtotal, is_honorarnote, paid_at, cancelled_at, cancels_invoice_id, cancels_invoice_number, client_snapshot, clients(name)')
      .order('invoice_date', { ascending: false })
      .order('invoice_number', { ascending: false });
    if (err) {
      setError('Deine Rechnungen konnten nicht geladen werden.');
    } else {
      setInvoices(
        data.map(({ client_snapshot, clients, ...inv }) => ({
          ...inv,
          // Ausgestellte Rechnungen: Name aus dem eingefrorenen Snapshot
          clientName: (client_snapshot as { name?: string } | null)?.name ?? clients?.name ?? null,
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markPaid = useCallback(async (id: string, paidAt: string): Promise<ActionResult> => {
    const { error: err } = await supabase.from('invoices').update({ status: 'paid', paid_at: paidAt }).eq('id', id);
    if (err) return { error: invoiceErrorMessage(err, 'Status konnte nicht geändert werden.') };
    setInvoices((list) => list.map((i) => (i.id === id ? { ...i, status: 'paid', paid_at: paidAt } : i)));
    return { error: null };
  }, []);

  const deleteDraft = useCallback(async (id: string): Promise<ActionResult> => {
    const { data, error: err } = await supabase.from('invoices').delete().eq('id', id).eq('status', 'draft').select('id');
    if (err || data.length === 0) return { error: 'Nur Entwürfe können gelöscht werden.' };
    setInvoices((list) => list.filter((i) => i.id !== id));
    return { error: null };
  }, []);

  return { invoices, loading, error, reload: load, markPaid, deleteDraft };
}
