import { Pencil, Trash2 } from 'lucide-react';
import { formatEuro } from '@/lib/money';
import type { Product } from '@/types';

export function priceLabel(p: Pick<Product, 'unit_price' | 'unit'>): string {
  return `${formatEuro(Number(p.unit_price))}${p.unit ? ` / ${p.unit}` : ''}`;
}

export function ProductList({
  products,
  onEdit,
  onDelete,
}: {
  products: Product[];
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      {products.map((p) => (
        <li key={p.id} className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-5">
          <button
            type="button"
            onClick={() => onEdit(p)}
            className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline"
            aria-label={`${p.name} bearbeiten`}
          >
            <p className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <span className="truncate font-medium text-slate-900">{p.name}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">{priceLabel(p)}</span>
            </p>
            {p.details && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-slate-500">{p.details}</p>}
          </button>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onEdit(p)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`${p.name} bearbeiten`}
              title="Bearbeiten"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(p)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              aria-label={`${p.name} löschen`}
              title="Löschen"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProductListSkeleton() {
  return (
    <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200" aria-busy="true" aria-label="Produkte werden geladen">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex animate-pulse items-center gap-3 px-5 py-4">
          <span className="flex-1 space-y-2">
            <span className="block h-3.5 w-1/3 rounded bg-slate-200" />
            <span className="block h-3 w-1/2 rounded bg-slate-100" />
          </span>
          <span className="h-3.5 w-16 rounded bg-slate-200" />
        </li>
      ))}
    </ul>
  );
}
