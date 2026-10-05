import { useCallback, useEffect, useState } from 'react';
import { fetchAll } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Asset, AssetInsert, Expense, ExpenseInsert, SvsPayment, SvsPaymentInsert } from '@/types';

type Result = { error: string | null };

/** Ausgaben, SVS-Zahlungen und Einnahmen (bezahlte Rechnungen und weitere Einnahmen, netto) eines Kalenderjahres, dazu alle Anlagen bis zu diesem Jahr. */
export function useExpensesData(year: number) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [svsPayments, setSvsPayments] = useState<SvsPayment[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const [exp, svs, inv, inc, ast] = await Promise.all([
      fetchAll((a, b) => supabase.from('expenses').select('*').gte('expense_date', from).lte('expense_date', to)
        .order('expense_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('svs_payments').select('*').eq('year', year).order('payment_date', { ascending: false }).order('id').range(a, b)),
      // Zuflussprinzip: Einnahme zählt im Jahr der Zahlung; netto (ohne USt)
      fetchAll((a, b) => supabase.from('invoices').select('subtotal').eq('status', 'paid')
        .gte('paid_at', `${from}T00:00:00`).lt('paid_at', `${year + 1}-01-01T00:00:00`).order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('incomes').select('amount, amount_net').gte('income_date', from).lte('income_date', to).order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('assets').select('*').lte('purchase_date', to)
        .order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
    ]);
    if (exp.error || svs.error || inv.error || inc.error || ast.error) {
      setError('Deine Ausgaben konnten nicht geladen werden.');
    } else {
      setExpenses(exp.data);
      setSvsPayments(svs.data);
      setAssets(ast.data);
      setRevenue(
        inv.data.reduce((s, i) => s + Number(i.subtotal), 0) + inc.data.reduce((s, i) => s + Number(i.amount_net ?? i.amount), 0),
      );
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

  const saveAsset = useCallback(
    async (values: AssetInsert, id?: string): Promise<Result> => {
      const query = id
        ? supabase.from('assets').update(values).eq('id', id).select().single()
        : supabase.from('assets').insert(values).select().single();
      const { error: err } = await query;
      if (err) return { error: 'Die Anlage konnte nicht gespeichert werden.' };
      await load();
      return { error: null };
    },
    [load],
  );

  const deleteAsset = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('assets').delete().eq('id', id);
    if (err) return { error: 'Die Anlage konnte nicht gelöscht werden.' };
    setAssets((list) => list.filter((a) => a.id !== id));
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

  return {
    expenses,
    svsPayments,
    assets,
    revenue,
    loading,
    error,
    reload: load,
    saveExpense,
    deleteExpense,
    saveAsset,
    deleteAsset,
    addSvsPayment,
    deleteSvsPayment,
  };
}
