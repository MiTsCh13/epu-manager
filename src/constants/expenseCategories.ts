// Ausgaben-Kategorien mit E1a-Kennzahl (für Steuerreport-Export in Phase 2).
// Kennzahlen laut BMF-Formular E 1a 2025.
//
// Zwei Ebenen:
// - Kategorie (EXPENSE_CATEGORIES): wird gespeichert – `kz` als e1a_kz, `label` als category_label.
// - Kachel (EXPENSE_TILES): was man im Formular antippt. Eine Kachel fasst Kategorien zusammen; haben sie
//   verschiedene Kennzahlen oder Rechenregeln (z. B. Bankgebühren 9230 / Kreditzinsen 9220), fragt Klaro nach.
//
// Anlagen (über 1.000 €, mehrere Jahre genutzt) liegen in der Tabelle assets; Klaro verteilt sie über die Nutzungsdauer.
// Die Arbeitsplatzpauschale ist keine Kategorie, sondern eine Einstellung (profiles.home_office).
//
// WICHTIG: SVS-Beiträge werden NICHT in dieser Liste geführt,
// sondern in der separaten Tabelle svs_payments — sie sind bei
// allen Gewinnermittlungsarten (auch Pauschalierung) absetzbar.
import type { BusinessType, PauschType, ProfitMethod } from '@/types';

export interface ExpenseCategory {
  id: string;
  kz: string;
  label: string;
  icon: string;
  hint: string; // Was gehört dazu? In einfacher Sprache
  hasKm?: boolean; // Kilometergeld: Betrag = km × Satz
  calc?: 'tagesgeld' | 'naechtigung'; // Betrag aus Reisedauer bzw. Nächten
  isBewirtung?: boolean; // nur 50 % absetzbar (DB-Trigger erzwingt das zusätzlich)
  deductibleRate?: number; // abweichender absetzbarer Anteil (z. B. Öffi-Karte 50 %)
  onlyFor?: BusinessType; // nur für diese Tätigkeitsart anbieten
  onlyWithSmallApp?: boolean; // nur mit kleiner Arbeitsplatzpauschale (300 €)
  // Über 1.000 € auf mehrere Jahre verteilen (Anlage, KZ 9130): 'always' = Geräte, 'ask' = Klaro fragt nach
  asset?: 'always' | 'ask';
  // Auch neben der Pauschalierung absetzbar (§ 17 EStG). Fehlt der Eintrag: nur bei Einnahmen-Ausgaben-Rechnung.
  pauschal?: readonly PauschType[];
  // Bei Pauschalierung nur, wenn die Kosten an Kund:innen weiterverrechnet werden (Reisekosten)
  pauschalOnlyReimbursed?: boolean;
}

