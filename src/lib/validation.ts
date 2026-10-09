// Eingabe-Validierung (IBAN, UID, PLZ, Onboarding-Schritte) mit deutschen Fehlermeldungen.
import type { BusinessType, IndustryType, InvoiceNumberFormat, OtherIncomeKind, PauschType, ProfitMethod } from '@/types';
import { parseDecimal } from './money';

const compact = (v: string) => v.replace(/\s+/g, '').toUpperCase();

/** IBAN-Prüfung inkl. Prüfsumme (ISO 13616, mod 97). */
export function isValidIban(value: string): boolean {
  const iban = compact(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith('AT') && iban.length !== 20) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  return remainder === 1;
}

/** „at611904300234573201“ → „AT61 1904 3002 3457 3201“ */
export function formatIban(value: string): string {
  return compact(value).replace(/(.{4})/g, '$1 ').trim();
}

/** Österreichische UID (ATU + 8 Ziffern) oder allgemeines EU-Format. */
export function isValidUid(value: string): boolean {
  const uid = compact(value);
  if (uid.startsWith('AT')) return /^ATU\d{8}$/.test(uid);
  return /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(uid);
}

export function normalizeUid(value: string): string {
  return compact(value);
}

export function isValidZip(value: string): boolean {
  return /^\d{4,5}$/.test(value.trim());
}

/** Telefonnummer: optional mit +, dann 6–20 Ziffern (Leerzeichen, /, -, Klammern erlaubt). */
export function isValidPhone(value: string): boolean {
  const v = value.trim();
  const digits = v.replace(/\D/g, '').length;
  return /^\+?[\d\s/()-]+$/.test(v) && digits >= 6 && digits <= 20;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ─── Onboarding ─────────────────────────────────────────────

export interface OnboardingData {
  full_name: string;
  business_name: string;
  business_type: BusinessType | null;
  svs_registration_date: string;
  is_kleinunternehmer: boolean | null;
  profit_method: ProfitMethod | null;
  pausch_type: PauschType | null;
  industry_code: IndustryType | null;
  home_office: boolean | null;
  other_income_kind: OtherIncomeKind | null;
  other_income_amount: string; // Eingabe, z. B. „18.000“
  address: string;
  zip_code: string;
  city: string;
  iban: string;
  account_holder: string;
  uid_number: string;
  invoice_number_format: InvoiceNumberFormat;
}

export type OnboardingErrors = Partial<Record<keyof OnboardingData, string>>;

const blank = (v: string) => v.trim().length === 0;

export function validateOnboardingStep(step: 1 | 2 | 3, data: OnboardingData, today: Date = new Date()): OnboardingErrors {
  const e: OnboardingErrors = {};

  if (step === 1) {
    if (blank(data.full_name)) e.full_name = 'Bitte gib deinen Namen ein.';
    if (!data.business_type) e.business_type = 'Bitte wähle deine Tätigkeitsart.';
    if (!data.svs_registration_date) {
      e.svs_registration_date = 'Bitte gib das Datum deiner Anmeldung ein.';
    } else {
      const date = new Date(data.svs_registration_date);
      const maxDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
      if (Number.isNaN(date.getTime()) || date.getFullYear() < 1950 || date > maxDate) {
        e.svs_registration_date = 'Bitte gib ein gültiges Datum ein.';
      }
    }
  }

  if (step === 2) {
    if (data.is_kleinunternehmer === null) e.is_kleinunternehmer = 'Bitte wähle Ja oder Nein.';
    if (!data.profit_method) e.profit_method = 'Bitte wähle, wie du deinen Gewinn ermittelst.';
    if (data.profit_method === 'pauschal') {
      if (!data.pausch_type) {
        e.pausch_type = 'Bitte wähle die Art der Pauschalierung.';
      } else if (data.pausch_type === 'ku' && data.is_kleinunternehmer === false) {
        e.pausch_type = 'Die Kleinunternehmerpauschalierung gibt es nur für Kleinunternehmer.';
      } else if (data.pausch_type === 'ku' && !data.industry_code) {
        e.industry_code = 'Bitte wähle, ob du einen Dienstleistungsbetrieb hast.';
      }
    }
    if (data.home_office === null) e.home_office = 'Bitte wähle, ob du von zu Hause arbeitest.';
    if (!data.other_income_kind) e.other_income_kind = 'Bitte wähle, ob du daneben andere Einkünfte hast.';
    else if (data.other_income_kind !== 'none') {
      const amount = parseDecimal(data.other_income_amount);
      if (blank(data.other_income_amount) || Number.isNaN(amount) || amount <= 0) {
        e.other_income_amount = 'Bitte gib einen ungefähren Betrag ein.';
      }
    }
  }

  if (step === 3) {
    if (blank(data.address)) e.address = 'Bitte gib deine Straße und Hausnummer ein.';
    if (!isValidZip(data.zip_code)) e.zip_code = 'Bitte gib eine gültige PLZ ein.';
    if (blank(data.city)) e.city = 'Bitte gib deinen Ort ein.';
    if (blank(data.iban)) e.iban = 'Bitte gib deine IBAN ein – sie kommt auf deine Rechnungen.';
    else if (!isValidIban(data.iban)) e.iban = 'Diese IBAN ist ungültig. Bitte prüfe sie noch einmal.';
    if (blank(data.account_holder)) {
      e.account_holder = 'Bitte gib den Kontoinhaber an – genau so, wie er bei deiner Bank hinterlegt ist.';
    }
    if (!blank(data.uid_number) && !isValidUid(data.uid_number)) {
      e.uid_number = 'Diese UID-Nummer ist ungültig (Format: ATU12345678).';
    }
  }

  return e;
}

// ─── Passwort ändern ────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordChangeData {
  current: string;
  next: string;
  confirm: string;
}

