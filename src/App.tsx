import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import { RedirectIfAuthenticated, RequireAuth } from '@/components/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import { FullPageSpinner } from '@/components/ui/Spinner';

// Seiten einzeln nachladen: Login/Registrierung bleiben klein, Diagramme & Co. kommen erst bei Bedarf
const AuthConfirm = lazy(() => import('@/pages/AuthConfirm'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Invoices = lazy(() => import('@/pages/Invoices'));
const NewInvoice = lazy(() => import('@/pages/NewInvoice'));
const InvoiceView = lazy(() => import('@/pages/InvoiceView'));
const Expenses = lazy(() => import('@/pages/Expenses'));
const Clients = lazy(() => import('@/pages/Clients'));
const SVSTracker = lazy(() => import('@/pages/SVSTracker'));
const Settings = lazy(() => import('@/pages/Settings'));
const Import = lazy(() => import('@/pages/Import'));
const TemplateEditor = lazy(() => import('@/pages/TemplateEditor'));

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
          <Route path="/registrieren" element={<RedirectIfAuthenticated><Register /></RedirectIfAuthenticated>} />
          <Route path="/passwort-vergessen" element={<RedirectIfAuthenticated><ForgotPassword /></RedirectIfAuthenticated>} />
          {/* Links aus den Auth-Mails – bewusst ohne Weiterleitung, auch wer schon angemeldet ist, löst den Link ein */}
          <Route path="/auth/bestaetigen" element={<AuthConfirm />} />
          <Route path="/passwort-neu" element={<RequireAuth allowIncompleteOnboarding><ResetPassword /></RequireAuth>} />
          <Route path="/onboarding" element={<RequireAuth allowIncompleteOnboarding><Onboarding /></RequireAuth>} />

          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="rechnungen" element={<Invoices />} />
            <Route path="rechnungen/neu" element={<NewInvoice />} />
            <Route path="rechnungen/:id" element={<InvoiceView />} />
            <Route path="ausgaben" element={<Expenses />} />
            <Route path="kunden" element={<Clients />} />
            <Route path="gewinn" element={<SVSTracker />} />
            <Route path="svs" element={<Navigate to="/gewinn" replace />} />
            <Route path="einstellungen" element={<Settings />} />
            <Route path="importieren" element={<Import />} />
            <Route path="vorlagen/:id" element={<TemplateEditor />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
