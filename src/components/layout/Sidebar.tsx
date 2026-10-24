import { NavLink } from 'react-router-dom';
import { KlaroLogo } from '@/components/auth/AuthLayout';
import { NAV_ITEMS } from './navigation';
import { TrialBadge } from './TrialBadge';
import { UserMenu } from './UserMenu';
import { LegalLinks } from '@/components/legal/LegalLinks';

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                isActive ? 'bg-primary-50 text-primary-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** Feste Sidebar ab Desktop-Breite (lg). */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-16 items-center px-5">
        <KlaroLogo />
      </div>
      <nav aria-label="Hauptnavigation" className="flex-1 overflow-y-auto px-3 py-2">
        <NavList />
      </nav>
      <div className="space-y-3 border-t border-slate-200 p-4">
        <TrialBadge />
        <UserMenu />
        <LegalLinks />
      </div>
    </aside>
  );
}
