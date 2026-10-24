import { Link } from 'react-router-dom';

/** Kleine Fußzeile mit Impressum und Datenschutz – auf Anmeldeseiten und im Menü. */
export function LegalLinks({ className = '', onNavigate }: { className?: string; onNavigate?: () => void }) {
  const link =
    'inline-flex min-h-[44px] items-center rounded px-1 hover:text-slate-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';
  return (
    <nav aria-label="Rechtliches" className={`flex flex-wrap items-center justify-center gap-x-2 text-xs text-slate-500 ${className}`}>
      <Link to="/impressum" onClick={onNavigate} className={link}>
        Impressum
      </Link>
      <span aria-hidden="true">·</span>
      <Link to="/datenschutz" onClick={onNavigate} className={link}>
        Datenschutz
      </Link>
    </nav>
  );
}
