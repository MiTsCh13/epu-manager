// Fachbegriffe in einfacher Sprache – für Tooltips (<Term>) im gesamten UI.
import { formatEuro } from '@/lib/money';
import { SVS_2026 } from './svs2026';

export const GLOSSARY = {
  svs: {
    term: 'SVS',
    text: 'Die Sozialversicherung der Selbständigen. Sie kümmert sich um deine Kranken-, Pensions- und Unfallversicherung – und schickt dir dafür vierteljährlich eine Vorschreibung.',
  },
  nachbemessung: {
    term: 'Nachbemessung',
    text: 'Die SVS verrechnet zuerst vorläufige Beiträge. Sobald dein Einkommensteuerbescheid da ist, rechnet sie mit deinem echten Gewinn nach – war er höher, kommt eine Nachzahlung.',
  },
  pauschalierung: {
    term: 'Pauschalierung',
    text: 'Statt jede Ausgabe einzeln zu sammeln, ziehst du einfach einen fixen Prozentsatz deiner Einnahmen als Ausgaben ab. Weniger Aufwand – lohnt sich, wenn du wenige echte Ausgaben hast.',
  },
  kuPauschalierung: {
    term: 'Kleinunternehmerpauschalierung',
    text: 'Nur für Kleinunternehmer (bis 55.000 € Umsatz): 45 % der Einnahmen gelten als Ausgaben bei Dienstleistungen, 20 % bei Handel und Produktion.',
  },
  basisPauschalierung: {
    term: 'Basispauschalierung',
    text: 'Für alle bis 420.000 € Umsatz: 15 % der Einnahmen gelten als Ausgaben. Für Beratung, Vorträge, Unterricht, schriftstellerische oder wissenschaftliche Tätigkeit nur 6 %.',
  },
  euer: {
    term: 'Einnahmen-Ausgaben-Rechnung (EÜR)',
    text: 'Du erfasst alle Einnahmen und alle Ausgaben einzeln. Gewinn = Einnahmen minus Ausgaben. Lohnt sich, wenn du viele echte Ausgaben hast.',
  },
  kleinunternehmer: {
    term: 'Kleinunternehmer',
    text: 'Wenn dein Umsatz unter 55.000 € im Jahr liegt, musst du keine Umsatzsteuer verrechnen. Dafür darfst du dir auch keine Vorsteuer zurückholen.',
  },
  uid: {
    term: 'UID-Nummer',
    text: 'Deine Umsatzsteuer-Identifikationsnummer (z. B. ATU12345678). Brauchst du, wenn du Umsatzsteuer verrechnest oder mit Firmen im EU-Ausland arbeitest. Beantragst du über FinanzOnline.',
  },
  ustg11: {
    term: '§ 11 UStG',
    text: 'Der Paragraf im Umsatzsteuergesetz, der festlegt, was auf einer Rechnung stehen muss – z. B. Name, Anschrift, Datum, Rechnungsnummer und Leistung. Klaro achtet darauf für dich.',
  },
  gsvg: {
    term: 'Gewerbetreibend (GSVG)',
    text: 'Du hast ein Gewerbe angemeldet und bist damit Mitglied der Wirtschaftskammer (z. B. IT-Dienstleistung, Fotografie, Grafikdesign, Handel). Bei der SVS bist du ab dem ersten Euro versichert.',
  },
  neueSelbstaendige: {
    term: 'Neue Selbständige',
    text: `Du arbeitest selbständig ohne Gewerbe (z. B. Vortragende, Psychotherapeut:innen, Journalist:innen, Künstler:innen). Bei der SVS bist du erst ab ${formatEuro(SVS_2026.registrationThreshold)} Einkünften im Jahr versichert.`,
  },
  iban: {
    term: 'IBAN',
    text: 'Deine Kontonummer für Überweisungen (beginnt in Österreich mit AT). Sie steht auf deinen Rechnungen, damit Kund:innen bezahlen können.',
  },
  grundfreibetrag: {
    term: 'Grundfreibetrag',
    text: '15 % deines Gewinns (bis 33.000 € Gewinn, also max. 4.950 €) sind automatisch steuerfrei – ohne dass du dafür etwas investieren musst.',
  },
  absetzbar: {
    term: 'absetzbar',
    text: 'Absetzbare Ausgaben ziehst du von deinen Einnahmen ab – dadurch sinkt dein Gewinn und damit Steuer und SVS. Manche Ausgaben zählen nur zur Hälfte (z. B. Geschäftsessen).',
  },
  berechnungsbasis: {
    term: 'Berechnungsbasis',
    text: 'Der Betrag, von dem die SVS deine Beiträge berechnet: dein Gewinn plus die SVS-Beiträge, die du im Jahr bezahlt hast (die zählen bei der SVS nicht als Ausgabe). Mindestens 6.613 €, höchstens 97.020 € im Jahr.',
  },
  kleinstunternehmer: {
    term: 'Ausnahme von der Pflichtversicherung',
    text: `Kleinstunternehmerregelung für Gewerbetreibende: Liegt dein Umsatz unter ${formatEuro(SVS_2026.exemptionRevenueLimit, true)} und dein Gewinn unter ${formatEuro(SVS_2026.registrationThreshold)} im Jahr, kannst du dich auf Antrag bei der SVS von Kranken- und Pensionsversicherung befreien lassen. Die Unfallversicherung zahlst du weiter. Überschreitest du eine Grenze, wirst du rückwirkend pflichtversichert.`,
  },
  vorschreibung: {
    term: 'Vorschreibung',
    text: 'Die Rechnung der SVS, die du jedes Quartal bekommst (Ende Februar, Mai, August, November). Sie basiert zunächst auf einer Schätzung – daher die spätere Nachbemessung.',
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
