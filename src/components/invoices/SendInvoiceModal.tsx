import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Mail, Share2 } from 'lucide-react';
import { buildInvoiceEmail, composeUrl, isPlausibleEmail, type InvoiceEmail, type MailProvider } from '@/lib/invoiceEmail';
import { downloadBlob, renderInvoicePdf } from '@/lib/renderInvoicePdf';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui/Spinner';
import type { Invoice } from '@/types';

const PROVIDERS: { id: MailProvider; label: string }[] = [
  { id: 'gmail', label: 'Gmail' },
  { id: 'outlook', label: 'Outlook.com' },
  { id: 'outlook365', label: 'Outlook (Microsoft 365)' },
  { id: 'mailto', label: 'Mail-Programm' },
];

/** Teilen-Menü mit Datei möglich (Handy, Safari/Chrome am Mac)? */
function canShareFiles(): boolean {
  try {
    const probe = new File([new Uint8Array(1)], 'probe.pdf', { type: 'application/pdf' });
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Rechnung per E-Mail senden – ohne Postfach-Anbindung: am Handy über das Teilen-Menü (PDF hängt dran),
 * am Computer lädt Klaro die PDF herunter und öffnet eine fertige Mail in Gmail, Outlook.com oder dem Mail-Programm.
 */
export function SendInvoiceModal({
  invoice,
  onClose,
  onSent,
}: {
  invoice: Invoice | null;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const [mail, setMail] = useState<InvoiceEmail>({ to: '', subject: '', body: '' });
  const [pdf, setPdf] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [pdfError, setPdfError] = useState(false);
  // Nach Teilen bzw. Öffnen der Mail: Nutzer bestätigt selbst, ob die Mail wirklich weg ist
  const [opened, setOpened] = useState<'share' | 'compose' | null>(null);
  const [busy, setBusy] = useState(false);
  const [share] = useState(canShareFiles);

  // Beim Öffnen: Vorschlag aufbauen und PDF schon erzeugen – Teilen und Pop-ups brauchen einen direkten Klick
  useEffect(() => {
    if (!invoice) return;
    const suggestion = buildInvoiceEmail(invoice);
    setMail(suggestion);
    setPdf(null);
    setPdfError(false);
    setOpened(null);
    let cancelled = false;
    // Adresse erst nach dem Ausstellen beim Kunden eingetragen? Dann die aktuelle nehmen
    if (!suggestion.to && invoice.client_id) {
      void supabase
        .from('clients')
        .select('email')
        .eq('id', invoice.client_id)
        .maybeSingle()
        .then(({ data }) => {
          const email = data?.email?.trim();
          if (!cancelled && email) setMail((m) => (m.to ? m : { ...m, to: email }));
        });
    }
    renderInvoicePdf(invoice).then(
      (result) => !cancelled && setPdf(result),
      () => !cancelled && setPdfError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [invoice]);

  const toInvalid = mail.to.trim() !== '' && !isPlausibleEmail(mail.to);
  // Stabil halten: Modal setzt bei neuem onClose den Fokus zurück aufs erste Feld (Tippen im Text springt sonst)
  const handleClose = useCallback(() => !busy && onClose(), [busy, onClose]);

  async function markSent() {
    setBusy(true);
    try {
      await onSent();
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!pdf) return;
    const file = new File([pdf.blob], pdf.fileName, { type: 'application/pdf' });
    try {
      await navigator.share({ files: [file], title: mail.subject, text: mail.body });
      // share() endet schon mit der Wahl der App – ob die Mail abgeschickt wurde, weiß nur der Nutzer
      setOpened('share');
    } catch (e) {
      // Abbrechen im Teilen-Menü ist kein Fehler
      if ((e as Error).name !== 'AbortError') toast.error('Das Teilen hat nicht geklappt. Versuch es über einen der Knöpfe darunter.');
    }
  }

  function handleCompose(provider: MailProvider) {
    if (!pdf) return;
    downloadBlob(pdf.blob, pdf.fileName);
    const url = composeUrl(provider, mail);
    if (provider === 'mailto') window.location.href = url;
    else {
      // Ohne 'noopener'-Option, damit ein blockiertes Pop-up erkennbar ist (null)
      const win = window.open(url, '_blank');
      if (win) win.opener = null;
      else toast.error('Das Fenster wurde blockiert – erlaube Pop-ups für Klaro und versuch es noch einmal.');
    }
    setOpened('compose');
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(mail.to.trim());
      toast.success('Adresse kopiert');
    } catch {
      toast.error('Kopieren hat nicht geklappt.');
    }
  }

  const docLabel = invoice?.is_honorarnote ? 'Honorarnote' : 'Rechnung';

  return (
    <Modal
      open={!!invoice}
      onClose={handleClose}
      title={`${docLabel} per E-Mail senden`}
      description="Klaro bereitet die Mail vor – abschicken tust du sie aus deinem eigenen Postfach."
      footer={
        opened ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Noch nicht verschickt
            </Button>
            <Button loading={busy} onClick={() => void markSent()}>
              Erledigt – als verschickt merken
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {opened === 'compose' && (
          <Alert type="info">
            Die PDF <strong>{pdf?.fileName}</strong> ist in deinem Download-Ordner. Zieh sie in die neue Mail (oder klick dort
            auf „Anhängen“) und schick die Mail ab. Ist kein Fenster aufgegangen, erlaube Pop-ups für Klaro oder wähle unten
            ein anderes Postfach.
          </Alert>
        )}
        {opened === 'share' && (
          <Alert type="info">Hast du die Mail in deiner Mail-App abgeschickt? Dann merk sie dir hier als verschickt.</Alert>
        )}

        <Field
          label="An"
          type="email"
          value={mail.to}
          error={toInvalid ? 'Bitte prüfe die E-Mail-Adresse.' : undefined}
          hint={mail.to.trim() ? undefined : 'Beim Kunden ist keine E-Mail-Adresse hinterlegt – du kannst sie hier oder in der Mail eintragen.'}
          onChange={(e) => setMail({ ...mail, to: e.target.value })}
        />
        <Field label="Betreff" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
        <TextArea label="Text" rows={8} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />

        {pdfError ? (
          <Alert type="critical">Das PDF konnte nicht erstellt werden. Schließ das Fenster und versuch es erneut.</Alert>
        ) : !pdf ? (
          <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
            <Spinner className="h-4 w-4" /> PDF wird vorbereitet …
          </p>
        ) : (
          <div className="space-y-4">
            {share && (
              <div className="space-y-2">
                <Button icon={<Share2 className="h-4 w-4" />} fullWidth onClick={() => void handleShare()}>
                  Mit Mail-App senden
                </Button>
                <p className="text-xs text-slate-500">
                  Öffnet das Teilen-Menü mit der PDF im Anhang – wähl dort Gmail, Outlook oder Mail. Den Empfänger trägst du in
                  der Mail-App ein.
                  {mail.to.trim() && !toInvalid && (
                    <>
                      {' '}
                      <button type="button" className="inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={() => void copyAddress()}>
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Adresse kopieren
                      </button>
                    </>
                  )}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">{share ? 'Oder im Postfach am Computer öffnen:' : 'Mail öffnen in:'}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PROVIDERS.map((p) => (
                  <Button key={p.id} variant="secondary" icon={<Mail className="h-4 w-4" />} disabled={toInvalid} onClick={() => handleCompose(p.id)}>
                    {p.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-slate-500">Klaro lädt die PDF herunter und öffnet eine fertige Mail – den Anhang fügst du selbst hinzu.</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
