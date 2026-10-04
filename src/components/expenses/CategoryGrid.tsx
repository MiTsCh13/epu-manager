import { useState } from 'react';
import { Info } from 'lucide-react';
import { categoriesFor, E1A_KZ_NAMES, EXPENSE_CATEGORY_GROUPS } from '@/constants/expenseCategories';
import type { BusinessType } from '@/types';
import { CategoryIcon } from './CategoryIcon';

/**
 * Visuelle Kategorie-Auswahl, gruppiert („Häufig“, „Betrieb“ …). Große Kacheln fürs Handy.
 * Darunter steht, was zur gewählten (bzw. mit der Maus berührten) Kategorie gehört und in welche E1a-Kennzahl sie fällt.
 */
export function CategoryGrid({
  value,
  onChange,
  error,
  businessType,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
  businessType: BusinessType | null;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const categories = categoriesFor(businessType, value);
  const shown = categories.find((c) => c.id === (hovered ?? value));

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">Kategorie</legend>
      <div className="space-y-4">
        {EXPENSE_CATEGORY_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">{group.label}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {categories.filter((c) => c.group === group.id).map((c) => {
                const selected = value === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={selected}
                    aria-describedby={selected ? 'category-hint' : undefined}
                    onClick={() => onChange(c.id)}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(c.id)}
                    onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(null)}
                    className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs font-medium leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      selected
                        ? 'border-primary bg-primary-50 text-primary-800 ring-1 ring-primary'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <CategoryIcon icon={c.icon} className={`h-5 w-5 ${selected ? 'text-primary' : 'text-slate-500'}`} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div id="category-hint" aria-live="polite" className="mt-3 flex gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {shown ? (
          <div>
            <p>
              <span className="font-medium text-slate-900">{shown.label}:</span> {shown.hint}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              In FinanzOnline (Formular E1a): Kennzahl {shown.kz} · {E1A_KZ_NAMES[shown.kz]}
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
