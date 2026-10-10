// Einstellungen: Profil ↔ Formular, Speicher-Patch je Abschnitt und Hinweise bei folgenreichen Änderungen.
import { SVS_2026 } from '@/constants/svs2026';
import { PHASE_INFO } from '@/constants/svsPhases';
import type { BusinessType, IndustryType, OtherIncomeKind, PauschType, Profile, ProfileUpdate, ProfitMethod } from '@/types';
import { formatDecimalInput, formatEuro, parseDecimal, round2 } from './money';
import { canonicalNumberFormat } from './invoiceNumbers';
import { getPauschRate } from './profit';
import { getSVSPhase, getSVSYear } from './svs';
import { formatIban, normalizeUid, validateOnboardingStep, type OnboardingData, type OnboardingErrors } from './validation';

export type SettingsSection = 'identity' | 'accounting' | 'invoicing';

/** Onboarding-Felder plus Einstellungen, die es nur hier gibt. */
export interface SettingsData extends OnboardingData {
  svs_exempt: boolean;
  invoice_footer_text: string;
}

export function profileToSettingsData(p: Profile): SettingsData {
  return {
    full_name: p.full_name ?? '',
    business_name: p.business_name ?? '',
    business_type: (p.business_type as BusinessType | null) ?? null,
    svs_registration_date: p.svs_registration_date ?? '',
    is_kleinunternehmer: p.is_kleinunternehmer,
    profit_method: p.profit_method as ProfitMethod,
    pausch_type: (p.pausch_type as PauschType | null) ?? null,
    industry_code: (p.industry_code as IndustryType | null) ?? null,
    home_office: p.home_office ?? null,
    other_income_kind: (p.other_income_kind as OtherIncomeKind | null) ?? null,
    other_income_amount: p.other_income_amount == null ? '' : formatDecimalInput(Number(p.other_income_amount)),
    address: p.address ?? '',
    zip_code: p.zip_code ?? '',
    city: p.city ?? '',
    iban: p.iban ?? '',
    account_holder: p.account_holder ?? '',
    uid_number: p.uid_number ?? '',
    invoice_number_format: p.invoice_number_format,
    svs_exempt: p.svs_exempt,
    invoice_footer_text: p.invoice_footer_text ?? '',
  };
}

/** Formular → DB-Felder (getrimmt, normalisiert, abhängige Felder bereinigt). Auch für das Onboarding. */
export function toProfilePatch(d: OnboardingData) {
  const pauschal = d.profit_method === 'pauschal';
  return {
    full_name: d.full_name.trim(),
    business_name: d.business_name.trim() || null,
    business_type: d.business_type,
    svs_registration_date: d.svs_registration_date || null,
    is_kleinunternehmer: d.is_kleinunternehmer ?? true,
    profit_method: d.profit_method ?? 'pauschal',
    pausch_type: pauschal ? d.pausch_type : null,
    industry_code: pauschal && d.pausch_type === 'ku' ? d.industry_code : null,
    home_office: d.home_office,
    other_income_kind: d.other_income_kind,
    other_income_amount:
      d.other_income_kind && d.other_income_kind !== 'none' && !Number.isNaN(parseDecimal(d.other_income_amount))
        ? round2(parseDecimal(d.other_income_amount))
        : null,
    address: d.address.trim(),
    zip_code: d.zip_code.trim(),
    city: d.city.trim(),
    iban: formatIban(d.iban),
    account_holder: d.account_holder.trim(),
    uid_number: d.uid_number.trim() ? normalizeUid(d.uid_number) : null,
    invoice_number_format: canonicalNumberFormat(d.invoice_number_format),
  } satisfies ProfileUpdate;
}

type PatchKey = keyof ReturnType<typeof toProfilePatch>;

const SECTION_FIELDS: Record<SettingsSection, readonly PatchKey[]> = {
  identity: ['full_name', 'business_name', 'business_type', 'svs_registration_date'],
  accounting: ['is_kleinunternehmer', 'profit_method', 'pausch_type', 'industry_code', 'home_office', 'other_income_kind', 'other_income_amount'],
  invoicing: ['address', 'zip_code', 'city', 'iban', 'account_holder', 'uid_number', 'invoice_number_format'],
};

/** Onboarding-Schritt mit derselben Validierung je Abschnitt */
const SECTION_STEP: Record<SettingsSection, 1 | 2 | 3> = { identity: 1, accounting: 2, invoicing: 3 };

