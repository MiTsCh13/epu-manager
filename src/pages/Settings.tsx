import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SubscriptionCard } from '@/components/billing/SubscriptionCard';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Settings() {
  const { refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Rückkehr von Stripe Checkout: Webhook aktualisiert den Status serverseitig – kurz nachladen
  useEffect(() => {
    const result = searchParams.get('abo');
    if (!result) return;
    setSearchParams({}, { replace: true });
    if (result === 'abgebrochen') {
      toast('Bezahlvorgang abgebrochen – du kannst jederzeit später abonnieren.');
      return;
    }
    toast.success('Danke! Dein Klaro-Pro-Abo wird aktiviert …');
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      void refreshProfile();
      if (tries >= 8) clearInterval(timer);
    }, 1500);
    return () => clearInterval(timer);
  }, [searchParams, setSearchParams, refreshProfile]);

  return (
    <PageWrapper title="Einstellungen" description="Dein Geschäftsprofil, Abrechnung und Abo.">
      <div className="space-y-6">
        <SubscriptionCard />
        <EmptyState icon={SettingsIcon} title="Profil-Einstellungen folgen" description="Geschäftsprofil, Steuer-Einstellungen und Rechnungsformat entstehen in Schritt 13." />
      </div>
    </PageWrapper>
  );
}
