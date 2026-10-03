import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { GLOSSARY, type GlossaryKey } from '@/constants/glossary';

/**
 * Info-Icon mit Erklärung. Funktioniert per Hover, Fokus (Tastatur) und Tippen (Mobile).
 */
export function InfoTip({ content, label = 'Erklärung anzeigen' }: { content: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      // Hover nur mit echter Maus – bei Touch feuern sonst Hover, Fokus und Klick gleichzeitig
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Öffnen statt umschalten: Fokus hat ggf. schon geöffnet; Schließen per Tippen daneben/Escape/Blur
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-64 max-w-[80vw] -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg"
        >
          {content}
        </span>
      )}
    </span>
  );
}

/** Fachbegriff aus dem Glossar mit Tooltip: <Term k="svs" /> oder <Term k="svs">SVS-Beiträge</Term> */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const entry = GLOSSARY[k];
  return (
    <span className="inline-flex items-center">
      {children ?? entry.term}
      <InfoTip content={entry.text} label={`Was bedeutet ${entry.term}?`} />
    </span>
  );
}
