// Dashboard-Kennzahlen: Monatsumsatz, offene Rechnungen, Top-Ausgabenkategorien
import { sumByCategory } from './expenses';
import { getDisplayStatus } from './invoices';
import { round2 } from './money';

/** Offene (gesendete) Rechnungen: Anzahl, Summe, davon überfällig. */
export function openInvoicesSummary(
  invoices: readonly { status: string; due_date: string | null; total: number }[],
  today: string,
): { count: number; total: number; overdueCount: number } {
  let count = 0;
  let total = 0;
  let overdueCount = 0;
  for (const inv of invoices) {
    const s = getDisplayStatus(inv, today);
    if (s !== 'sent' && s !== 'overdue') continue;
    count++;
    total += Number(inv.total);
    if (s === 'overdue') overdueCount++;
  }
  return { count, total: round2(total), overdueCount };
}

/** Top-N-Kategorien; der Rest wird zu „Weitere“ zusammengefasst (nie mehr als N+1 Segmente). */
export function topCategories(
  expenses: readonly { category_label: string; deductible_amount: number | null; amount: number }[],
  n = 5,
): { label: string; total: number }[] {
  const all = sumByCategory(expenses);
  if (all.length <= n) return all;
  const rest = round2(all.slice(n).reduce((s, c) => s + c.total, 0));
  return [...all.slice(0, n), { label: 'Weitere', total: rest }];
}
