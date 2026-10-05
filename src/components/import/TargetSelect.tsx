import { EXPENSE_CATEGORIES, isCategoryOffered, type CategoryContext } from '@/constants/expenseCategories';
import { catTarget, type CategoryChoice, type Target } from '@/lib/importMapping';

/** Auswahl: Einnahme, SVS-Beitrag, die angebotenen Ausgaben-Kategorien, Nicht übernehmen. */
export function TargetSelect<T extends CategoryChoice = Target>({
  value,
  onChange,
  context,
  label,
  incomeOnly = false,
  allowAuto = false,
  className = '',
}: {
  value: T;
  onChange: (t: T) => void;
  context: CategoryContext;
  label: string; // für Screenreader
  incomeOnly?: boolean; // nur Einnahmen-Zeilen: Einnahme oder nicht übernehmen
  allowAuto?: boolean; // „Automatisch nach Beschreibung“ anbieten (nur bei der Kategorie-Spalte)
  className?: string;
}) {
  const categories = EXPENSE_CATEGORIES.filter((c) => isCategoryOffered(c, context) || catTarget(c.id) === value);
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
        value === 'skip' ? 'text-slate-500' : ''
      } ${className}`}
    >
      {allowAuto && !incomeOnly && <option value="auto">Automatisch (nach Beschreibung)</option>}
      <option value="income">Einnahme</option>
      {!incomeOnly && <option value="svs">SVS-Beitrag</option>}
      {!incomeOnly && (
        <optgroup label={context.profitMethod === 'pauschal' ? 'Ausgabe (zusätzlich zur Pauschale)' : 'Ausgabe'}>
          {categories.map((c) => (
            <option key={c.id} value={catTarget(c.id)}>
              {c.label}
            </option>
          ))}
        </optgroup>
      )}
      <option value="skip">Nicht übernehmen</option>
    </select>
  );
}
