import type { CategoryContext } from '@/constants/expenseCategories';
import type { CategoryChoice, CategoryValueSummary } from '@/lib/importMapping';
import { formatEuro } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Term } from '@/components/ui/Tooltip';
import { TargetSelect } from './TargetSelect';

/** Schritt 3: Jeden Wert der Kategorie-Spalte einmal zuordnen – gilt dann für alle Zeilen mit diesem Wert. */
export function CategoriesStep({
  values,
  map,
  context,
  busy,
  onChange,
  onBack,
  onNext,
}: {
  values: CategoryValueSummary[];
  map: Record<string, CategoryChoice>;
  context: CategoryContext;
  busy: boolean;
  onChange: (value: string, target: CategoryChoice) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const pauschal = context.profitMethod === 'pauschal';
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
        <div>
          <h2 className="font-semibold text-slate-900">Deine Kategorien → Klaro</h2>
          <p className="text-sm text-slate-600">
            Ordne jede Kategorie aus deiner Tabelle einmal zu. <Term k="svs">SVS-Beiträge</Term> erfasst Klaro extra, private
            Buchungen und Steuerzahlungen ans Finanzamt übernimmst du nicht.
            {' '}„Automatisch“ heißt: Klaro schaut bei jeder Zeile auf die Beschreibung.
            {pauschal && (
              <>
                {' '}Bei <Term k="pauschalierung" /> zählen nur wenige Ausgaben zusätzlich – alles andere steckt schon im Pauschalsatz.
              </>
            )}
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {values.map((v) => (
            <li key={v.value} className="grid gap-2 py-3 sm:grid-cols-[1fr_minmax(0,280px)] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{v.value}</p>
                <p className="text-xs text-slate-500">
                  {v.count === 1 ? '1 Eintrag' : `${v.count} Einträge`} · {formatEuro(v.total)}
                </p>
              </div>
              <TargetSelect<CategoryChoice>
                allowAuto
                value={map[v.value] ?? 'auto'}
                onChange={(t) => onChange(v.value, t)}
                context={context}
                incomeOnly={v.directions.size === 1 && v.directions.has('in')}
                label={`Zuordnung für ${v.value}`}
              />
            </li>
          ))}
        </ul>
      </section>
      <div className="flex justify-between gap-2">
        <Button variant="secondary" onClick={onBack}>
          Zurück
        </Button>
        <Button onClick={onNext} loading={busy}>
          Weiter
        </Button>
      </div>
    </div>
  );
}
