import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { requestPasswordReset } from '@/lib/authLinks';
import { isValidEmail } from '@/lib/validation';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) return setError('Bitte gib eine gültige E-Mail-Adresse ein.');
    setLoading(true);
    setError(null);
    const resetError = await requestPasswordReset(email);
    setLoading(false);
    if (resetError) return setError(resetError);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout title="Schau in dein Postfach">
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
          {/* Bewusst neutral: wir verraten nicht, ob es zu dieser Adresse ein Konto gibt */}
          <p className="text-slate-700">
            Wenn es zu <strong>{email.trim()}</strong> ein Klaro-Konto gibt, haben wir dir einen Link geschickt, mit dem
            du ein neues Passwort festlegen kannst. Der Link gilt eine Stunde.
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
    <AuthLayout title="Passwort vergessen?" subtitle="Kein Problem – wir schicken dir einen Link für ein neues Passwort.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Alert type="critical">{error}</Alert>}
        <Field
          label="E-Mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" fullWidth loading={loading}>
          Link schicken
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Doch wieder eingefallen?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Anmelden
        </Link>
      </p>
    </AuthLayout>
  );
}
