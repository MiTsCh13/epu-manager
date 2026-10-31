import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API – in TypeScript noch nicht enthalten; nur das, was Klaro braucht
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Klaro darf das Mikrofon nicht verwenden. Erlaube den Zugriff in den Browser-Einstellungen oder tipp den Befehl.',
  'service-not-allowed': 'Die Spracherkennung ist in diesem Browser nicht erlaubt. Tipp den Befehl bitte.',
  'no-speech': 'Ich habe nichts gehört. Versuch es noch einmal.',
  'audio-capture': 'Kein Mikrofon gefunden.',
  network: 'Die Spracherkennung braucht eine Internetverbindung.',
};

/**
 * Spracheingabe über den Browser (Chrome: Google, Safari: Apple). Liefert den erkannten Text laufend über
 * onText; `supported` ist false in Browsern ohne Spracherkennung (z. B. Firefox) – dann bleibt das Tippen.
 * `listening` gilt ab start(), `hearing` erst, wenn das Mikrofon wirklich aufnimmt (vorher fragt der Browser
 * ggf. noch nach der Erlaubnis).
 */
export function useSpeechRecognition(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const supported = recognitionCtor() !== null;

  const stop = useCallback(() => recognition.current?.stop(), []);
  // Abbrechen ohne Ergebnis (z. B. weil die Person doch tippt)
  const cancel = useCallback(() => recognition.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    recognition.current?.abort();
    const r = new Ctor();
    r.lang = 'de-AT';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    // Ereignisse einer abgebrochenen, älteren Erkennung ignorieren (kommen asynchron nach)
    const current = () => recognition.current === r;
    r.onresult = (e) => {
      if (!current()) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      onTextRef.current((finalText + interim).trim());
    };
    r.onerror = (e) => {
      if (current() && e.error !== 'aborted') setError(ERRORS[e.error] ?? 'Die Spracherkennung hat nicht geklappt. Tipp den Befehl bitte.');
    };
    r.onaudiostart = () => current() && setHearing(true);
    r.onend = () => {
      if (!current()) return;
      setListening(false);
      setHearing(false);
    };
    recognition.current = r;
    setError(null);
    setHearing(false);
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }, []);

  // Beim Schließen des Assistenten nicht weiter zuhören
  useEffect(() => () => recognition.current?.abort(), []);

  return { supported, listening, hearing, error, start, stop, cancel };
}
