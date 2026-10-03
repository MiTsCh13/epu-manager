import { ReceiptEuro } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Expenses() {
  return (
    <PageWrapper title="Ausgaben" description="Deine Ausgaben und SVS-Beiträge.">
      <EmptyState icon={ReceiptEuro} title="Wird gerade gebaut" description="Dieser Bereich entsteht in Schritt 9." />
    </PageWrapper>
  );
}
