// Gemeinsame Bausteine der Seite „Gewinn & Rücklagen“.
import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import { formatDecimalInput, formatEuro, parseDecimal, round2 } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

/** Nummerierter Abschnitt – die Nummer zeigt die Rechenreihenfolge (1 → 5). */
export function StepCard({ id, step, eyebrow, title, children }: { id?: string; step: number; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`step-${step}-heading`} className="scroll-mt-20 space-y-5 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 text-[11px] tracking-normal ring-1 ring-primary-100" aria-hidden="true">
            {step}
          </span>
          {eyebrow}
        </p>
        <h2 id={`step-${step}-heading`} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** Überleitung zwischen zwei Abschnitten. */
export function Bridge({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 px-1 text-sm text-slate-600">
      <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Rechenzeile „Bezeichnung … Betrag“ mit optionalem Rechenzeichen. */
export function SumLine({
  op,
  label,
  sub,
  amount,
  total,
  testId,
}: {
  op?: '−' | '=' | '+';
  label: ReactNode;
  sub?: ReactNode;
  amount: ReactNode;
  total?: boolean;
  testId?: string;
}) {
  return (
    <div className={`grid grid-cols-[1rem_minmax(0,1fr)_auto] items-baseline gap-x-2 py-2.5 ${total ? 'border-t-2 border-slate-900' : 'border-b border-slate-100'}`}>
      <span className="text-center font-semibold text-slate-400" aria-hidden="true">
        {op}
      </span>
      <span className={total ? 'font-semibold text-slate-900' : 'text-slate-700'}>
        {label}
        {sub && <span className="block text-xs font-normal text-slate-500">{sub}</span>}
      </span>
      <span className={`whitespace-nowrap text-right tabular-nums ${total ? 'text-base font-semibold text-slate-900' : 'text-slate-900'}`} data-testid={testId}>
        {amount}
      </span>
    </div>
  );
}

/** Betrag als „€ 1.234“ bzw. „− € 1.234“ für Gutschriften. */
export function Money({ value }: { value: number }) {
  return <>{value < 0 ? `− ${formatEuro(Math.abs(value), true)}` : formatEuro(value, true)}</>;
}

/** Kleines Formular für einen Euro-Betrag (Leer = zurücksetzen, wenn `allowEmpty`). */
export function AmountForm({
  label,
  hint,
  initial,
  allowEmpty,
  onSave,
  onCancel,
}: {
  label: string;
  hint?: ReactNode;
  initial: number | null;
  allowEmpty?: boolean;
  onSave: (value: number | null) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial === null ? '' : formatDecimalInput(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const empty = value.trim() === '';
    const amount = empty ? null : parseDecimal(value);
    if ((empty && !allowEmpty) || (amount !== null && (Number.isNaN(amount) || amount < 0))) {
      setError('Bitte gib einen gültigen Betrag ein.');
      return;
    }
    setSaving(true);
    const ok = await onSave(amount === null ? null : round2(amount));
    setSaving(false);
    if (ok) onCancel();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-end">
      <Field
        className="flex-1"
        label={label}
        inputMode="decimal"
        autoFocus
        value={value}
        hint={hint}
        error={error ?? undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      <div className={`flex gap-2 ${hint || error ? 'sm:pb-6' : ''}`}>
        <Button type="submit" loading={saving}>
          Speichern
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

/** Kennzeichnung, wer etwas verlangt (SVS / Finanzamt) – in Rücklage und Zeitplan gleich. */
export function PayeeTag({ payee }: { payee: 'svs' | 'finanzamt' }) {
  return (
    <span
      className={`mr-1.5 inline-block rounded px-1.5 py-px align-[1px] text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
        payee === 'svs' ? 'text-orange-700 ring-orange-200' : 'text-violet-700 ring-violet-200'
      }`}
    >
      {payee === 'svs' ? 'SVS' : 'Finanzamt'}
    </span>
  );
}
