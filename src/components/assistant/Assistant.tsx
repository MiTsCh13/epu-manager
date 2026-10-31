import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Car, FileText, Mic, MicOff, Send, Sparkles } from 'lucide-react';
import { askAssistant, invoicePrefill, shortPlace, tripPrefill, type AssistantResult } from '@/lib/assistant';
import { toISODate, formatDate } from '@/lib/invoices';
import { formatEuro, parseDecimal } from '@/lib/money';
import { kilometergeldRate } from '@/lib/profit';
import { VEHICLE_LABELS } from '@/constants/vehicles';
import { supabase } from '@/lib/supabase';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { Product } from '@/types';

const EXAMPLES = ['Fahrt von Linz nach Wien', 'Fahrt zur Tischlerei Holz, gestern', 'Rechnung für Café Sonne mit 3 Stunden Beratung'];

/** Assistent: Knopf unten rechts auf jeder Seite → Befehl sprechen oder tippen → Vorschlag → vorausgefülltes Formular. */
// Hier liegt unten eine eigene Aktionsleiste, die der Knopf verdecken würde: beim Import immer (klebt auch am
// Desktop rechts unten), im Rechnungs-Editor und bei Vorlagen nur am Handy
const HIDE_ALWAYS = [/^\/importieren/];
const HIDE_ON_MOBILE = [/^\/rechnungen\/.+/, /^\/vorlagen\//];

export function Assistant() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { pathname } = useLocation();
  const hideOnMobile = HIDE_ON_MOBILE.some((r) => r.test(pathname));
  if (HIDE_ALWAYS.some((r) => r.test(pathname))) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Assistent: Fahrt oder Rechnung per Sprache erfassen"
        title="Assistent"
        // über der Bottom-Navigation (inkl. iPhone-Rand unten); bei Auswahl-Leisten ausgeblendet (index.css)
        className={`assistant-fab fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:bottom-6 lg:right-6 lg:flex ${
          hideOnMobile ? 'hidden' : 'flex'
        }`}
      >
        <Mic className="h-6 w-6" aria-hidden="true" />
      </button>
      {open && <AssistantDialog onClose={close} />}
    </>
  );
}

function AssistantDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ result: AssistantResult; products: Product[] } | null>(null);
  const [roundTrip, setRoundTrip] = useState<boolean | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  // Sperre gegen doppeltes Senden (Enter, Mikro) – jeder Befehl kostet und zählt gegen das Tageslimit
  const busyRef = useRef(false);
  busyRef.current = busy;
  // Stabil halten: Modal setzt bei neuem onClose den Fokus zurück ins erste Feld
  const handleClose = useCallback(() => !busyRef.current && onClose(), [onClose]);

  const send = useCallback(async (command: string) => {
    if (!command.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      // Frisch laden – Namen gehen nur für diesen Befehl an den Assistenten
      const [clients, products] = await Promise.all([
        supabase.from('clients').select('id, name').order('name'),
        supabase.from('products').select('*').order('name'),
      ]);
      if (clients.error || products.error) {
        setError('Deine Kunden und Produkte konnten nicht geladen werden. Bitte versuche es erneut.');
        return;
      }
      const res = await askAssistant(command, { clients: clients.data, products: products.data, today: toISODate(new Date()) });
      if ('error' in res) return setError(res.error);
      setAnswer({ result: res.result, products: products.data });
      // Hin und zurück fragt Klaro jedes Mal – auch wenn es im Befehl stand
      setRoundTrip(null);
    } catch {
      setError('Der Assistent ist gerade nicht erreichbar. Bitte versuche es später erneut.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const speech = useSpeechRecognition(setText);
  // Nach dem Sprechen gleich losschicken – Tippen geht über „Senden“
  const wasListening = useRef(false);
  const typed = useRef(false);
  useEffect(() => {
    if (wasListening.current && !speech.listening && !speech.error && !typed.current && textRef.current.trim()) void send(textRef.current);
    wasListening.current = speech.listening;
  }, [speech.listening, speech.error, send]);

  // Wer auf den Mikro-Knopf tippt, will sprechen: gleich zuhören (der Klick erlaubt dem Browser das Mikrofon)
  const { supported, start: startListening, cancel: cancelListening } = speech;
  useEffect(() => {
    if (supported) startListening();
  }, [supported, startListening]);

  // Wer tippt, ein Beispiel wählt oder selbst sendet, will nicht mehr sprechen – dann nichts von selbst abschicken
  function stopListening() {
    if (!speech.listening) return;
    typed.current = true;
    cancelListening();
  }

  function listen() {
    typed.current = false;
    setAnswer(null);
    speech.start();
  }

  function openTrip() {
    if (!answer?.result.trip || roundTrip === null) return;
    const prefill = tripPrefill(answer.result.trip, roundTrip, toISODate(new Date()));
    onClose();
    navigate('/ausgaben', { state: { assistantExpense: prefill } });
  }

  function openInvoice() {
    if (!answer?.result.invoice) return;
    const prefill = invoicePrefill(answer.result.invoice, answer.products);
    onClose();
    navigate('/rechnungen/neu', { state: { assistantInvoice: prefill } });
  }

  const result = answer?.result;
  const trip = result?.trip;
  const invoice = result?.invoice;

  return (
    <Modal
      open
      onClose={handleClose}
      title="Was soll Klaro tun?"
      description={
        speech.supported
          ? 'Sag oder tipp, was du erledigen willst – Klaro füllt das Formular vor, du prüfst und speicherst.'
          : 'Tipp, was du erledigen willst – Klaro füllt das Formular vor, du prüfst und speicherst.'
      }
      footer={
        trip ? (
          <Button icon={<Car className="h-4 w-4" />} disabled={roundTrip === null} onClick={openTrip}>
            Im Formular prüfen
          </Button>
        ) : invoice ? (
          <Button icon={<FileText className="h-4 w-4" />} onClick={openInvoice}>
            Rechnung öffnen
          </Button>
        ) : (
          <Button
            icon={<Send className="h-4 w-4" />}
            loading={busy}
            disabled={!text.trim()}
            onClick={() => {
              stopListening();
              void send(text);
            }}
          >
            Senden
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {speech.listening && (
          <div className="flex items-center gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-inset ring-red-200" role="status">
            <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
              {speech.hearing && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />}
              <span className={`relative inline-flex h-3 w-3 rounded-full ${speech.hearing ? 'bg-red-600' : 'bg-red-300'}`} />
            </span>
            <span className="flex-1">
              {speech.hearing ? (
                <>
                  <span className="font-medium">Ich höre zu – sprich jetzt.</span> Wenn du fertig bist, mach einfach eine kurze Pause.
                </>
              ) : (
                'Mikrofon wird eingeschaltet … Erlaubt dein Browser das Mikrofon? Dann bitte zulassen.'
              )}
            </span>
            <button type="button" onClick={speech.stop} className="shrink-0 rounded-md px-2 py-1 font-medium text-red-800 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
              Fertig
            </button>
          </div>
        )}
        <div className="relative">
          <TextArea
            label="Dein Befehl"
            rows={2}
            value={text}
            maxLength={500}
            placeholder={speech.listening ? 'Ich höre zu …' : 'z. B. Fahrt von Linz nach Wien'}
            className="[&_textarea]:pr-14"
            onChange={(e) => {
              stopListening();
              setText(e.target.value);
              if (answer) setAnswer(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                stopListening();
                void send(text);
              }
            }}
          />
          {speech.supported && (
            <button
              type="button"
              disabled={busy}
              onClick={() => (speech.listening ? speech.stop() : listen())}
              aria-label={speech.listening ? 'Zuhören beenden' : 'Befehl sprechen'}
              aria-pressed={speech.listening}
              className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                speech.listening ? 'animate-pulse bg-red-600 text-white' : 'bg-primary-50 text-primary hover:bg-primary-100'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {speech.listening ? <MicOff className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
            </button>
          )}
        </div>

        {speech.error && <Alert type="warning">{speech.error}</Alert>}
        {!speech.supported && !answer && (
          <Alert type="info">
            Spracheingabe gibt es in diesem Browser nicht – verwende Chrome, Edge oder Safari. Am Handy geht auch das Mikrofon auf der Tastatur.
          </Alert>
        )}
        {error && <Alert type="critical">{error}</Alert>}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
            <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" /> Klaro denkt nach …
          </p>
        )}

        {!answer && !busy && (
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-700">Das kann Klaro schon:</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    onClick={() => {
                      stopListening();
                      setText(ex);
                    }}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-left hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    „{ex}“
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result && result.message && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">{result.message}</p>}

        {trip && (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Von</dt>
              <dd className="text-slate-900">{shortPlace(trip.from_label, trip.from) || '–'}</dd>
              <dt className="text-slate-500">Nach</dt>
              <dd className="text-slate-900">{shortPlace(trip.to_label, trip.to) || '–'}</dd>
              <dt className="text-slate-500">Strecke</dt>
              <dd className="text-slate-900">
                {trip.km !== null ? `${trip.km} km pro Richtung${trip.km_source === 'route' ? ' (Routenplaner)' : ''}` : 'trägst du im Formular ein'}
              </dd>
              {trip.date && (
                <>
                  <dt className="text-slate-500">Datum</dt>
                  <dd className="text-slate-900">{formatDate(trip.date)}</dd>
                </>
              )}
              <dt className="text-slate-500">Fahrzeug</dt>
              <dd className="text-slate-900">
                {VEHICLE_LABELS[trip.vehicle ?? 'car']}
                {!trip.vehicle && <span className="text-slate-500"> (im Formular änderbar)</span>}
              </dd>
            </dl>
            <ChoiceCards<boolean>
              legend="Nur hin oder hin und zurück?"
              name="assistant-round-trip"
              value={roundTrip}
              columns={2}
              onChange={setRoundTrip}
              options={[
                {
                  value: false,
                  title: 'Nur hin',
                  description: trip.km !== null ? kmText(trip.km, trip.vehicle ?? 'car', trip.date) : undefined,
                },
                {
                  value: true,
                  title: 'Hin und zurück',
                  description: trip.km !== null ? kmText(trip.km * 2, trip.vehicle ?? 'car', trip.date) : undefined,
                },
              ]}
            />
          </div>
        )}

        {invoice && (
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Kunde: </span>
              {invoice.client_id ? (
                <span className="font-medium text-slate-900">{invoice.client_name}</span>
              ) : (
                <span className="text-amber-800">„{invoice.client_name || '–'}“ nicht gefunden – wählst du im Formular aus</span>
              )}
            </p>
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {invoicePrefill(invoice, answer!.products).rows.map((row, i) => (
                <li key={i} className="flex justify-between gap-3 px-3 py-2">
                  <span className="text-slate-900">
                    {row.quantity} {row.unit} {row.description}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {row.unit_price && !Number.isNaN(parseDecimal(row.unit_price)) ? `${formatEuro(parseDecimal(row.unit_price))} netto` : 'Preis fehlt'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result && (trip || invoice) && (
          <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setAnswer(null)}>
            Etwas anderes sagen
          </button>
        )}
      </div>
    </Modal>
  );
}

function kmText(km: number, vehicle: 'car' | 'motorbike' | 'bike', date: string | null): string {
  return `${km} km · ${formatEuro(km * kilometergeldRate(vehicle, date ?? undefined))}`;
}
