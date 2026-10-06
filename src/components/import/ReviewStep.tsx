import { useMemo, useState, type ReactNode } from 'react';
import { findCategoryById, type CategoryContext } from '@/constants/expenseCategories';
import { MAX_USEFUL_LIFE, MIN_USEFUL_LIFE } from '@/lib/assets';
import { canSpread, effectiveVat, rowKind, summarize, targetCategoryId, type EntryKind, type ReviewRow, type Target } from '@/lib/importMapping';
import { formatDate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Term } from '@/components/ui/Tooltip';
import { TargetSelect } from './TargetSelect';

type Filter = 'all' | 'income' | 'expense' | 'svs' | 'attention';

const PAGE = 100;
const LIFE_OPTIONS = Array.from({ length: MAX_USEFUL_LIFE - MIN_USEFUL_LIFE + 1 }, (_, i) => MIN_USEFUL_LIFE + i);

const KIND_BADGE: Record<EntryKind, { label: string; tone: 'success' | 'neutral' | 'info' | 'warning' }> = {
  income: { label: 'Einnahme', tone: 'success' },
  expense: { label: 'Ausgabe', tone: 'neutral' },
  asset: { label: 'Anlage', tone: 'info' },
  svs: { label: 'SVS', tone: 'info' },
  skip: { label: 'Wird nicht übernommen', tone: 'warning' },
};


