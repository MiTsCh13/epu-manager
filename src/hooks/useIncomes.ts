import { useCallback, useEffect, useState } from 'react';
import { fetchAll } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import { useLoadGuard } from '@/hooks/useLoadGuard';
import type { Income } from '@/types';

/** Einnahmen ohne Klaro-Rechnung (z. B. aus Excel übernommen), neueste zuerst. */
export function useIncomes() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Verspätete Antworten dürfen gelöschte Einnahmen nicht wieder anzeigen
  const guard = useLoadGuard();

  const load = useCallback(async (): Promise<void> => {
    const ticket = guard.start();
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchAll((a, b) =>
      supabase
        .from('incomes')
        .select('*')
        .order('income_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(a, b),
    );
    const fresh = guard.check(ticket);
    if (fresh === 'stale') return;
    if (fresh === 'changed') return load();
    if (err) setError('Deine weiteren Einnahmen konnten nicht geladen werden.');
    else setIncomes(data);
    setLoading(false);
  }, [guard]);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteIncome = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const { error: err } = await supabase.from('incomes').delete().eq('id', id);
    if (err) return { error: 'Die Einnahme konnte nicht gelöscht werden.' };
    guard.changed();
    setIncomes((list) => list.filter((i) => i.id !== id));
    return { error: null };
  }, [guard]);

  const deleteIncomes = useCallback(async (ids: readonly string[]): Promise<{ error: string | null }> => {
    for (let i = 0; i < ids.length; i += 200) {
      const { error: err } = await supabase.from('incomes').delete().in('id', ids.slice(i, i + 200));
      if (err) {
        await load();
        return { error: 'Nicht alle Einnahmen konnten gelöscht werden.' };
      }
    }
    guard.changed();
    setIncomes((list) => list.filter((i) => !ids.includes(i.id)));
    return { error: null };
  }, [load, guard]);

  return { incomes, loading, error, reload: load, deleteIncome, deleteIncomes };
}
