import { PiggyBank } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EmptyState } from '@/components/ui/EmptyState';

export default function SVSTracker() {
  return (
    <PageWrapper title="SVS & Rücklagen" description="Wie viel du für SVS und Steuer zur Seite legen solltest.">
      <EmptyState icon={PiggyBank} title="Wird gerade gebaut" description="Dieser Bereich entsteht in Schritt 10." />
    </PageWrapper>
  );
}
