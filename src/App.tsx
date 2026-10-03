import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import { RedirectIfAuthenticated, RequireAuth } from '@/components/auth/RequireAuth';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Onboarding from '@/pages/Onboarding';
import ComingSoon from '@/pages/ComingSoon';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
          <Route path="/registrieren" element={<RedirectIfAuthenticated><Register /></RedirectIfAuthenticated>} />
          <Route path="/onboarding" element={<RequireAuth allowIncompleteOnboarding><Onboarding /></RequireAuth>} />

          {/* Platzhalter bis Schritt 5+ (Layout, Seiten) */}
          <Route path="/" element={<RequireAuth><ComingSoon title="Dashboard" /></RequireAuth>} />
          <Route path="/rechnungen/neu" element={<RequireAuth><ComingSoon title="Neue Rechnung" /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
