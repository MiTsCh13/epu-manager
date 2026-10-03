import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, FileClock, PiggyBank, Plus, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useSvsTracker } from '@/hooks/useSvsTracker';
import { monthlyRevenue, openInvoicesSummary, topCategories } from '@/lib/dashboard';
import { toISODate } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { ExpenseDonut } from '@/components/dashboard/ExpenseDonut';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { StatCard } from '@/components/dashboard/StatCard';
import { SVSDashboardCard } from '@/components/svs/SVSDashboardCard';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

const MONTH_NAMES = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export default function Dashboard() {
  const { profile } = useAuth();
  const svs = useSvsTracker();
  const dash = useDashboardData();
  const today = new Date();

  const todayIso = toISODate(today);
  const open = useMemo(() => openInvoicesSummary(dash.invoices, todayIso), [dash.invoices, todayIso]);
  const revenueByMonth = useMemo(() => monthlyRevenue(dash.invoices, new Date(todayIso)), [dash.invoices, todayIso]);
  const categories = useMemo(() => topCategories(dash.monthExpenses), [dash.monthExpenses]);

  const firstName = profile?.full_name?.split(' ')[0];
  const loading = svs.loading || dash.loading || !svs.model;
  const error = svs.error ?? dash.error;

  const newInvoice = (
    <Link
      to="/rechnungen/neu"
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Neue Rechnung
    </Link>
  );

  return (
    <PageWrapper title="Übersicht" description={firstName ? `Hallo ${firstName}! So steht ${svs.year} gerade da.` : 'Was dir dieses Jahr wirklich bleibt.'} actions={newInvoice}>
      {loading && !error ? (
        <div className="flex justify-center py-20 text-primary" role="status" aria-label="Übersicht wird geladen">
          <Spinner className="h-8 w-8" />
        </div>
      ) : error ? (
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
      ) : (
        svs.model && (
          <div className="space-y-6">
            {/* Wichtige Hinweise (Phasenhinweis steckt bereits in der SVS-Karte) */}
            {svs.model.alerts
              .filter((a) => !a.id.startsWith('phase'))
              .map((a) => (
                <Alert key={a.id} type={a.urgency}>
                  {a.message}
                </Alert>
              ))}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Einnahmen dieses Jahr"
                value={formatEuro(svs.current.revenueNet, true)}
                sub="bezahlte Rechnungen, netto"
                icon={Banknote}
                to="/rechnungen"
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
                to="/rechnungen"
                testId="stat-open"
              />
              <StatCard
                label="Geschätzter Jahresgewinn"
                value={formatEuro(Math.max(svs.model.projection.projected - svs.model.expectedSvs, 0), true)}
                sub="hochgerechnet, nach SVS, vor Steuer"
                icon={TrendingUp}
                to="/ausgaben"
                testId="stat-profit"
              />
              <StatCard
                label="Empfohlene Rücklage"
                value={formatEuro(svs.model.reserveOpen, true)}
                sub={`noch für SVS + Steuer ${svs.year}`}
                icon={PiggyBank}
                to="/svs"
                highlight
                testId="stat-reserve"
              />
            </div>

            <SVSDashboardCard model={svs.model} year={svs.year} />

            <div className="grid gap-6 lg:grid-cols-2">
              <ExpenseDonut data={categories} monthLabel={MONTH_NAMES[today.getMonth()]!} pauschal={profile?.profit_method === 'pauschal'} />
              <RevenueChart data={revenueByMonth} />
            </div>
          </div>
        )
      )}
    </PageWrapper>
  );
}
