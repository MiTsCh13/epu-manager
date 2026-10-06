import { useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { EXPENSE_CATEGORIES, isCategoryOffered, type CategoryContext } from '@/constants/expenseCategories';
import { searchAndSort, type ListSort } from '@/lib/expenses';
import { formatEuro } from '@/lib/money';
import { sumDeductibleExpenses } from '@/lib/profit';
import { BulkBar, SelectAll } from '@/components/ui/BulkBar';
import { Button } from '@/components/ui/Button';
import { filterSelectClass, ListControls } from '@/components/ui/ListControls';
import { Modal } from '@/components/ui/Modal';
import { ExpenseList } from './ExpenseList';
import type { Expense } from '@/types';

/** Ausgaben-Liste mit Suche, Kategorie-Filter, Sortierung und Massenbearbeitung (Kategorie ändern, löschen). */
export function ExpenseBrowser({
  expenses,
  context,
  counts,
  empty,
  onEdit,
  onDelete,
  onRecategorize,
  onDeleteMany,
}: {
  expenses: Expense[];
  context: CategoryContext;
  counts?: (e: Expense) => boolean;
  empty: ReactNode; // wenn es gar keine Ausgaben gibt
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onRecategorize: (ids: string[], categoryId: string) => Promise<{ changed: number; skipped: { description: string; reason: string }[]; error: string | null }>;
  onDeleteMany: (ids: string[]) => Promise<{ error: string | null }>;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ListSort>('date-desc');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categories = useMemo(() => [...new Set(expenses.map((e) => e.category_label))].sort((a, b) => a.localeCompare(b)), [expenses]);
  const visible = useMemo(
    () =>
      searchAndSort(
        expenses.filter((e) => !category || e.category_label === category),
        query,
        sort,
        (e) => ({ date: e.expense_date, amount: Number(e.amount), texts: [e.description, e.category_label] }),
      ),
    [expenses, category, query, sort],
  );
  // Massenaktionen nur für ausgewählte UND sichtbare Einträge – nie für etwas, das ein Filter gerade ausblendet
  const chosen = visible.filter((e) => selected.has(e.id));
  const ids = chosen.map((e) => e.id);
  const selectedTotal = chosen.reduce((s, e) => s + Number(e.amount), 0);
  // Was davon den Gewinn senkt – bei Pauschalierung nur, was zusätzlich zählt
  const selectedDeductible = sumDeductibleExpenses(
    (counts ? chosen.filter(counts) : chosen).map((e) => ({
      amount: Number(e.amount),
      deductible_amount: e.deductible_amount == null ? null : Number(e.deductible_amount),
      is_bewirtung: e.is_bewirtung,
    })),
  );
  const bulkTargets = EXPENSE_CATEGORIES.filter((c) => !c.calc && isCategoryOffered(c, context));
  const visibleSelected = ids.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function applyCategory() {
    if (!bulkCategory) return;
    setBusy(true);
    const r = await onRecategorize(ids, bulkCategory);
    setBusy(false);
    if (r.error) toast.error(r.error);
    if (r.changed > 0) toast.success(r.changed === 1 ? '1 Ausgabe geändert' : `${r.changed} Ausgaben geändert`);
    if (r.skipped.length > 0) {
      toast(`${r.skipped.length} nicht geändert – bitte einzeln bearbeiten: ${r.skipped.slice(0, 3).map((s) => `„${s.description}“ (${s.reason})`).join(', ')}${r.skipped.length > 3 ? ' …' : ''}`, {
        duration: 8000,
      });
    }
    setSelected(new Set());
    setBulkCategory('');
  }

  async function deleteSelected() {
    setBusy(true);
    const r = await onDeleteMany(ids);
    setBusy(false);
    setConfirmDelete(false);
    if (r.error) return void toast.error(r.error);
    toast.success(ids.length === 1 ? 'Ausgabe gelöscht' : `${ids.length} Ausgaben gelöscht`);
    setSelected(new Set());
  }

  if (expenses.length === 0) return <>{empty}</>;

  return (
    <div className="space-y-3">
      <ListControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} placeholder="Beschreibung, Kategorie oder Betrag">
        <select aria-label="Kategorie filtern" value={category} onChange={(e) => setCategory(e.target.value)} className={filterSelectClass}>
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </ListControls>
      <div className="flex items-center justify-between gap-2">
        <SelectAll
          total={visible.length}
          selected={visibleSelected}
          onChange={(all) =>
            setSelected((s) => {
              const next = new Set(s);
              for (const e of visible) {
                if (all) next.add(e.id);
                else next.delete(e.id);
              }
              return next;
            })
          }
        />
        {(query || category) && (
          <p className="text-sm text-slate-600">
            {visible.length} von {expenses.length} · {formatEuro(visible.reduce((s, e) => s + Number(e.amount), 0))}
          </p>
        )}
      </div>
      {visible.length > 0 ? (
        <ExpenseList expenses={visible} counts={counts} selected={selected} onToggle={toggle} onEdit={onEdit} onDelete={onDelete} />
      ) : (
        <p className="rounded-2xl bg-white py-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">Nichts gefunden.</p>
      )}

      <BulkBar
        count={ids.length}
        summary={
          <>
            Summe {formatEuro(selectedTotal)}
            {Math.abs(selectedDeductible - selectedTotal) >= 0.005 && (
              <>
                <span className="hidden sm:inline"> · </span>
                <span className="block sm:inline">absetzbar {formatEuro(selectedDeductible)}</span>
              </>
            )}
          </>
        }
        onClear={() => setSelected(new Set())}
      >
        <select
          aria-label="Neue Kategorie für die Auswahl"
          value={bulkCategory}
          onChange={(e) => setBulkCategory(e.target.value)}
          disabled={busy}
          className="min-h-[40px] min-w-0 flex-1 rounded-lg border-0 bg-white px-2 text-sm text-slate-900 sm:w-52 sm:flex-none"
        >
          <option value="">Kategorie ändern …</option>
          {bulkTargets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <Button onClick={() => void applyCategory()} disabled={!bulkCategory} loading={busy && !confirmDelete} className="min-h-[40px] py-2">
          Ändern
        </Button>
        <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)} disabled={busy} className="min-h-[40px] py-2">
          Löschen
        </Button>
      </BulkBar>

      <Modal
        open={confirmDelete}
        onClose={() => !busy && setConfirmDelete(false)}
        size="sm"
        title={ids.length === 1 ? '1 Ausgabe löschen?' : `${ids.length} Ausgaben löschen?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void deleteSelected()}>
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Die ausgewählten Ausgaben über insgesamt {formatEuro(selectedTotal)} werden gelöscht – inklusive Belegen. Das lässt
          sich nicht rückgängig machen.
        </p>
      </Modal>
    </div>
  );
}