/** Schritt 4: Alles prüfen, einzelne Zeilen ändern oder abwählen, dann übernehmen. */
export function ReviewStep({
  rows,
  isKU,
  context,
  saving,
  onChange,
  onChangeMany,
  onBack,
  onImport,
}: {
  rows: ReviewRow[];
  isKU: boolean;
  context: CategoryContext;
  saving: boolean;
  onChange: (id: number, patch: Partial<ReviewRow>) => void;
  onChangeMany: (ids: readonly number[], patch: (r: ReviewRow) => Partial<ReviewRow>) => void;
  onBack: () => void;
  onImport: () => void;
}) {
  // Bitte ansehen: Probleme, mögliche Duplikate, Hinweise und teure Käufe, bei denen „auf mehrere Jahre verteilen“ offen ist
  const needsAttention = (r: ReviewRow) => !!r.problem || r.duplicate || !!r.note || r.unclear || canSpread(r, isKU);
  const [query, setQuery] = useState('');
  const [bulkTarget, setBulkTarget] = useState<Target | ''>('');
  const [filter, setFilter] = useState<Filter>(() => (rows.some(needsAttention) ? 'attention' : 'all'));
  const [shown, setShown] = useState(PAGE);
  const summary = useMemo(() => summarize(rows, isKU), [rows, isKU]);
  const kinds = useMemo(() => new Map(rows.map((r) => [r.id, rowKind(r, isKU)])), [rows, isKU]);
  const total = summary.incomes.count + summary.expenses.count + summary.assets.count + summary.svs_payments.count;

  const matches = (r: ReviewRow, f: Filter) => {
    const k = kinds.get(r.id)!;
    if (f === 'all') return true;
    if (f === 'attention') return needsAttention(r);
    if (f === 'expense') return k === 'expense' || k === 'asset';
    return k === f;
  };
  const filters: [Filter, string][] = [
    ['all', 'Alle'],
    ['attention', 'Bitte ansehen'],
    ['income', 'Einnahmen'],
    ['expense', 'Ausgaben'],
    ['svs', 'SVS'],
  ];
  // Ist der aktive Filter leer geworden (z. B. alles erledigt), zurück auf „Alle“
  const activeFilter: Filter = filter === 'all' || rows.some((r) => matches(r, filter)) ? filter : 'all';
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) => matches(r, activeFilter) && (!q || [r.description, r.category, r.reference].some((t) => t.toLowerCase().includes(q)) || r.amount.toFixed(2).includes(q.replace(',', '.'))),
  );
  // Massenänderung: Einnahmen nur zu Einnahmen, Ausgaben nur zu Ausgaben/SVS; „Nicht übernehmen“ für alle.
  // Bereits abgewählte Zeilen (privat, Steuer) bleiben unangetastet, außer man wählt selbst „Nicht übernehmen“.
  const fits = (r: ReviewRow, t: Target) =>
    !r.problem && (t === 'skip' || (r.target !== 'skip' && (t === 'income' ? r.direction === 'in' : r.direction === 'out')));
  const affected = bulkTarget ? visible.filter((r) => fits(r, bulkTarget)) : visible.filter((r) => !r.problem && r.target !== 'skip');

  function applyBulk() {
    if (!bulkTarget) return;
    const t = bulkTarget;
    onChangeMany(
      affected.map((r) => r.id),
      (r) => ({ target: t, note: null, reason: null, unclear: false, include: t !== 'skip' && !r.duplicate }),
    );
    setBulkTarget('');
  }

  return (
    <div className="space-y-6">
      <section aria-label="Zusammenfassung" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Einnahmen" count={summary.incomes.count} total={summary.incomes.total} />
        <SummaryTile label="Ausgaben" count={summary.expenses.count} total={summary.expenses.total} />
        <SummaryTile label={<Term k="abschreibung">Anlagen</Term>} count={summary.assets.count} total={summary.assets.total} />
        <SummaryTile label={<Term k="svs">SVS-Beiträge</Term>} count={summary.svs_payments.count} total={summary.svs_payments.total} />
      </section>

      {summary.assets.count > 0 && (
        <Alert type="info">
          Geräte über 1.000 € setzt du nicht auf einmal ab: Klaro legt sie als Anlage an und verteilt den Kaufpreis auf die
          Nutzungsdauer. Prüfe bei diesen Zeilen die Jahre.
        </Alert>
      )}

      <div role="tablist" aria-label="Zeilen filtern" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {filters.map(([f, label]) => {
          const count = rows.filter((r) => matches(r, f)).length;
          if (f !== 'all' && count === 0) return null;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={activeFilter === f}
              onClick={() => {
                setFilter(f);
                setShown(PAGE);
              }}
              className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-inset transition-colors ${
                activeFilter === f ? 'bg-primary text-white ring-primary' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {label}
              <span className={`text-xs ${activeFilter === f ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label="Zeilen suchen"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          placeholder="Suchen, z. B. „Adobe“"
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {visible.some((r) => !r.problem) && (
          <div className="flex gap-2">
            <TargetSelect<Target | ''>
              value={bulkTarget}
              onChange={setBulkTarget}
              context={context}
              placeholder={`Alle ${affected.length} gefundenen ändern auf …`}
              label="Zuordnung für alle angezeigten Zeilen"
              className="sm:w-64"
            />
            <Button variant="secondary" onClick={applyBulk} disabled={!bulkTarget}>
              Ändern
            </Button>
          </div>
        )}
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200" data-testid="import-review-list">
        {visible.slice(0, shown).map((r) => (
          <ReviewItem key={r.id} row={r} kind={kinds.get(r.id)!} isKU={isKU} context={context} onChange={(patch) => onChange(r.id, patch)} />
        ))}
        {visible.length === 0 && <li className="py-10 text-center text-sm text-slate-500">Keine Zeilen in dieser Ansicht.</li>}
      </ul>
      {visible.length > shown && (
        <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
          Weitere {Math.min(PAGE, visible.length - shown)} anzeigen
        </Button>
      )}

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">{total === 1 ? '1 Eintrag' : `${total} Einträge`}</span> werden übernommen
          {summary.skipped > 0 && `, ${summary.skipped} nicht`}.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onBack} disabled={saving}>
            Zurück
          </Button>
          <Button onClick={onImport} loading={saving} disabled={total === 0} data-testid="import-submit">
            Jetzt übernehmen
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, count, total }: { label: ReactNode; count: number; total: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatEuro(total)}</p>
      <p className="text-xs text-slate-500">{count === 1 ? '1 Eintrag' : `${count} Einträge`}</p>
    </div>
  );
}

function ReviewItem({
  row: r,
  kind,
  isKU,
  context,
  onChange,
}: {
  row: ReviewRow;
  kind: EntryKind;
  isKU: boolean;
  context: CategoryContext;
  onChange: (patch: Partial<ReviewRow>) => void;
}) {
  const disabled = !!r.problem;
  const included = r.include && !disabled && kind !== 'skip';
  const badge = KIND_BADGE[kind];
  const spreadable = canSpread(r, isKU);
  return (
    <li className={`grid gap-3 p-4 sm:grid-cols-[auto_1fr_minmax(0,240px)] sm:items-start ${included ? '' : 'bg-slate-50'}`}>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
        checked={included}
        disabled={disabled || kind === 'skip'}
        onChange={(e) => onChange({ include: e.target.checked })}
        aria-label={`${r.description || 'Zeile ' + r.line} übernehmen`}
      />
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className={`min-w-0 truncate font-medium ${included ? 'text-slate-900' : 'text-slate-500'}`}>{r.description || '(ohne Beschreibung)'}</p>
          <p className={`font-semibold tabular-nums ${kind === 'income' ? 'text-primary-800' : 'text-slate-900'}`}>
            {kind === 'income' ? '+' : '−'} {formatEuro(r.amount)}
          </p>
        </div>
        <p className="text-xs text-slate-500">
          {r.date ? formatDate(r.date.iso) : r.dateText || 'ohne Datum'} · Zeile {r.line}
          {r.category && ` · „${r.category}“`}
          {!isKU && kind !== 'svs' && kind !== 'skip' && ` · ${effectiveVat(r, isKU)} % USt`}
          {r.reference && ` · ${r.reference}`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {r.duplicate && <Badge tone="warning">Gibt es schon in Klaro</Badge>}
          {r.unclear && !r.problem && <Badge tone="warning">Kategorie unklar</Badge>}
        </div>
        {r.problem && <p className="text-sm text-red-700">{r.problem}</p>}
        {r.duplicate && !r.problem && (
          <p className="text-sm text-slate-600">Gleiches Datum, gleicher Betrag – deshalb abgewählt. Hak an, falls es doch ein eigener Eintrag ist.</p>
        )}
        {r.note && !r.problem && <p className="text-sm text-slate-600">{r.note}</p>}
        {r.reason && !r.problem && kind !== 'skip' && <p className="text-xs text-slate-500">Vorschlag: {r.reason}</p>}
        {r.unclear && !r.problem && (
          <p className="text-sm text-slate-600">Klaro hat keine passende Kategorie erkannt – bitte rechts auswählen.</p>
        )}
        {spreadable && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              checked={r.spread}
              onChange={(e) => onChange({ spread: e.target.checked })}
            />
            Über 1.000 € und mehrere Jahre genutzt – auf mehrere Jahre verteilen
          </label>
        )}
        {context.profitMethod === 'pauschal' && findCategoryById(targetCategoryId(r.target) ?? '')?.pauschalOnlyReimbursed && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              checked={r.reimbursed}
              onChange={(e) => onChange({ reimbursed: e.target.checked })}
            />
            An Kund:innen weiterverrechnet – nur dann zählt es neben der Pauschale
          </label>
        )}
        {kind === 'asset' && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Nutzungsdauer
            <select
              value={r.usefulLife}
              onChange={(e) => onChange({ usefulLife: Number(e.target.value) })}
              className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {LIFE_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y} Jahre
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!disabled && (
        <TargetSelect
          value={r.target}
          context={context}
          label={`Zuordnung für ${r.description || 'Zeile ' + r.line}`}
          onChange={(target: Target) => onChange({ target, note: null, reason: null, unclear: false, include: target !== 'skip' && !r.duplicate })}
        />
      )}
    </li>
  );
}
