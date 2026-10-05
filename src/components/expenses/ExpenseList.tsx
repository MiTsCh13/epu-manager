import { Paperclip, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { getReceiptUrl } from '@/lib/receipts';
import { ExpenseCategoryIcon } from './CategoryIcon';
import type { Expense } from '@/types';

export function ExpenseList({
  expenses,
  onEdit,
  onDelete,
  counts,
}: {
  expenses: Expense[];
  counts?: (e: Expense) => boolean; // Pauschalierung: zählt die Ausgabe zusätzlich?
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      {expenses.map((e) => {
        const deductible = Number(e.deductible_amount ?? e.amount);
        const partial = deductible !== Number(e.amount);
        const notCounted = counts ? !counts(e) : false;
        return (
          <li key={e.id} className="flex items-center gap-3 py-3 pl-4 pr-2 sm:pl-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <ExpenseCategoryIcon label={e.category_label} />
            </span>
            <button type="button" onClick={() => onEdit(e)} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline" aria-label={`${e.description} bearbeiten`}>
              <p className="truncate font-medium text-slate-900">{e.description}</p>
              <p className="truncate text-xs text-slate-500">
                {formatDate(e.expense_date)} · {e.category_label}
                {e.km_driven && ` · ${String(e.km_driven).replace('.', ',')} km`}
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