export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeData, string>>;

export function validatePasswordChange(data: PasswordChangeData): PasswordChangeErrors {
  const e: PasswordChangeErrors = { ...validateNewPassword(data) };
  if (!data.current) e.current = 'Bitte gib dein aktuelles Passwort ein.';
  if (!e.next && data.next === data.current) {
    e.next = 'Das neue Passwort muss sich von deinem aktuellen unterscheiden.';
    delete e.confirm;
  }
  return e;
}

/** Neues Passwort + Wiederholung (auch für „Passwort vergessen“, dort ohne aktuelles Passwort). */
export function validateNewPassword(data: Pick<PasswordChangeData, 'next' | 'confirm'>): Pick<PasswordChangeErrors, 'next' | 'confirm'> {
  const e: Pick<PasswordChangeErrors, 'next' | 'confirm'> = {};
  if (data.next.length < MIN_PASSWORD_LENGTH) {
    e.next = `Dein neues Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  } else if (data.confirm !== data.next) {
    e.confirm = 'Die beiden Passwörter stimmen nicht überein.';
  }
  return e;
}

// ─── Supabase-Auth-Fehler auf Deutsch ───────────────────────

export function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-Mail oder Passwort ist falsch.';
  if (m.includes('email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse – schau in dein Postfach.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Für diese E-Mail-Adresse gibt es bereits ein Konto. Melde dich stattdessen an.';
  }
  if (m.includes('different from the old password')) return 'Das neue Passwort muss sich von deinem aktuellen unterscheiden.';
  if (m.includes('reauthenticat')) return 'Bitte melde dich aus Sicherheitsgründen neu an und versuche es dann erneut.';
  if (m.includes('password') && (m.includes('at least') || m.includes('short') || m.includes('weak'))) {
    return 'Dein Passwort ist zu kurz oder zu schwach. Bitte verwende mindestens 8 Zeichen.';
  }
  if (m.includes('expired') || m.includes('invalid or has')) {
    return 'Dieser Link ist abgelaufen oder wurde schon verwendet.';
  }
  if (m.includes('security purposes')) return 'Bitte warte kurz, bevor du eine weitere E-Mail anforderst.';
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann erneut.';
  }
  if (m.includes('invalid') && m.includes('email')) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
  if (m.includes('fetch') || m.includes('network')) return 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.';
  return 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
}

// ─── Kunden ─────────────────────────────────────────────────

export interface ClientFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  zip_code: string;
  city: string;
  country: string;
  uid_number: string;
  notes: string;
  template_id?: string; // Rechnungs-Vorlage für diesen Kunden ('' = Standard)
}

export type ClientFormErrors = Partial<Record<keyof ClientFormData, string>>;

export const EMPTY_CLIENT_FORM: ClientFormData = {
  name: '',
  email: '',
  phone: '',
  address: '',
  zip_code: '',
  city: '',
  country: 'AT',
  uid_number: '',
  notes: '',
};

/** Österreich: 4-stellige PLZ; andere Länder: 3–10 Zeichen (Ziffern, Buchstaben, Bindestrich). */
export function isValidZipForCountry(zip: string, country: string): boolean {
  const z = zip.trim();
  if (country === 'AT') return /^\d{4}$/.test(z);
  return /^[A-Z0-9][A-Z0-9 -]{2,9}$/i.test(z);
}

export function validateClient(data: ClientFormData): ClientFormErrors {
  const e: ClientFormErrors = {};
  if (blank(data.name)) e.name = 'Bitte gib einen Namen ein.';
  if (!blank(data.email) && !isValidEmail(data.email)) e.email = 'Diese E-Mail-Adresse ist ungültig.';
  if (!blank(data.phone) && !isValidPhone(data.phone)) e.phone = 'Diese Telefonnummer ist ungültig.';
  if (!blank(data.zip_code) && !isValidZipForCountry(data.zip_code, data.country)) {
    e.zip_code = data.country === 'AT' ? 'Österreichische PLZ haben 4 Ziffern.' : 'Bitte gib eine gültige PLZ ein.';
  }
  if (!blank(data.uid_number) && !isValidUid(data.uid_number)) {
    e.uid_number = 'Diese UID-Nummer ist ungültig (z. B. ATU12345678).';
  }
  return e;
}

/** Formulardaten → DB-Felder (getrimmt, leere Felder als null, UID normalisiert). */
export function normalizeClient(data: ClientFormData) {
  const opt = (v: string) => (v.trim() ? v.trim() : null);
  return {
    name: data.name.trim(),
    email: opt(data.email)?.toLowerCase() ?? null,
    phone: opt(data.phone),
    address: opt(data.address),
    zip_code: opt(data.zip_code),
    city: opt(data.city),
    country: data.country || 'AT',
    uid_number: data.uid_number.trim() ? normalizeUid(data.uid_number) : null,
    notes: opt(data.notes),
    ...(data.template_id !== undefined && { template_id: data.template_id || null }),
  };
}
