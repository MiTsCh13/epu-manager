import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, XCircle } from 'lucide-react';
import { PHASE_INFO } from '@/constants/svsPhases';
import { formatDate, toISODate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import type { SvsTrackerModel } from '@/lib/svsTracker';
import { Term } from '@/components/ui/Tooltip';
import { ThresholdMeter } from './ThresholdMeter';

const PHASE_BORDER = { year1_2: 'border-l-primary', year3: 'border-l-amber-500', year4plus: 'border-l-amber-500' } as const;

/** Kompakter SVS-Status fürs Dashboard (Farbe je Phase). */
export function SVSDashboardCard({ model, year }: { model: SvsTrackerModel; year: number }) {
  const { warning } = model;
  const showWarning = model.phase !== 'year1_2' && warning.hasWarning;
  const WarnIcon = warning.urgency === 'critical' ? XCircle : AlertTriangle;
  return (
    <section aria-labelledby="svs-card-heading" className={`rounded-2xl border-l-4 bg-white p-5 ring-1 ring-slate-200 sm:p-6 ${PHASE_BORDER[model.phase]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="svs-card-heading" className="text-lg font-semibold text-slate-900">
            Dein <Term k="svs">SVS-Status</Term>
          </h2>
          <p className="mt-1 text-sm text-slate-700" data-testid="svs-card-text">
            Du bist in <strong>SVS-Jahr {model.svsYear}</strong> ({PHASE_INFO[model.phase].title}). Deine nächste{' '}
            <Term k="vorschreibung" />: <strong className="tabular-nums">{formatEuro(model.quarterlyAmount)}</strong> am{' '}
            <strong>{formatDate(toISODate(model.nextDue))}</strong>.
          </p>
        </div>
        <Link to="/gewinn" className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
          Details
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-5">
        <ThresholdMeter
          label={`Berechnungsbasis ${year} (Gewinn vor SVS)`}
          current={model.basisYtd}
          projected={model.projection.projected}
          thresholds={[
            { value: model.thresholds.svs, label: 'SVS-Pflicht' },
            { value: model.thresholds.incomeTax, label: 'Einkommensteuer' },
          ]}
          max={Math.max(model.projection.high, model.thresholds.incomeTax * 1.25)}
        />
      </div>

      {showWarning && (
        <p
          className={`mt-2 flex gap-2 rounded-lg p-3 text-sm ring-1 ring-inset ${
            warning.urgency === 'critical' ? 'bg-red-50 text-red-900 ring-red-200' : 'bg-amber-50 text-amber-900 ring-amber-200'
          }`}
        >
          <WarnIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Mögliche <Term k="nachbemessung">Nachzahlung</Term>: <strong className="tabular-nums">{formatEuro(warning.estimatedNachzahlung, true)}</strong>.
            Stelle sicher, dass du genug zurückgelegt hast.
          </span>
        </p>
      )}
    </section>
  );
}
