import { useRef, useState, type DragEvent } from 'react';
import { ClipboardPaste, FileSpreadsheet, Upload } from 'lucide-react';
import { IMPORT_FILE_ACCEPT, readImportFile, type Sheet } from '@/lib/importData';
import { parseDelimited } from '@/lib/importParse';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

/** Schritt 1: Excel-Datei hochladen oder Zeilen aus Excel einfügen. */
export function SourceStep({ onLoaded }: { onLoaded: (sheets: Sheet[], sourceName: string) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const sheets = await readImportFile(file);
      if (sheets.length === 0 || sheets.every((s) => s.table.length < 1)) throw new Error('In der Datei stehen keine Daten.');
      onLoaded(sheets, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
    }
  }

  function handlePaste() {
    const table = parseDelimited(text);
    if (table.length === 0) return setError('Füge zuerst ein paar Zeilen aus deiner Tabelle ein.');
    onLoaded([{ name: 'Eingefügt', table }], 'Aus Excel eingefügt');
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-6">
      {error && <Alert type="critical">{error}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" aria-labelledby="import-file-heading">
          <h2 id="import-file-heading" className="flex items-center gap-2 font-semibold text-slate-900">
            <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden="true" />
            Datei hochladen
          </h2>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragging ? 'border-primary bg-primary-50' : 'border-slate-300'
            }`}
          >
            <Upload className="h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="text-sm text-slate-600">Excel-Datei (.xlsx) oder CSV hierher ziehen</p>
            <Button variant="secondary" loading={busy} onClick={() => inputRef.current?.click()} data-testid="import-file-button">
              Datei auswählen
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={IMPORT_FILE_ACCEPT}
              className="sr-only"
              aria-label="Datei auswählen"
              data-testid="import-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleFile(file);
              }}
            />
          </div>
          <p className="text-xs text-slate-500">Hat die Datei mehrere Blätter (z. B. eines pro Monat), wählst du im nächsten Schritt aus.</p>
        </section>

        <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" aria-labelledby="import-paste-heading">
          <h2 id="import-paste-heading" className="flex items-center gap-2 font-semibold text-slate-900">
            <ClipboardPaste className="h-5 w-5 text-primary" aria-hidden="true" />
            Aus Excel kopieren
          </h2>
          <p className="text-sm text-slate-600">
            Markiere in Excel die Zeilen samt Überschrift, kopiere sie (Strg + C bzw. ⌘ + C) und füge sie hier ein.
          </p>
          <textarea
            aria-label="Zeilen aus Excel"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'Datum\tBeschreibung\tBetrag\n05.03.2026\tAdobe Abo\t-59,99'}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="import-paste"
          />
          <Button onClick={handlePaste} disabled={!text.trim()}>
            Weiter
          </Button>
        </section>
      </div>

      <Alert type="info" title="Was du brauchst">
        Pro Zeile ein Datum und einen Betrag, am besten auch eine Beschreibung oder Kategorie. Einnahmen und Ausgaben
        dürfen in einer Tabelle stehen. Du prüfst alles, bevor Klaro etwas speichert – und kannst einen Import jederzeit
        wieder rückgängig machen.
      </Alert>
    </div>
  );
}
