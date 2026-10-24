import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { searchProducts } from '@/lib/products';
import type { Product } from '@/types';
import { priceLabel } from './ProductList';

/** „Aus Liste wählen“ im Rechnungs-Editor: suchen, antippen, fertig. */
export function ProductPicker({
  open,
  products,
  onClose,
  onPick,
}: {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onPick: (p: Product) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => searchProducts(products, query), [products, query]);

  return (
    <Modal
      open={open}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      title="Leistung oder Produkt wählen"
    >
      {products.length === 0 ? (
        <p className="text-sm text-slate-600">
          Du hast noch keine Leistungen oder Produkte gespeichert. Leg sie unter{' '}
          <Link to="/produkte" target="_blank" rel="noopener" className="font-medium text-primary hover:underline">
            Leistungen & Produkte
          </Link>{' '}
          an oder speichere eine Position direkt hier in der Rechnung.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              // Liegt im Rechnungs-Formular: Enter würde sonst die Rechnung speichern → ersten Treffer nehmen
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const first = filtered[0];
                if (first) {
                  onPick(first);
                  setQuery('');
                }
              }}
              placeholder="Suchen …"
              aria-label="Leistungen und Produkte suchen"
              className="block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-base placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nichts passt zu „{query}“.</p>
          ) : (
            <ul className="-mx-2 max-h-[55vh] overflow-y-auto">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p);
                      setQuery('');
                    }}
                    className="flex min-h-[44px] w-full items-baseline justify-between gap-4 rounded-lg px-2 py-2 text-left hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                      {p.details && <span className="block truncate text-xs text-slate-500">{p.details.split('\n')[0]}</span>}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-slate-700">{priceLabel(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