/** Nur die Felder eines Abschnitts – andere Abschnitte bleiben beim Speichern unberührt. */
export function sectionPatch(section: SettingsSection, d: SettingsData): ProfileUpdate {
  const full = toProfilePatch(d);
  const patch: Record<string, unknown> = {};
  for (const key of SECTION_FIELDS[section]) patch[key] = full[key];
  // Ausnahme von der Pflichtversicherung gibt es nur für Gewerbetreibende
  if (section === 'identity') patch.svs_exempt = d.business_type === 'gewerbetreibend' && d.svs_exempt;
  if (section === 'invoicing') patch.invoice_footer_text = d.invoice_footer_text.trim() || null;
  return patch as ProfileUpdate;
}

export function isSectionDirty(section: SettingsSection, data: SettingsData, saved: SettingsData): boolean {
  return JSON.stringify(sectionPatch(section, data)) !== JSON.stringify(sectionPatch(section, saved));
}

export function validateSection(section: SettingsSection, d: SettingsData, today: Date = new Date()): OnboardingErrors {
  return validateOnboardingStep(SECTION_STEP[section], d, today);
}

// ─── Hinweise bei folgenreichen Änderungen ──────────────────

export interface ChangeNotice {
  id: string;
  type: 'info' | 'warning';
  title: string;
  text: string;
}

const validDate = (iso: string) => (iso && !Number.isNaN(new Date(iso).getTime()) ? new Date(iso) : null);

const BUSINESS_TYPE_CHANGE_NOTE =
  'Ändere das nur, wenn du dich bei der Einrichtung vertan hast oder dein Gewerbe an- bzw. abgemeldet hast. Klaro rechnet dann dein ganzes Jahr mit der neuen Tätigkeitsart.';

/** Tätigkeitsart oder Anmeldedatum geändert → was sich bei der SVS-Berechnung ändert. */
export function describeSvsChange(saved: SettingsData, next: SettingsData, today: Date = new Date()): ChangeNotice[] {
  const notices: ChangeNotice[] = [];

  if (next.business_type && next.business_type !== saved.business_type) {
    notices.push(
      next.business_type === 'neue_selbstaendige'
        ? {
            id: 'business-type',
            type: 'info',
            title: 'Neue Selbständige',
            text: `Du bist erst ab ${formatEuro(SVS_2026.registrationThreshold)} Einkünften im Jahr bei der SVS pflichtversichert. Neue Rechnungen und Entwürfe heißen ab jetzt Honorarnote. ${BUSINESS_TYPE_CHANGE_NOTE}`,
          }
        : {
            id: 'business-type',
            type: 'info',
            title: 'Gewerbetreibend',
            text: `Du bist ab dem ersten Euro bei der SVS versichert, auch ohne Gewinn fällt mindestens der Mindestbeitrag an. Neue Rechnungen und Entwürfe heißen ab jetzt Rechnung statt Honorarnote. ${BUSINESS_TYPE_CHANGE_NOTE}`,
          },
    );
  }

  const before = validDate(saved.svs_registration_date);
  const after = validDate(next.svs_registration_date);
  if (after && next.svs_registration_date !== saved.svs_registration_date) {
    const year = getSVSYear(after, today);
    const phase = getSVSPhase(after, today);
    const prevYear = before ? getSVSYear(before, today) : null;
    if (prevYear !== year) {
      const phaseChanged = !before || getSVSPhase(before, today) !== phase;
      notices.push({
        id: 'svs-year',
        type: phaseChanged ? 'warning' : 'info',
        title: `Du bist damit im SVS-Jahr ${year}`,
        text:
          (prevYear ? `Bisher: Jahr ${prevYear}. ` : '') +
          (phaseChanged ? `Neue Phase: ${PHASE_INFO[phase].title}. ` : '') +
          'Rücklagen-Empfehlung und Nachzahlungs-Radar passen sich automatisch an.',
      });
    }
  }

  return notices;
}

