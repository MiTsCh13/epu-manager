import { FileText, LayoutDashboard, PiggyBank, ReceiptEuro, Settings, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** In der mobilen Bottom-Navigation anzeigen (max. 4 + „Mehr“) */
  mobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Übersicht', icon: LayoutDashboard, mobile: true },
  { to: '/rechnungen', label: 'Rechnungen', icon: FileText, mobile: true },
  { to: '/ausgaben', label: 'Ausgaben', icon: ReceiptEuro, mobile: true },
  { to: '/svs', label: 'SVS & Rücklagen', icon: PiggyBank, mobile: true },
  { to: '/kunden', label: 'Kunden', icon: Users, mobile: false },
  { to: '/einstellungen', label: 'Einstellungen', icon: Settings, mobile: false },
];
