import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { KlaroLogo } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';

/** Platzhalter für Seiten, die in späteren Build-Schritten entstehen. */
export default function ComingSoon({ title }: { title: string }) {
  const { profile, signOut } = useAuth();
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-lg">
        <header className="mb-8 flex items-center justify-between">
          <KlaroLogo />
          <Button variant="ghost" onClick={() => void signOut()}>
            Abmelden
          </Button>
        </header>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <Construction className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-2 text-slate-600">
            Hallo {profile?.full_name?.split(' ')[0] ?? 'du'}! Diese Seite wird gerade gebaut.
          </p>
          <Link to="/" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">
            Zur Startseite
          </Link>
        </div>
      </div>
    </main>
  );
}
