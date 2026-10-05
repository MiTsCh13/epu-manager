import { useState } from 'react';
import { ChevronDown, Paperclip, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { bookValueAtYearEnd, depreciationSchedule, type DepreciationInput } from '@/lib/assets';
import { formatDate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { getReceiptUrl } from '@/lib/receipts';
import { ExpenseCategoryIcon } from './CategoryIcon';
import type { Asset } from '@/types';

export const assetInput = (a: Asset): DepreciationInput => ({
  cost: Number(a.cost ?? a.amount_net ?? a.amount),
  purchaseDate: a.purchase_date,
  usefulLifeYears: a.useful_life_years,
});

/** Anlagen mit Kaufpreis, Abschreibung im gewählten Jahr und Restwert; aufklappbar der ganze Plan. */
export function AssetList({
  assets,
  year,
  onEdit,
  onDelete,
}: {
  assets: Asset[];
  year: number;
  onEdit: (a: Asset) => void;
  onDelete: (a: Asset) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      {assets.map((a) => {
        const input = assetInput(a);
        const plan = depreciationSchedule(input);
        const thisYear = plan.find((p) => p.year === year)?.amount ?? 0;
        const rest = bookValueAtYearEnd(input, year);
        const open = expanded === a.id;
        const planId = `plan-${a.id}`;
        return (
          <li key={a.id} data-testid="asset-row">
            <div className="flex items-center gap-3 py-3 pl-4 pr-2 sm:pl-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <ExpenseCategoryIcon label={a.category_label} />
              </span>
              <button type="button" onClick={() => onEdit(a)} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline" aria-label={`${a.description} bearbeiten`}>
                <p className="truncate font-medium text-slate-900">{a.description}</p>
                <p className="truncate text-xs text-slate-500">
                  {formatDate(a.purchase_date)} · {a.useful_life_years} Jahre · Kaufpreis {formatEuro(input.cost)}
                  {a.amount_net !== null && ' netto'}
                </p>
              </button>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums text-slate-900" data-testid="asset-depreciation">
                  {formatEuro(thisYear)}
                </p>
                <p className="text-xs tabular-nums text-slate-500">Restwert Ende {year}: {formatEuro(rest)}</p>
              </div>
              <div className="flex shrink-0">
                {a.receipt_url && (
                  <button
                    type="button"
                    title="Beleg ansehen"
                    aria-label={`Beleg zu ${a.description} ansehen`}
                    onClick={async () => {
                      const url = await getReceiptUrl(a.receipt_url!);
                      if (url) window.open(url, '_blank', 'noopener');
                      else toast.error('Beleg konnte nicht geöffnet werden.');
                    }}
                    className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-primary"
                  >
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <button type="button" title="Bearbeiten" aria-label={`${a.description} bearbeiten`} onClick={() => onEdit(a)} className="hidden h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:flex">
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" title="Löschen" aria-label={`${a.description} löschen`} onClick={() => onDelete(a)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={planId}
              onClick={() => setExpanded(open ? null : a.id)}
              className="mb-2 ml-[4.25rem] inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-primary hover:underline sm:ml-[4.75rem]"
            >
              Abschreibung pro Jahr
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open && (
              <table id={planId} className="mb-3 ml-[4.25rem] w-[calc(100%-5.25rem)] max-w-sm text-sm sm:ml-[4.75rem]">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1 font-medium">Jahr</th>
                    <th className="py-1 text-right font-medium">Absetzbar</th>
                    <th className="py-1 text-right font-medium">Restwert</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {plan.map((p) => (
                    <tr key={p.year} className={p.year === year ? 'font-semibold text-slate-900' : 'text-slate-700'}>
                      <td className="py-0.5">
                        {p.year}
                        {p.half && <span className="font-normal text-slate-500"> (halbes Jahr)</span>}
                      </td>
                      <td className="py-0.5 text-right">{formatEuro(p.amount)}</td>
                      <td className="py-0.5 text-right">{formatEuro(p.bookValueEnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        );
      })}
    </ul>
  );
}
