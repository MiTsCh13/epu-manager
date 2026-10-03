import { LayoutDashboard } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Dashboard() {
  return (
    <PageWrapper title="Übersicht" description="Was dir dieses Jahr wirklich bleibt.">
      <EmptyState icon={LayoutDashboard} title="Wird gerade gebaut" description="Dieser Bereich entsteht in Schritt 11." />
    </PageWrapper>
  );
}
