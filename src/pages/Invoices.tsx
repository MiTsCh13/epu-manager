import { FileText } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Invoices() {
  return (
    <PageWrapper title="Rechnungen" description="Alle deine Rechnungen und Honorarnoten.">
      <EmptyState icon={FileText} title="Wird gerade gebaut" description="Dieser Bereich entsteht in Schritt 7." />
    </PageWrapper>
  );
}
