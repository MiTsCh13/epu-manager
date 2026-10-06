import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { isValidEmail, translateAuthError } from '@/lib/validation';
import { BILLING_ENABLED } from '@/lib/subscription';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ResendConfirmation } from '@/components/auth/ResendConfirmation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // E-Mail noch nicht bestätigt → neuen Bestätigungslink anbieten
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) return setError('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (!password) return setError('Bitte gib dein Passwort ein.');

    setLoading(true);
    setError(null);
    setUnconfirmed(false);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (authError) {
      setUnconfirmed(authError.message.toLowerCase().includes('email not confirmed'));
      return setError(translateAuthError(authError.message));
    }
    navigate(from, { replace: true });
  }

  return (
    <AuthLayout title="Willkommen zurück" subtitle="Melde dich an, um deine Finanzen im Blick zu behalten.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Alert type="critical">{error}</Alert>}
        {unconfirmed && <ResendConfirmation email={email} />}
        <Field
          label="E-Mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setUnconfirmed(false);
          }}
          required
        />
        <Field
          label="Passwort"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="-mt-2 text-right text-sm">
          <Link to="/passwort-vergessen" className="font-medium text-primary hover:underline">
            Passwort vergessen?
          </Link>
        </p>
        <Button type="submit" fullWidth loading={loading}>
          Anmelden
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Noch kein Konto?{' '}
        <Link to="/registrieren" className="font-semibold text-primary hover:underline">
          {BILLING_ENABLED ? '14 Tage kostenlos testen' : 'Kostenlos registrieren'}
        </Link>
      </p>
    </AuthLayout>
  );
}
