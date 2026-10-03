import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

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

/** Offene Rechnungen (immer) + bezahlte Rechnungen und Ausgaben im gewählten Zeitraum. */
export function useDashboardData(range: DateRange) {
  const [openInvoices, setOpenInvoices] = useState<DashboardInvoice[]>([]);
  const [paidInRange, setPaidInRange] = useState<DashboardInvoice[]>([]);
  const [expensesInRange, setExpensesInRange] = useState<DashboardExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cols = 'status, due_date, total, subtotal, paid_at';
    const [open, paid, exp] = await Promise.all([
      supabase.from('invoices').select(cols).in('status', ['sent', 'overdue']),
      supabase.from('invoices').select(cols).eq('status', 'paid').gte('paid_at', `${range.from}T00:00:00`).lte('paid_at', `${range.to}T23:59:59.999`),
      supabase.from('expenses').select('category_label, amount, deductible_amount').gte('expense_date', range.from).lte('expense_date', range.to),
    ]);
    if (open.error || paid.error || exp.error) {
      setError('Deine Übersicht konnte nicht geladen werden.');
    } else {
      const num = (i: (typeof open.data)[number]) => ({ ...i, total: Number(i.total), subtotal: Number(i.subtotal) });
      setOpenInvoices(open.data.map(num));
      setPaidInRange(paid.data.map(num));
      setExpensesInRange(
        exp.data.map((e) => ({
          ...e,
          amount: Number(e.amount),
          deductible_amount: e.deductible_amount === null ? null : Number(e.deductible_amount),
        })),
      );
    }
    setLoading(false);
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return { openInvoices, paidInRange, expensesInRange, loading, error, reload: load };
}
