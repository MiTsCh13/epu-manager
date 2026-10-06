// Landeseite für die Links aus den Auth-Mails: Link einlösen und weiter zur passenden Seite.
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { destinationFor, markPasswordLink, parseConfirmLink, parseLinkError } from '@/lib/authLinks';
import { translateAuthError } from '@/lib/validation';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';

type State =
  | { status: 'checking' }
  | { status: 'error'; type: EmailOtpType | null; message: string; hasSession: boolean }
  | { status: 'other-address' };

export default function AuthConfirm() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'checking' });
  // Links sind nur einmal gültig – im StrictMode läuft der Effekt sonst doppelt und der zweite Versuch schlägt fehl
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      const link = parseConfirmLink(location.search);
      const linkError = parseLinkError(location.hash, location.search);

      if (!link) {
        // Standardvorlage von Supabase: die Sitzung steckt schon in der Adresse (detectSessionInUrl)
        const { data } = await supabase.auth.getSession();
        if (data.session && !linkError) return navigate('/onboarding', { replace: true });
        return setState({
          status: 'error',
          type: null,
          message: translateAuthError(linkError ?? 'expired'),
          hasSession: !!data.session,
        });
      }

      const { data, error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
      if (error) {
        const { data: current } = await supabase.auth.getSession();
        return setState({ status: 'error', type: link.type, message: translateAuthError(error.message), hasSession: !!current.session });
      }
      // E-Mail ändern mit doppelter Bestätigung: der erste Link meldet nur „angenommen“, ohne Sitzung
      if (link.type === 'email_change' && !data.session) return setState({ status: 'other-address' });
      if (link.type === 'email_change') toast.success('Deine neue E-Mail-Adresse ist bestätigt.');
      if (link.type === 'recovery' || link.type === 'invite') markPasswordLink();
      navigate(destinationFor(link.type), { replace: true });
    }

    void run();
  }, [location.search, location.hash, navigate]);

  if (state.status === 'checking') {
    return (
      <AuthLayout title="Einen Moment …">
        <div className="flex items-center justify-center gap-3 text-slate-600" role="status">
          <Spinner />
          <span>Wir prüfen deinen Link.</span>
        </div>
      </AuthLayout>
    );
  }

  if (state.status === 'other-address') {
    return (
      <AuthLayout title="Fast geschafft!">
        <Alert type="success">
          Dieser Link ist bestätigt. Wir haben dir auch an deine andere E-Mail-Adresse einen Link geschickt – klicke auch
          auf diesen, dann ist die Änderung abgeschlossen.
        </Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Das hat leider nicht geklappt">
      <div className="space-y-4">
        <Alert type="critical">{state.message}</Alert>
        <LinkErrorHelp type={state.type} hasSession={state.hasSession} />
      </div>
    </AuthLayout>
  );
}

function LinkErrorHelp({ type, hasSession }: { type: EmailOtpType | null; hasSession: boolean }) {
  const linkClass = 'font-semibold text-primary hover:underline';

  if (hasSession) {
    // z. B. Bestätigungslink ein zweites Mal geklickt – du bist ohnehin schon angemeldet
    return (
      <p className="text-sm text-slate-600">
        Du bist bereits angemeldet.{' '}
        <Link to="/" className={linkClass}>
          Weiter zu Klaro
        </Link>
      </p>
    );
  }

  if (type === 'recovery') {
    return (
      <p className="text-sm text-slate-600">
        Links zum Zurücksetzen gelten eine Stunde und nur einmal.{' '}
        <Link to="/passwort-vergessen" className={linkClass}>
          Neuen Link anfordern
        </Link>
      </p>
    );
  }

  return (
    <p className="text-sm text-slate-600">
      Vielleicht hast du dein Konto schon bestätigt – dann melde dich einfach an. Falls nicht, kannst du dir bei der
      Anmeldung einen neuen Bestätigungslink schicken lassen.{' '}
      <Link to="/login" className={linkClass}>
        Zur Anmeldung
      </Link>
    </p>
  );
}
