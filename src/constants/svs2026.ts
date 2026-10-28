// SVS-Werte 2026 (GSVG/FSVG)
// WICHTIG: Diese Datei jedes Jahr updaten. Nie SVS-Werte hardcoden!
// Quellen: svs.at „Beiträge 2026“, sozialversicherung.gv.at „Werte 2026“
export const SVS_2026 = {
  year: 2026,

  // Versicherungsgrenzen
  registrationThreshold: 6613.2, // Versicherungsgrenze Neue Selbständige (= 12 × Mindestbeitragsgrundlage)
  incomeTaxThreshold: 13539.0, // Ab hier Einkommensteuer (Tarifstufe 1, Wert 2026)

  // Beitragsgrenzen
  minBasisMonthly: 551.1, // Mindestbeitragsgrundlage/Monat (KV + PV)
  maxBasisMonthly: 8085.0, // Höchstbeitragsgrundlage/Monat

  // Beitragssätze
  rates: {
    health: 0.068, // Krankenversicherung 6,80 %
    pension: 0.185, // Pensionsversicherung 18,50 %
    provision: 0.0153, // Selbständigenvorsorge 1,53 %
  },
  accidentFixed: 155.4, // Unfallversicherung (Jahresfixbetrag, 12,95 €/Monat)

  // Quartalsbeiträge sind am letzten Tag des 2. Quartalsmonats fällig (Feb, Mai, Aug, Nov)
  quarterlyDueMonths: [2, 5, 8, 11],
  dueReminderDays: 30, // Hinweis X Tage vor Fälligkeit

  // Kleinunternehmer-Umsatzgrenze (USt, brutto)
  kleinunternehmerThreshold: 55000,
  kleinunternehmerWarningThreshold: 45000, // Ab hier Vorwarnung
  // Toleranz 10 % (USP, Regelung seit 2025): bis hier bleibt die Befreiung bis Jahresende, darüber
  // entfällt sie ab dem Umsatz, mit dem die Grenze überschritten wird. Im Folgejahr jedenfalls USt-pflichtig.
  kleinunternehmerToleranceLimit: 60500,

  // Ausnahme von der Pflichtversicherung (Kleinstunternehmerregelung, nur GSVG, auf Antrag):
  // Umsatz höchstens 55.000 € und Gewinn höchstens registrationThreshold – sonst rückwirkend pflichtversichert
  exemptionRevenueLimit: 55000,

  // Gesamtquote für Rücklagen-Empfehlung (= Summe der Beitragssätze)
  reserveRate: 0.2683,
  reserveFixed: 155.4, // Plus UV-Fixbetrag

  // Nachzahlung ab diesem Betrag als „kritisch“ markieren
  nachzahlungCriticalAmount: 5000,
} as const;

export type SVSConstants = typeof SVS_2026;
