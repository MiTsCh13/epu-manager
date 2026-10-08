// Beleg per Drag & Drop importieren: Overlay fürs ganze Fenster und Ablagefläche im Formular.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight, FileText, ReceiptEuro, ScanText } from 'lucide-react';

const isFileDrag = (e: { dataTransfer: DataTransfer | null }) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
// Solange irgendein Dialog offen ist, nimmt das Fenster keinen Beleg an (z. B. „Ausgaben löschen?“)
const dialogOpen = () => document.querySelector('[role="dialog"]') !== null;

/** Erste Datei aus einem Drop – bei mehreren Hinweis, dass Klaro einen Beleg nach dem anderen liest. */
function firstFile(dataTransfer: DataTransfer | null): File | null {
  const files = Array.from(dataTransfer?.files ?? []);
  if (files.length > 1) toast('Klaro liest einen Beleg nach dem anderen – übernommen wird der erste.');
  return files[0] ?? null;
}

/**
 * Datei ins Fenster ziehen → großes Overlay, das zeigt, was passiert; Loslassen → `onFile`.
 * Auch wenn `enabled` aus ist (z. B. ein Dialog ist offen), verhindert es, dass der Browser die Datei öffnet.
 */
export function WindowReceiptDrop({ onFile, enabled = true, afterText }: { onFile: (file: File) => void; enabled?: boolean; afterText?: string }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0); // dragenter/dragleave feuern für jedes Kindelement
  const latest = useRef({ onFile, enabled });
  latest.current = { onFile, enabled };

  useEffect(() => {
    const active = () => latest.current.enabled && !dialogOpen();
    // Rückfall, falls ein dragleave ausbleibt (Safari, Element unter dem Mauszeiger verschwindet):
    // dragover feuert beim Ziehen laufend – bleibt es aus, ist die Datei nicht mehr über dem Fenster.
    let idle: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      depth.current = 0;
      setDragging(false);
    };
    const enter = (e: globalThis.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth.current++;
      if (active()) setDragging(true);
    };
    const over = (e: globalThis.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = active() ? 'copy' : 'none';
      clearTimeout(idle);
      idle = setTimeout(reset, 1000);
    };
    const leave = (e: globalThis.DragEvent) => {
      if (!isFileDrag(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0 || e.relatedTarget === null) reset(); // relatedTarget null = Fenster verlassen
    };
    const drop = (e: globalThis.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      clearTimeout(idle);
      reset();
      if (!active()) return;
      const file = firstFile(e.dataTransfer);
      if (file) latest.current.onFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      clearTimeout(idle);
    };
  }, []);

  if (!dragging || !enabled) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-primary-900/75 p-4 backdrop-blur-sm" data-testid="receipt-drop-overlay">
      <div className="w-full max-w-lg rounded-3xl border-4 border-dashed border-white/70 p-6 text-center text-white sm:p-10">
        <div className="flex items-center justify-center gap-2 sm:gap-4" aria-hidden="true">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 sm:h-16 sm:w-16">
            <FileText className="h-7 w-7 sm:h-8 sm:w-8" />
          </span>
          <ArrowRight className="h-5 w-5 opacity-70" />
          <span className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-white text-primary sm:h-20 sm:w-20">
            <ScanText className="h-8 w-8 sm:h-10 sm:w-10" />
          </span>
          <ArrowRight className="h-5 w-5 opacity-70" />
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 sm:h-16 sm:w-16">
            <ReceiptEuro className="h-7 w-7 sm:h-8 sm:w-8" />
          </span>
        </div>
        <p className="mt-6 text-2xl font-bold">Beleg hier loslassen</p>
        <p className="mt-2 text-sm text-white/90">
          Klaro liest Betrag, Datum, Umsatzsteuer und Kategorie aus dem Foto oder PDF aus und legt daraus eine Ausgabe an.
          {afterText ? ` ${afterText}` : ''}
        </p>
        <ol className="mt-6 grid grid-cols-3 gap-2 text-xs font-medium text-white/90">
          {['Loslassen', 'Klaro liest aus', 'Du prüfst und speicherst'].map((step, i) => (
            <li key={step} className="flex flex-col items-center gap-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm font-bold">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Ablagefläche im Formular „Ausgabe erfassen“: hineinziehen oder auswählen → auslesen. */
export function ReceiptDropArea({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (e: DragEvent<HTMLElement>, active: boolean) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation(); // nicht zusätzlich vom Fenster-Overlay verarbeiten
    setOver(active);
  };

  return (
    <div
      onDragEnter={(e) => handle(e, true)}
      onDragOver={(e) => handle(e, true)}
      onDragLeave={(e) => handle(e, false)}
      onDrop={(e) => {
        handle(e, false);
        const file = firstFile(e.dataTransfer);
        if (file) onFile(file);
      }}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        over ? 'border-primary bg-primary-50' : 'border-slate-300 bg-slate-50'
      }`}
      data-testid="receipt-drop-area"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary ring-1 ring-slate-200">
        <ScanText className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-slate-900">Beleg importieren und automatisch auslesen</p>
        {/* Am Handy zieht niemand Dateien – dort ist die ganze Fläche zum Antippen */}
        <p className="text-slate-600">
          <span className="sm:hidden">Tippen, um ein Foto aufzunehmen oder ein PDF auszuwählen.</span>
          <span className="hidden sm:inline">
            Foto oder PDF hierher ziehen oder <span className="font-semibold text-primary">auswählen</span>.
          </span>{' '}
          Klaro füllt Betrag, Datum und Kategorie aus.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        data-testid="receipt-drop-input"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
