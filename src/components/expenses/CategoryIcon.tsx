import {
  Armchair, BadgeCheck, BookOpen, Bus, Calculator, Camera, Car, Coffee, Home, KeyRound, Landmark, Laptop, Megaphone,
  MoreHorizontal, Package, Pencil, Shield, Smartphone, Building2, Users, type LucideIcon,
} from 'lucide-react';
import { findCategoryByLabel } from '@/constants/expenseCategories';

const ICONS: Record<string, LucideIcon> = {
  laptop: Laptop, pencil: Pencil, car: Car, megaphone: Megaphone, coffee: Coffee, camera: Camera, phone: Smartphone,
  building: Building2, home: Home, armchair: Armchair, bus: Bus, bank: Landmark, users: Users, package: Package,
  key: KeyRound, shield: Shield, book: BookOpen, calculator: Calculator, dots: MoreHorizontal, badge: BadgeCheck,
};

export function CategoryIcon({ icon, className = 'h-5 w-5' }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? MoreHorizontal;
  return <Icon className={className} aria-hidden="true" />;
}

/** Icon zu einer gespeicherten Ausgabe (über das Kategorie-Label). */
export function ExpenseCategoryIcon({ label, className }: { label: string; className?: string }) {
  return <CategoryIcon icon={findCategoryByLabel(label)?.icon ?? 'dots'} className={className} />;
}
