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
    // Kleinunternehmerpauschalierung (bis 55.000 € Umsatz), § 17 Abs. 3a EStG
    // Quelle: usp.gv.at „Kleinunternehmerpauschalierung“, Dienstleistungsbetriebe-Verordnung BGBl. II 615/2020
    service: 0.2, // Dienstleistungsbetrieb laut Verordnung (z. B. IT, Fotografie, Design, Werbung, Beratung, Unterricht): 20 %
    trade: 0.45, // alle anderen Betriebe (z. B. Handel, Handwerk, Produktion): 45 %
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

// Arbeitsplatzpauschale (§ 4 Abs. 4 Z 8 EStG) – auch zusätzlich zur Basis- und Kleinunternehmerpauschalierung absetzbar.
// Groß: keine anderen aktiven Einkünfte mit Arbeitsplatz außer Haus über dem Grenzwert, sonst klein.
// Bei Betriebsbeginn: 1/12 pro angefangenem Monat.
export const ARBEITSPLATZPAUSCHALE = {
  gross: 1200, // E1a KZ 9217
  klein: 300, // E1a KZ 9215
  otherIncomeLimit: 13539, // Wert 2026 (= Grenze der ersten Tarifstufe)
} as const;

// Einkommensteuer-Vorauszahlungen: fällig am 15. Februar, Mai, August, November (Monat 1–12)
export const EST_PREPAYMENT_DUE_MONTHS = [2, 5, 8, 11] as const;
export const EST_PREPAYMENT_DUE_DAY = 15;
// Steuererklärung über FinanzOnline bis 30. Juni des Folgejahres
export const TAX_RETURN_DEADLINE = { month: 6, day: 30 } as const;

// Sonderregeln Ausgaben
export const BEWIRTUNG_DEDUCTIBLE_RATE = 0.5; // Bewirtung nur zu 50 % absetzbar
// Amtliches Kilometergeld je Fahrzeug (Quelle: bmf.gv.at „Kilometergeld“). Einspurige: 1.1.–30.6.2025 kurz 0,50 €,
// seit 1.7.2025 wieder 0,25 €. Auto bis 2024: 0,42 €. Höchstens 30.000 km im Jahr (Fahrrad bei Arbeitnehmer:innen 3.000 km).
export const KILOMETERGELD_RATES = {
  car: [{ from: '2000-01-01', rate: 0.42 }, { from: '2025-01-01', rate: 0.5 }],
  motorbike: [{ from: '2000-01-01', rate: 0.24 }, { from: '2025-01-01', rate: 0.5 }, { from: '2025-07-01', rate: 0.25 }],
  bike: [{ from: '2000-01-01', rate: 0.38 }, { from: '2025-01-01', rate: 0.5 }, { from: '2025-07-01', rate: 0.25 }],
} as const;

// Diäten und Nächtigung bei Geschäftsreisen (§ 4 Abs. 5 iVm § 26 Z 4 EStG, Werte ab 2025) – nur Einnahmen-Ausgaben-Rechnung.
// Quelle: usp.gv.at „Reisekosten“. Reise: mindestens 25 km vom Betriebsort; kein Tagesgeld, wenn man länger als
// 5 Tage durchgehend oder öfter als 15-mal im Jahr am selben Ort ist.
export const TAGESGELD = {
  perDay: 30, // volles Tagesgeld je 24 Stunden
  minHours: 3, // erst bei MEHR als 3 Stunden
  perStartedHour: 2.5, // 1/12 je angefangener Stunde
} as const;
// Eingabe pro Reisetag in ganzen (angefangenen) Stunden: ab 4 (= mehr als 3) bis 12 (= volles Tagesgeld)
export const TAGESGELD_INPUT_HOURS = { min: TAGESGELD.minHours + 1, max: TAGESGELD.perDay / TAGESGELD.perStartedHour } as const;
export const NAECHTIGUNG_PAUSCHAL = 17; // pro Nacht inkl. Frühstück, ohne Beleg (sonst Hotelrechnung)

// Abschreibung (AfA) – nur bei Einnahmen-Ausgaben-Rechnung; bei Pauschalierung ist sie im Pauschalsatz enthalten.
// Quelle: usp.gv.at „Geringwertige Wirtschaftsgüter“ und „Abschreibung“; E1a KZ 9130 (AfA inkl. GWG)
// Geringwertige Wirtschaftsgüter (§ 13 EStG): bis 1.000 € sofort absetzbar – netto bei Vorsteuerabzug, brutto bei Kleinunternehmern.
export const GWG_LIMIT = 1000;
// Halbjahresregel (§ 7 Abs. 2 EStG): höchstens 6 Monate im ersten Jahr genutzt (Inbetriebnahme ab 1. Juli) → halbe Jahres-AfA
export const AFA_HALF_YEAR_FROM_MONTH = 7;

// Umsatzsteuer
export const VAT_RATES = [0, 10, 13, 20] as const;
export const KLEINBETRAGSRECHNUNG_LIMIT = 400; // § 11 Abs. 6 UStG (brutto)
export const RECIPIENT_UID_REQUIRED_ABOVE = 10000; // UID des Empfängers ab 10.000 € brutto
export const KLEINUNTERNEHMER_NOTE =
  'Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung gemäß § 6 Abs. 1 Z 27 UStG.';
