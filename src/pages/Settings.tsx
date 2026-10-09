import { useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowRight, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SubscriptionCard } from '@/components/billing/SubscriptionCard';
import { BILLING_ENABLED } from '@/lib/subscription';
import { AccountSection } from '@/components/settings/AccountSection';
import { AccountingSection, IdentitySection, InvoicingSection } from '@/components/settings/ProfileSections';
import { TemplatesSection } from '@/components/templates/TemplatesSection';

const SECTIONS = [
  ...(BILLING_ENABLED ? [{ id: 'abo', label: 'Abo' }] : []),
  { id: 'profil', label: 'Über dich & SVS' },
  { id: 'steuer', label: 'Steuer' },
  { id: 'rechnungen', label: 'Adresse & Rechnungen' },
  { id: 'vorlagen', label: 'Rechnungs-Vorlagen' },
  { id: 'import', label: 'Daten übernehmen' },
  { id: 'konto', label: 'Konto' },
];

export default function Settings() {
  const { refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hash } = useLocation();

  // Sprungmarken (z. B. #steuer von der Ausgaben-Seite) anspringen
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

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
    <PageWrapper title="Einstellungen" description={`Dein Geschäftsprofil, Steuer-Einstellungen${BILLING_ENABLED ? ', Abo' : ''} und Konto.`}>
      <nav aria-label="Abschnitte" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 whitespace-nowrap">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-[36px] items-center rounded-full bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mx-auto max-w-3xl space-y-6">
        {BILLING_ENABLED && (
          <div id="abo" className="scroll-mt-20">
            <SubscriptionCard />
          </div>
        )}
        <IdentitySection />
        <AccountingSection />
        <InvoicingSection />
        <TemplatesSection />
        <section id="import" aria-labelledby="import-heading" className="scroll-mt-20 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
          <h2 id="import-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
            Daten übernehmen
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Hast du deine Einnahmen und Ausgaben bisher in Excel geführt? Übernimm sie in Klaro, damit Gewinn, SVS und
            Steuer fürs ganze Jahr stimmen.
          </p>
          <Link to="/importieren" className="mt-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Aus Excel übernehmen
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
        <AccountSection />
      </div>
    </PageWrapper>
  );
}
