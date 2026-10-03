import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSvsTracker } from '@/hooks/useSvsTracker';
import { formatEuro } from '@/lib/money';
import { toISODate, formatDate } from '@/lib/invoices';
import { PHASE_INFO } from '@/constants/svsPhases';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { NachzahlungsRadar } from '@/components/svs/NachzahlungsRadar';
import { ReserveCard } from '@/components/svs/ReserveCard';
import { ThresholdMeter } from '@/components/svs/ThresholdMeter';
import { YearBreakdown } from '@/components/svs/YearBreakdown';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Term } from '@/components/ui/Tooltip';


const ALERT_TYPE = { info: 'info', warning: 'warning', critical: 'critical' } as const;

export default function SVSTracker() {
  const { profile } = useAuth();
  const { model, year, current, loading, error, reload } = useSvsTracker();
  const { hash } = useLocation();

  // Sprungmarken (z. B. #ruecklage vom Dashboard) erst nach dem Laden anspringen
  useEffect(() => {
    if (!loading && model && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [loading, model, hash]);

  return (
    <PageWrapper title="Gewinn & Rücklagen" description="Was dir nach SVS und Steuer wirklich bleibt – und was du zur Seite legen solltest.">
      {loading || !model ? (
        <div className="flex justify-center py-20 text-primary" role="status" aria-label="Wird berechnet">
          <Spinner className="h-8 w-8" />
        </div>
      ) : error ? (
        <div className="space-y-3">
          <Alert type="critical">{error}</Alert>
          <Button variant="secondary" onClick={() => void reload()}>
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {model.alerts.length > 0 && (
            <div className="space-y-2" aria-label="Hinweise">
              {model.alerts.map((a) => (
                <Alert key={a.id} type={ALERT_TYPE[a.urgency]}>
                  {a.message}
                </Alert>
              ))}
            </div>
          )}

          {!profile?.svs_registration_date && (
            <Alert type="warning">
              Dein Anmeldedatum bei der SVS fehlt – ohne kann Klaro deine Phase nicht bestimmen.{' '}
              <Link to="/einstellungen" className="font-semibold underline">
                In den Einstellungen ergänzen
              </Link>
            </Alert>
          )}

          <YearBreakdown ytd={model.breakdown.ytd} projected={model.breakdown.projected} year={year} pauschal={profile?.profit_method === 'pauschal'} />

          {/* SVS-Jahr, Fälligkeit, Fortschritt */}
          <section aria-labelledby="phase-heading" className="space-y-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm text-slate-500">
                  Dein Status bei der <Term k="svs" />
                </p>
                <h2 id="phase-heading" className="mt-0.5 text-2xl font-bold text-slate-900" data-testid="svs-year">
                  SVS-Jahr {model.svsYear}
                </h2>
                <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${PHASE_INFO[model.phase].tone}`}>
                  {PHASE_INFO[model.phase].title}
                </span>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{PHASE_INFO[model.phase].text}</p>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 lg:min-w-[16rem]">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm text-slate-600">
                    Nächste <Term k="vorschreibung" />
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{formatEuro(model.quarterlyAmount)}</p>
                  <p className="text-sm text-slate-600">fällig am {formatDate(toISODate(model.nextDue))}</p>
                </div>
              </div>
            </div>

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

            {profile?.is_kleinunternehmer && (
              <ThresholdMeter
                label={`Umsatz ${year} (Kleinunternehmergrenze)`}
                current={current.revenueGross}
                projected={model.revenueProjected}
                thresholds={[{ value: model.thresholds.kleinunternehmer, label: 'USt-Pflicht' }]}
                max={Math.max(model.thresholds.kleinunternehmer * 1.15, model.revenueProjected * 1.05)}
              />
            )}
          </section>

          <ReserveCard model={model} year={year} />
          <NachzahlungsRadar model={model} />

          <p className="text-xs leading-relaxed text-slate-500">
            Alle Werte sind Schätzungen auf Basis deiner erfassten Rechnungen, Ausgaben und SVS-Beiträge (Werte 2026). Sie
            ersetzen keine Steuerberatung.
          </p>
        </div>
      )}
    </PageWrapper>
  );
}
