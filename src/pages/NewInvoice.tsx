import { FilePlus } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NewInvoice() {
  return (
    <PageWrapper title="Neue Rechnung" description="Erstelle eine Rechnung mit allen Pflichtangaben.">
      <EmptyState icon={FilePlus} title="Wird gerade gebaut" description="Dieser Bereich entsteht in Schritt 7." />
    </PageWrapper>
  );
}
