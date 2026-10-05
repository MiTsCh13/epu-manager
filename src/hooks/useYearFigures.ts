import { useCallback, useEffect, useState } from 'react';
import { fetchAll } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import { sumDepreciation } from '@/lib/assets';
import { expenseTotals } from '@/lib/expenses';
import { round2 } from '@/lib/money';
import type { YearFigures } from '@/lib/svsTracker';

const empty: YearFigures = { revenueNet: 0, revenueGross: 0, deductibleExpenses: 0, pauschalExtras: { ku: 0, basis: 0 }, reimbursedTravel: 0, depreciation: 0, svsPaid: 0 };

/** Kennzahlen (Einnahmen aus Rechnungen und weiteren Einnahmen, absetzbare Ausgaben, Abschreibung, SVS) für das aktuelle und das Vorjahr. */
export function useYearFigures(year: number) {
  const [current, setCurrent] = useState<YearFigures>(empty);
  const [previous, setPrevious] = useState<YearFigures | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = `${year - 1}-01-01`;
    const [inv, inc, exp, svs, assets] = await Promise.all([
      fetchAll((a, b) => supabase.from('invoices').select('subtotal, total, paid_at').eq('status', 'paid').gte('paid_at', `${from}T00:00:00`).order('id').range(a, b)),
      // Einnahmen ohne Klaro-Rechnung (z. B. importiert)
      fetchAll((a, b) => supabase.from('incomes').select('amount, amount_net, income_date').gte('income_date', from).order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('expenses').select('category_label, amount, deductible_amount, is_bewirtung, reimbursed, expense_date').gte('expense_date', from).order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('svs_payments').select('amount, year').gte('year', year - 1).order('id').range(a, b)),
      // Anlagen aus früheren Jahren werden noch abgeschrieben → alle laden
      fetchAll((a, b) => supabase.from('assets').select('cost, purchase_date, useful_life_years').lte('purchase_date', `${year}-12-31`).order('id').range(a, b)),
    ]);
    if (inv.error || inc.error || exp.error || svs.error || assets.error) {
      setError('Deine Zahlen konnten nicht geladen werden.');
      setLoading(false);
      return;
    }
    const figures = (y: number): YearFigures & { hasData: boolean } => {
      const invoices = inv.data.filter((i) => i.paid_at && new Date(i.paid_at).getFullYear() === y);
      const incomes = inc.data.filter((i) => Number(i.income_date.slice(0, 4)) === y);
      const expenses = exp.data.filter((e) => Number(e.expense_date.slice(0, 4)) === y);
      const payments = svs.data.filter((p) => p.year === y);
      const totals = expenseTotals(
        expenses.map((e) => ({
          ...e,
          amount: Number(e.amount),
          deductible_amount: e.deductible_amount === null ? null : Number(e.deductible_amount),
        })),
      );
      return {
        revenueNet: round2(
          invoices.reduce((s, i) => s + Number(i.subtotal), 0) + incomes.reduce((s, i) => s + Number(i.amount_net ?? i.amount), 0),
        ),
        revenueGross: round2(invoices.reduce((s, i) => s + Number(i.total), 0) + incomes.reduce((s, i) => s + Number(i.amount), 0)),
        deductibleExpenses: totals.deductible,
        pauschalExtras: totals.pauschalExtras,
        reimbursedTravel: totals.reimbursedTravel,
        depreciation: sumDepreciation(
          assets.data.map((a) => ({ ...a, cost: Number(a.cost) })),
          y,
        ),
        svsPaid: round2(payments.reduce((s, p) => s + Number(p.amount), 0)),
        hasData: invoices.length + incomes.length + expenses.length + payments.length > 0,
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
