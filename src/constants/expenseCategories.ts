// Ausgaben-Kategorien mit E1a-Kennzahl (für Steuerreport-Export in Phase 2).
// Im UI wird nur `label` angezeigt; gespeichert werden `kz` (e1a_kz) und `label` (category_label).
//
// WICHTIG: SVS-Beiträge werden NICHT in dieser Liste geführt,
// sondern in der separaten Tabelle svs_payments — sie sind bei
// allen Gewinnermittlungsarten (auch Pauschalierung) absetzbar.

export type ExpenseCategoryGroup = 'häufig' | 'betrieb' | 'personal' | 'vorsorge' | 'sonstiges';

export interface ExpenseCategory {
  id: string;
  kz: string;
  label: string;
  icon: string;
  group: ExpenseCategoryGroup;
  hasKm?: boolean; // Kilometergeld: Betrag = km × Satz
  isBewirtung?: boolean; // nur 50 % absetzbar (DB-Trigger erzwingt das zusätzlich)
  deductibleRate?: number; // abweichender absetzbarer Anteil (z. B. Öffi-Jahreskarte 50 %)
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  // Häufig genutzt — oben anzeigen
  { id: 'software', kz: '9230', label: 'Software & Abos', icon: 'laptop', group: 'häufig' },
  { id: 'bueromaterial', kz: '9230', label: 'Büromaterial', icon: 'pencil', group: 'häufig' },
  { id: 'reisen', kz: '9160', label: 'Reisen & Fahrtkosten', icon: 'car', group: 'häufig', hasKm: true },
  { id: 'marketing', kz: '9200', label: 'Marketing & Werbung', icon: 'megaphone', group: 'häufig' },
  { id: 'bewirtung', kz: '9200', label: 'Bewirtung (50%)', icon: 'coffee', group: 'häufig', isBewirtung: true },
  { id: 'geraete', kz: '9130', label: 'Geräte & Ausrüstung (AfA)', icon: 'camera', group: 'häufig' },
  { id: 'telefon', kz: '9230', label: 'Telefon & Internet', icon: 'phone', group: 'häufig' },
  // Betrieb
  { id: 'miete', kz: '9180', label: 'Miete & Leasing', icon: 'building', group: 'betrieb' },
  { id: 'homeoffice', kz: '9215', label: 'Homeoffice-Pauschale', icon: 'home', group: 'betrieb' },
  { id: 'bueromoebel', kz: '9216', label: 'Büromöbel (ergonomisch)', icon: 'armchair', group: 'betrieb' },
  { id: 'oeffi', kz: '9165', label: 'Öffi-Jahreskarte (50%)', icon: 'bus', group: 'betrieb', deductibleRate: 0.5 },
  { id: 'bank', kz: '9220', label: 'Bankspesen & Zinsen', icon: 'bank', group: 'betrieb' },
  // Personal & Aufträge
  { id: 'subauftraege', kz: '9110', label: 'Subaufträge & Freelancer', icon: 'users', group: 'personal' },
  { id: 'waren', kz: '9100', label: 'Waren & Materialien', icon: 'package', group: 'personal' },
  { id: 'lizenzen', kz: '9190', label: 'Lizenzen & Provisionen', icon: 'key', group: 'personal' },
  // Versicherung & Vorsorge
  { id: 'versicherungen', kz: '9230', label: 'Versicherungen', icon: 'shield', group: 'vorsorge' },
  { id: 'fortbildung', kz: '9230', label: 'Fortbildung & Kurse', icon: 'book', group: 'vorsorge' },
  { id: 'steuerberatung', kz: '9230', label: 'Steuerberatung', icon: 'calculator', group: 'vorsorge' },
  // Sonstiges
  { id: 'sonstiges', kz: '9090', label: 'Sonstige Ausgaben', icon: 'dots', group: 'sonstiges' },
];

export const EXPENSE_CATEGORY_GROUPS: readonly { id: ExpenseCategoryGroup; label: string }[] = [
  { id: 'häufig', label: 'Häufig' },
  { id: 'betrieb', label: 'Betrieb' },
  { id: 'personal', label: 'Personal & Aufträge' },
  { id: 'vorsorge', label: 'Versicherung & Vorsorge' },
  { id: 'sonstiges', label: 'Sonstiges' },
];

export function findCategoryByLabel(label: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find((c) => c.label === label);
}
