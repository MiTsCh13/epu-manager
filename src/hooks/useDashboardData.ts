import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toISODate } from '@/lib/invoices';

export interface DashboardInvoice {
  status: string;
  due_date: string | null;
  total: number;
  subtotal: number;
  paid_at: string | null;
}

export interface DashboardExpense {
  category_label: string;
  amount: number;
  deductible_amount: number | null;
}

/** Rechnungen (für offene Posten + Monatsumsatz) und Ausgaben des laufenden Monats. */
export function useDashboardData() {
  const [invoices, setInvoices] = useState<DashboardInvoice[]>([]);
  const [monthExpenses, setMonthExpenses] = useState<DashboardExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const now = new Date();
    const monthStart = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
    const sixMonthsAgo = toISODate(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    const [inv, exp] = await Promise.all([
      // offene Rechnungen (beliebig alt) + bezahlte der letzten 6 Monate
      supabase
        .from('invoices')
        .select('status, due_date, total, subtotal, paid_at')
        .or(`status.in.(sent,overdue),paid_at.gte.${sixMonthsAgo}`),
      supabase.from('expenses').select('category_label, amount, deductible_amount').gte('expense_date', monthStart),
    ]);
    if (inv.error || exp.error) {
      setError('Deine Übersicht konnte nicht geladen werden.');
    } else {
      setInvoices(inv.data.map((i) => ({ ...i, total: Number(i.total), subtotal: Number(i.subtotal) })));
      setMonthExpenses(
        exp.data.map((e) => ({
          ...e,
          amount: Number(e.amount),
          deductible_amount: e.deductible_amount === null ? null : Number(e.deductible_amount),
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { invoices, monthExpenses, loading, error, reload: load };
}
