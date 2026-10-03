// Dashboard-Kennzahlen: Monatsumsatz, offene Rechnungen, Top-Ausgabenkategorien
import { sumByCategory } from './expenses';
import { getDisplayStatus } from './invoices';
import { round2 } from './money';

const MONTHS_DE = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Umsatz (netto, nach Zahlungseingang) je Monat für die letzten `months` Monate inkl. aktuellem. */
export function monthlyRevenue(
  paid: readonly { subtotal: number; paid_at: string | null }[],
  today: Date,
  months = 6,
): { key: string; label: string; total: number }[] {
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (months - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS_DE[d.getMonth()]!, total: 0 };
  });
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const inv of paid) {
    if (!inv.paid_at) continue;
    const i = index.get(inv.paid_at.slice(0, 7));
    if (i !== undefined) buckets[i]!.total += Number(inv.subtotal);
  }
  return buckets.map((b) => ({ ...b, total: round2(b.total) }));
}

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
