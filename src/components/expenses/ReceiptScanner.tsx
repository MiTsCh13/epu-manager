// Beleg importieren: Foto oder PDF (Knopf, Ablagefläche oder Drag & Drop) → Klaro liest es aus →
// vorausgefülltes Formular (oder SVS-Zahlung). Ein Ablauf für alle Einstiege.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { categoryContextFor, validateReceiptFile } from '@/lib/expenses';
import { toISODate } from '@/lib/invoices';
import { formatDecimalInput, formatEuro, parseDecimal, round2 } from '@/lib/money';
import { buildPrefill, type ScanResult } from '@/lib/receiptPrefill';
import { loadHistory, scanReceipt } from '@/lib/receiptScan';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import type { ReceiptScan } from './ExpenseForm';
import type { Quarter, SvsPaymentInsert } from '@/types';

type Phase =
  | { step: 'idle' }
  | { step: 'reading'; file: File }
  | { step: 'svs'; file: File; result: ScanResult }
  | { step: 'other'; file: File; title: string; message: string };

const EMPTY_PREFILL = { form: {}, categoryReason: null, notes: [], likelyPrivate: false };

export interface ReceiptScanner {
  /** Datei auslesen lassen (z. B. nach Drag & Drop) */
  start: (file: File) => void;
  /** Dateiauswahl öffnen */
  pick: () => void;
  /** Gerade beim Auslesen oder ein Ergebnis-Dialog offen */
  busy: boolean;
  /** Verstecktes Datei-Feld und Dialoge – einmal pro Seite rendern */
  elements: ReactNode;
}

export function useReceiptScanner({
  onExpense,
  onAddSvs,
}: {
  onExpense: (scan: ReceiptScan) => void;
  onAddSvs: (p: SvsPaymentInsert) => Promise<{ error: string | null }>;
}): ReceiptScanner {
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ step: 'idle' });
  // Abbrechen während des Lesens: Ergebnis verwerfen (die Anfrage selbst läuft zu Ende)
  const runId = useRef(0);
  // Seite verlassen = Ergebnis verwerfen. Als Flag statt runId++, damit der doppelte Effekt-Lauf im StrictMode
  // ein gerade gestartetes Auslesen (z. B. Beleg aus der Übersicht) nicht verwirft.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const close = () => setPhase({ step: 'idle' });
  const enterManually = (file: File) => {
    close();
    onExpense({ file, prefill: EMPTY_PREFILL });
  };

  async function handleFile(file: File) {
    // Fotos werden vorher verkleinert – die 5-MB-Grenze gilt hier nur streng für PDFs
    const invalid = validateReceiptFile(file.type.startsWith('image/') ? { type: file.type, size: 1 } : file);
    if (invalid) return void toast.error(invalid);

    const id = ++runId.current;
    setPhase({ step: 'reading', file });
    const isKU = profile?.is_kleinunternehmer ?? true;
    const ctx = categoryContextFor(profile);
    const today = toISODate(new Date());
    const [response, history] = await Promise.all([scanReceipt(file, ctx, today), loadHistory()]);
    if (id !== runId.current || !mounted.current) return;

    if ('error' in response) {
      return setPhase({ step: 'other', file, title: 'Das hat leider nicht geklappt', message: response.error });
    }
    const { result } = response;
    if (result.kind === 'svs') return setPhase({ step: 'svs', file, result });
    if (result.kind === 'own_invoice') {
      return setPhase({
        step: 'other',
        file,
        title: 'Das ist wohl eine Rechnung von dir',
        message: 'Der Beleg sieht nach einer Rechnung aus, die du selbst ausgestellt hast – das ist eine Einnahme, keine Ausgabe. Einnahmen erfasst du unter „Rechnungen“.',
      });
    }
    if (result.kind === 'not_receipt') {
      return setPhase({ step: 'other', file, title: 'Kein Beleg erkannt', message: 'Klaro hat darin keinen Beleg gefunden. Du kannst die Ausgabe trotzdem selbst eintragen.' });
    }
    close();
    onExpense({ file, prefill: buildPrefill(result, { ctx, isKU, today, history }) });
  }

  const elements = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        data-testid="receipt-scan-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ''; // denselben Beleg erneut wählen können
          if (f) void handleFile(f);
        }}
      />
      <Modal
        open={phase.step === 'reading'}
        onClose={() => {
          runId.current++;
          close();
        }}
        size="sm"
        title="Klaro liest deinen Beleg"
      >
        <div className="flex items-center gap-3 text-slate-700" role="status">
          <Spinner />
          <span>Einen Moment – das dauert etwa 10 bis 20 Sekunden.</span>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Zum Auslesen geht dein Beleg verschlüsselt an unseren KI-Dienst Claude (Anthropic, USA). Anthropic verwendet ihn
          nicht zum Training. Gespeichert wird er erst, wenn du die Ausgabe speicherst.
        </p>
      </Modal>

      {phase.step === 'svs' && <SvsDialog result={phase.result} onAdd={onAddSvs} onClose={close} />}

      <Modal
        open={phase.step === 'other'}
        onClose={close}
        size="sm"
        title={phase.step === 'other' ? phase.title : ''}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Abbrechen
            </Button>
            {phase.step === 'other' && <Button onClick={() => enterManually(phase.file)}>Selbst eintragen</Button>}
          </>
        }
      >
        <p className="text-sm text-slate-700">{phase.step === 'other' && phase.message}</p>
      </Modal>
    </>
  );

  return {
    start: (file) => void handleFile(file),
    pick: () => inputRef.current?.click(),
    busy: phase.step !== 'idle',
    elements,
  };
}

