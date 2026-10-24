import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { KlaroLogo } from '@/components/auth/AuthLayout';
import { LEGAL_UPDATED, OPERATOR } from '@/constants/legal';
import { LegalLinks } from './LegalLinks';

/** Rahmen für Impressum und Datenschutz – öffentlich, egal ob angemeldet oder nicht. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  // Direkt aufgerufen (z. B. aus einer E-Mail) gibt es keine Klaro-Seite davor → zur Startseite
  const cameFromKlaro = useLocation().key !== 'default';
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/" aria-label="Zur Startseite">
            <KlaroLogo />
          </Link>
          <button
            type="button"
            onClick={() => (cameFromKlaro ? navigate(-1) : navigate('/'))}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Zurück
          </button>
        </div>
        <article className="rounded-2xl bg-white p-6 text-sm leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <div className="mt-6 space-y-8">{children}</div>
          <p className="mt-8 text-xs text-slate-500">Stand: {LEGAL_UPDATED}</p>
        </article>
        <LegalLinks className="mt-6" />
      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export function OperatorMail() {
  return (
    <a href={`mailto:${OPERATOR.email}`} className="font-medium text-primary hover:underline">
      {OPERATOR.email}
    </a>
  );
}
