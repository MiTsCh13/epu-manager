import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

/** Kennzahl-Kachel: Label, große Zahl, optionale Zusatzzeile; ganz klickbar wenn `to` gesetzt. */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  to,
  highlight,
  testId,
}: {
  label: ReactNode;
  value: string;
  sub?: ReactNode;
  icon: LucideIcon;
  to?: string;
  highlight?: boolean;
  testId?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm ${highlight ? 'text-primary-900' : 'text-slate-600'}`}>{label}</span>
        <Icon className={`h-4 w-4 shrink-0 ${highlight ? 'text-primary' : 'text-slate-400'}`} aria-hidden="true" />
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${highlight ? 'text-primary-900' : 'text-slate-900'}`} data-testid={testId}>
        {value}
      </p>
      {sub && <p className={`mt-0.5 text-xs ${highlight ? 'text-primary-800' : 'text-slate-500'}`}>{sub}</p>}
    </>
  );
  const cls = `block rounded-2xl p-4 ring-1 transition-colors ${
    highlight ? 'bg-primary-50 ring-primary-100' : 'bg-white ring-slate-200'
  } ${to ? 'hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary' : ''}`;
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
