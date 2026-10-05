import { useState } from 'react';
import { Info } from 'lucide-react';
import { E1A_KZ_NAMES, tileOf, tilesFor, type CategoryContext } from '@/constants/expenseCategories';
import { CategoryIcon } from './CategoryIcon';

/**
 * Visuelle Kategorie-Auswahl: große Kacheln fürs Handy. Fasst eine Kachel mehrere Kategorien zusammen
 * (z. B. Bankgebühren / Kreditzinsen), fragt Klaro darunter nach. Unten steht, was zur gewählten Kategorie gehört
 * und in welche E1a-Kennzahl sie fällt.
 */
export function CategoryGrid({
  value,
  onChange,
  error,
  context,
}: {
  value: string; // Kategorie-ID
  onChange: (categoryId: string) => void;
  error?: string;
  context: CategoryContext;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const tiles = tilesFor(context, value);
  const selectedTile = tiles.find((t) => t.tile.id === tileOf(value)?.id);
  const selected = selectedTile?.categories.find((c) => c.id === value);
  const hoveredTile = hovered ? tiles.find((t) => t.tile.id === hovered) : undefined;

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">Kategorie</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {tiles.map(({ tile, categories }) => {
          const active = selectedTile?.tile.id === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              aria-pressed={active}
              aria-describedby={active ? 'category-hint' : undefined}
              // Erste angebotene Kategorie vorauswählen; bei mehreren fragt Klaro darunter nach
              onClick={() => !active && onChange(categories[0]!.id)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(tile.id)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(null)}
              className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs font-medium leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                  ? 'border-primary bg-primary-50 text-primary-800 ring-1 ring-primary'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <CategoryIcon icon={tile.icon} className={`h-5 w-5 ${active ? 'text-primary' : 'text-slate-500'}`} />
              {categories.length === 1 ? categories[0]!.label : tile.label}
            </button>
          );
        })}
      </div>

      {selectedTile && selectedTile.categories.length > 1 && (
        <div className="mt-3" role="radiogroup" aria-label={selectedTile.tile.question ?? selectedTile.tile.label}>
          <p className="mb-1.5 text-sm font-medium text-slate-700">{selectedTile.tile.question}</p>
          <div className="flex flex-wrap gap-2">
            {selectedTile.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === value}
                onClick={() => onChange(c.id)}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  c.id === value
                    ? 'border-primary bg-primary-50 text-primary-800 ring-1 ring-primary'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                <CategoryIcon icon={c.icon} className="h-4 w-4" />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div id="category-hint" aria-live="polite" className="mt-3 flex gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {hoveredTile && hoveredTile.tile.id !== selectedTile?.tile.id ? (
          <div className="space-y-1">
            {hoveredTile.categories.map((c) => (
              <p key={c.id}>
                <span className="font-medium text-slate-900">{c.label}:</span> {c.hint}
              </p>
            ))}
          </div>
        ) : selected ? (
          <div>
            <p>
              <span className="font-medium text-slate-900">{selected.label}:</span> {selected.hint}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              In FinanzOnline (Formular E1a): Kennzahl {selected.kz} · {E1A_KZ_NAMES[selected.kz]}
            </p>
          </div>
        ) : (
          <p className="text-slate-600">Tippe auf eine Kategorie. Hier siehst du dann, was dazugehört.</p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </fieldset>
  );
}
