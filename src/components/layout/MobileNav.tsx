import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { KlaroLogo } from '@/components/auth/AuthLayout';
import { NAV_ITEMS } from './navigation';
import { NavList } from './Sidebar';
import { TrialBadge } from './TrialBadge';
import { UserMenu } from './UserMenu';
import { LegalLinks } from '@/components/legal/LegalLinks';

/** Mobile TopBar: Logo + Menü-Button. */
export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header
      className="sticky z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <KlaroLogo />
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Menü öffnen"
      >
        <Menu className="h-6 w-6" aria-hidden="true" />
      </button>
    </header>
  );
}

/** Mobile Bottom-Navigation mit den wichtigsten Bereichen. */
export function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const items = NAV_ITEMS.filter((i) => i.mobile);
  return (
    <nav
      aria-label="Schnellnavigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  isActive ? 'text-primary' : 'text-slate-500'
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="max-w-full truncate px-1">{label.split(' ')[0]}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-500"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            Mehr
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Ausklappbares Menü (Mobile) mit vollständiger Navigation, Testphase und Abmelden. */
export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menü">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-white shadow-xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <KlaroLogo />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Menü schließen"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Menü-Navigation" className="flex-1 overflow-y-auto px-3 py-2">
          <NavList onNavigate={onClose} />
        </nav>
        <div className="space-y-3 border-t border-slate-200 p-4">
          <TrialBadge onNavigate={onClose} />
          <UserMenu />
          <LegalLinks onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
