import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate, getDisplayStatus } from '@/lib/invoices';
import { formatEuro } from '@/lib/money';
import type { InvoiceListItem } from '@/hooks/useInvoices';

export function InvoiceList({
  invoices,
  onMarkPaid,
}: {
  invoices: InvoiceListItem[];
  onMarkPaid: (inv: InvoiceListItem) => void;
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      {invoices.map((inv) => {
        const status = getDisplayStatus(inv);
        const open = status === 'sent' || status === 'overdue';
        return (
          <li key={inv.id} className="flex items-center gap-2 pr-2 hover:bg-slate-50">
            <Link to={`/rechnungen/${inv.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-slate-900">{inv.invoice_number}</span>
                  <StatusBadge status={status} />
                  {inv.is_honorarnote && <span className="text-xs text-slate-500">Honorarnote</span>}
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-600">{inv.clientName ?? 'Ohne Kunde'}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(inv.invoice_date)}
                  {status === 'paid' && inv.paid_at && ` · bezahlt am ${formatDate(inv.paid_at)}`}
                  {open && inv.due_date && ` · fällig ${formatDate(inv.due_date)}`}
                  {inv.cancels_invoice_number && ` · Storno zu ${inv.cancels_invoice_number}`}
                </p>
              </div>
              <span
                className={`shrink-0 text-right font-semibold tabular-nums ${
                  status === 'overdue' ? 'text-red-700' : status === 'cancelled' ? 'text-slate-400 line-through' : 'text-slate-900'
                }`}
              >
                {formatEuro(Number(inv.total))}
              </span>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" aria-hidden="true" />
            </Link>
            {open && (
              <button
                type="button"
                onClick={() => onMarkPaid(inv)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-primary-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`${inv.invoice_number} als bezahlt markieren`}
                title="Als bezahlt markieren"
              >
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
