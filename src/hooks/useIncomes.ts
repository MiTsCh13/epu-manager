import { useCallback, useEffect, useState } from 'react';
import { fetchAll } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Income } from '@/types';

/** Einnahmen ohne Klaro-Rechnung (z. B. aus Excel übernommen), neueste zuerst. */
export function useIncomes() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
    if (err) setError('Deine weiteren Einnahmen konnten nicht geladen werden.');
    else setIncomes(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteIncome = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const { error: err } = await supabase.from('incomes').delete().eq('id', id);
    if (err) return { error: 'Die Einnahme konnte nicht gelöscht werden.' };
    setIncomes((list) => list.filter((i) => i.id !== id));
    return { error: null };
  }, []);

  return { incomes, loading, error, reload: load, deleteIncome };
}
