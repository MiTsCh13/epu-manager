import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLoadGuard } from '@/hooks/useLoadGuard';
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
  // Verspätete Antworten dürfen „bezahlt“ bzw. gelöschte Entwürfe nicht wieder zurückdrehen
  const guard = useLoadGuard();

  const load = useCallback(async (): Promise<void> => {
    const ticket = guard.start();
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, due_date, status, total, subtotal, is_honorarnote, paid_at, cancelled_at, cancels_invoice_id, cancels_invoice_number, client_snapshot, clients(name)')
      .order('invoice_date', { ascending: false })
      .order('invoice_number', { ascending: false });
    const fresh = guard.check(ticket);
    if (fresh === 'stale') return;
    if (fresh === 'changed') return load();
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
  }, [guard]);

  useEffect(() => {
    void load();
  }, [load]);

  const markPaid = useCallback(async (id: string, paidAt: string): Promise<ActionResult> => {
    // Nur wenn noch offen: Eine veraltete Liste darf einen zurückgeholten Entwurf nicht ungeprüft als bezahlt ausstellen
    const { data, error: err } = await supabase.from('invoices').update({ status: 'paid', paid_at: paidAt }).eq('id', id).in('status', ['sent', 'overdue']).select('id');
    if (err) return { error: invoiceErrorMessage(err, 'Status konnte nicht geändert werden.') };
    if (data.length === 0) {
      void load();
      return { error: 'Diese Rechnung ist nicht mehr offen. Die Liste wurde aktualisiert.' };
    }
    guard.changed();
    setInvoices((list) => list.map((i) => (i.id === id ? { ...i, status: 'paid', paid_at: paidAt } : i)));
    return { error: null };
  }, [guard, load]);

  const deleteDraft = useCallback(async (id: string): Promise<ActionResult> => {
    const { data, error: err } = await supabase.from('invoices').delete().eq('id', id).eq('status', 'draft').select('id');
    if (err || data.length === 0) return { error: 'Nur Entwürfe können gelöscht werden.' };
    guard.changed();
    setInvoices((list) => list.filter((i) => i.id !== id));
    return { error: null };
  }, [guard]);

  return { invoices, loading, error, reload: load, markPaid, deleteDraft };
}
