import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import { RedirectIfAuthenticated, RequireAuth } from '@/components/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Onboarding from '@/pages/Onboarding';
import Dashboard from '@/pages/Dashboard';
import Invoices from '@/pages/Invoices';
import NewInvoice from '@/pages/NewInvoice';
import InvoiceView from '@/pages/InvoiceView';
import Expenses from '@/pages/Expenses';
import Clients from '@/pages/Clients';
import SVSTracker from '@/pages/SVSTracker';
import Settings from '@/pages/Settings';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
          <Route path="/registrieren" element={<RedirectIfAuthenticated><Register /></RedirectIfAuthenticated>} />
          <Route path="/onboarding" element={<RequireAuth allowIncompleteOnboarding><Onboarding /></RequireAuth>} />

          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="rechnungen" element={<Invoices />} />
            <Route path="rechnungen/neu" element={<NewInvoice />} />
            <Route path="rechnungen/:id" element={<InvoiceView />} />
            <Route path="ausgaben" element={<Expenses />} />
            <Route path="kunden" element={<Clients />} />
            <Route path="svs" element={<SVSTracker />} />
            <Route path="einstellungen" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