export interface ExpenseTile {
  id: string;
  label: string;
  icon: string;
  categories: readonly string[]; // IDs aus EXPENSE_CATEGORIES; die erste ist vorausgewählt
  question?: string; // Unterauswahl, wenn mehrere Kategorien angeboten werden
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

const ALL_PAUSCH: readonly PauschType[] = ['ku', 'basis_15', 'basis_6'];
const BASIS_PAUSCH: readonly PauschType[] = ['basis_15', 'basis_6'];

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  {
    id: 'buero', kz: '9230', label: 'Büro & Software', icon: 'laptop', asset: 'ask',
    hint: 'Büromaterial, Porto, Druckerpatronen, Programme und Apps, Cloud-Speicher, Website und Domain, Handy- und Internetvertrag. Nutzt du etwas auch privat, nur den beruflichen Anteil eintragen.',
  },
  {
    id: 'geraete', kz: '9130', label: 'Geräte & Ausrüstung', icon: 'camera', asset: 'always',
    hint: 'Laptop, Handy, Kamera, Drucker, Werkzeug, Möbel. Bis 1.000 € setzt du den Kaufpreis sofort ganz ab, teurere Geräte verteilt Klaro auf mehrere Jahre.',
  },
  {
    id: 'bueromoebel', kz: '9216', label: 'Büromöbel (ergonomisch)', icon: 'armchair', onlyWithSmallApp: true,
    hint: 'Schreibtisch, Drehstuhl, Schreibtischlampe fürs Arbeiten zu Hause, höchstens 300 € im Jahr. Gibt es nur zusätzlich zur kleinen Arbeitsplatzpauschale (300 €).',
  },
  {
    id: 'reisen', kz: '9160', label: 'Fahrten & Reisen', icon: 'car', hasKm: true, pauschal: ALL_PAUSCH, pauschalOnlyReimbursed: true,
    hint: 'Bahn- und Flugtickets, Taxi, Parken, Hotel laut Rechnung, Kilometergeld fürs private Auto (0,50 € pro km). Nicht hier: Öffi-Zeitkarten, die haben eine eigene Kategorie.',
  },
  {
    id: 'tagesgeld', kz: '9160', label: 'Tagesgeld (Diäten)', icon: 'utensils', calc: 'tagesgeld',
    hint: 'Pauschale fürs Essen auf Geschäftsreisen, mindestens 25 km vom Betriebsort entfernt: ab mehr als 3 Stunden 2,50 € pro angefangener Stunde, höchstens 30 € pro Tag. Kein Tagesgeld, wenn du länger als 5 Tage am Stück oder öfter als 15-mal im Jahr am selben Ort bist.',
  },
  {
    id: 'naechtigung', kz: '9160', label: 'Nächtigung (pauschal)', icon: 'bed', calc: 'naechtigung',
    hint: '17 € pro Nacht ohne Beleg, z. B. wenn du privat übernachtest. Hast du eine Hotelrechnung, trag sie stattdessen unter „Fahrten & Reisen“ ein.',
  },
  {
    id: 'oeffi', kz: '9165', label: 'Öffi-Karte (50 %)', icon: 'bus', deductibleRate: 0.5, pauschal: ALL_PAUSCH,
    hint: 'Wochen-, Monats- oder Jahreskarte (z. B. Klimaticket), wenn du sie auch beruflich nutzt. Die Hälfte ist absetzbar – auch bei Pauschalierung. Klaro rechnet das automatisch.',
  },
  {
    id: 'werbung', kz: '9200', label: 'Werbung', icon: 'megaphone',
    hint: 'Inserate, Social-Media-Werbung, Visitenkarten, Flyer, Messestand, Werbegeschenke.',
  },
  {
    id: 'bewirtung', kz: '9200', label: 'Geschäftsessen (50 %)', icon: 'coffee', isBewirtung: true,
    hint: 'Essen mit Kund:innen, wenn es um einen Auftrag geht. Davon ist nur die Hälfte absetzbar, Klaro rechnet das automatisch. Notiere auf dem Beleg, mit wem und wofür.',
  },
  {
    id: 'miete', kz: '9180', label: 'Miete & Leasing', icon: 'building',
    hint: 'Miete für Büro, Atelier, Praxis oder Coworking-Platz, Leasingraten für Geräte oder Auto.',
  },
  {
    id: 'waren', kz: '9100', label: 'Waren & Material', icon: 'package', pauschal: BASIS_PAUSCH,
    hint: 'Was du einkaufst, um es weiterzuverkaufen oder zu verarbeiten: Handelsware, Rohstoffe, Material für Aufträge.',
  },
  {
    id: 'subauftraege', kz: '9110', label: 'Subaufträge & Freelancer', icon: 'users', pauschal: BASIS_PAUSCH,
    hint: 'Wenn du andere Selbständige für einen Teil deines Auftrags bezahlst, z. B. Texter:in, Entwickler:in, Assistenz.',
  },
  {
    id: 'lizenzen', kz: '9190', label: 'Lizenzen & Provisionen', icon: 'key',
    hint: 'Bildrechte, Musiklizenzen, Schriften, Vermittlungsprovisionen an Plattformen oder Agenturen.',
  },
  {
    id: 'versicherung', kz: '9230', label: 'Versicherung & Beratung', icon: 'shield',
    hint: 'Betriebs- und Berufshaftpflicht, Rechtsschutz, Geräteversicherung, Steuerberatung, Buchhaltung, Rechtsberatung. Nicht hier: SVS-Beiträge, die erfasst du extra.',
  },
  {
    id: 'kurse', kz: '9230', label: 'Kurse & Fachbücher', icon: 'book',
    hint: 'Kurse, Seminare, Fachbücher und Fachzeitschriften, die mit deiner Tätigkeit zu tun haben.',
  },
  {
    id: 'bankgebuehren', kz: '9230', label: 'Bankgebühren', icon: 'bank',
    hint: 'Kontoführung fürs Geschäftskonto, Überweisungs- und Kartengebühren, Gebühren von Zahlungsanbietern.',
  },
  {
    id: 'zinsen', kz: '9220', label: 'Kreditzinsen', icon: 'percent',
    hint: 'Zinsen für einen Kredit, mit dem du etwas für dein Unternehmen finanziert hast. Nur die Zinsen, nicht die Rückzahlung.',
  },
  {
    id: 'wko', kz: '9230', label: 'WKO-Grundumlage', icon: 'badge', onlyFor: 'gewerbetreibend',
    hint: 'Der Mitgliedsbeitrag an die Wirtschaftskammer, den du als Gewerbetreibende:r jährlich vorgeschrieben bekommst.',
  },
  {
    id: 'sonstiges', kz: '9230', label: 'Sonstige Ausgaben', icon: 'dots', asset: 'ask',
    hint: 'Alles Berufliche, das in keine andere Kategorie passt. Schreib eine kurze Beschreibung dazu.',
  },
];

