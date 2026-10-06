// Neues Passwort festlegen – nach dem Link aus „Passwort vergessen“ (oder einer Einladung) bist du schon angemeldet.
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { clearPasswordLink, hasPasswordLink } from '@/lib/authLinks';
import { MIN_PASSWORD_LENGTH, translateAuthError, validateNewPassword } from '@/lib/validation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ next?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Nur nach einem Link aus „Passwort vergessen“/Einladung – sonst gilt „Passwort ändern“ mit aktuellem Passwort
  const [allowed] = useState(hasPasswordLink);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateNewPassword({ next, confirm });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (error) return setFormError(translateAuthError(error.message));
    clearPasswordLink();
    toast.success('Dein neues Passwort ist gespeichert.');
    navigate('/', { replace: true });
  }

  if (!allowed) return <Navigate to="/einstellungen" replace />;

  return (
    <AuthLayout title="Neues Passwort festlegen" subtitle={user?.email ? <>Für {user.email}</> : undefined}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {formError && <Alert type="critical">{formError}</Alert>}
        {/* Für Passwort-Manager: zugehöriger Benutzername */}
        <input type="email" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
        <Field
          label="Neues Passwort"
          type="password"
          autoComplete="new-password"
          hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
          value={next}
          error={errors.next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Field
          label="Neues Passwort wiederholen"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" fullWidth loading={loading}>
          Passwort speichern
        </Button>
      </form>
    </AuthLayout>
  );
}
