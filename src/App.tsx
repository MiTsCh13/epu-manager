import { Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Platzhalter bis Schritt 4/5 (Auth, Layout). Routen werden dort ausgebaut.
function Placeholder() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12">
      <h1 className="text-4xl font-bold text-primary">Klaro</h1>
      <p className="mt-2 text-lg text-slate-600">Endlich weißt du, was dir wirklich bleibt.</p>
      <p className="mt-8 text-sm text-slate-500">Projektsetup abgeschlossen – die App wird Schritt für Schritt aufgebaut.</p>
    </main>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="*" element={<Placeholder />} />
      </Routes>
      <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
    </>
  );
}
