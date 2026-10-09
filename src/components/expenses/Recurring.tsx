// Wiederkehrende Ausgaben: Kennzeichen, fällige Zahlungen, Verwaltung der Serien und Felder fürs Ausgaben-Formular.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Pause, Pencil, Play, Repeat, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { findCategoryByLabel, EXPENSE_CATEGORIES, isCategoryOffered } from '@/constants/expenseCategories';
import { VAT_RATES } from '@/constants/tax2026';
import { categoryContextFor, computeExpenseValues, entryKind, validateExpenseForm, type ExpenseFormInput } from '@/lib/expenses';
import { formatDate } from '@/lib/invoices';
import { formatDecimalInput, formatEuro, round2 } from '@/lib/money';
import {
  catchUpCount,
  dueDates,
  endDateNow,
  INTERVAL_LABELS,
  INTERVALS,
  intervalLabel,
  monthlyAverage,
  rescheduleNextDate,
  resumeNextDate,
  seriesStatus,
  type IntervalMonths,
} from '@/lib/recurring';
import { bookAllDue, bookNext, deleteSeries, skipNext, todayIso, updateSeries } from '@/lib/recurringSync';
import type { DueSeries } from '@/hooks/useRecurring';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Field, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { RecurringExpense, VatRate } from '@/types';

// ─── Kennzeichen ────────────────────────────────────────────

