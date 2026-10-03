import { FileText, Mail, MapPin, Pencil, Phone, Trash2 } from 'lucide-react';
import { countryName } from '@/constants/countries';
import type { ClientWithStats } from '@/hooks/useClients';

function addressLine(c: ClientWithStats): string {
  const place = [c.zip_code, c.city].filter(Boolean).join(' ');
  const country = c.country && c.country !== 'AT' ? countryName(c.country) : '';
  return [c.address, place, country].filter(Boolean).join(', ');
}

export function ClientList({
  clients,
  onEdit,
  onDelete,
}: {
  clients: ClientWithStats[];
  onEdit: (c: ClientWithStats) => void;
  onDelete: (c: ClientWithStats) => void;
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      {clients.map((c) => {
        const address = addressLine(c);
        return (
          <li key={c.id} className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-5">
            <span
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-800 sm:mt-0"
              aria-hidden="true"
            >
              {c.name.trim().charAt(0).toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => onEdit(c)}
              className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline"
              aria-label={`${c.name} bearbeiten`}
            >
              <p className="flex flex-wrap items-center gap-x-2 font-medium text-slate-900">
                <span className="truncate">{c.name}</span>
                {c.uid_number && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{c.uid_number}</span>
                )}
              </p>
              <div className="mt-0.5 flex flex-col gap-0.5 text-sm text-slate-500 sm:flex-row sm:flex-wrap sm:gap-x-4">
                {address && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{address}</span>
                  </span>
                )}
                {c.email && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{c.email}</span>
                  </span>
                )}
                {c.phone && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{c.phone}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {c.invoiceCount === 1 ? '1 Rechnung' : `${c.invoiceCount} Rechnungen`}
                </span>
              </div>
            </button>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => onEdit(c)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`${c.name} bearbeiten`}
                title="Bearbeiten"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(c)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                aria-label={`${c.name} löschen`}
                title="Löschen"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ClientListSkeleton() {
  return (
    <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200" aria-busy="true" aria-label="Kunden werden geladen">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex animate-pulse items-center gap-3 px-5 py-4">
          <span className="h-10 w-10 rounded-full bg-slate-200" />
          <span className="flex-1 space-y-2">
            <span className="block h-3.5 w-1/3 rounded bg-slate-200" />
            <span className="block h-3 w-1/2 rounded bg-slate-100" />
          </span>
        </li>
      ))}
    </ul>
  );
}
