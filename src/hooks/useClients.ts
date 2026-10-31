import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
  // Zählt Änderungen: Wurde während des Ladens ein Kunde angelegt/geändert/gelöscht, ist die Antwort veraltet und
  // würde z. B. den gerade angelegten Kunden wieder aus der Liste werfen – dann neu laden
  const changes = useRef(0);
  // Laufen zwei Ladevorgänge gleichzeitig (z. B. reload), zählt nur der neueste
  const latest = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    const before = changes.current;
    const { data, error: err } = await supabase.from('clients').select('*, invoices(count)').order('name');
    if (id !== latest.current) return;
    if (changes.current !== before) return load();
    if (err) {
      setError('Deine Kunden konnten nicht geladen werden.');
    } else {
      setClients(
        data.map(({ invoices, ...c }) => ({ ...c, invoiceCount: invoices[0]?.count ?? 0 })).sort(byName),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async (form: ClientFormData): Promise<Result<Client>> => {
    const { data, error: err } = await supabase.from('clients').insert(normalizeClient(form)).select().single();
    if (err) return { data: null, error: 'Der Kunde konnte nicht gespeichert werden.' };
    changes.current++;
    // Hat ein gleichzeitiges Laden den Kunden schon gebracht, nicht doppelt einfügen
    setClients((list) => [...list.filter((c) => c.id !== data.id), { ...data, invoiceCount: 0 }].sort(byName));
    return { data, error: null };
  }, []);

  const update = useCallback(async (id: string, form: ClientFormData): Promise<Result<Client>> => {
    const { data, error: err } = await supabase.from('clients').update(normalizeClient(form)).eq('id', id).select().single();
    if (err) return { data: null, error: 'Die Änderungen konnten nicht gespeichert werden.' };
    changes.current++;
    setClients((list) => list.map((c) => (c.id === id ? { ...data, invoiceCount: c.invoiceCount } : c)).sort(byName));
    return { data, error: null };
  }, []);

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
    changes.current++;
    setClients((list) => list.filter((c) => c.id !== id));
    return { data: true, error: null };
  }, []);

  return { clients, loading, error, reload: load, create, update, remove };
}