/** Kleinunternehmer-Status oder Gewinnermittlung geändert → Folgen für Rechnungen und Steuer. */
export function describeTaxChange(saved: SettingsData, next: SettingsData, draftCount: number): ChangeNotice[] {
  const notices: ChangeNotice[] = [];
  const drafts = draftCount === 1 ? '1 Entwurf' : `${draftCount} Entwürfe`;

  if (saved.is_kleinunternehmer && next.is_kleinunternehmer === false) {
    notices.push({
      id: 'ku-off',
      type: 'warning',
      title: 'Du verrechnest ab jetzt Umsatzsteuer',
      text: [
        'Diese Änderung beeinflusst deine Rechnungsstellung: Neue Rechnungen weisen Umsatzsteuer aus, der Kleinunternehmer-Hinweis entfällt. Bereits ausgestellte Rechnungen bleiben unverändert.',
        draftCount > 0 ? `Du hast ${drafts} – prüfe dort den USt-Satz.` : '',
        'Melde dich beim Finanzamt für die Umsatzsteuer an (UID-Nummer, Umsatzsteuervoranmeldung), am besten gemeinsam mit deiner Steuerberatung.',
        `Wichtig: Verzichtest du freiwillig auf die Kleinunternehmerregelung, obwohl dein Umsatz unter ${formatEuro(SVS_2026.kleinunternehmerThreshold, true)} liegt, bist du fünf Jahre an diese Entscheidung gebunden.`,
        next.uid_number.trim() ? '' : 'Trage danach deine UID-Nummer unter „Adresse, Bank & Rechnungen“ ein.',
      ]
        .filter(Boolean)
        .join(' '),
    });
  } else if (saved.is_kleinunternehmer === false && next.is_kleinunternehmer) {
    notices.push({
      id: 'ku-on',
      type: 'warning',
      title: 'Du wirst Kleinunternehmer',
      text: [
        'Diese Änderung beeinflusst deine Rechnungsstellung: Neue Rechnungen enthalten keine Umsatzsteuer mehr, dafür automatisch den Hinweis „§ 6 Abs. 1 Z 27 UStG“. Bereits ausgestellte Rechnungen bleiben unverändert.',
        draftCount > 0 ? `${drafts} ${draftCount === 1 ? 'wird' : 'werden'} automatisch auf 0 % USt umgestellt.` : '',
        'Beachte: Als Kleinunternehmer kannst du dir keine Vorsteuer zurückholen.',
        `Das geht nur, wenn dein Umsatz unter ${formatEuro(SVS_2026.kleinunternehmerThreshold, true)} brutto liegt und du nicht in den letzten fünf Jahren freiwillig auf die Kleinunternehmerregelung verzichtet hast.`,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  if (saved.profit_method === 'pauschal' && next.profit_method === 'euer') {
    notices.push({
      id: 'pausch-to-euer',
      type: 'warning',
      title: 'Achtung: Bindungsfrist',
      text: 'Wechselst du von der Pauschalierung zur Einnahmen-Ausgaben-Rechnung, kannst du frühestens nach fünf Jahren wieder pauschalieren (§ 17 Abs. 3 EStG). Die Gewinnermittlung gilt immer für das ganze Kalenderjahr – besprich den Wechsel am besten mit deiner Steuerberatung. Ab jetzt zählen deine einzeln erfassten Ausgaben.',
    });
  } else if (saved.profit_method === 'euer' && next.profit_method === 'pauschal') {
    notices.push({
      id: 'euer-to-pausch',
      type: 'info',
      title: 'Pauschalierung gilt fürs ganze Jahr',
      text: 'Klaro rechnet dein ganzes Kalenderjahr ab sofort mit dem Pauschalsatz. Einzeln erfasste Ausgaben bleiben gespeichert, zählen aber nicht mehr zum Gewinn. Hast du in den letzten fünf Jahren von der Pauschalierung zur Einnahmen-Ausgaben-Rechnung gewechselt, ist eine erneute Pauschalierung noch nicht erlaubt (§ 17 Abs. 3 EStG).',
    });
  } else if (
    next.profit_method === 'pauschal' &&
    next.pausch_type &&
    (next.pausch_type !== saved.pausch_type || (next.pausch_type === 'ku' && next.industry_code !== saved.industry_code))
  ) {
    const rate = Math.round(getPauschRate(next.pausch_type, next.industry_code ?? undefined) * 100);
    notices.push({
      id: 'pausch-rate',
      type: 'info',
      title: `Neuer Pauschalsatz: ${rate} %`,
      text: `Klaro rechnet dein ganzes Kalenderjahr ab sofort mit ${rate} % pauschalen Ausgaben. Die Art der Pauschalierung gilt immer für das ganze Kalenderjahr.`,
    });
  }

  return notices;
}
