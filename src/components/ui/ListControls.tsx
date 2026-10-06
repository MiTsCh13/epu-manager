import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { LIST_SORT_LABELS, type ListSort } from '@/lib/expenses';

const control =
  'min-h-[44px] rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/** Suche, Sortierung und optionale Filter über einer Liste. */
export function ListControls({
  query,
  onQuery,
  sort,
  onSort,
  placeholder = 'Suchen …',
  children,
}: {
  query: string;
  onQuery: (q: string) => void;
  sort: ListSort;
  onSort: (s: ListSort) => void;
  placeholder?: string;
  children?: ReactNode; // weitere Filter
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          aria-label="Suchen"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className={`${control} w-full pl-9 pr-9`}
        />
        {query && (
          <button
            type="button"
            aria-label="Suche löschen"
            onClick={() => onQuery('')}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
      <select aria-label="Sortieren" value={sort} onChange={(e) => onSort(e.target.value as ListSort)} className={`${control} px-3`}>
        {(Object.keys(LIST_SORT_LABELS) as ListSort[]).map((s) => (
          <option key={s} value={s}>
            {LIST_SORT_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

export const filterSelectClass = `${control} px-3`;
