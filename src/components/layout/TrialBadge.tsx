import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessState } from '@/lib/subscription';

/** Hinweis auf Testphase bzw. abgelaufenen Zugang (bei aktivem Abo unsichtbar). */
export function TrialBadge({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useAuth();
  if (!profile) return null;
  const access = getAccessState(profile);
  if (access.kind === 'active') return null;

  const expired = access.kind === 'expired';
  return (
    <Link
      to="/einstellungen"
      onClick={onNavigate}
      className={`block rounded-lg p-3 text-sm ring-1 ring-inset transition-colors ${
        expired ? 'bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100' : 'bg-primary-50 text-primary-900 ring-primary-100 hover:bg-primary-100'
      }`}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {expired ? 'Testphase abgelaufen' : `Testphase: noch ${access.daysLeft} ${access.daysLeft === 1 ? 'Tag' : 'Tage'}`}
      </span>
      <span className="mt-0.5 block text-xs opacity-80">
        {expired ? 'Jetzt Klaro Pro abonnieren →' : 'Klaro Pro für 19 €/Monat →'}
      </span>
    </Link>
  );
}
