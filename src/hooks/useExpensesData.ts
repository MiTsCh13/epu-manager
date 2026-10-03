import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Expense, ExpenseInsert, SvsPayment, SvsPaymentInsert } from '@/types';

type Result = { error: string | null };

/** Ausgaben, SVS-Zahlungen und Einnahmen (bezahlte Rechnungen, netto) eines Kalenderjahres. */
export function useExpensesData(year: number) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [svsPayments, setSvsPayments] = useState<SvsPayment[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const [exp, svs, inv] = await Promise.all([
      supabase.from('expenses').select('*').gte('expense_date', from).lte('expense_date', to)
        .order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('svs_payments').select('*').eq('year', year).order('payment_date', { ascending: false }),
      // Zuflussprinzip: Einnahme zählt im Jahr der Zahlung; netto (ohne USt)
      supabase.from('invoices').select('subtotal').eq('status', 'paid')
        .gte('paid_at', `${from}T00:00:00`).lt('paid_at', `${year + 1}-01-01T00:00:00`),
    ]);
    if (exp.error || svs.error || inv.error) {
      setError('Deine Ausgaben konnten nicht geladen werden.');
    } else {
      setExpenses(exp.data);
      setSvsPayments(svs.data);
      setRevenue(inv.data.reduce((s, i) => s + Number(i.subtotal), 0));
    }
    setLoading(false);
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveExpense = useCallback(
    async (values: ExpenseInsert, id?: string): Promise<Result> => {
      const query = id
        ? supabase.from('expenses').update(values).eq('id', id).select().single()
        : supabase.from('expenses').insert(values).select().single();
      const { error: err } = await query;
      if (err) return { error: 'Die Ausgabe konnte nicht gespeichert werden.' };
      await load();
      return { error: null };
    },
    [load],
  );

  const deleteExpense = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('expenses').delete().eq('id', id);
    if (err) return { error: 'Die Ausgabe konnte nicht gelöscht werden.' };
    setExpenses((list) => list.filter((e) => e.id !== id));
    return { error: null };
  }, []);

  const addSvsPayment = useCallback(
    async (values: SvsPaymentInsert): Promise<Result> => {
      const { error: err } = await supabase.from('svs_payments').insert(values);
      if (err) return { error: 'Der SVS-Beitrag konnte nicht gespeichert werden.' };
      await load();
      return { error: null };
    },
    [load],
  );

  const deleteSvsPayment = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('svs_payments').delete().eq('id', id);
    if (err) return { error: 'Der SVS-Beitrag konnte nicht gelöscht werden.' };
    setSvsPayments((list) => list.filter((p) => p.id !== id));
    return { error: null };
  }, []);

  return { expenses, svsPayments, revenue, loading, error, reload: load, saveExpense, deleteExpense, addSvsPayment, deleteSvsPayment };
}
