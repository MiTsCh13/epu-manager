import { Users } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Clients() {
  return (
    <PageWrapper title="Kunden" description="Deine Kundinnen und Kunden.">
      <EmptyState icon={Users} title="Wird gerade gebaut" description="Dieser Bereich entsteht in Schritt 6." />
    </PageWrapper>
  );
}
