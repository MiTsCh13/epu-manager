import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type AlertType = 'info' | 'success' | 'warning' | 'critical';

const STYLES: Record<AlertType, { box: string; Icon: typeof Info }> = {
  info: { box: 'bg-sky-50 text-sky-900 ring-sky-200', Icon: Info },
  success: { box: 'bg-primary-50 text-primary-900 ring-primary-100', Icon: CheckCircle2 },
  warning: { box: 'bg-amber-50 text-amber-900 ring-amber-200', Icon: AlertTriangle },
  critical: { box: 'bg-red-50 text-red-900 ring-red-200', Icon: XCircle },
};

export function Alert({ type = 'info', title, children }: { type?: AlertType; title?: string; children?: ReactNode }) {
  const { box, Icon } = STYLES[type];
  return (
    <div role={type === 'critical' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg p-3 text-sm ring-1 ring-inset ${box}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}
