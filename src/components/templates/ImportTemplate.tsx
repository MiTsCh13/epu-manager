// „Aus meiner Rechnung übernehmen“: PDF wählen → Klaro liest es aus → Original und Klaro-Vorlage nebeneinander.
import { useMemo, useRef, useState, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import { Check, FileUp, Info, Loader2 } from 'lucide-react';
import { useAuth, useProfileFor } from '@/contexts/AuthContext';
import { analyzeInvoicePdf, finalizeImport, readInvoiceDesign, type ImportedDesign } from '@/lib/invoiceImport';
import type { TemplateSettings } from '@/lib/invoiceTemplates';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { TemplatePreview } from './TemplatePreview';

type Step = 'pick' | 'working' | 'compare';
const STEPS = ['Seite und Bilder lesen', 'Aufbau und Texte erkennen', 'Vorlage zusammenstellen'];

/**
 * Ablauf im Dialog „Neue Vorlage“. `onCreate` legt die Vorlage an und liefert die ID;
 * `edit` = danach im Editor weiter anpassen.
 */
export function ImportTemplate({
  onCreate,
  onBusyChange,
}: {
  onCreate: (name: string, settings: TemplateSettings, edit: boolean) => Promise<boolean>;
  /** Solange Klaro liest bzw. anlegt, darf der Dialog nicht schließen (der Versuch zählt sonst trotzdem) */
  onBusyChange?: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const profile = useProfileFor(new Date().getFullYear());
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedDesign | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'save' | 'edit' | null>(null);
  const [dragging, setDragging] = useState(false);

  async function start(file: File) {
    setError(null);
    setStep('working');
    setProgress(0);
    onBusyChange?.(true);
    const fail = (message: string) => {
      setError(message);
      setStep('pick');
    };
    try {
      const analysis = await analyzeInvoicePdf(file);
      if ('error' in analysis) return fail(analysis.error);
      setPageUrl(analysis.pageUrl);
      setProgress(1);
      const result = await readInvoiceDesign(analysis);
      if ('error' in result) return fail(result.error);
      setProgress(2);
      setImported(result);
      setName(result.result.name || file.name.replace(/\.pdf$/i, '').slice(0, 60));
      setStep('compare');
    } catch {
      fail('Klaro konnte deine Rechnung nicht lesen. Bitte versuche es erneut.');
    } finally {
      onBusyChange?.(false);
    }
  }

  async function confirm(edit: boolean) {
    if (!imported || !user) return;
    if (!name.trim()) return void toast.error('Bitte gib der Vorlage einen Namen.');
    setBusy(edit ? 'edit' : 'save');
    onBusyChange?.(true);
    try {
      const final = await finalizeImport(imported, user.id);
      if ('error' in final) return void toast.error(final.error);
      await onCreate(name.trim(), final.settings, edit);
    } catch {
      toast.error('Die Vorlage konnte nicht angelegt werden.');
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  }

  // Vorschau-Bilder einmal je Import (sonst rendert die Vorschau bei jedem Tastendruck neu)
  const previewImages = useMemo(() => imported?.previewImages, [imported]);

  if (step === 'compare' && imported) {
    return (
      <div className="space-y-4" data-testid="import-compare">
        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          <figure>
            <figcaption className="mb-1 text-xs font-medium text-slate-500">Deine Rechnung</figcaption>
            {pageUrl && <img src={pageUrl} alt="Deine Rechnung" className="w-full rounded-lg shadow-sm ring-1 ring-slate-200" />}
          </figure>
          <figure>
            <figcaption className="mb-1 text-xs font-medium text-slate-500">So sieht sie in Klaro aus</figcaption>
            <TemplatePreview profile={profile} settings={imported.settings} active={null} images={previewImages} />
          </figure>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Übernommen</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700" data-testid="import-adopted">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Farbe <span className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: imported.settings.color }} /> {imported.settings.color}
              </li>
              {imported.adopted.map((a) => (
                <li key={a} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            {imported.result.not_adopted.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-900">Nicht übernommen</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-600">
                  {imported.result.not_adopted.map((n) => (
                    <li key={n} className="flex items-start gap-2">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Pflichtangaben, deine Anschrift, Bankdaten und die Positionen setzt Klaro selbst – die Vorschau zeigt Beispieldaten.
            </p>
            <Field label="Name der Vorlage" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setStep('pick')} disabled={!!busy}>
            Andere Rechnung
          </Button>
          <Button variant="secondary" onClick={() => void confirm(true)} loading={busy === 'edit'} disabled={!!busy}>
            Anpassen
          </Button>
          <Button onClick={() => void confirm(false)} loading={busy === 'save'} disabled={!!busy}>
            Passt so
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'working') {
    return (
      <div className="flex flex-col items-center gap-4 py-10" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="font-semibold text-slate-900">Klaro liest deine Rechnung …</p>
        <ol className="space-y-1 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i < progress ? 'text-primary' : i === progress ? 'text-slate-900' : 'text-slate-400'}`}>
              {i < progress ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="inline-block h-4 w-4 text-center">{i + 1}.</span>}
              {s}
            </li>
          ))}
        </ol>
        <p className="text-xs text-slate-500">Dauert meist 10–30 Sekunden.</p>
      </div>
    );
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void start(f);
  };
  return (
    <div className="space-y-4">
      {error && <Alert type="critical">{error}</Alert>}
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${dragging ? 'border-primary bg-primary-50' : 'border-slate-300 hover:border-primary'}`}
        data-testid="import-drop"
      >
        <FileUp className="h-8 w-8 text-primary" aria-hidden="true" />
        <span className="font-semibold text-slate-900">Rechnung als PDF hierher ziehen oder auswählen</span>
        <span className="text-sm text-slate-600">Am besten eine Rechnung, die du selbst geschrieben hast – Klaro übernimmt Logo, Farben, Texte und Aufbau.</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        className="sr-only"
        data-testid="import-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void start(f);
        }}
      />
      <p className="text-xs text-slate-500">
        Zum Auslesen schickt Klaro die erste Seite an Claude (Anthropic). Die Rechnung wird nicht gespeichert – nur Logo und Kopfbild,
        wenn du die Vorlage übernimmst. Bis zu 3 Rechnungen pro Tag.
      </p>
    </div>
  );
}