/** SVS-Vorschreibung erkannt → als SVS-Zahlung eintragen (zählt im Jahr der Zahlung). */
function SvsDialog({
  result,
  onAdd,
  onClose,
}: {
  result: ScanResult;
  onAdd: (p: SvsPaymentInsert) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const today = toISODate(new Date());
  const [amount, setAmount] = useState(result.total !== null ? formatDecimalInput(result.total) : '');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [quarter, setQuarter] = useState<Quarter>(result.svs_quarter ?? (`Q${Math.floor(new Date().getMonth() / 3) + 1}` as Quarter));
  const year = Number((result.date ?? today).slice(0, 4));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseDecimal(amount);
    if (Number.isNaN(value) || value <= 0) return setError('Bitte gib einen Betrag größer 0 ein.');
    setSaving(true);
    const r = await onAdd({ amount: round2(value), quarter, year, payment_date: date });
    setSaving(false);
    if (r.error) return void toast.error(r.error);
    toast.success('SVS-Beitrag erfasst');
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="SVS-Vorschreibung erkannt"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" form="svs-scan-form" loading={saving}>
            Als bezahlt eintragen
          </Button>
        </>
      }
    >
      <form id="svs-scan-form" onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-slate-700">
          {result.svs_quarter ? `Vorschreibung für ${result.svs_quarter} ${year}` : `Vorschreibung ${year}`}
          {result.total !== null && <> über {formatEuro(result.total)}</>}. SVS-Beiträge zählen im Jahr, in dem du sie
          bezahlst – trag sie ein, sobald die Zahlung erledigt ist.
        </p>
        {result.notes.length > 0 && (
          <Alert type="info">
            <ul className="list-disc space-y-1 pl-4">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </Alert>
        )}
        <Field label="Bezahlter Betrag (€)" inputMode="decimal" value={amount} error={error ?? undefined} onChange={(e) => setAmount(e.target.value)} />
        <Select
          label="Quartal"
          value={quarter}
          onChange={(e) => setQuarter(e.target.value as Quarter)}
          options={(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => ({ value: q, label: `${q} ${year}` }))}
        />
        <Field label="Bezahlt am" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </form>
    </Modal>
  );
}
