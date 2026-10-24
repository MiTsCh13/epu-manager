import type { ReactNode } from 'react';
import { LegalLinks } from '@/components/legal/LegalLinks';

export function KlaroLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold text-slate-900 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white" aria-hidden="true">K</span>
      <span className="text-xl">Klaro</span>
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Beta</span>
    </span>
  );
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-slate-50 px-4 py-8 sm:justify-center">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <KlaroLogo />
          <p className="mt-2 text-sm text-slate-500">Endlich weißt du, was dir wirklich bleibt.</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <LegalLinks className="mt-6" />
      </div>
    </main>
  );
}
