import { Plus, Trash2 } from 'lucide-react';
import type { LineItemInput, InvoiceFormErrors } from '@/lib/invoices';
import { formatEuro, parseDecimal, round2 } from '@/lib/money';

export type LineItemRow = LineItemInput & { key: string };

const inputClass = (error?: string) =>
  `block min-h-[44px] w-full rounded-lg border px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 sm:text-sm ${
    error ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-primary focus:ring-primary/20'
  }`;

function rowTotal(row: LineItemInput): number {
  const q = parseDecimal(row.quantity);
  const p = parseDecimal(row.unit_price);
  return Number.isNaN(q) || Number.isNaN(p) ? 0 : round2(q * p);
}

export function newRow(): LineItemRow {
  return { key: crypto.randomUUID(), description: '', quantity: '1', unit_price: '' };
}

export function LineItemsEditor({
  rows,
  onChange,
  errors,
  listError,
}: {
  rows: LineItemRow[];
  onChange: (rows: LineItemRow[]) => void;
  errors?: InvoiceFormErrors['itemErrors'];
  listError?: string;
}) {
  const update = (key: string, patch: Partial<LineItemInput>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div>
      {/* Spaltenköpfe nur am Desktop */}
      <div className="mb-1 hidden grid-cols-[1fr_6rem_8rem_7rem_2.5rem] gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
        <span>Bezeichnung</span>
        <span>Menge</span>
        <span>Einzelpreis (€)</span>
        <span className="text-right">Summe</span>
        <span />
      </div>
      <ol className="space-y-3 sm:space-y-2">
        {rows.map((row, idx) => {
          const err = errors?.[idx];
          return (
            <li
              key={row.key}
              className="grid grid-cols-[1fr_1fr] gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-[1fr_6rem_8rem_7rem_2.5rem] sm:items-start sm:bg-transparent sm:p-0 sm:ring-0"
            >
              <label className="col-span-2 sm:col-span-1">
                <span className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">Bezeichnung<span className="sr-only"> (Position {idx + 1})</span></span>
                <input
                  className={inputClass()}
                  placeholder="z. B. Website-Gestaltung"
                  value={row.description}
                  onChange={(e) => update(row.key, { description: e.target.value })}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">Menge<span className="sr-only"> (Position {idx + 1})</span></span>
                <input
                  className={inputClass(err?.quantity)}
                  inputMode="decimal"
                  value={row.quantity}
                  aria-invalid={!!err?.quantity || undefined}
                  onChange={(e) => update(row.key, { quantity: e.target.value })}
                />
                {err?.quantity && <span className="mt-0.5 block text-xs text-red-600">{err.quantity}</span>}
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500 sm:sr-only">Einzelpreis in €<span className="sr-only"> (Position {idx + 1})</span></span>
                <input
                  className={inputClass(err?.unit_price)}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={row.unit_price}
                  aria-invalid={!!err?.unit_price || undefined}
                  onChange={(e) => update(row.key, { unit_price: e.target.value })}
                />
                {err?.unit_price && <span className="mt-0.5 block text-xs text-red-600">{err.unit_price}</span>}
              </label>
              <div className="flex items-center justify-between sm:block sm:pt-3 sm:text-right">
                <span className="text-xs text-slate-500 sm:hidden">Summe</span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{formatEuro(rowTotal(row))}</span>
              </div>
              <div className="flex justify-end sm:block">
                <button
                  type="button"
                  onClick={() => onChange(rows.length > 1 ? rows.filter((r) => r.key !== row.key) : [newRow()])}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  aria-label={`Position ${idx + 1} entfernen`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {listError && <p className="mt-2 text-sm text-red-600">{listError}</p>}
      <button
        type="button"
        onClick={() => onChange([...rows, newRow()])}
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Position hinzufügen
      </button>
    </div>
  );
}
