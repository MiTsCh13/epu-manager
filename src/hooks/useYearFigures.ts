import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { sumDeductibleExpenses } from '@/lib/profit';
import { round2 } from '@/lib/money';
import type { YearFigures } from '@/lib/svsTracker';

const empty: YearFigures = { revenueNet: 0, revenueGross: 0, deductibleExpenses: 0, svsPaid: 0 };

/** Kennzahlen (Einnahmen, absetzbare Ausgaben, SVS) für das aktuelle und das Vorjahr. */
export function useYearFigures(year: number) {
  const [current, setCurrent] = useState<YearFigures>(empty);
  const [previous, setPrevious] = useState<YearFigures | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = `${year - 1}-01-01`;
    const [inv, exp, svs] = await Promise.all([
      supabase.from('invoices').select('subtotal, total, paid_at').eq('status', 'paid').gte('paid_at', `${from}T00:00:00`),
      supabase.from('expenses').select('amount, deductible_amount, is_bewirtung, expense_date').gte('expense_date', from),
      supabase.from('svs_payments').select('amount, year').gte('year', year - 1),
    ]);
    if (inv.error || exp.error || svs.error) {
      setError('Deine Zahlen konnten nicht geladen werden.');
      setLoading(false);
      return;
    }
    const figures = (y: number): YearFigures & { hasData: boolean } => {
      const invoices = inv.data.filter((i) => i.paid_at && new Date(i.paid_at).getFullYear() === y);
      const expenses = exp.data.filter((e) => Number(e.expense_date.slice(0, 4)) === y);
      const payments = svs.data.filter((p) => p.year === y);
      return {
        revenueNet: round2(invoices.reduce((s, i) => s + Number(i.subtotal), 0)),
        revenueGross: round2(invoices.reduce((s, i) => s + Number(i.total), 0)),
        deductibleExpenses: sumDeductibleExpenses(
          expenses.map((e) => ({
            amount: Number(e.amount),
            deductible_amount: e.deductible_amount === null ? null : Number(e.deductible_amount),
            is_bewirtung: e.is_bewirtung,
          })),
        ),
        svsPaid: round2(payments.reduce((s, p) => s + Number(p.amount), 0)),
        hasData: invoices.length + expenses.length + payments.length > 0,
      };
    };
    const { hasData: _c, ...cur } = figures(year);
    const { hasData, ...prev } = figures(year - 1);
    setCurrent(cur);
    setPrevious(hasData ? prev : null);
    setLoading(false);
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  return { current, previous, loading, error, reload: load };
}
