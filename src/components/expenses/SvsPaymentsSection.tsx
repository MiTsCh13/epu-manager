import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDate, toISODate } from '@/lib/invoices';
import { formatDecimalInput, formatEuro, parseDecimal, round2 } from '@/lib/money';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Term } from '@/components/ui/Tooltip';
import type { Quarter, SvsPayment, SvsPaymentInsert } from '@/types';

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

/** Bezahlt in einem anderen Jahr → der Beitrag steht dort (SVS zählt im Jahr der Zahlung). */
const savedMessage = (text: string, paymentDate: string, year: number) =>
  Number(paymentDate.slice(0, 4)) === year ? text : `${text} – zählt für ${paymentDate.slice(0, 4)} und steht dort`;

const label = (p: SvsPayment) => `${p.quarter ?? 'SVS'} ${p.year} über ${formatEuro(Number(p.amount))}`;

type Values = Pick<SvsPaymentInsert, 'amount' | 'quarter' | 'year' | 'payment_date' | 'notes'>;

export function SvsPaymentsSection({
  year,
  payments,
  onAdd,
  onUpdate,
  onDelete,
}: {
  year: number;
  payments: SvsPayment[];
  onAdd: (p: SvsPaymentInsert) => Promise<{ error: string | null }>;
  onUpdate: (id: string, p: Values) => Promise<{ error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}) {
  // 'new' = neuer Beitrag, sonst der Beitrag, der gerade bearbeitet wird
  const [editing, setEditing] = useState<SvsPayment | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SvsPayment | null>(null);
  const [busy, setBusy] = useState(false);

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <section className="space-y-3" aria-labelledby="svs-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="svs-heading" className="text-lg font-semibold text-slate-900">
            <Term k="svs">SVS-Beiträge</Term> {year}
          </h2>
          <p className="text-sm text-slate-600">Bezahlt: {formatEuro(total)}</p>
        </div>
        {editing !== 'new' && (
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            SVS-Beitrag erfassen
          </Button>
        )}
      </div>
      <Alert type="info">
        SVS-Beiträge sind immer absetzbar – auch bei Pauschalierung. Sie zählen im Jahr, in dem du sie bezahlst: Q4 {year - 1}, bezahlt im Jänner {year},
        mindert deinen Gewinn {year}.
      </Alert>

      {editing === 'new' && (
        <SvsForm
          key="new"
          year={year}
          payment={null}
          onCancel={() => setEditing(null)}
          onSave={async (values) => {
            const r = await onAdd(values);
            if (r.error) return void toast.error(r.error);
            toast.success(savedMessage('SVS-Beitrag erfasst', values.payment_date, year));
            setEditing(null);
          }}
        />
      )}

      {payments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Noch keine SVS-Beiträge {year} bezahlt.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200" data-testid="svs-list">
          {payments.map((p) =>
            editing !== 'new' && editing?.id === p.id ? (
              <li key={p.id} className="p-2">
                <SvsForm
                  key={p.id}
                  year={year}
                  payment={p}
                  onCancel={() => setEditing(null)}
                  onSave={async (values) => {
                    const r = await onUpdate(p.id, values);
                    if (r.error) return void toast.error(r.error);
                    toast.success(savedMessage('SVS-Beitrag gespeichert', values.payment_date, year));
                    setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={p.id} className="flex items-center gap-1 py-1 pl-1 pr-2">
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  aria-label={`SVS-Beitrag ${label(p)} bearbeiten`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 sm:px-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">
                      {p.quarter ?? 'SVS'} {p.year}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      bezahlt am {formatDate(p.payment_date)}
                      {Number(p.payment_date.slice(0, 4)) !== p.year && ` · zählt für ${p.payment_date.slice(0, 4)}`}
                      {p.notes && ` · ${p.notes}`}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{formatEuro(Number(p.amount))}</span>
                  <Pencil className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`SVS-Beitrag ${label(p)} löschen`}
                  onClick={() => setDeleting(p)}
                  className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <Modal
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        size="sm"
        title="SVS-Beitrag löschen?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!deleting) return;
                setBusy(true);
                const r = await onDelete(deleting.id);
                setBusy(false);
                if (r.error) return void toast.error(r.error);
                toast.success('SVS-Beitrag gelöscht');
                setDeleting(null);
              }}
            >
              Löschen
            </Button>
          </>
        }
      >
        {deleting && (
          <p className="text-sm text-slate-700">
            {deleting.quarter ?? 'SVS'} {deleting.year} über {formatEuro(Number(deleting.amount))}, bezahlt am {formatDate(deleting.payment_date)}.
          </p>
        )}
      </Modal>
    </section>
  );
}

/** Quartale des Vorjahres und des Jahres („Q4 2025“ kann im Jänner 2026 bezahlt werden), plus der bisherige Wert. */
function periodOptions(year: number, payment: SvsPayment | null) {
  const options = [year - 1, year].flatMap((y) => QUARTERS.map((q) => ({ value: `${q}|${y}`, label: `${q} ${y}` })));
  if (payment && !options.some((o) => o.value === `${payment.quarter ?? ''}|${payment.year}`)) {
    options.push({ value: `${payment.quarter ?? ''}|${payment.year}`, label: payment.quarter ? `${payment.quarter} ${payment.year}` : `${payment.year} (ohne Quartal)` });
  }
  return options;
}

/** Formular für einen neuen oder einen bestehenden SVS-Beitrag. */
function SvsForm({
  year,
  payment,
  onSave,
  onCancel,
}: {
  year: number;
  payment: SvsPayment | null;
  onSave: (v: Values) => Promise<void>;
  onCancel: () => void;
}) {
  const today = toISODate(new Date());
  const currentQuarter = QUARTERS[Math.floor(new Date().getMonth() / 3)]!;
  const [amount, setAmount] = useState(payment ? formatDecimalInput(Number(payment.amount)) : '');
  // Wofür der Beitrag ist: Quartal + Jahr (gezählt wird nach dem Zahlungsdatum). Ohne Quartal z. B. Nachzahlung aus dem Import.
  const [period, setPeriod] = useState(payment ? `${payment.quarter ?? ''}|${payment.year}` : `${currentQuarter}|${year}`);
  // Neuer Beitrag in einem früheren Jahr: Datum selbst eingeben (heute läge im falschen Jahr)
  const [date, setDate] = useState(payment?.payment_date ?? (today.startsWith(String(year)) ? today : ''));
  const [notes, setNotes] = useState(payment?.notes ?? '');
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = parseDecimal(amount);
    const next = {
      amount: Number.isNaN(value) || value <= 0 ? 'Bitte gib einen Betrag größer 0 ein.' : value >= 1_000_000 ? 'Der Betrag ist zu hoch.' : undefined,
      // Ein schon gespeichertes Datum in der Zukunft (z. B. aus dem Import) blockiert andere Änderungen nicht
      date: !date ? 'Bitte gib das Zahlungsdatum ein.' : date > today && date !== payment?.payment_date ? 'Das Datum liegt in der Zukunft.' : undefined,
    };
    setErrors(next);
    if (next.amount || next.date) return;
    setSaving(true);
    const [quarter, periodYear] = period.split('|');
    await onSave({ amount: round2(value), quarter: (quarter as Quarter) || null, year: Number(periodYear), payment_date: date, notes: notes.trim() || null });
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={payment ? 'SVS-Beitrag bearbeiten' : 'SVS-Beitrag erfassen'}
      className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-3 sm:items-start"
    >
      <Field autoFocus label="Betrag (€)" inputMode="decimal" placeholder="z. B. 482,43" value={amount} error={errors.amount} onChange={(e) => setAmount(e.target.value)} />
      <Select
        label="Beitrag für"
        value={period}
        options={periodOptions(year, payment)}
        onChange={(e) => setPeriod(e.target.value)}
      />
      <Field label="Bezahlt am" type="date" max={date > today ? date : today} value={date} error={errors.date} onChange={(e) => setDate(e.target.value)} />
      <Field className="sm:col-span-2" label="Notiz" optional placeholder="z. B. Nachzahlung 2025" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2 sm:pt-6">
        <Button type="submit" loading={saving} className="flex-1">
          Speichern
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
