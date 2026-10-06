import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertCircle, Banknote, FileClock, FileText, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useIncomes } from '@/hooks/useIncomes';
import { useInvoices, type InvoiceListItem } from '@/hooks/useInvoices';
import { StatCard } from '@/components/dashboard/StatCard';
import { FILTER_LABELS, getDisplayStatus, matchesFilter, type InvoiceFilter } from '@/lib/invoices';
import { searchAndSort, type ListSort } from '@/lib/expenses';
import { formatEuro } from '@/lib/money';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { InvoiceList } from '@/components/invoices/InvoiceList';
import { MarkPaidModal } from '@/components/invoices/MarkPaidModal';
import { OtherIncomes } from '@/components/invoices/OtherIncomes';
import { ClientListSkeleton } from '@/components/clients/ClientList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListControls } from '@/components/ui/ListControls';
import { YearSelect } from '@/components/ui/YearSelect';
import { ImportLink } from '@/components/import/ImportLink';

const FILTERS: InvoiceFilter[] = ['all', 'open', 'paid', 'overdue'];

const newInvoiceLink = (
  <Link
    to="/rechnungen/neu"
    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
  >
    <Plus className="h-4 w-4" aria-hidden="true" />
    Neue Rechnung
  </Link>
);

export default function Invoices() {
  const { invoices, loading: invoicesLoading, error: invoicesError, reload: reloadInvoices, markPaid } = useInvoices();
  const other = useIncomes();
  const loading = invoicesLoading || other.loading;
  const error = invoicesError ?? other.error;
  const reload = () => Promise.all([reloadInvoices(), other.reload()]);
  const { profile } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ListSort>('date-desc');
  // Filter steht in der Adresse (?filter=open) – Links vom Dashboard kommen vorgefiltert an
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('filter') as InvoiceFilter | null;
  const filter: InvoiceFilter = param && FILTERS.includes(param) ? param : 'all';
  const setFilter = (f: InvoiceFilter) => setSearchParams(f === 'all' ? {} : { filter: f }, { replace: true });
  const [paying, setPaying] = useState<InvoiceListItem | null>(null);

  const yearOf = (iso: string | null) => Number((iso ?? '').slice(0, 4));
  const dataYears = useMemo(
    () => [...invoices.map((i) => yearOf(i.invoice_date)), ...other.incomes.map((i) => yearOf(i.income_date))].filter(Boolean),
    [invoices, other.incomes],
  );
  const withStatus = useMemo(() => invoices.map((inv) => ({ inv, status: getDisplayStatus(inv) })), [invoices]);
  const inYear = withStatus.filter((x) => yearOf(x.inv.invoice_date) === year);
  const counts = Object.fromEntries(FILTERS.map((f) => [f, inYear.filter((x) => matchesFilter(x.status, f)).length])) as Record<InvoiceFilter, number>;
  // Offene Beträge über alle Jahre – eine unbezahlte Rechnung vom Vorjahr soll nicht untergehen
  const openAll = withStatus.filter((x) => matchesFilter(x.status, 'open'));
  const openSum = openAll.reduce((s, x) => s + Number(x.inv.total), 0);
  const overdueAll = withStatus.filter((x) => x.status === 'overdue');
  const overdueSum = overdueAll.reduce((s, x) => s + Number(x.inv.total), 0);
  const openOtherYears = openAll.filter((x) => yearOf(x.inv.invoice_date) !== year).length;
  const visible = searchAndSort(
    inYear.filter((x) => matchesFilter(x.status, filter)).map((x) => x.inv),
    query,
    sort,
    (i) => ({ date: i.invoice_date, amount: Number(i.total), texts: [i.invoice_number, i.clientName] }),
  );
  // Einnahmen = bezahlte Rechnungen nach Zahlungsdatum + weitere Einnahmen (wie im Dashboard und in der Jahresrechnung)
  const paidThisYear = invoices.filter((i) => i.status === 'paid' && i.paid_at && yearOf(i.paid_at) === year);
  const otherThisYear = other.incomes.filter((i) => yearOf(i.income_date) === year);
  const earnedNet =
    paidThisYear.reduce((s, i) => s + Number(i.subtotal), 0) + otherThisYear.reduce((s, i) => s + Number(i.amount_net ?? i.amount), 0);
  const earnedGross = paidThisYear.reduce((s, i) => s + Number(i.total), 0) + otherThisYear.reduce((s, i) => s + Number(i.amount), 0);
  const earnedSub = otherThisYear.length > 0 ? 'Rechnungen und weitere Einnahmen' : 'bezahlte Rechnungen';
  const isKU = !!profile?.is_kleinunternehmer;

  const earnedCard = (
    <StatCard
      label={`Eingenommen ${year}`}
      value={formatEuro(earnedNet, true)}
      sub={isKU ? earnedSub : `netto · brutto ${formatEuro(earnedGross, true)}`}
      icon={Banknote}
      testId="invoices-earned"
    />
  );

  return (
    <PageWrapper
      title="Rechnungen"
      description="Deine Einnahmen: alle Rechnungen und Honorarnoten."
      actions={
        <>
          <YearSelect value={year} onChange={setYear} extraYears={dataYears} />
          <ImportLink />
          {invoices.length > 0 && newInvoiceLink}
        </>
      }
    >
      {loading ? (
        <ClientListSkeleton />
      ) : error ? (
        <div className="space-y-3">
          <Alert type="critical">{error}</Alert>
          <Button variant="secondary" onClick={() => void reload()}>
            Erneut versuchen
          </Button>
        </div>
      ) : invoices.length === 0 ? (
        <div className="space-y-8">
          {otherThisYear.length > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{earnedCard}</div>}
          <EmptyState
            icon={FileText}
            title="Noch keine Rechnungen"
            description="Schreib deine erste Rechnung – Klaro achtet auf alle Pflichtangaben und rechnet automatisch mit."
            action={newInvoiceLink}
          />
          <OtherIncomes key={year} incomes={otherThisYear} year={year} isKU={isKU} onDelete={other.deleteIncomes} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {earnedCard}
            <StatCard
              label="Offen"
              value={formatEuro(openSum, true)}
              sub={`${openAll.length === 1 ? '1 Rechnung' : `${openAll.length} Rechnungen`}${openOtherYears > 0 ? `, davon ${openOtherYears} aus anderen Jahren` : ''}`}
              icon={FileClock}
              testId="invoices-open"
            />
            {overdueAll.length > 0 && (
              <StatCard
                label="Davon überfällig"
                value={formatEuro(overdueSum, true)}
                sub={overdueAll.length === 1 ? '1 Rechnung – Zeit für eine Erinnerung' : `${overdueAll.length} Rechnungen – Zeit für eine Erinnerung`}
                icon={AlertCircle}
              />
            )}
          </div>
          <div role="tablist" aria-label="Rechnungen filtern" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-inset transition-colors ${
                  filter === f ? 'bg-primary text-white ring-primary' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {FILTER_LABELS[f]}
                <span className={`text-xs ${filter === f ? 'text-white/80' : 'text-slate-400'}`}>{counts[f]}</span>
              </button>
            ))}
          </div>
          {inYear.length > 0 && (
            <ListControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} placeholder="Rechnungsnummer, Kunde oder Betrag" />
          )}
          {visible.length === 0 ? (
            <p className="rounded-2xl bg-white py-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">
              {inYear.length === 0 ? `Keine Rechnungen in ${year}.` : query ? 'Nichts gefunden.' : `Keine Rechnungen in „${FILTER_LABELS[filter]}“.`}
            </p>
          ) : (
            <InvoiceList invoices={visible} onMarkPaid={setPaying} />
          )}
          <div className="pt-4">
            <OtherIncomes key={year} incomes={otherThisYear} year={year} isKU={isKU} onDelete={other.deleteIncomes} />
          </div>
        </div>
      )}

      <MarkPaidModal
        invoice={paying && { invoice_number: paying.invoice_number, total: Number(paying.total) }}
        onClose={() => setPaying(null)}
        onConfirm={async (paidAt) => {
          if (!paying) return;
          const { error: err } = await markPaid(paying.id, paidAt);
          if (err) toast.error(err);
          else toast.success(`${paying.invoice_number} als bezahlt markiert`);
          setPaying(null);
        }}
      />
    </PageWrapper>
  );
}
