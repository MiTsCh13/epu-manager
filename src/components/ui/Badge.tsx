import type { ReactNode } from 'react';
import { STATUS_LABELS, type DisplayStatus } from '@/lib/invoices';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  success: 'bg-primary-50 text-primary-800 ring-primary-100',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<DisplayStatus, Tone> = { draft: 'neutral', sent: 'info', paid: 'success', overdue: 'danger' };

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
