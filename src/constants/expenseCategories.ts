// Ausgaben-Kategorien mit E1a-Kennzahl (für Steuerreport-Export in Phase 2).
// Im UI werden `label` und `hint` angezeigt; gespeichert werden `kz` (e1a_kz) und `label` (category_label).
// Kennzahlen laut BMF-Formular E 1a 2025.
//
// Anlagen (über 1.000 €, mehrere Jahre genutzt) liegen in der Tabelle assets; Klaro verteilt sie über die Nutzungsdauer.
//
// Die Arbeitsplatzpauschale ist keine Kategorie, sondern eine Einstellung (profiles.home_office) –
// Klaro zieht sie automatisch ab.
//
// WICHTIG: SVS-Beiträge werden NICHT in dieser Liste geführt,
// sondern in der separaten Tabelle svs_payments — sie sind bei
// allen Gewinnermittlungsarten (auch Pauschalierung) absetzbar.
import type { BusinessType } from '@/types';

export type ExpenseCategoryGroup = 'häufig' | 'betrieb' | 'personal' | 'vorsorge' | 'sonstiges';

export interface ExpenseCategory {
  id: string;
  kz: string;
  label: string;
  icon: string;
  group: ExpenseCategoryGroup;
  hint: string; // Was gehört dazu? In einfacher Sprache, für die Auswahl
  hasKm?: boolean; // Kilometergeld: Betrag = km × Satz
  isBewirtung?: boolean; // nur 50 % absetzbar (DB-Trigger erzwingt das zusätzlich)
  deductibleRate?: number; // abweichender absetzbarer Anteil (z. B. Öffi-Jahreskarte 50 %)
  onlyFor?: BusinessType; // nur für diese Tätigkeitsart anbieten
  // Über 1.000 € auf mehrere Jahre verteilen (Anlage, KZ 9130): 'always' = Geräte, 'ask' = Klaro fragt nach
  asset?: 'always' | 'ask';
}

