import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLoadGuard } from '@/hooks/useLoadGuard';
import { normalizeClient, type ClientFormData } from '@/lib/validation';
import type { Client } from '@/types';

export type ClientWithStats = Client & { invoiceCount: number };

type Result<T> = { data: T; error: null } | { data: null; error: string };

const byName = (a: Client, b: Client) => a.name.localeCompare(b.name, 'de');

/** Kunden laden und verwalten (RLS sorgt dafür, dass nur eigene Kunden sichtbar sind). */
export function useClients() {
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Verspätete Antworten dürfen einen gerade angelegten Kunden nicht wieder aus der Liste werfen
  const guard = useLoadGuard();

  const load = useCallback(async (): Promise<void> => {
    const ticket = guard.start();
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from('clients').select('*, invoices(count)').order('name');
    const fresh = guard.check(ticket);
    if (fresh === 'stale') return;
    if (fresh === 'changed') return load();
    if (err) {
      setError('Deine Kunden konnten nicht geladen werden.');
    } else {
      setClients(
        data.map(({ invoices, ...c }) => ({ ...c, invoiceCount: invoices[0]?.count ?? 0 })).sort(byName),
      );
    }
    setLoading(false);
  }, [guard]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async (form: ClientFormData): Promise<Result<Client>> => {
    const { data, error: err } = await supabase.from('clients').insert(normalizeClient(form)).select().single();
    if (err) return { data: null, error: 'Der Kunde konnte nicht gespeichert werden.' };
    guard.changed();
    // Hat ein gleichzeitiges Laden den Kunden schon gebracht, nicht doppelt einfügen
    setClients((list) => [...list.filter((c) => c.id !== data.id), { ...data, invoiceCount: 0 }].sort(byName));
    return { data, error: null };
  }, [guard]);

  const update = useCallback(async (id: string, form: ClientFormData): Promise<Result<Client>> => {
    const { data, error: err } = await supabase.from('clients').update(normalizeClient(form)).eq('id', id).select().single();
    if (err) return { data: null, error: 'Die Änderungen konnten nicht gespeichert werden.' };
    guard.changed();
    setClients((list) => list.map((c) => (c.id === id ? { ...data, invoiceCount: c.invoiceCount } : c)).sort(byName));
    return { data, error: null };
  }, [guard]);

  const remove = useCallback(async (id: string): Promise<Result<true>> => {
    const { error: err } = await supabase.from('clients').delete().eq('id', id);
    if (err) {
      // 23503 = Fremdschlüssel: Kunde hat Rechnungen (DB verhindert das Löschen)
      return {
        data: null,
        error: err.code === '23503'
          ? 'Dieser Kunde hat Rechnungen und kann deshalb nicht gelöscht werden.'
          : 'Der Kunde konnte nicht gelöscht werden.',
      };
    }
    guard.changed();
    setClients((list) => list.filter((c) => c.id !== id));
    return { data: true, error: null };
  }, [guard]);

  return { clients, loading, error, reload: load, create, update, remove };
}
