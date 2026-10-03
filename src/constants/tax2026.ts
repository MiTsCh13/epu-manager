// Steuerwerte 2026 (Einkommensteuer, Pauschalierung, USt)
// WICHTIG: Diese Datei jedes Jahr updaten.
// Quellen: usp.gv.at „Tarifstufen“, BMF Progressionsabgeltungsgesetz 2025

// Einkommensteuertarif 2026 (§ 33 EStG): Obergrenze der Stufe + Grenzsteuersatz
export const INCOME_TAX_BRACKETS_2026 = [
  { upTo: 13539, rate: 0 },
  { upTo: 21992, rate: 0.2 },
  { upTo: 36458, rate: 0.3 },
  { upTo: 70365, rate: 0.4 },
  { upTo: 104859, rate: 0.48 },
  { upTo: 1000000, rate: 0.5 },
  { upTo: Infinity, rate: 0.55 },
] as const;

// Pauschalsätze 2026
export const PAUSCH_RATES = {
  ku: {
    // Kleinunternehmerpauschalierung (bis 55.000 € Umsatz)
    service: 0.45, // Dienstleistung: 45 % der Einnahmen als Ausgaben
    trade: 0.2, // Handel/Produktion: 20 % der Einnahmen als Ausgaben
  },
  basis_15: 0.15, // Basispauschalierung allgemein (bis 420.000 € Umsatz)
  basis_6: 0.06, // Basispauschalierung für Beratung, Wissenschaft, etc.
} as const;

export const PAUSCH_REVENUE_LIMITS = {
  ku: 55000,
  basis_15: 420000,
  basis_6: 420000,
} as const;

// Grundfreibetrag (Gewinnfreibetrag): 15 % des Gewinns bis 33.000 € → max. 4.950 €
export const GRUNDFREIBETRAG_RATE = 0.15;
export const GRUNDFREIBETRAG_MAX = 4950;

// Sonderregeln Ausgaben
export const BEWIRTUNG_DEDUCTIBLE_RATE = 0.5; // Bewirtung nur zu 50 % absetzbar
export const KILOMETERGELD_PER_KM = 0.5; // Amtliches Kilometergeld PKW

// Umsatzsteuer
export const VAT_RATES = [0, 10, 13, 20] as const;
export const KLEINBETRAGSRECHNUNG_LIMIT = 400; // § 11 Abs. 6 UStG (brutto)
export const RECIPIENT_UID_REQUIRED_ABOVE = 10000; // UID des Empfängers ab 10.000 € brutto
export const KLEINUNTERNEHMER_NOTE =
  'Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung gemäß § 6 Abs. 1 Z 27 UStG.';
