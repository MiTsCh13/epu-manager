import { useEffect, type ReactNode } from 'react';

/** Seitenkopf (Titel, Beschreibung, Aktionen) + Inhalt. Setzt auch den Browser-Tab-Titel. */
export function PageWrapper({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · Klaro`;
  }, [title]);

  return (
    <>
      {/* Passen die Aktionen nicht neben den Titel, rutschen sie in eine eigene Zeile, statt ihn zusammenzudrücken */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 sm:min-w-[16rem] sm:flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex max-w-full flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </>
  );
}
