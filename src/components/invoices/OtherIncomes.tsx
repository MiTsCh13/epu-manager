import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { searchAndSort, type ListSort } from '@/lib/expenses';
import { formatDate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { BulkBar, SelectAll } from '@/components/ui/BulkBar';
import { Button } from '@/components/ui/Button';
import { ListControls } from '@/components/ui/ListControls';
import { Modal } from '@/components/ui/Modal';
import type { Income } from '@/types';

/** Einnahmen ohne Klaro-Rechnung (aus Excel übernommen) eines Jahres – zählen wie bezahlte Rechnungen. */
export function OtherIncomes({
  incomes,
  year,
  isKU,
  onDelete,
}: {
  incomes: Income[]; // bereits auf das Jahr gefiltert
  year: number;
  isKU: boolean;
  onDelete: (ids: string[]) => Promise<{ error: string | null }>;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ListSort>('date-desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => searchAndSort(incomes, query, sort, (i) => ({ date: i.income_date, amount: Number(i.amount), texts: [i.description, i.reference] })),
    [incomes, query, sort],
  );
  const total = incomes.reduce((s, i) => s + Number(i.amount_net ?? i.amount), 0);
  // Nur ausgewählte UND sichtbare Einträge – nie etwas, das die Suche gerade ausblendet
  const ids = visible.filter((i) => selected.has(i.id)).map((i) => i.id);
  // Wie die Überschrift: netto, wenn vorhanden
  const sumOf = (list: string[]) => incomes.filter((i) => list.includes(i.id)).reduce((s, i) => s + Number(i.amount_net ?? i.amount), 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    const { error } = await onDelete(deleting);
    setBusy(false);
    if (error) toast.error(error);
    else toast.success(deleting.length === 1 ? 'Einnahme gelöscht' : `${deleting.length} Einnahmen gelöscht`);
    setSelected((s) => new Set([...s].filter((id) => !deleting.includes(id))));
    setDeleting(null);
  }

  if (incomes.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="other-incomes-heading">
      <div>
        <h2 id="other-incomes-heading" className="text-lg font-semibold text-slate-900">
          Weitere Einnahmen {year}: {formatEuro(total)}
          {isKU ? '' : ' netto'}
        </h2>
        <p className="text-sm text-slate-600">Ohne Klaro-Rechnung, z. B. aus Excel übernommen. Sie zählen wie bezahlte Rechnungen.</p>
      </div>
      <ListControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} placeholder="Beschreibung oder Betrag" />
      <SelectAll
        total={visible.length}
        selected={visible.filter((i) => selected.has(i.id)).length}
        onChange={(all) =>
          setSelected((s) => {
            const next = new Set(s);
            for (const i of visible) {
              if (all) next.add(i.id);
              else next.delete(i.id);
            }
            return next;
          })
        }
      />
      {visible.length === 0 ? (
        <p className="rounded-2xl bg-white py-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">Nichts gefunden.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200" data-testid="other-incomes">
          {visible.map((i) => (
            <li key={i.id} className={`flex items-center gap-3 py-3 pl-4 pr-2 sm:pl-5 ${selected.has(i.id) ? 'bg-primary-50/60' : ''}`}>
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary"
                checked={selected.has(i.id)}
                onChange={() => toggle(i.id)}
                aria-label={`${i.description || 'Einnahme'} auswählen`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{i.description || 'Einnahme'}</p>
                <p className="truncate text-xs text-slate-500">
                  {formatDate(i.income_date)}
                  {i.reference && ` · ${i.reference}`}
                </p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums text-slate-900">{formatEuro(Number(i.amount))}</p>
              <button
                type="button"
                title="Löschen"
                aria-label={`${i.description || 'Einnahme'} löschen`}
                onClick={() => setDeleting([i.id])}
                className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <BulkBar count={ids.length} summary={`Summe ${formatEuro(sumOf(ids))}${isKU ? '' : ' netto'}`} onClear={() => setSelected(new Set())}>
        <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(ids)} className="min-h-[40px] py-2">
          Löschen
        </Button>
      </BulkBar>

      <Modal
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        size="sm"
        title={deleting?.length === 1 ? 'Einnahme löschen?' : `${deleting?.length ?? 0} Einnahmen löschen?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void handleDelete()}>
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          {deleting?.length === 1 ? 'Die Einnahme' : 'Die ausgewählten Einnahmen'} über {formatEuro(sumOf(deleting ?? []))}
          {isKU ? '' : ' netto'} {deleting?.length === 1 ? 'wird' : 'werden'} gelöscht.
        </p>
      </Modal>
    </section>
  );
}