/** „↻ monatlich“ – für Listen und Karten. */
export function RecurringTag({ interval, className = '' }: { interval: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap font-medium text-primary-800 ${className}`} title="Wiederkehrende Ausgabe">
      <Repeat className="h-3 w-3" aria-hidden="true" />
      {intervalLabel(interval)}
    </span>
  );
}

function StatusBadges({ s }: { s: RecurringExpense }) {
  const status = seriesStatus(s);
  return (
    <>
      {status === 'paused' && <Badge tone="warning">pausiert</Badge>}
      {status === 'ended' && <Badge>beendet</Badge>}
      {status === 'active' && s.auto_book && <Badge tone="success">automatisch</Badge>}
    </>
  );
}

// ─── Fällige Zahlungen ──────────────────────────────────────

/**
 * Fällige Zahlungen von Serien ohne „automatisch buchen“: übernehmen, anpassen (übernehmen und gleich bearbeiten)
 * oder überspringen. Pro Serie steht der älteste offene Termin oben.
 */
export function RecurringDueList({
  due,
  onChanged,
  onAdjust,
}: {
  due: DueSeries[];
  onChanged: () => void | Promise<void>;
  /** Übernommene Zahlung gleich bearbeiten (Betrag geändert o. Ä.) */
  onAdjust: (expenseId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (due.length === 0) return null;
  const total = due.reduce((n, d) => n + d.dates.length, 0);

  const run = async (key: string, action: () => Promise<{ error: string | null }>, success: string) => {
    setBusy(key);
    const r = await action();
    if (r.error) toast.error(r.error);
    else toast.success(success);
    await onChanged();
    setBusy(null);
  };

  async function bookAll() {
    setBusy('all');
    let booked = 0;
    let failed = false;
    for (const d of due) {
      const r = await bookAllDue(d.series);
      if (r.error) failed = true;
      else booked += d.dates.length;
    }
    if (failed) toast.error('Nicht alle Zahlungen konnten übernommen werden.');
    if (booked > 0) toast.success(booked === 1 ? '1 Zahlung übernommen' : `${booked} Zahlungen übernommen`);
    await onChanged();
    setBusy(null);
  }

  return (
    <section aria-labelledby="recurring-due-heading" className="rounded-2xl border-l-4 border-l-primary bg-white p-4 ring-1 ring-slate-200 sm:p-5" data-testid="recurring-due">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="recurring-due-heading" className="font-semibold text-slate-900">
            Fällige wiederkehrende Ausgaben ({total})
          </h2>
          <p className="text-sm text-slate-600">Hast du sie bezahlt? Dann übernimm sie in deine Ausgaben.</p>
        </div>
        {total > 1 && (
          <Button variant="secondary" onClick={() => void bookAll()} loading={busy === 'all'} disabled={!!busy}>
            Alle übernehmen
          </Button>
        )}
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {due.map(({ series: s, dates }) => (
          <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{s.description || s.category_label}</p>
              <p className="text-xs text-slate-500">
                fällig am {formatDate(dates[0])} · <RecurringTag interval={s.interval_months} />
                {dates.length > 1 && ` · danach noch ${dates.length - 1} weitere`}
              </p>
            </div>
            <p className="font-semibold tabular-nums text-slate-900 sm:w-28 sm:text-right">{formatEuro(Number(s.amount))}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-[40px] py-2"
                loading={busy === `book-${s.id}`}
                disabled={!!busy}
                onClick={() => void run(`book-${s.id}`, () => bookNext(s), 'Zahlung übernommen')}
                aria-label={`${s.description} am ${formatDate(dates[0])} übernehmen`}
              >
                Übernehmen
              </Button>
              <Button
                variant="secondary"
                className="min-h-[40px] py-2"
                loading={busy === `adjust-${s.id}`}
                disabled={!!busy}
                title="Übernehmen und gleich bearbeiten, z. B. wenn sich der Betrag geändert hat"
                onClick={async () => {
                  setBusy(`adjust-${s.id}`);
                  const r = await bookNext(s);
                  await onChanged();
                  setBusy(null);
                  if (r.error) toast.error(r.error);
                  else if (r.id) onAdjust(r.id);
                }}
              >
                Anpassen
              </Button>
              <Button
                variant="ghost"
                className="min-h-[40px] py-2"
                loading={busy === `skip-${s.id}`}
                disabled={!!busy}
                title="Diesmal nicht bezahlt – Klaro bucht nichts"
                onClick={() => void run(`skip-${s.id}`, () => skipNext(s), 'Zahlung übersprungen')}
              >
                Überspringen
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Alle Serien verwalten ──────────────────────────────────

/**
 * Alle Serien mit Pausieren, Fortsetzen, Bearbeiten, Löschen. Als eigener Bereich (Pauschalierung) oder `inTab`
 * im Reiter „Wiederkehrend“ – dann ohne eigene Überschrift.
 */
export function RecurringSection({ series, onChanged, inTab = false }: { series: RecurringExpense[]; onChanged: () => void | Promise<void>; inTab?: boolean }) {
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [removing, setRemoving] = useState<RecurringExpense | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (series.length === 0) return null;
  const perMonth = monthlyAverage(series.map((s) => ({ ...s, amount: Number(s.amount) })));
  const today = todayIso();

  const change = async (s: RecurringExpense, values: Parameters<typeof updateSeries>[1], success: string) => {
    setBusy(s.id);
    const r = await updateSeries(s.id, values);
    if (r.error) toast.error(r.error);
    else toast.success(success);
    await onChanged();
    setBusy(null);
  };

  return (
    <section {...(inTab ? {} : { id: 'wiederkehrend', 'aria-labelledby': 'recurring-heading' })} className="space-y-3">
      <div>
        {!inTab && (
          <h2 id="recurring-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Repeat className="h-5 w-5 text-primary" aria-hidden="true" />
            Wiederkehrende Ausgaben
          </h2>
        )}
        <p className="text-sm text-slate-600">
          Laufend ca. <strong className="tabular-nums text-slate-900">{formatEuro(perMonth)}</strong> pro Monat. In der Hochrechnung zählt
          Klaro sie genau – mit allen Zahlungen bis Jahresende.
        </p>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200" data-testid="recurring-list">
        {series.map((s) => {
          const status = seriesStatus(s);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 pl-4 pr-2 sm:pl-5">
              <button type="button" onClick={() => setEditing(s)} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline" aria-label={`Serie ${s.description} bearbeiten`}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-slate-900">{s.description || s.category_label}</span>
                  <StatusBadges s={s} />
                </p>
                <p className="text-xs text-slate-500">
                  <RecurringTag interval={s.interval_months} /> · {s.category_label} ·{' '}
                  {status === 'ended'
                    ? `bis ${formatDate(s.end_date)}`
                    : status === 'paused'
                      ? 'keine Vorschläge, bis du fortsetzt'
                      : `nächste am ${formatDate(s.next_date)}${s.end_date ? ` · bis ${formatDate(s.end_date)}` : ''}`}
                </p>
              </button>
              <p className="shrink-0 font-semibold tabular-nums text-slate-900">{formatEuro(Number(s.amount))}</p>
              <div className="flex shrink-0">
                {status !== 'ended' && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    title={status === 'paused' ? 'Fortsetzen' : 'Pausieren'}
                    aria-label={`${s.description} ${status === 'paused' ? 'fortsetzen' : 'pausieren'}`}
                    onClick={() =>
                      void (status === 'paused'
                        ? change(s, { paused: false, next_date: resumeNextDate(s, today) }, 'Serie läuft wieder')
                        : change(s, { paused: true }, 'Serie pausiert'))
                    }
                    className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                  >
                    {status === 'paused' ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
                  </button>
                )}
                <button type="button" title="Bearbeiten" aria-label={`Serie ${s.description} bearbeiten`} onClick={() => setEditing(s)} className="hidden h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:flex">
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" title="Beenden oder löschen" aria-label={`Serie ${s.description} beenden oder löschen`} onClick={() => setRemoving(s)} className="flex h-10 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <SeriesFormModal
        key={editing?.id ?? 'edit-none'}
        series={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await onChanged();
        }}
      />
      <RemoveSeriesModal
        key={removing?.id ?? 'remove-none'}
        series={removing}
        onClose={() => setRemoving(null)}
        onDone={async () => {
          setRemoving(null);
          await onChanged();
        }}
      />
    </section>
  );
}

/** Beenden (Zahlungen bleiben) oder ganz löschen – optional samt allen Zahlungen. */
function RemoveSeriesModal({ series, onClose, onDone }: { series: RecurringExpense | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [choice, setChoice] = useState<'end' | 'delete' | 'delete-all'>('end');
  const [busy, setBusy] = useState(false);
  const ended = series ? seriesStatus(series) === 'ended' : false;
  const openDue = series ? dueDates(series, todayIso()).length : 0;
  const selected = ended && choice === 'end' ? 'delete' : choice;

  async function confirm() {
    if (!series) return;
    setBusy(true);
    const r =
      selected === 'end'
        ? await updateSeries(series.id, { end_date: endDateNow(series), paused: false })
        : await deleteSeries(series.id, selected === 'delete-all');
    setBusy(false);
    if (r.error) return void toast.error(r.error);
    toast.success(selected === 'end' ? 'Serie beendet' : selected === 'delete-all' ? 'Serie und Zahlungen gelöscht' : 'Serie gelöscht');
    setChoice('end');
    await onDone();
  }

  return (
    <Modal
      open={!!series}
      onClose={() => !busy && onClose()}
      size="sm"
      title={ended ? 'Serie löschen?' : 'Serie beenden oder löschen?'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant={selected === 'end' ? 'primary' : 'danger'} loading={busy} onClick={() => void confirm()}>
            {selected === 'end' ? 'Beenden' : 'Löschen'}
          </Button>
        </>
      }
    >
      <ChoiceCards<'end' | 'delete' | 'delete-all'>
        legend={`„${series?.description ?? ''}“`}
        name="remove-series"
        value={selected}
        onChange={setChoice}
        options={[
          ...(ended ? [] : [{ value: 'end' as const, title: 'Beenden', description: 'Keine weiteren Zahlungen. Bisherige bleiben, die Serie bleibt sichtbar.' }]),
          { value: 'delete' as const, title: 'Serie löschen', description: 'Bisherige Zahlungen bleiben als normale Ausgaben.' },
          { value: 'delete-all' as const, title: 'Serie und alle Zahlungen löschen', description: 'Auch alle schon gebuchten Zahlungen samt Belegen. Nicht rückgängig zu machen.' },
        ]}
      />
      {openDue > 0 && selected !== 'delete-all' && (
        <p className="mt-3 text-sm text-slate-700">
          {openDue === 1 ? '1 fällige Zahlung ist' : `${openDue} fällige Zahlungen sind`} noch nicht übernommen – Klaro schlägt sie dann nicht mehr vor.
        </p>
      )}
      {selected === 'delete' && (
        <p className="mt-3 text-sm text-slate-600">
          Tipp: Beenden ist meist besser. Gelöschte Serien rechnet Klaro in der Jahres-Hochrechnung wie einmalige Ausgaben hoch.
        </p>
      )}
    </Modal>
  );
}

const KEEP = '';

/** Serie bearbeiten: gilt nur für künftige Zahlungen – bisherige bleiben, wie sie sind. */
function SeriesFormModal({ series, onClose, onSaved }: { series: RecurringExpense | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { profile } = useAuth();
  const isKU = profile?.is_kleinunternehmer ?? true;
  const context = categoryContextFor(profile);
  const [form, setForm] = useState(() => ({
    // '' = bisherige Kategorie unverändert lassen (auch wenn es sie so nicht mehr gibt)
    categoryId: KEEP,
    amount: series ? formatDecimalInput(Number(series.amount)) : '',
    vatRate: (series?.amount_net ? Math.round((Number(series.amount) / Number(series.amount_net) - 1) * 100) : 0) as VatRate,
    description: series?.description ?? '',
    interval: (series?.interval_months ?? 1) as IntervalMonths,
    endDate: series?.end_date ?? '',
    auto: series?.auto_book ?? false,
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!series) return null;

  const current = findCategoryByLabel(series.category_label);
  const categories = EXPENSE_CATEGORIES.filter((c) => !c.calc && isCategoryOffered(c, context) && c.id !== current?.id);
  const input: ExpenseFormInput = {
    categoryId: form.categoryId === KEEP ? (current?.id ?? 'sonstiges') : form.categoryId,
    amount: form.amount,
    km: '',
    hours: '',
    nights: '',
    reimbursed: series.reimbursed,
    vatRate: (VAT_RATES as readonly number[]).includes(form.vatRate) ? form.vatRate : 20,
    date: series.start_date,
    description: form.description,
    spread: false,
    usefulLife: '',
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!series) return;
    const errs = validateExpenseForm(input, '9999-12-31', isKU);
    if (errs.amount || errs.categoryId) return setError(errs.amount ?? errs.categoryId ?? null);
    if (entryKind(input, isKU) !== 'expense') return setError('Über 1.000 € ist das eine Anlage – die erfasst du einzeln, nicht als Serie.');
    if (form.endDate && form.endDate < series.start_date) return setError(`Das Enddatum liegt vor der ersten Zahlung (${formatDate(series.start_date)}).`);
    const computed = computeExpenseValues(input, isKU);
    // Kategorie nicht geändert: Kategorie, Kennzahl und absetzbaren Anteil von der Serie übernehmen
    const oldBase = Number(series.amount_net ?? series.amount);
    const v =
      form.categoryId === KEEP
        ? {
            ...computed,
            category_label: series.category_label,
            e1a_kz: series.e1a_kz,
            is_bewirtung: series.is_bewirtung,
            reimbursed: series.reimbursed,
            deductible_amount: round2(Number(computed.amount_net ?? computed.amount) * (oldBase > 0 ? Number(series.deductible_amount) / oldBase : 1)),
          }
        : computed;
    // Termine: neues Intervall → neu einteilen; war die Serie beendet und läuft jetzt wieder → nichts nachholen
    let nextDate = form.interval === series.interval_months ? series.next_date : rescheduleNextDate(series, form.interval);
    const endDate = form.endDate || null;
    const wasEnded = seriesStatus(series) === 'ended';
    if (wasEnded && (!endDate || endDate >= nextDate)) nextDate = resumeNextDate({ ...series, interval_months: form.interval, next_date: nextDate }, todayIso());
    setSaving(true);
    const r = await updateSeries(series.id, {
      description: form.description.trim() || v.category_label,
      category_label: v.category_label,
      e1a_kz: v.e1a_kz,
      amount: v.amount,
      amount_net: v.amount_net,
      deductible_amount: v.deductible_amount,
      is_bewirtung: v.is_bewirtung,
      reimbursed: v.reimbursed,
      interval_months: form.interval,
      next_date: nextDate,
      end_date: endDate,
      auto_book: form.auto,
    });
    setSaving(false);
    if (r.error) return void toast.error(r.error);
    toast.success('Serie gespeichert – gilt für die nächsten Zahlungen');
    await onSaved();
  }

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Wiederkehrende Ausgabe bearbeiten"
      description="Änderungen gelten ab der nächsten Zahlung. Schon gebuchte Zahlungen bleiben, wie sie sind."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" form="series-form" loading={saving}>
            Speichern
          </Button>
        </>
      }
    >
      <form id="series-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Beschreibung" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Select
          label="Kategorie"
          value={form.categoryId}
          options={[{ value: KEEP, label: series.category_label }, ...categories.map((c) => ({ value: c.id, label: c.label }))]}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Betrag (brutto, €)" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          {!isKU && (
            <Select
              label="Enthaltene USt"
              value={String(form.vatRate)}
              options={VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` }))}
              onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) as VatRate })}
            />
          )}
        </div>
        <IntervalAndEnd
          interval={form.interval}
          endDate={form.endDate}
          minEnd={series.start_date}
          auto={form.auto}
          onChange={(p) => setForm({ ...form, ...p })}
        />
        {error && <Alert type="critical">{error}</Alert>}
      </form>
    </Modal>
  );
}

