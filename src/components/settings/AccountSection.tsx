import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { KeyRound, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { changePassword, deleteAccount, DELETE_CONFIRM_WORD } from '@/lib/account';
import { getAccessState } from '@/lib/subscription';
import { MIN_PASSWORD_LENGTH, validatePasswordChange, type PasswordChangeData, type PasswordChangeErrors } from '@/lib/validation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

export function AccountSection() {
  const { user, signOut } = useAuth();
  const [dialog, setDialog] = useState<'password' | 'delete' | null>(null);
  // Stabil halten: Modal fokussiert bei jeder neuen onClose-Referenz erneut das erste Feld
  const close = useCallback(() => setDialog(null), []);

  return (
    <section id="konto" aria-labelledby="konto-heading" className="scroll-mt-20 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 id="konto-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
        Konto & Sicherheit
      </h2>
      <p className="mt-3 text-sm text-slate-600">
        Angemeldet als <span className="font-medium text-slate-900">{user?.email}</span>
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" onClick={() => setDialog('password')}>
          Passwort ändern
        </Button>
        <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>
          Abmelden
        </Button>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-red-700">Konto löschen</h3>
        <p className="mt-1 text-sm text-slate-600">
          Löscht dein Konto mit allen Kunden, Rechnungen, Ausgaben und Belegen endgültig.
        </p>
        <Button variant="danger" className="mt-3" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDialog('delete')}>
          Konto löschen
        </Button>
      </div>

      {dialog === 'password' && <ChangePasswordDialog onClose={close} />}
      {dialog === 'delete' && <DeleteAccountDialog onClose={close} />}
    </section>
  );
}

// ─── Passwort ändern ────────────────────────────────────────

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState<PasswordChangeData>({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<PasswordChangeData>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch) as (keyof PasswordChangeData)[]) delete next[key];
      return next;
    });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validatePasswordChange(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const result = await changePassword(user!.email!, form.current, form.next);
    setBusy(false);
    if (result?.field === 'current') return setErrors({ current: result.error });
    if (result) return setFormError(result.error);
    toast.success('Dein Passwort wurde geändert.');
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Passwort ändern"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" form="password-form" loading={busy}>
            Speichern
          </Button>
        </>
      }
    >
      <form id="password-form" onSubmit={submit} noValidate className="space-y-4">
        {/* Für Passwort-Manager: zugehöriger Benutzername */}
        <input type="email" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
        <Field
          label="Aktuelles Passwort"
          type="password"
          autoComplete="current-password"
          value={form.current}
          error={errors.current}
          onChange={(e) => set({ current: e.target.value })}
        />
        <Field
          label="Neues Passwort"
          type="password"
          autoComplete="new-password"
          value={form.next}
          error={errors.next}
          hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
          onChange={(e) => set({ next: e.target.value })}
        />
        <Field
          label="Neues Passwort wiederholen"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          error={errors.confirm}
          onChange={(e) => set({ confirm: e.target.value })}
        />
        {formError && <Alert type="critical">{formError}</Alert>}
      </form>
    </Modal>
  );
}

// ─── Konto löschen ──────────────────────────────────────────

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmWord, setConfirmWord] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasActiveSubscription = !!profile && getAccessState(profile).kind === 'active';
  const ready = password.length > 0 && confirmWord.trim().toUpperCase() === DELETE_CONFIRM_WORD;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setFormError(null);
    const result = await deleteAccount(user!.email!, password);
    if (result) {
      setBusy(false);
      if (result.field === 'password') setPasswordError(result.error);
      else setFormError(result.error);
      return;
    }
    toast.success('Dein Konto wurde gelöscht. Danke, dass du Klaro ausprobiert hast.');
    navigate('/login', { replace: true });
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Konto endgültig löschen?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" form="delete-account-form" variant="danger" loading={busy} disabled={!ready}>
            Endgültig löschen
          </Button>
        </>
      }
    >
      <form id="delete-account-form" onSubmit={submit} noValidate className="space-y-4">
        <Alert type="critical" title="Das kann nicht rückgängig gemacht werden">
          Gelöscht werden dein Profil, alle Kunden, Rechnungen, Ausgaben, SVS-Zahlungen und Belegfotos.
        </Alert>
        <Alert type="warning" title="Aufbewahrungspflicht beachten">
          Rechnungen und Belege musst du 7 Jahre aufbewahren (§ 132 BAO). Lade deine Rechnungen vorher als PDF herunter
          –{' '}
          <Link to="/rechnungen" className="font-medium underline" onClick={onClose}>
            zu deinen Rechnungen
          </Link>
          .
        </Alert>
        {hasActiveSubscription && (
          <p className="text-sm text-slate-700">
            Dein Klaro-Pro-Abo wird sofort beendet. Bereits bezahlte Zeit wird nicht anteilig erstattet.
          </p>
        )}
        <p className="text-xs text-slate-500">
          Die Zahlungsbelege deines Abos bewahrt unser Zahlungsanbieter Stripe wegen der gesetzlichen Aufbewahrungspflicht auf.
        </p>

        <input type="email" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
        <Field
          label="Dein Passwort"
          type="password"
          autoComplete="current-password"
          value={password}
          error={passwordError}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordError(undefined);
          }}
        />
        <Field
          label={`Tippe ${DELETE_CONFIRM_WORD} zur Bestätigung`}
          autoComplete="off"
          autoCapitalize="characters"
          value={confirmWord}
          onChange={(e) => setConfirmWord(e.target.value)}
        />
        {formError && <Alert type="critical">{formError}</Alert>}
      </form>
    </Modal>
  );
}
