// Erklärungen der SVS-Phasen in einfacher Sprache (SVS-Tracker + Dashboard)
import type { SVSPhase } from '@/lib/svs';

export const PHASE_INFO: Record<SVSPhase, { title: string; text: string; tone: string }> = {
  year1_2: {
    title: 'Gründungsphase',
    text: 'Du zahlst vorläufig nur Mindestbeiträge. Die Pensionsversicherung wird später auf Basis deines echten Gewinns nachberechnet – dieses Geld solltest du jetzt schon zur Seite legen.',
    tone: 'bg-primary-50 text-primary-900 ring-primary-100',
  },
  year3: {
    title: 'Erste Nachbemessung',
    text: 'Sobald dein erster Einkommensteuerbescheid da ist, rechnet die SVS dein erstes Jahr nach. Ab jetzt kommt jedes Jahr eine Nachbemessung – und Kranken- und Pensionsversicherung richten sich nach deinem echten Gewinn.',
    tone: 'bg-amber-50 text-amber-900 ring-amber-200',
  },
  year4plus: {
    title: 'Volle Nachbemessung',
    text: 'Die SVS schreibt auf Basis deines letzten Steuerbescheids vor und rechnet jedes Jahr nach. Steigt dein Gewinn, kommt eine Nachzahlung – sinkt er, bekommst du Geld zurück.',
    tone: 'bg-amber-50 text-amber-900 ring-amber-200',
  },
};
