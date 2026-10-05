import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Undo2 } from 'lucide-react';
import { listImports, undoImport } from '@/lib/importData';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { ImportRecord } from '@/types';

type Counts = Partial<Record<'incomes' | 'expenses' | 'assets' | 'svs_payments', number>>;

export function describeCounts(summary: unknown): string {
  const c = (summary ?? {}) as Counts;
  const parts = [
    [c.incomes, 'Einnahme', 'Einnahmen'],
    [c.expenses, 'Ausgabe', 'Ausgaben'],
    [c.assets, 'Anlage', 'Anlagen'],
    [c.svs_payments, 'SVS-Beitrag', 'SVS-Beiträge'],
  ] as const;
  return parts.filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(', ') || 'keine Einträge';
}

const dateTime = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' });

/** Bisherige Importe mit „Rückgängig machen“. `refreshKey` erhöhen, um neu zu laden. */
export function ImportHistory({ refreshKey }: { refreshKey: number }) {
  const [imports, setImports] = useState<ImportRecord[] | null>(null);
  const [undoing, setUndoing] = useState<ImportRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setImports(await listImports());
    } catch {
      setImports([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleUndo() {
    if (!undoing) return;
    setBusy(true);
    const { error } = await undoImport(undoing.id);
    setBusy(false);
    if (error) return void toast.error(error);
    toast.success('Import rückgängig gemacht');
    setUndoing(null);
    void load();
  }

  if (!imports || imports.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="import-history-heading">
      <h2 id="import-history-heading" className="text-lg font-semibold text-slate-900">
        Bisherige Importe
      </h2>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        {imports.map((imp) => (
          <li key={imp.id} className="flex items-center gap-3 py-3 pl-4 pr-2 sm:pl-5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{imp.source_name || 'Import'}</p>
              <p className="truncate text-xs text-slate-500">
                {dateTime.format(new Date(imp.created_at))} · {describeCounts(imp.summary)}
              </p>
            </div>
            <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => setUndoing(imp)}>
              Rückgängig
            </Button>
          </li>
        ))}
      </ul>

      <Modal
        open={!!undoing}
        onClose={() => !busy && setUndoing(null)}
        size="sm"
        title="Import rückgängig machen?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUndoing(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void handleUndo()}>
              Rückgängig machen
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Alle Einträge aus „{undoing?.source_name || 'Import'}“ werden gelöscht ({describeCounts(undoing?.summary)}) – auch
          wenn du sie inzwischen bearbeitet hast. Alles, was du selbst erfasst hast, bleibt.
        </p>
      </Modal>
    </section>
  );
}
