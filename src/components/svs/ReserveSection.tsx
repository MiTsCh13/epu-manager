import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfilePatch } from '@/hooks/useProfilePatch';
import { formatEuro } from '@/lib/money';
import type { Payee, SvsTrackerModel } from '@/lib/svsTracker';
import { Button } from '@/components/ui/Button';
import { InfoTip } from '@/components/ui/Tooltip';
import { Money, PayeeTag, StepCard } from './parts';

/** 4 · Rücklage: alles, was noch offen ist – getrennt nach SVS und Finanzamt. */
export function ReserveSection({ model }: { model: SvsTrackerModel }) {
  const { profile } = useAuth();
  const patch = useProfilePatch();
  const [busy, setBusy] = useState(false);
  const { reserve, year, previous, full } = model;
  const prevYear = year - 1;

  async function markAssessed(value: number | null) {
    setBusy(true);
    await patch({ assessed_through_year: value }, value ? `${prevYear} ist erledigt` : `${prevYear} wieder offen`);
    setBusy(false);
  }

  const group = (payee: Payee, title: string, sum: number) => {
    const items = reserve.items.filter((i) => i.payee === payee);
    if (!items.length) return null;
    return (
      <div>
        <h3 className="pb-1 pt-2">
          <PayeeTag payee={payee} />
          <span className="sr-only">{title}</span>
        </h3>
        {items.map((i) => (
          <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-slate-100 py-2.5">
            <span className="text-slate-700">
              {i.label}
              <span className="block text-xs text-slate-500">{i.note}</span>
            </span>
            <span className={`whitespace-nowrap tabular-nums ${i.amount < 0 ? 'text-primary-700' : 'text-slate-900'}`}>
              <Money value={i.amount} />
            </span>
          </div>
        ))}
        <div className="flex justify-between py-2 text-sm text-slate-500">
          <span>Summe {title}</span>
          <span className="tabular-nums">
            <Money value={sum} />
          </span>
        </div>
      </div>
    );
  };

  return (
    <StepCard id="ruecklage" step={4} eyebrow="Rücklage" title="Was du zur Seite legen solltest">
      <p className="-mt-2 text-sm text-slate-600">Alles, was für {previous ? `${prevYear} und ${year}` : year} noch auf dich zukommt.</p>

      <div className="max-w-xl">
        {group('svs', 'SVS', reserve.svs)}
        {group('finanzamt', 'Finanzamt', reserve.finanzamt)}
        <div className="mt-1 flex items-baseline justify-between border-t-2 border-slate-900 pt-3">
          <span className="font-semibold text-slate-900">Rücklage gesamt</span>
          <span className="text-2xl font-bold tabular-nums text-primary-800" data-testid="reserve-total">
            <Money value={reserve.total} />
          </span>
        </div>
      </div>

      {model.remaining !== null && (
        <p className="text-sm text-slate-600">
          Nach SVS und Einkommensteuer bleiben dir {year} voraussichtlich{' '}
          <strong className="tabular-nums text-slate-900">{formatEuro(model.remaining, true)}</strong>.
          <InfoTip
            content={`Umsatz ${formatEuro(full.revenue, true)} − Ausgaben ${formatEuro(full.expenses, true)} − SVS endgültig ${formatEuro(model.svs.final.total, true)} − Einkommensteuer ${formatEuro(full.incomeTax, true)}`}
          />
        </p>
      )}

      {previous ? (
        <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Ist dein Steuerbescheid {prevYear} schon da und sind Steuer und SVS-Nachzahlung für {prevYear} bezahlt?
          </span>
          <Button variant="secondary" loading={busy} onClick={() => void markAssessed(prevYear)}>
            Ja, {prevYear} ist erledigt
          </Button>
        </div>
      ) : (
        profile?.assessed_through_year === prevYear && (
          <p className="text-xs text-slate-500">
            {prevYear} ist als erledigt markiert.{' '}
            <button type="button" className="font-medium text-primary hover:underline" disabled={busy} onClick={() => void markAssessed(prevYear - 1)}>
              Rückgängig
            </button>
          </p>
        )
      )}
    </StepCard>
  );
}
