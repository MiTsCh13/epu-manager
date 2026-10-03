import { useAuth } from '@/contexts/AuthContext';
import { getAccessState } from '@/lib/subscription';
import { InvoiceEditor } from '@/components/invoices/InvoiceEditor';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Paywall } from '@/components/billing/Paywall';

export default function NewInvoice() {
  const { profile } = useAuth();
  if (profile && getAccessState(profile).kind === 'expired') {
    return (
      <PageWrapper title="Neue Rechnung">
        <Paywall />
      </PageWrapper>
    );
  }
  return <InvoiceEditor invoice={null} />;
}