/** Kacheln im Formular, nach Häufigkeit sortiert. */
export const EXPENSE_TILES: readonly ExpenseTile[] = [
  { id: 'buero', label: 'Büro & Software', icon: 'laptop', categories: ['buero'] },
  { id: 'geraete', label: 'Geräte & Ausrüstung', icon: 'camera', categories: ['geraete'] },
  { id: 'reisen', label: 'Fahrten & Reisen', icon: 'car', categories: ['reisen'] },
  { id: 'diaeten', label: 'Diäten & Nächtigung', icon: 'utensils', categories: ['tagesgeld', 'naechtigung'], question: 'Was möchtest du eintragen?' },
  { id: 'werbung', label: 'Werbung & Geschäftsessen', icon: 'megaphone', categories: ['werbung', 'bewirtung'], question: 'Was war es?' },
  { id: 'oeffi', label: 'Öffi-Karte (50 %)', icon: 'bus', categories: ['oeffi'] },
  { id: 'miete', label: 'Miete & Leasing', icon: 'building', categories: ['miete'] },
  { id: 'auftraege', label: 'Einkauf & Fremdleistungen', icon: 'package', categories: ['waren', 'subauftraege', 'lizenzen'], question: 'Wofür hast du bezahlt?' },
  { id: 'versicherung', label: 'Versicherung & Beratung', icon: 'shield', categories: ['versicherung'] },
  { id: 'kurse', label: 'Kurse & Fachbücher', icon: 'book', categories: ['kurse'] },
  { id: 'bank', label: 'Bank & Kredit', icon: 'bank', categories: ['bankgebuehren', 'zinsen'], question: 'Gebühren oder Zinsen?' },
  { id: 'wko', label: 'WKO-Grundumlage', icon: 'badge', categories: ['wko'] },
  { id: 'bueromoebel', label: 'Büromöbel (ergonomisch)', icon: 'armchair', categories: ['bueromoebel'] },
  { id: 'sonstiges', label: 'Sonstige Ausgaben', icon: 'dots', categories: ['sonstiges'] },
];

export function findCategoryById(id: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find((c) => c.id === id);
}

export function findCategoryByLabel(label: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find((c) => c.label === label);
}

export function tileOf(categoryId: string): ExpenseTile | undefined {
  return EXPENSE_TILES.find((t) => t.categories.includes(categoryId));
}

/** Wer erfasst: bestimmt, welche Kategorien angeboten werden und was bei Pauschalierung zählt. */
export interface CategoryContext {
  businessType: BusinessType | null | undefined;
  profitMethod: ProfitMethod;
  pauschType: PauschType | null | undefined;
  smallApp: boolean; // kleine Arbeitsplatzpauschale (300 €)
}

/** Zählt die Kategorie bei der gewählten Gewinnermittlung? (Bei Pauschalierung nur, was § 17 EStG zusätzlich erlaubt.) */
export function countsUnder(category: ExpenseCategory, profitMethod: ProfitMethod, pauschType: PauschType | null | undefined): boolean {
  if (profitMethod !== 'pauschal') return true;
  return !!category.pauschal?.includes(pauschType ?? 'ku');
}

export function isCategoryOffered(category: ExpenseCategory, ctx: CategoryContext): boolean {
  if (category.onlyFor && category.onlyFor !== ctx.businessType) return false;
  if (category.onlyWithSmallApp && !ctx.smallApp) return false;
  return countsUnder(category, ctx.profitMethod, ctx.pauschType);
}

/**
 * Kacheln mit den angebotenen Kategorien. `keepId` bleibt sichtbar (z. B. beim Bearbeiten einer bestehenden Ausgabe).
 * Kacheln ohne angebotene Kategorie fallen weg.
 */
export function tilesFor(ctx: CategoryContext, keepId?: string): { tile: ExpenseTile; categories: ExpenseCategory[] }[] {
  return EXPENSE_TILES.map((tile) => ({
    tile,
    categories: tile.categories
      .map((id) => findCategoryById(id)!)
      .filter((c) => c.id === keepId || isCategoryOffered(c, ctx)),
  })).filter((t) => t.categories.length > 0);
}