/** Bezeichnung der Kennzahl im E1a (FinanzOnline), gekürzt. */
export const E1A_KZ_NAMES: Record<string, string> = {
  '9100': 'Waren, Rohstoffe, Hilfsstoffe',
  '9110': 'Fremdpersonal und Fremdleistungen',
  '9130': 'Abschreibungen auf das Anlagevermögen',
  '9160': 'Reise- und Fahrtspesen inkl. Kilometergeld und Diäten',
  '9165': 'Pauschale von 50 % für Wochen-, Monats- oder Jahreskarten',
  '9180': 'Miet- und Pachtaufwand, Leasing',
  '9190': 'Provisionen an Dritte, Lizenzgebühren',
  '9200': 'Werbe- und Repräsentationsaufwendungen',
  '9216': 'Ergonomisch geeignetes Mobiliar',
  '9220': 'Zinsen und ähnliche Aufwendungen',
  '9225': 'Eigene Pflichtversicherungsbeiträge (SVS)',
  '9230': 'Übrige Betriebsausgaben',
};

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  // Häufig genutzt — oben anzeigen
  {
    id: 'software', kz: '9230', label: 'Software & Abos', icon: 'laptop', group: 'häufig', asset: 'ask',
    hint: 'Programme, Apps, Cloud-Speicher, Website-Hosting und Domains, Online-Abos für die Arbeit.',
  },
  {
    id: 'bueromaterial', kz: '9230', label: 'Büromaterial', icon: 'pencil', group: 'häufig',
    hint: 'Papier, Druckerpatronen, Stifte, Ordner, Porto. Kleine Dinge, die schnell verbraucht sind.',
  },
  {
    id: 'reisen', kz: '9160', label: 'Reisen & Fahrtkosten', icon: 'car', group: 'häufig', hasKm: true,
    hint: 'Bahn- und Flugtickets, Taxi, Hotel bei Geschäftsreisen, Kilometergeld fürs private Auto (0,50 € pro km). Nicht hier: Öffi-Zeitkarten, die haben eine eigene Kategorie.',
  },
  {
    id: 'marketing', kz: '9200', label: 'Marketing & Werbung', icon: 'megaphone', group: 'häufig',
    hint: 'Inserate, Social-Media-Werbung, Visitenkarten, Flyer, Messestand, Werbegeschenke.',
  },
  {
    id: 'bewirtung', kz: '9200', label: 'Bewirtung (50%)', icon: 'coffee', group: 'häufig', isBewirtung: true,
    hint: 'Geschäftsessen mit Kund:innen, wenn es um einen Auftrag geht. Davon ist nur die Hälfte absetzbar, Klaro rechnet das automatisch. Notiere auf dem Beleg, mit wem und wofür.',
  },
  {
    id: 'geraete', kz: '9130', label: 'Geräte & Ausrüstung', icon: 'camera', group: 'häufig', asset: 'always',
    hint: 'Laptop, Handy, Kamera, Drucker, Werkzeug, Möbel. Bis 1.000 € setzt du den Kaufpreis sofort ganz ab, teurere Geräte verteilt Klaro auf mehrere Jahre.',
  },
  {
    id: 'telefon', kz: '9230', label: 'Telefon & Internet', icon: 'phone', group: 'häufig',
    hint: 'Handyvertrag, Festnetz, Internet. Nutzt du es auch privat, nur den beruflichen Anteil eintragen.',
  },
  // Betrieb
  {
    id: 'miete', kz: '9180', label: 'Miete & Leasing', icon: 'building', group: 'betrieb',
    hint: 'Miete für Büro, Atelier, Praxis oder Coworking-Platz, Leasingraten für Geräte oder Auto.',
  },
  {
    id: 'bueromoebel', kz: '9216', label: 'Büromöbel (ergonomisch)', icon: 'armchair', group: 'betrieb',
    hint: 'Schreibtisch, Drehstuhl, Schreibtischlampe fürs Arbeiten zu Hause, höchstens 300 € im Jahr. Nur wenn du das kleine Arbeitsplatzpauschale (300 €) bekommst, sonst unter „Geräte & Ausrüstung“.',
  },
  {
    id: 'oeffi', kz: '9165', label: 'Öffi-Jahreskarte (50%)', icon: 'bus', group: 'betrieb', deductibleRate: 0.5,
    hint: 'Wochen-, Monats- oder Jahreskarte (z. B. Klimaticket), wenn du sie auch beruflich nutzt. Pauschal ist die Hälfte absetzbar, Klaro rechnet das automatisch.',
  },
  {
    id: 'bank', kz: '9220', label: 'Bankspesen & Zinsen', icon: 'bank', group: 'betrieb',
    hint: 'Kontoführung fürs Geschäftskonto, Überweisungsgebühren, Zinsen für einen Geschäftskredit.',
  },
  {
    id: 'wko', kz: '9230', label: 'WKO-Grundumlage', icon: 'badge', group: 'betrieb', onlyFor: 'gewerbetreibend',
    hint: 'Der Mitgliedsbeitrag an die Wirtschaftskammer, den du als Gewerbetreibende:r jährlich vorgeschrieben bekommst.',
  },
  // Personal & Aufträge
  {
    id: 'subauftraege', kz: '9110', label: 'Subaufträge & Freelancer', icon: 'users', group: 'personal',
    hint: 'Wenn du andere Selbständige für einen Teil deines Auftrags bezahlst, z. B. Texter:in, Entwickler:in, Assistenz.',
  },
  {
    id: 'waren', kz: '9100', label: 'Waren & Materialien', icon: 'package', group: 'personal',
    hint: 'Was du einkaufst, um es weiterzuverkaufen oder zu verarbeiten: Handelsware, Rohstoffe, Material für Aufträge.',
  },
  {
    id: 'lizenzen', kz: '9190', label: 'Lizenzen & Provisionen', icon: 'key', group: 'personal',
    hint: 'Bildrechte, Musiklizenzen, Schriften, Vermittlungsprovisionen an Plattformen oder Agenturen.',
  },
  // Versicherung & Vorsorge
  {
    id: 'versicherungen', kz: '9230', label: 'Versicherungen', icon: 'shield', group: 'vorsorge',
    hint: 'Betriebshaftpflicht, Berufshaftpflicht, Rechtsschutz und Geräteversicherung. Nicht hier: SVS-Beiträge, die erfasst du extra.',
  },
  {
    id: 'fortbildung', kz: '9230', label: 'Fortbildung & Kurse', icon: 'book', group: 'vorsorge',
    hint: 'Kurse, Seminare, Fachbücher und Fachzeitschriften, die mit deiner Tätigkeit zu tun haben.',
  },
  {
    id: 'steuerberatung', kz: '9230', label: 'Steuerberatung', icon: 'calculator', group: 'vorsorge',
    hint: 'Steuerberatung, Buchhaltung, Rechtsberatung für dein Unternehmen.',
  },
  // Sonstiges
  {
    id: 'sonstiges', kz: '9230', label: 'Sonstige Ausgaben', icon: 'dots', group: 'sonstiges', asset: 'ask',
    hint: 'Alles Berufliche, das in keine andere Kategorie passt. Schreib eine kurze Beschreibung dazu.',
  },
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

/** Kategorien für eine Tätigkeitsart. `keepId` bleibt sichtbar (z. B. beim Bearbeiten einer bestehenden Ausgabe). */
export function categoriesFor(businessType: BusinessType | null | undefined, keepId?: string): ExpenseCategory[] {
  return EXPENSE_CATEGORIES.filter((c) => !c.onlyFor || c.onlyFor === businessType || c.id === keepId);
}
