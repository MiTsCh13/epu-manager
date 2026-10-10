import { useCallback, useEffect, useRef, useState } from 'react';
import { findCategoryById } from '@/constants/expenseCategories';
import { recategorize } from '@/lib/expenses';
import { fetchAll } from '@/lib/fetchAll';
import { deleteReceipt } from '@/lib/receipts';
import { bookDueRecurring } from '@/lib/recurringSync';
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
  // Jahre mit Ausgaben oder Anlagen (für die Jahresauswahl, z. B. nach einem Import älterer Jahre)
  const [years, setYears] = useState<number[]>([]);
  const loadedYear = useRef<number | null>(null);

  const load = useCallback(async () => {
    // Ladeanzeige nur beim ersten Laden eines Jahres – beim Neuladen nach dem Speichern bleiben Suche und Filter erhalten
    if (loadedYear.current !== year) setLoading(true);
    setError(null);
    const from = `${year}-01-01`;
    await bookDueRecurring(); // automatisch gebuchte Serien-Zahlungen zuerst anlegen
    const to = `${year}-12-31`;
    const [exp, svs, inv, inc, ast] = await Promise.all([
      fetchAll((a, b) => supabase.from('expenses').select('*').gte('expense_date', from).lte('expense_date', to)
        .order('expense_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
      // SVS zählt im Jahr der Zahlung (§ 19 EStG; Quartalsbeiträge sind nie um den Jahreswechsel fällig)
      fetchAll((a, b) => supabase.from('svs_payments').select('*').gte('payment_date', from).lte('payment_date', to)
        .order('payment_date', { ascending: false }).order('id').range(a, b)),
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
      loadedYear.current = year;
      setRevenue(
        inv.data.reduce((s, i) => s + Number(i.subtotal), 0) + inc.data.reduce((s, i) => s + Number(i.amount_net ?? i.amount), 0),
      );
    }
    setLoading(false);
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void Promise.all([
      supabase.from('expenses').select('expense_date').order('expense_date', { ascending: true }).limit(1),
      supabase.from('assets').select('purchase_date').order('purchase_date', { ascending: true }).limit(1),
    ]).then(([e, a]) => {
      const first = Math.min(Number(e.data?.[0]?.expense_date.slice(0, 4) ?? 9999), Number(a.data?.[0]?.purchase_date.slice(0, 4) ?? 9999));
      const current = new Date().getFullYear();
      if (first < current) setYears(Array.from({ length: current - first + 1 }, (_, i) => current - i));
    });
  }, []);

  const saveExpense = useCallback(
    async (values: ExpenseInsert, id?: string): Promise<Result> => {
      const query = id
        ? supabase.from('expenses').update(values).eq('id', id).select().single()
        : supabase.from('expenses').insert(values).select().single();
      const { error: err } = await query;
      // UNIQUE (recurring_id, expense_date): pro Serie nur eine Zahlung je Tag
      if (err?.code === '23505') return { error: 'An diesem Tag gibt es schon eine Zahlung dieser wiederkehrenden Ausgabe.' };
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

  /** Mehrere Ausgaben in eine Kategorie verschieben. Was nur einzeln geht, wird übersprungen und zurückgemeldet. */
  const recategorizeExpenses = useCallback(
    async (ids: readonly string[], categoryId: string): Promise<{ changed: number; skipped: { description: string; reason: string }[]; error: string | null }> => {
      const cat = findCategoryById(categoryId);
      if (!cat) return { changed: 0, skipped: [], error: 'Unbekannte Kategorie.' };
      const skipped: { description: string; reason: string }[] = [];
      const updates: { id: string; values: object }[] = [];
      for (const e of expenses.filter((x) => ids.includes(x.id))) {
        const r = recategorize(
          { ...e, amount: Number(e.amount), amount_net: e.amount_net === null ? null : Number(e.amount_net), km_driven: e.km_driven === null ? null : Number(e.km_driven), trip_hours: e.trip_hours === null ? null : Number(e.trip_hours) },
          cat,
        );
        if (r.ok) updates.push({ id: e.id, values: r.values });
        else skipped.push({ description: e.description, reason: r.reason });
      }
      let failed = 0;
      // In kleinen Gruppen parallel – jede Zeile hat eigene Werte (absetzbarer Betrag)
      for (let i = 0; i < updates.length; i += 20) {
        const results = await Promise.all(updates.slice(i, i + 20).map((u) => supabase.from('expenses').update(u.values).eq('id', u.id)));
        failed += results.filter((r) => r.error).length;
      }
      await load();
      return { changed: updates.length - failed, skipped, error: failed ? `${failed} Ausgaben konnten nicht geändert werden.` : null };
    },
    [expenses, load],
  );

  /** Mehrere Ausgaben löschen, samt Belegen. */
  const deleteExpenses = useCallback(
    async (ids: readonly string[]): Promise<Result> => {
      const receiptOf = new Map(expenses.filter((e) => e.receipt_url).map((e) => [e.id, e.receipt_url!]));
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error: err } = await supabase.from('expenses').delete().in('id', chunk);
        if (err) {
          await load();
          return { error: 'Nicht alle Ausgaben konnten gelöscht werden.' };
        }
        // Belege je gelöschtem Block entfernen – auch wenn ein späterer Block scheitert
        await Promise.all(chunk.flatMap((id) => (receiptOf.has(id) ? [deleteReceipt(receiptOf.get(id)!)] : [])));
      }
      const gone = new Set(ids);
      setExpenses((list) => list.filter((e) => !gone.has(e.id)));
      return { error: null };
    },
    [expenses, load],
  );

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

  const updateSvsPayment = useCallback(
    async (id: string, values: Pick<SvsPaymentInsert, 'amount' | 'quarter' | 'year' | 'payment_date' | 'notes'>): Promise<Result> => {
      const { error: err } = await supabase.from('svs_payments').update(values).eq('id', id).select('id').single();
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
    years,
    reload: load,
    saveExpense,
    deleteExpense,
    recategorizeExpenses,
    deleteExpenses,
    saveAsset,
    deleteAsset,
    addSvsPayment,
    updateSvsPayment,
    deleteSvsPayment,
  };
}
