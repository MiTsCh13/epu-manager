import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banknote, FilePlus, FileClock, PiggyBank, ReceiptEuro, ScanText, TrendingUp, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessState } from '@/lib/subscription';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useSvsTracker } from '@/hooks/useSvsTracker';
import { useRecurring } from '@/hooks/useRecurring';
import { openInvoicesSummary, topCategories } from '@/lib/dashboard';
import { toISODate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { periodLabel, resolvePeriod, revenueBuckets, type DateRange, type PeriodPreset } from '@/lib/period';
import { setPendingReceipt } from '@/lib/pendingReceipt';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { WindowReceiptDrop } from '@/components/expenses/ReceiptDrop';
import { RecurringDueList, RecurringOverviewCard } from '@/components/expenses/Recurring';
import { ExpenseDonut } from '@/components/dashboard/ExpenseDonut';
import { PeriodFilter } from '@/components/dashboard/PeriodFilter';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { StatCard } from '@/components/dashboard/StatCard';
import { SVSDashboardCard } from '@/components/svs/SVSDashboardCard';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

const actionClass =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

export default function Dashboard() {
  const { profile, profileFor } = useAuth();
  const svs = useSvsTracker();
  const recurring = useRecurring();
  const navigate = useNavigate();
  const receiptInput = useRef<HTMLInputElement>(null);
  // Beleg importieren: zu den Ausgaben wechseln, dort liest Klaro ihn sofort aus
  const importReceipt = (file: File) => {
    setPendingReceipt(file);
    navigate('/ausgaben');
  };
  const todayIso = toISODate(new Date());

  // Zeitraum für die Diagramme
  const [preset, setPreset] = useState<PeriodPreset>('last6m');
  const [custom, setCustom] = useState<DateRange>(() => resolvePeriod('thisMonth', new Date()));
  const range = useMemo(() => resolvePeriod(preset, new Date(todayIso), custom), [preset, custom, todayIso]);
  const dash = useDashboardData(range);

  const open = useMemo(() => openInvoicesSummary(dash.openInvoices, todayIso), [dash.openInvoices, todayIso]);
  const revenue = useMemo(() => revenueBuckets(dash.paidInRange, range), [dash.paidInRange, range]);
  const categories = useMemo(() => topCategories(dash.expensesInRange), [dash.expensesInRange]);
  const periodText = periodLabel(preset, range);

  const firstName = profile?.full_name?.split(' ')[0];
  const initialLoading = svs.loading || !svs.model;
  const error = svs.error ?? dash.error;

  const actions = (
    <>
      <Link to="/rechnungen/neu" className={`${actionClass} bg-primary text-white hover:bg-primary-800`}>
        <FilePlus className="h-4 w-4" aria-hidden="true" />
        Neue Rechnung
      </Link>
      <Link to="/ausgaben?neu" className={`${actionClass} bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`}>
        <ReceiptEuro className="h-4 w-4" aria-hidden="true" />
        Ausgabe erfassen
      </Link>
      <button
        type="button"
        onClick={() => receiptInput.current?.click()}
        title="Foto oder PDF – Klaro liest Betrag, Datum und Kategorie automatisch aus"
        className={`${actionClass} bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`}
      >
        <ScanText className="h-4 w-4" aria-hidden="true" />
        Beleg importieren
      </button>
      <input
        ref={receiptInput}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        data-testid="dashboard-receipt-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) importReceipt(f);
        }}
      />
      <Link to="/kunden?neu" className={`${actionClass} bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Kunde anlegen
      </Link>
    </>
  );

  return (
    <PageWrapper title="Übersicht" description={firstName ? `Hallo ${firstName}! So steht ${svs.year} gerade da.` : 'Was dir dieses Jahr wirklich bleibt.'} actions={actions}>
      {error ? (
        <div className="space-y-3">
          <Alert type="critical">{error}</Alert>
          <Button
            variant="secondary"
            onClick={() => {
              void svs.reload();
              void dash.reload();
            }}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : initialLoading || !svs.model ? (
        <div className="flex justify-center py-20 text-primary" role="status" aria-label="Übersicht wird geladen">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="space-y-6">
          {profile && getAccessState(profile).kind === 'expired' && (
            <Alert type="warning" title="Deine Testphase ist abgelaufen">
              Deine Daten bleiben sichtbar. Für neue Rechnungen brauchst du{' '}
              <Link to="/einstellungen" className="font-semibold underline">
                Klaro Pro (19 €/Monat)
              </Link>
              .
            </Alert>
          )}

          {/* Wichtige Hinweise: Umsatzgrenze, SVS-Fälligkeit, Ausnahme */}
          {svs.model.alerts.map((a) => (
            <Alert key={a.id} type={a.urgency}>
              {a.message}
            </Alert>
          ))}

          {/* Jede Kennzahl führt dorthin, wo genau diese Zahl wieder steht */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={`Einnahmen ${svs.year}`}
              value={formatEuro(svs.current.revenueNet, true)}
              sub="bezahlte Rechnungen, netto"
              icon={Banknote}
              to="/rechnungen?filter=paid"
              testId="stat-revenue"
            />
            <StatCard
              label="Offene Rechnungen"
              value={formatEuro(open.total, true)}
              sub={
                open.count === 0
                  ? 'alles bezahlt'
                  : `${open.count} ${open.count === 1 ? 'Rechnung' : 'Rechnungen'}${open.overdueCount ? ` · ${open.overdueCount} überfällig` : ''}`
              }
              icon={FileClock}
              to="/rechnungen?filter=open"
              testId="stat-open"
            />
            <StatCard
              label={`Erwartete Einkünfte ${svs.year}`}
              value={formatEuro(svs.model.full.einkuenfte, true)}
              sub="ganzes Jahr, vor Einkommensteuer"
              icon={TrendingUp}
              to="/gewinn"
              testId="stat-profit"
            />
            <StatCard
              label="Empfohlene Rücklage"
              value={formatEuro(svs.model.reserve.total, true)}
              sub="noch offen für SVS + Finanzamt"
              icon={PiggyBank}
              to="/gewinn#ruecklage"
              highlight
              testId="stat-reserve"
            />
          </div>

          <RecurringDueList
            due={recurring.due}
            onChanged={async () => {
              await Promise.all([recurring.reload(), svs.reload(), dash.reload()]);
            }}
            onAdjust={(id) => navigate(`/ausgaben?bearbeiten=${id}`)}
          />

          <SVSDashboardCard model={svs.model} />

          <RecurringOverviewCard series={recurring.series} />

          <section aria-label="Auswertung nach Zeitraum" className="space-y-4">
            <PeriodFilter preset={preset} range={range} custom={custom} onPreset={setPreset} onCustom={setCustom} />
            <div className={`grid gap-6 lg:grid-cols-2 ${dash.loading ? 'opacity-60 transition-opacity' : ''}`} aria-busy={dash.loading}>
              <ExpenseDonut data={categories} periodText={periodText} pauschal={profileFor(svs.year)?.profit_method === 'pauschal'} />
              <RevenueChart data={revenue.buckets} granularity={revenue.granularity} periodText={periodText} />
            </div>
          </section>
        </div>
      )}
      <WindowReceiptDrop onFile={importReceipt} afterText="Du landest dafür bei den Ausgaben." />
    </PageWrapper>
  );
}
