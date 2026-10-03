import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Lock, Sparkles } from 'lucide-react';
import { startCheckout } from '@/lib/billing';
import { Button } from '@/components/ui/Button';

/** Weicher Paywall: Testphase abgelaufen → keine neuen Rechnungen, Daten bleiben sichtbar. */
export function Paywall({ action = 'neue Rechnungen erstellen' }: { action?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-slate-200" data-testid="paywall">
      <Lock className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-semibold text-slate-900">Deine Testphase ist abgelaufen</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
        Alle deine Daten bleiben sichtbar. Um {action}, brauchst du Klaro Pro – 19 € pro Monat, monatlich kündbar.
      </p>
      <div className="mt-5 flex flex-col items-center gap-2">
        <Button
          icon={<Sparkles className="h-4 w-4" />}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const error = await startCheckout();
            if (error) {
              setBusy(false);
              toast.error(error);
            }
          }}
        >
          Klaro Pro abonnieren
        </Button>
        <Link to="/rechnungen" className="text-sm font-semibold text-primary hover:underline">
          Zu deinen Rechnungen
        </Link>
      </div>
    </div>
  );
}
