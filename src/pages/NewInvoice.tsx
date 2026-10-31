import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { InvoicePrefill } from '@/lib/assistant';
import { getAccessState } from '@/lib/subscription';
import { InvoiceEditor } from '@/components/invoices/InvoiceEditor';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Paywall } from '@/components/billing/Paywall';

export default function NewInvoice() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Vom Assistenten vorausgefüllt: einmal übernehmen und den Zustand verbrauchen – sonst öffnet Neuladen oder
  // „Zurück“ den vorausgefüllten Entwurf noch einmal
  const [prefill] = useState(() => (location.state as { assistantInvoice?: InvoicePrefill } | null)?.assistantInvoice ?? null);
  useEffect(() => {
    if (prefill) navigate(location.pathname, { replace: true, state: null });
  }, []); // nur beim Öffnen

  if (profile && getAccessState(profile).kind === 'expired') {
    return (
      <PageWrapper title="Neue Rechnung">
        <Paywall />
      </PageWrapper>
    );
  }
  return <InvoiceEditor invoice={null} prefill={prefill} />;
}
