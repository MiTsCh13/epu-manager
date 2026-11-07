import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Heart, MessageSquareHeart, Send } from 'lucide-react';
import { FEEDBACK_KINDS, FEEDBACK_MAX, feedbackErrors, feedbackRow, type FeedbackDraft, type FeedbackErrors, type FeedbackKind } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

/** Eintrag „Feedback & Wünsche“ in Seitenleiste und Handy-Menü – sieht aus wie die anderen Menüpunkte. */
export function FeedbackNavButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <MessageSquareHeart className="h-5 w-5 shrink-0" aria-hidden="true" />
      Feedback &amp; Wünsche
    </button>
  );
}

/** Fenster: Art wählen, Text schreiben, optional Antwort erlauben → Tabelle `feedback` (lesen kann nur der Betreiber). */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [draft, setDraft] = useState<FeedbackDraft>({ kind: null, message: '', contactOk: false });
  const [error, setError] = useState<string | null>(null);
  // Feldfehler erst nach dem ersten Senden zeigen, dann laufend aktualisieren
  const [tried, setTried] = useState(false);
  const fieldErrors: FeedbackErrors = tried ? feedbackErrors(draft) : {};
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const busyRef = useRef(false);
  const handleClose = useCallback(() => !busyRef.current && onClose(), [onClose]);

  async function submit() {
    setTried(true);
    if (Object.keys(feedbackErrors(draft)).length > 0 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('feedback').insert(feedbackRow({ ...draft, kind: draft.kind! }, pathname));
      if (err) {
        // Tageslimit aus der Datenbank – der Text ist schon verständlich
        setError(err.hint === 'feedback_limit' ? err.message : 'Dein Feedback konnte nicht gesendet werden. Bitte versuch es erneut.');
        return;
      }
      setSent(true);
    } catch {
      setError('Dein Feedback konnte nicht gesendet werden. Bitte versuch es erneut.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (sent) {
    return (
      // eigener key: neues Fenster, damit der Fokus neu gesetzt und der Titel vorgelesen wird
      <Modal key="sent" open onClose={handleClose} title="Danke für dein Feedback!" size="sm" footer={<Button onClick={onClose}>Fertig</Button>}>
        <div className="flex gap-3 text-sm text-slate-700">
          <Heart className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p>
            Jede Nachricht wird persönlich gelesen.
            {draft.contactOk ? ' Bei Rückfragen bekommst du eine E-Mail.' : ''}
          </p>
        </div>
      </Modal>
    );
  }

  const kind = FEEDBACK_KINDS.find((k) => k.value === draft.kind);
  return (
    <Modal
      open
      onClose={handleClose}
      title="Feedback & Wünsche"
      description="Was fehlt dir, was stört dich, was gefällt dir? Klaro wird mit deinen Rückmeldungen besser."
      footer={
        <Button icon={<Send className="h-4 w-4" />} loading={busy} onClick={() => void submit()}>
          Senden
        </Button>
      }
    >
      <div className="space-y-4">
        <ChoiceCards<FeedbackKind>
          legend="Worum geht es?"
          name="feedback-kind"
          value={draft.kind}
          columns={2}
          error={fieldErrors.kind}
          onChange={(k) => setDraft((d) => ({ ...d, kind: k }))}
          options={FEEDBACK_KINDS.map(({ value, title }) => ({ value, title }))}
        />
        <TextArea
          label="Deine Nachricht"
          rows={5}
          maxLength={FEEDBACK_MAX}
          value={draft.message}
          error={fieldErrors.message}
          hint={draft.message.length > FEEDBACK_MAX - 500 ? `${draft.message.length.toLocaleString('de-AT')} von ${FEEDBACK_MAX.toLocaleString('de-AT')} Zeichen` : undefined}
          placeholder={kind?.placeholder ?? 'Was möchtest du uns sagen?'}
          onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.contactOk}
            onChange={(e) => setDraft((d) => ({ ...d, contactOk: e.target.checked }))}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span>
            <span className="font-medium text-slate-900">Du darfst mir antworten</span>
            <span className="block text-slate-600">
              Dann wird deine E-Mail-Adresse{user?.email ? ` (${user.email})` : ''} mitgeschickt und du bekommst bei
              Rückfragen eine Antwort. Dein Feedback ist in jedem Fall deinem Konto zugeordnet – ohne Haken bekommst du
              aber keine E-Mail dazu.
            </span>
          </span>
        </label>
        <p className="text-xs text-slate-500">
          Bitte keine Daten deiner Kundinnen und Kunden hineinschreiben. Mitgeschickt wird nur, auf welcher Seite du gerade
          bist – nicht deine Rechnungen oder Zahlen.
        </p>
        {error && <Alert type="warning">{error}</Alert>}
      </div>
    </Modal>
  );
}
