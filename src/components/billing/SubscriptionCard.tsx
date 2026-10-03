import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, CreditCard, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessState } from '@/lib/subscription';
import { openBillingPortal, startCheckout } from '@/lib/billing';
import { formatDate } from '@/lib/invoices';
import { Button } from '@/components/ui/Button';

const BENEFITS = ['Unbegrenzt Rechnungen nach § 11 UStG mit QR-Code', 'SVS-Tracker & Rücklagen-Empfehlung', 'Ausgaben mit Belegfotos', 'Monatlich kündbar'];

/** Abo-Status mit Abschluss (Checkout) bzw. Verwaltung (Kundenportal). */
export function SubscriptionCard() {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const access = getAccessState(profile);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    const error = await action();
    // Bei Erfolg wird weitergeleitet – busy bleibt bis dahin aktiv
    if (error) {
      setBusy(false);
      toast.error(error);
    }
  }

  return (
    <section aria-labelledby="sub-heading" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6" data-testid="subscription-card">
      <h2 id="sub-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
        Dein Abo
      </h2>

      {access.kind === 'active' ? (
        <div className="mt-3 space-y-3">
          <p className="flex items-center gap-2 font-medium text-primary-800" data-testid="subscription-status">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            Klaro Pro ist aktiv
          </p>
          {profile.subscription_renews_at && (
            <p className="text-sm text-slate-600">
              {profile.subscription_cancel_at_period_end
                ? `Gekündigt – dein Zugang läuft am ${formatDate(profile.subscription_renews_at)} aus.`
                : `19 € pro Monat · verlängert sich am ${formatDate(profile.subscription_renews_at)}.`}
            </p>
          )}
          <Button variant="secondary" loading={busy} onClick={() => void run(openBillingPortal)}>
            Abo verwalten
          </Button>
          <p className="text-xs text-slate-500">Zahlungsmethode ändern, Rechnungen herunterladen oder kündigen – sicher bei Stripe.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <p className="font-medium text-slate-900" data-testid="subscription-status">
            {access.kind === 'trial'
              ? `Testphase: noch ${access.daysLeft} ${access.daysLeft === 1 ? 'Tag' : 'Tage'} kostenlos`
              : 'Deine Testphase ist abgelaufen'}
          </p>
          {access.kind === 'expired' && (
            <p className="text-sm text-slate-600">Deine Daten bleiben sichtbar. Neue Rechnungen kannst du mit Klaro Pro wieder erstellen.</p>
          )}
          <ul className="space-y-1.5 text-sm text-slate-700">
            {BENEFITS.map((b) => (
              <li key={b} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<Sparkles className="h-4 w-4" />} loading={busy} onClick={() => void run(startCheckout)}>
              Klaro Pro abonnieren – 19 €/Monat
            </Button>
            {profile.stripe_customer_id && (
              <button type="button" className="text-sm font-semibold text-primary hover:underline" disabled={busy} onClick={() => void run(openBillingPortal)}>
                Bisherige Rechnungen
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">Sichere Zahlung über Stripe (Karte, SEPA, Apple/Google Pay). Monatlich kündbar.</p>
        </div>
      )}
    </section>
  );
}
