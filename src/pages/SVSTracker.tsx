import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSvsTracker } from '@/hooks/useSvsTracker';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { IncomeTaxSection } from '@/components/svs/IncomeTaxSection';
import { PaymentTimeline } from '@/components/svs/PaymentTimeline';
import { Bridge } from '@/components/svs/parts';
import { ReserveSection } from '@/components/svs/ReserveSection';
import { SvsSection } from '@/components/svs/SvsSection';
import { YearBreakdown } from '@/components/svs/YearBreakdown';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatEuro } from '@/lib/money';

const ALERT_TYPE = { info: 'info', warning: 'warning', critical: 'critical' } as const;

/**
 * Gewinn & Rücklagen – in Rechenreihenfolge:
 * 1 Jahresrechnung → 2 SVS → 3 Einkommensteuer → 4 Rücklage → 5 Zeitplan.
 * Die Umsatzgrenze (Umsatzsteuer) gehört nicht hierher, sie steht auf der Übersicht.
 */
export default function SVSTracker() {
  const { profile } = useAuth();
  const { model, year, loading, error, reload } = useSvsTracker();
  const { hash } = useLocation();

  // Sprungmarken (z. B. #ruecklage vom Dashboard) erst nach dem Laden anspringen
  useEffect(() => {
    if (!loading && model && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [loading, model, hash]);

  const alerts = model?.alerts.filter((a) => !a.id.startsWith('ku-')) ?? [];

  return (
    <PageWrapper
      title="Gewinn & Rücklagen"
      description={`Was dir ${year} nach SVS und Einkommensteuer bleibt, was du zur Seite legen solltest und wann was fällig ist.`}
    >
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
        <div className="space-y-4">
          {alerts.map((a) => (
            <Alert key={a.id} type={ALERT_TYPE[a.urgency]}>
              {a.message}
            </Alert>
          ))}
          {!profile?.svs_registration_date && (
            <Alert type="warning">
              Dein Anmeldedatum bei der SVS fehlt – ohne kann Klaro nicht bestimmen, in welchem Jahr du bist.{' '}
              <Link to="/einstellungen#profil" className="font-semibold underline">
                In den Einstellungen ergänzen
              </Link>
            </Alert>
          )}

          <YearBreakdown model={model} />
          <Bridge>
            Aus deinen Einkünften berechnet die SVS ihre Beiträge – immer fürs ganze Jahr. Klaro nimmt dafür die Erwartung für {year} (
            {formatEuro(model.full.einkuenfte, true)}).
          </Bridge>
          <SvsSection model={model} />
          <Bridge>Unabhängig von der SVS verlangt das Finanzamt die Einkommensteuer:</Bridge>
          <IncomeTaxSection model={model} />
          <Bridge>Beides zusammen ergibt deine Rücklage:</Bridge>
          <ReserveSection model={model} />
          <Bridge>Diese Beträge kommen nicht auf einmal. Wann welcher fällig wird:</Bridge>
          <PaymentTimeline model={model} />

          <p className="px-1 text-xs leading-relaxed text-slate-500">
            Alle Werte sind Schätzungen mit den Werten {year} (SVS-Beitragssätze, Einkommensteuertarif, ohne Absetzbeträge). Sie ersetzen
            keine Steuerberatung.
          </p>
        </div>
      )}
    </PageWrapper>
  );
}
