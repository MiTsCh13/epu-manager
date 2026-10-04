import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isValidEmail, MIN_PASSWORD_LENGTH, translateAuthError } from '@/lib/validation';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

export default function Register() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return setError('Bitte gib deinen Namen ein.');
    if (!isValidEmail(email)) return setError('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Dein Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`);
    }

    setLoading(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    });
    setLoading(false);

    if (authError) return setError(translateAuthError(authError.message));
    // Supabase verrät aus Sicherheitsgründen nicht direkt, ob die E-Mail existiert:
    // bei bestehenden Konten kommt ein User ohne Identities zurück.
    if (data.user && data.user.identities?.length === 0) {
      return setError(translateAuthError('already registered'));
    }
    if (data.session) navigate('/onboarding', { replace: true });
    else setAwaitingConfirmation(true);
  }

  if (awaitingConfirmation) {
    return (
      <AuthLayout title="Fast geschafft!">
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
          <p className="text-slate-700">
            Wir haben dir eine E-Mail an <strong>{email.trim()}</strong> geschickt. Klicke auf den Link darin, um dein
            Konto zu bestätigen – danach richten wir gemeinsam dein Profil ein.
          </p>
          <p className="text-sm text-slate-500">Keine E-Mail bekommen? Schau auch im Spam-Ordner nach.</p>
          <Link to="/login" className="inline-block text-sm font-semibold text-primary hover:underline">
            Zur Anmeldung
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Konto erstellen"
      subtitle="14 Tage kostenlos testen – keine Kreditkarte nötig."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Alert type="critical">{error}</Alert>}
        <Field label="Dein Name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Field
          label="E-Mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Passwort"
          type="password"
          autoComplete="new-password"
          hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" fullWidth loading={loading}>
          Kostenlos starten
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Schon registriert?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Anmelden
        </Link>
      </p>
    </AuthLayout>
  );
}
