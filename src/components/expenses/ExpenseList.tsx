import { Paperclip, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { sumDeductibleExpenses } from '@/lib/profit';
import { getReceiptUrl } from '@/lib/receipts';
import { ExpenseCategoryIcon } from './CategoryIcon';
import type { Expense } from '@/types';

export function ExpenseList({
  expenses,
  onEdit,
  onDelete,
  counts,
  selected,
  onToggle,
}: {
  expenses: Expense[];
  selected?: ReadonlySet<string>; // Auswahl für Massenbearbeitung
  onToggle?: (id: string) => void;
  counts?: (e: Expense) => boolean; // Pauschalierung: zählt die Ausgabe zusätzlich?
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      {expenses.map((e) => {
        const deductible = sumDeductibleExpenses([
          { amount: Number(e.amount), deductible_amount: e.deductible_amount == null ? null : Number(e.deductible_amount), is_bewirtung: e.is_bewirtung },
        ]);
        const partial = deductible !== Number(e.amount);
        const notCounted = counts ? !counts(e) : false;
        return (
          <li key={e.id} className={`flex items-center gap-3 py-3 pl-4 pr-2 sm:pl-5 ${selected?.has(e.id) ? 'bg-primary-50/60' : ''}`}>
            {onToggle && (
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary"
                checked={!!selected?.has(e.id)}
                onChange={() => onToggle(e.id)}
                aria-label={`${e.description} auswählen`}
              />
            )}
            <span className={`h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 ${onToggle ? 'hidden sm:flex' : 'flex'}`}>
              <ExpenseCategoryIcon label={e.category_label} />
            </span>
            <button type="button" onClick={() => onEdit(e)} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline" aria-label={`${e.description} bearbeiten`}>
              <p className="truncate font-medium text-slate-900">{e.description}</p>
              {/* Handy: zwei Zeilen, damit km, Stunden usw. nicht abgeschnitten werden */}
              <p className="line-clamp-2 text-xs text-slate-500 sm:line-clamp-1">
                {formatDate(e.expense_date)} · {e.category_label}
                {e.km_driven && ` · ${String(e.km_driven).replace('.', ',')} km`}
                {e.km_driven && e.vehicle && e.vehicle !== 'car' && ` ${e.vehicle === 'bike' ? 'mit dem Fahrrad' : 'mit Motorrad/Moped'}`}
                {e.trip_hours && ` · ${String(e.trip_hours).replace('.', ',')} Std.`}
                {e.nights && ` · ${e.nights} ${e.nights === 1 ? 'Nacht' : 'Nächte'}`}
                {e.reimbursed && ' · weiterverrechnet'}
              </p>
            </button>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums text-slate-900">{formatEuro(Number(e.amount))}</p>
              {notCounted ? (
                <p className="text-xs text-amber-700">zählt bei Pauschalierung nicht</p>
              ) : (
                partial && <p className="text-xs tabular-nums text-slate-500">absetzbar {formatEuro(deductible)}</p>
              )}
            </div>
            <div className="flex shrink-0">
              {e.receipt_url && (
                <button
                  type="button"
                  title="Beleg ansehen"
                  aria-label={`Beleg zu ${e.description} ansehen`}
                  onClick={async () => {
                    const url = await getReceiptUrl(e.receipt_url!);
                    if (url) window.open(url, '_blank', 'noopener');
                    else toast.error('Beleg konnte nicht geöffnet werden.');
                  }}
                  className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-primary"
                >
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button type="button" title="Bearbeiten" aria-label={`${e.description} bearbeiten`} onClick={() => onEdit(e)} className="hidden h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:flex">
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" title="Löschen" aria-label={`${e.description} löschen`} onClick={() => onDelete(e)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
