import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_GROUPS } from '@/constants/expenseCategories';
import { CategoryIcon } from './CategoryIcon';

/** Visuelle Kategorie-Auswahl, gruppiert („Häufig“, „Betrieb“ …). Große Kacheln fürs Handy. */
export function CategoryGrid({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">Kategorie</legend>
      <div className="space-y-4">
        {EXPENSE_CATEGORY_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">{group.label}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {EXPENSE_CATEGORIES.filter((c) => c.group === group.id).map((c) => {
                const selected = value === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(c.id)}
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
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </fieldset>
  );
}
