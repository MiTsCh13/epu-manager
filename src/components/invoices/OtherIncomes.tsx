import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Trash2, Upload } from 'lucide-react';
import { formatDate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Income } from '@/types';

/** Einnahmen ohne Klaro-Rechnung (aus Excel übernommen) – zählen wie bezahlte Rechnungen. */
export function OtherIncomes({
  incomes,
  isKU,
  onDelete,
}: {
  incomes: Income[];
  isKU: boolean;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}) {
  const years = [...new Set(incomes.map((i) => Number(i.income_date.slice(0, 4))))].sort((a, b) => b - a);
  const [picked, setYear] = useState(() => years[0] ?? new Date().getFullYear());
  // Nach dem Löschen des letzten Eintrags eines Jahres auf ein Jahr mit Einträgen wechseln
  const year = years.includes(picked) ? picked : (years[0] ?? picked);
  const [deleting, setDeleting] = useState<Income | null>(null);
  const [busy, setBusy] = useState(false);
  const visible = incomes.filter((i) => Number(i.income_date.slice(0, 4)) === year);
  const total = visible.reduce((s, i) => s + Number(i.amount_net ?? i.amount), 0);

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    const { error } = await onDelete(deleting.id);
    setBusy(false);
    if (error) toast.error(error);
    else toast.success('Einnahme gelöscht');
    setDeleting(null);
  }

  return (
    <section className="space-y-3" aria-labelledby="other-incomes-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="other-incomes-heading" className="text-lg font-semibold text-slate-900">
            Weitere Einnahmen
          </h2>
          <p className="text-sm text-slate-600">
            Ohne Klaro-Rechnung, z. B. aus Excel übernommen. Sie zählen wie bezahlte Rechnungen.
          </p>
        </div>
        <Link to="/importieren" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Aus Excel übernehmen
        </Link>
      </div>
      {incomes.length > 0 && (
        <>
          {years.length > 1 && (
            <div role="tablist" aria-label="Jahr" className="flex gap-2">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  role="tab"
                  aria-selected={year === y}
                  onClick={() => setYear(y)}
                  className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium ring-1 ring-inset ${
                    year === y ? 'bg-primary text-white ring-primary' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
          <p className="text-sm text-slate-600">
            {year}: {formatEuro(total)}
            {isKU ? '' : ' netto'}
          </p>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200" data-testid="other-incomes">
            {visible.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3 pl-4 pr-2 sm:pl-5">
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
                  onClick={() => setDeleting(i)}
                  className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        size="sm"
        title="Einnahme löschen?"
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
          „{deleting?.description || 'Einnahme'}“ über {deleting && formatEuro(Number(deleting.amount))} wird gelöscht.
        </p>
      </Modal>
    </section>
  );
}
