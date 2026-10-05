// Anlagen und Abschreibung (AfA): Geräte über 1.000 € werden linear über die Nutzungsdauer verteilt.
// Nur bei Einnahmen-Ausgaben-Rechnung – bei Pauschalierung ist die Abschreibung im Pauschalsatz enthalten.
import { AFA_HALF_YEAR_FROM_MONTH, GWG_LIMIT } from '@/constants/tax2026';
import { round2 } from './money';

export { GWG_LIMIT };

/** Übliche Nutzungsdauern zur Auswahl (Jahre). Das Auto hat gesetzlich mindestens 8 Jahre. */
export const USEFUL_LIFE_PRESETS = [
  { id: 'computer', label: 'Computer, Laptop, Tablet, Handy', years: 3 },
  { id: 'geraet', label: 'Kamera, Drucker, Werkzeug, Maschinen', years: 5 },
  { id: 'moebel', label: 'Büromöbel und Einrichtung', years: 10 },
  { id: 'auto', label: 'Auto (gesetzlich mindestens 8 Jahre)', years: 8 },
] as const;

export const MIN_USEFUL_LIFE = 2;
export const MAX_USEFUL_LIFE = 50;

/** Muss auf mehrere Jahre verteilt werden? Maßgeblich ist der Betrag ohne Vorsteuer (Kleinunternehmer: brutto). */
export function exceedsGwgLimit(cost: number): boolean {
  return cost > GWG_LIMIT;
}

export interface DepreciationInput {
  cost: number; // Anschaffungskosten (netto bzw. bei Kleinunternehmern brutto)
  purchaseDate: string; // ISO-Datum, ab dem das Gerät genutzt wird
  usefulLifeYears: number;
}

export interface DepreciationYear {
  year: number;
  amount: number; // Abschreibung in diesem Jahr
  bookValueEnd: number; // Restwert am Jahresende
  half: boolean; // Halbjahres-AfA (erstes oder letztes Jahr)
}

/** Kaufjahr ab 1. Juli: höchstens 6 Monate genutzt → halbe Jahres-AfA. */
export function isHalfYearStart(purchaseDate: string): boolean {
  return Number(purchaseDate.slice(5, 7)) >= AFA_HALF_YEAR_FROM_MONTH;
}

/**
 * Linearer Abschreibungsplan. Bei Halbjahres-AfA im Kaufjahr verlängert sich der Plan um ein Jahr, das die
 * zweite Hälfte trägt. Rundungsdifferenzen fallen ins letzte Jahr, damit die Summe genau dem Kaufpreis entspricht.
 */
export function depreciationSchedule(input: DepreciationInput): DepreciationYear[] {
  const cost = round2(Math.max(input.cost, 0));
  const life = Math.max(1, Math.round(input.usefulLifeYears));
  const startYear = Number(input.purchaseDate.slice(0, 4));
  const annual = cost / life;
  const half = isHalfYearStart(input.purchaseDate);
  const years = half ? life + 1 : life;

  const plan: DepreciationYear[] = [];
  let booked = 0;
  for (let i = 0; i < years; i++) {
    const last = i === years - 1;
    const isHalf = half && (i === 0 || last);
    const amount = last ? round2(cost - booked) : round2(isHalf ? annual / 2 : annual);
    booked = round2(booked + amount);
    plan.push({ year: startYear + i, amount, bookValueEnd: round2(cost - booked), half: isHalf });
  }
  return plan;
}

/** Abschreibung eines Jahres (0 vor dem Kauf und nach dem Ende der Nutzungsdauer). */
export function depreciationForYear(input: DepreciationInput, year: number): number {
  return depreciationSchedule(input).find((y) => y.year === year)?.amount ?? 0;
}

/** Restwert am Ende eines Jahres (vor dem Kaufjahr: voller Kaufpreis). */
export function bookValueAtYearEnd(input: DepreciationInput, year: number): number {
  const plan = depreciationSchedule(input);
  if (!plan[0] || year < plan[0].year) return round2(input.cost);
  return plan.filter((y) => y.year <= year).at(-1)?.bookValueEnd ?? 0;
}

/** Summe der Abschreibung aller Anlagen in einem Jahr (fließt als KZ 9130 in den Gewinn). */
export function sumDepreciation(
  assets: readonly { cost: number; purchase_date: string; useful_life_years: number }[],
  year: number,
): number {
  return round2(
    assets.reduce(
      (sum, a) => sum + depreciationForYear({ cost: Number(a.cost), purchaseDate: a.purchase_date, usefulLifeYears: a.useful_life_years }, year),
      0,
    ),
  );
}

/** Prüft die Nutzungsdauer (ganze Jahre). */
export function validateUsefulLife(raw: string): string | null {
  const n = Number(raw.trim());
  if (!raw.trim() || !Number.isInteger(n)) return 'Bitte gib die Nutzungsdauer in ganzen Jahren ein.';
  if (n < MIN_USEFUL_LIFE) return `Mindestens ${MIN_USEFUL_LIFE} Jahre – sonst setzt du den Betrag sofort ab.`;
  if (n > MAX_USEFUL_LIFE) return `Höchstens ${MAX_USEFUL_LIFE} Jahre.`;
  return null;
}