// ─── Felder im Ausgaben-Formular ────────────────────────────

export interface RecurringChoice {
  on: boolean;
  interval: IntervalMonths;
  endDate: string; // '' = ohne Ende
  auto: boolean;
}

export const NO_RECURRING: RecurringChoice = { on: false, interval: 1, endDate: '', auto: false };

/** Wiederkehrend-Teil eines Formulars: Ende-Fehler oder null. */
export function validateRecurringChoice(c: RecurringChoice, startDate: string): string | null {
  if (!c.on || !c.endDate || !startDate) return null;
  return c.endDate < startDate ? 'Das Enddatum liegt vor dieser Zahlung.' : null;
}

function IntervalAndEnd({
  interval,
  endDate,
  minEnd,
  auto,
  error,
  onChange,
}: {
  interval: IntervalMonths;
  endDate: string;
  minEnd: string;
  auto: boolean;
  error?: string;
  onChange: (p: Partial<{ interval: IntervalMonths; endDate: string; auto: boolean }>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Wie oft?"
          value={String(interval)}
          options={INTERVALS.map((m) => ({ value: String(m), label: INTERVAL_LABELS[m].replace(/^./, (c) => c.toUpperCase()) }))}
          onChange={(e) => onChange({ interval: Number(e.target.value) as IntervalMonths })}
        />
        <Field label="Läuft bis" optional type="date" min={minEnd} value={endDate} error={error} onChange={(e) => onChange({ endDate: e.target.value })} />
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={auto} onChange={(e) => onChange({ auto: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary" />
        <span>
          <span className="font-medium text-slate-900">Automatisch buchen</span>
          <span className="block text-slate-600">
            Klaro trägt jede Zahlung am Fälligkeitstag selbst ein. Ohne Haken fragt Klaro dich vorher – sinnvoll, wenn sich der Betrag ändern kann.
          </span>
        </span>
      </label>
    </>
  );
}

/** Checkbox „Wiederkehrende Ausgabe“ mit Intervall, Ende und „automatisch buchen“. */
export function RecurringFields({
  value,
  onChange,
  startDate,
  error,
}: {
  value: RecurringChoice;
  onChange: (v: RecurringChoice) => void;
  startDate: string;
  error?: string;
}) {
  const today = todayIso();
  const catchUp = value.on && startDate && startDate <= today ? catchUpCount(startDate, value.interval, value.endDate || null, today) : 0;
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3">
      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-900">
        <input
          type="checkbox"
          checked={value.on}
          onChange={(e) => onChange({ ...value, on: e.target.checked })}
          className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
        />
        <Repeat className="h-4 w-4 text-primary" aria-hidden="true" />
        Wiederkehrende Ausgabe
      </label>
      {value.on && (
        <>
          <IntervalAndEnd
            interval={value.interval}
            endDate={value.endDate}
            minEnd={startDate}
            auto={value.auto}
            error={error}
            onChange={(p) => onChange({ ...value, ...p })}
          />
          {catchUp > 0 && (
            <p className="text-sm text-slate-700" data-testid="recurring-catch-up">
              Seit {formatDate(startDate)} {catchUp === 1 ? 'ist schon 1 weitere Zahlung' : `sind schon ${catchUp} weitere Zahlungen`} fällig.{' '}
              {value.auto ? 'Klaro bucht sie gleich nach dem Speichern.' : 'Klaro schlägt sie dir gleich nach dem Speichern vor.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Übersicht ──────────────────────────────────────────────

/** Karte in der Übersicht: was als Nächstes abgebucht wird, und ungefähr pro Monat. */
export function RecurringOverviewCard({ series }: { series: RecurringExpense[] }) {
  const active = series.filter((s) => seriesStatus(s) === 'active');
  if (active.length === 0) return null;
  const perMonth = monthlyAverage(active.map((s) => ({ ...s, amount: Number(s.amount) })));
  const next = [...active].sort((a, b) => a.next_date.localeCompare(b.next_date)).slice(0, 4);
  return (
    <section aria-labelledby="recurring-card-heading" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6" data-testid="recurring-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="recurring-card-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Repeat className="h-5 w-5 text-primary" aria-hidden="true" />
            Wiederkehrende Ausgaben
          </h2>
          <p className="text-sm text-slate-600">
            {active.length} laufend · ca. <strong className="tabular-nums text-slate-900">{formatEuro(perMonth)}</strong> pro Monat
          </p>
        </div>
        <Link to="/ausgaben#wiederkehrend" className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
          Alle ansehen
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {next.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-20 shrink-0 tabular-nums text-slate-500">{formatDate(s.next_date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-900">{s.description || s.category_label}</span>
              <span className="text-xs text-slate-500">
                <RecurringTag interval={s.interval_months} />
                {s.auto_book && ' · bucht automatisch'}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatEuro(Number(s.amount))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
