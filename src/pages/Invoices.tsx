import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText, Plus } from 'lucide-react';
import { useInvoices, type InvoiceListItem } from '@/hooks/useInvoices';
import { FILTER_LABELS, getDisplayStatus, matchesFilter, type InvoiceFilter } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { InvoiceList } from '@/components/invoices/InvoiceList';
import { MarkPaidModal } from '@/components/invoices/MarkPaidModal';
import { ClientListSkeleton } from '@/components/clients/ClientList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

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
  const { invoices, loading, error, reload, markPaid } = useInvoices();
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [paying, setPaying] = useState<InvoiceListItem | null>(null);

  const withStatus = useMemo(() => invoices.map((inv) => ({ inv, status: getDisplayStatus(inv) })), [invoices]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, withStatus.filter((x) => matchesFilter(x.status, f)).length])) as Record<InvoiceFilter, number>,
    [withStatus],
  );
  const openSum = withStatus.filter((x) => matchesFilter(x.status, 'open')).reduce((s, x) => s + Number(x.inv.total), 0);
  const visible = withStatus.filter((x) => matchesFilter(x.status, filter)).map((x) => x.inv);

  return (
    <PageWrapper
      title="Rechnungen"
      description={
        counts.open > 0
          ? `${counts.open} offen über ${formatEuro(openSum)}${counts.overdue > 0 ? ` · ${counts.overdue} überfällig` : ''}`
          : 'Alle deine Rechnungen und Honorarnoten.'
      }
      actions={invoices.length > 0 && newInvoiceLink}
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
        <EmptyState
          icon={FileText}
          title="Noch keine Rechnungen"
          description="Schreib deine erste Rechnung – Klaro achtet auf alle Pflichtangaben und rechnet automatisch mit."
          action={newInvoiceLink}
        />
      ) : (
        <div className="space-y-4">
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
          {visible.length === 0 ? (
            <p className="rounded-2xl bg-white py-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">
              Keine Rechnungen in „{FILTER_LABELS[filter]}“.
            </p>
          ) : (
            <InvoiceList invoices={visible} onMarkPaid={setPaying} />
          )}
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
