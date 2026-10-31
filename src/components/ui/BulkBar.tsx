import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Leiste für ausgewählte Einträge: Anzahl, Summe, Aktionen, Auswahl aufheben. Klebt beim Scrollen unten. */
export function BulkBar({ count, summary, onClear, children }: { count: number; summary?: ReactNode; onClear: () => void; children: ReactNode }) {
  const visible = count > 0;
  // Assistent-Knopf ausblenden (index.css), solange die Leiste da ist
  useEffect(() => {
    if (!visible) return;
    document.body.setAttribute('data-bulk-bar', '');
    return () => document.body.removeAttribute('data-bulk-bar');
  }, [visible]);
  if (!visible) return null;
  return (
    <div
      role="region"
      aria-label="Auswahl bearbeiten"
      aria-live="polite"
      className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-2 rounded-2xl bg-slate-900 p-3 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between lg:bottom-4"
    >
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" onClick={onClear} aria-label="Auswahl aufheben" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="shrink-0 text-sm font-semibold" data-testid="bulk-count">
          {count} ausgewählt
        </span>
        {summary && <span className="ml-auto text-right text-sm tabular-nums text-white/80 sm:ml-2">{summary}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** „Alle auswählen“ für die gerade sichtbaren Einträge. */
export function SelectAll({ total, selected, onChange }: { total: number; selected: number; onChange: (all: boolean) => void }) {
  if (total === 0) return null;
  const all = selected > 0 && selected === total;
  return (
    <label className="inline-flex min-h-[36px] items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
        checked={all}
        ref={(el) => {
          if (el) el.indeterminate = selected > 0 && !all;
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      Alle {total} auswählen
    </label>
  );
}
