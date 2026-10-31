import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { Assistant } from '@/components/assistant/Assistant';
import { Sidebar } from './Sidebar';
import { BottomNav, MobileDrawer, TopBar } from './MobileNav';

/** Rahmen für alle eingeloggten Seiten: Sidebar (Desktop) bzw. TopBar + Bottom-Navigation (Mobile). */
export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { pathname } = useLocation();

  // Bei Seitenwechsel nach oben scrollen und Menü schließen
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <TopBar onOpenMenu={openMenu} />
      <MobileDrawer open={menuOpen} onClose={closeMenu} />
      <div className="lg:pl-64">
        {/* pb: Platz für die Bottom-Navigation auf Mobile */}
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-10">
          {/* Seiten werden nachgeladen – Navigation bleibt dabei stehen */}
          <Suspense
            fallback={
              <div className="flex justify-center py-20 text-primary" role="status" aria-label="Seite wird geladen">
                <Spinner className="h-8 w-8" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomNav onOpenMenu={openMenu} />
      <Assistant />
    </div>
  );
}
