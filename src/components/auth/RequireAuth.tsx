import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

/**
 * Schützt Routen: ohne Login → /login, ohne abgeschlossenes Onboarding → /onboarding.
 * `allowIncompleteOnboarding` für die Onboarding-Seite selbst.
 */
export function RequireAuth({
  children,
  allowIncompleteOnboarding = false,
}: {
  children: ReactNode;
  allowIncompleteOnboarding?: boolean;
}) {
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (profileError || !profile) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 text-center">
        <p className="text-slate-700">{profileError ?? 'Dein Profil konnte nicht geladen werden.'}</p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => void refreshProfile()}>Erneut versuchen</Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            Abmelden
          </Button>
        </div>
      </main>
    );
  }

  if (!allowIncompleteOnboarding && !profile.onboarding_completed) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** Für Login/Registrierung: eingeloggte Nutzer direkt weiterleiten. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}
