import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { formatDate, toISODate } from '@/lib/invoices';
import { formatEuro, parseDecimal, round2 } from '@/lib/money';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Term } from '@/components/ui/Tooltip';
import type { Quarter, SvsPayment, SvsPaymentInsert } from '@/types';

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export function SvsPaymentsSection({
  year,
  payments,
  onAdd,
  onDelete,
}: {
  year: number;
  payments: SvsPayment[];
  onAdd: (p: SvsPaymentInsert) => Promise<{ error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}) {
  const today = toISODate(new Date());
  const currentQuarter = QUARTERS[Math.floor(new Date().getMonth() / 3)]!;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [quarter, setQuarter] = useState<Quarter>(currentQuarter);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = parseDecimal(amount);
    if (Number.isNaN(value) || value <= 0) return setError('Bitte gib einen Betrag größer 0 ein.');
    setSaving(true);
    const result = await onAdd({ amount: round2(value), quarter, year, payment_date: date });
    setSaving(false);
    if (result.error) return void toast.error(result.error);
    toast.success('SVS-Beitrag erfasst');
    setAmount('');
    setError(null);
    setOpen(false);
  }

  return (
    <section className="space-y-3" aria-labelledby="svs-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="svs-heading" className="text-lg font-semibold text-slate-900">
            <Term k="svs">SVS-Beiträge</Term> {year}
          </h2>
          <p className="text-sm text-slate-600">Bezahlt: {formatEuro(total)}</p>
        </div>
        {!open && (
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            SVS-Beitrag erfassen
          </Button>
        )}
      </div>
      <Alert type="info">SVS-Beiträge sind immer absetzbar – auch bei Pauschalierung.</Alert>

      {open && (
        <form onSubmit={handleSubmit} noValidate className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-4 sm:items-start">
          <Field label="Betrag (€)" inputMode="decimal" placeholder="z. B. 482,43" value={amount} error={error ?? undefined} onChange={(e) => setAmount(e.target.value)} />
          <Select label="Quartal" value={quarter} options={QUARTERS.map((q) => ({ value: q, label: `${q} ${year}` }))} onChange={(e) => setQuarter(e.target.value as Quarter)} />
          <Field label="Bezahlt am" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="flex gap-2 sm:pt-6">
            <Button type="submit" loading={saving} className="flex-1">
              Speichern
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}

      {payments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Noch keine SVS-Beiträge für {year} erfasst.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3 pl-4 pr-2 sm:pl-5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {p.quarter ?? 'SVS'} {p.year}
                </p>
                <p className="text-xs text-slate-500">bezahlt am {formatDate(p.payment_date)}</p>
              </div>
              <span className="font-semibold tabular-nums text-slate-900">{formatEuro(Number(p.amount))}</span>
              <button
                type="button"
                aria-label={`SVS-Beitrag ${p.quarter ?? ''} löschen`}
                onClick={async () => {
                  const r = await onDelete(p.id);
                  if (r.error) toast.error(r.error);
                  else toast.success('SVS-Beitrag gelöscht');
                }}
                className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
