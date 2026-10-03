import { Lightbulb, PiggyBank } from 'lucide-react';
import { formatEuro } from '@/lib/money';
import { InfoTip, Term } from '@/components/ui/Tooltip';
import type { SvsTrackerModel } from '@/lib/svsTracker';

/** „Was du zurücklegen solltest“ – konkrete €-Empfehlung + Aufschlüsselung. */
export function ReserveCard({ model, year }: { model: SvsTrackerModel; year: number }) {
  const { reserve, reserveOpen } = model;
  const percent = Math.round(reserve.perInvoiceRate * 100);
  const base = model.revenueProjected > 0 ? model.revenueProjected : model.projection.projected;

  return (
    <section id="ruecklage" aria-labelledby="reserve-heading" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 id="reserve-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <PiggyBank className="h-5 w-5 text-primary" aria-hidden="true" />
        Was du zurücklegen solltest
      </h2>

      <p className="mt-4 text-slate-700">Von deinen nächsten Einnahmen:</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2">
        <span className="text-5xl font-bold tabular-nums text-primary-800" data-testid="reserve-rate">
          {percent} %
        </span>
        <span className="text-slate-600">zur Seite legen</span>
        <InfoTip
          label="Warum dieser Prozentsatz?"
          content={
            <>
              <strong>Warum {percent} %?</strong>
              <br />
              {model.revenueProjected > 0 ? `Hochgerechnet nimmst du ${year} ca. ${formatEuro(base, true)} ein.` : `Dein Gewinn ${year} liegt hochgerechnet bei ca. ${formatEuro(base, true)}.`}{' '}
              Darauf fallen voraussichtlich {formatEuro(reserve.svsAmount, true)} SVS und {formatEuro(reserve.incomeTaxAmount, true)} Einkommensteuer an –
              zusammen {formatEuro(reserve.totalReserve, true)}. Das sind {percent} % {model.revenueProjected > 0 ? 'deiner Einnahmen' : 'deines Gewinns'} (aufgerundet, damit du auf der sicheren Seite bist).
            </>
          }
        />
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">
            <Term k="svs">SVS</Term> {year} (erwartet)
          </dt>
          <dd className="text-lg font-semibold tabular-nums text-slate-900">{formatEuro(reserve.svsAmount, true)}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">Einkommensteuer {year} (ca.)</dt>
          <dd className="text-lg font-semibold tabular-nums text-slate-900">{formatEuro(reserve.incomeTaxAmount, true)}</dd>
        </div>
        <div className="rounded-xl bg-primary-50 p-3 ring-1 ring-primary-100">
          <dt className="text-xs text-primary-900">Noch zurückzulegen</dt>
          <dd className="text-lg font-semibold tabular-nums text-primary-900" data-testid="reserve-open">
            {formatEuro(reserveOpen, true)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        Gesamt {formatEuro(reserve.totalReserve, true)} für {year}, davon {formatEuro(reserve.totalReserve - reserveOpen, true)} SVS
        bereits bezahlt. Die Steuer ist vereinfacht geschätzt (ohne andere Einkünfte).
      </p>

      <p className="mt-4 flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        Am einfachsten: Richte ein separates Verrechnungskonto ein und überweise den Anteil gleich nach jedem
        Zahlungseingang.
      </p>
    </section>
  );
}
