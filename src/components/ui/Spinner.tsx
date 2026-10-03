import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function FullPageSpinner({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500" role="status">
      <Spinner className="h-8 w-8 text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
