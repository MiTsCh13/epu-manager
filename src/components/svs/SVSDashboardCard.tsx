import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { PHASE_INFO } from '@/constants/svsPhases';
import { formatDate, toISODate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import type { SvsTrackerModel } from '@/lib/svsTracker';
import { Term } from '@/components/ui/Tooltip';

const PHASE_BORDER = { year1_2: 'border-l-primary', year3: 'border-l-amber-500', year4plus: 'border-l-amber-500' } as const;

/** Kompakter Stand bei SVS und Finanzamt fürs Dashboard – Details auf „Gewinn & Rücklagen“. */
export function SVSDashboardCard({ model }: { model: SvsTrackerModel }) {
  const { svs, incomeTax, year } = model;
  const nachzahlung = !svs.notInsured && svs.difference >= 1;
  return (
    <section aria-labelledby="svs-card-heading" className={`rounded-2xl border-l-4 bg-white p-5 ring-1 ring-slate-200 sm:p-6 ${PHASE_BORDER[model.phase]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="svs-card-heading" className="text-lg font-semibold text-slate-900">
          <Term k="svs" /> & Einkommensteuer {year}
        </h2>
        <Link to="/gewinn" className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
          Details
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-700" data-testid="svs-card-text">
        Du bist im <strong>{model.svsYear}. Jahr</strong> bei der SVS ({PHASE_INFO[model.phase].title}). Nächste <Term k="vorschreibung" />:{' '}
        <strong className="tabular-nums">{formatEuro(svs.quarterlyAmount)}</strong> am <strong>{formatDate(toISODate(svs.nextDue))}</strong>.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={`rounded-xl p-3 ${nachzahlung ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'bg-slate-50'}`}>
          <dt className="flex items-center gap-1.5 text-xs text-slate-600">
            {nachzahlung && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />}
            SVS-{svs.difference >= 0 ? 'Nachzahlung' : 'Gutschrift'} für {year}
          </dt>
          <dd className="text-lg font-semibold tabular-nums text-slate-900">ca. {formatEuro(Math.abs(svs.notInsured ? 0 : svs.difference), true)}</dd>
          <dd className="text-xs text-slate-500">kommt nach deinem Steuerbescheid {year}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-600">Einkommensteuer {year}, noch offen</dt>
          <dd className="text-lg font-semibold tabular-nums text-slate-900">ca. {formatEuro(Math.max(incomeTax.open, 0), true)}</dd>
          <dd className="text-xs text-slate-500">{incomeTax.prepaymentTotal > 0 ? 'nach deinen Vorauszahlungen' : `nach deinem Steuerbescheid ${year}`}</dd>
        </div>
      </dl>
    </section>
  );
}
