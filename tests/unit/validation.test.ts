import { describe, expect, it } from 'vitest';
import {
  formatIban,
  isValidEmail,
  isValidIban,
  isValidUid,
  isValidZip,
  normalizeUid,
  translateAuthError,
  validateOnboardingStep,
  type OnboardingData,
} from '@/lib/validation';

describe('IBAN', () => {
  it.each(['AT61 1904 3002 3457 3201', 'at611904300234573201', 'DE89 3704 0044 0532 0130 00'])('gültig: %s', (iban) => {
    expect(isValidIban(iban)).toBe(true);
  });
  it.each([
    ['falsche Prüfziffer', 'AT62 1904 3002 3457 3201'],
    ['AT mit falscher Länge', 'AT61 1904 3002 3457 320'],
    ['kein Ländercode', '1234567890123456'],
    ['leer', ''],
  ])('ungültig: %s', (_, iban) => {
    expect(isValidIban(iban)).toBe(false);
  });
  it('formatiert in 4er-Blöcken', () => {
    expect(formatIban('at611904300234573201')).toBe('AT61 1904 3002 3457 3201');
  });
});

describe('UID-Nummer', () => {
  it('österreichisch: ATU + 8 Ziffern', () => {
    expect(isValidUid('ATU12345678')).toBe(true);
    expect(isValidUid('atu 1234 5678')).toBe(true);
    expect(isValidUid('ATU1234567')).toBe(false);
    expect(isValidUid('AT12345678')).toBe(false);
  });
  it('andere EU-Länder', () => {
    expect(isValidUid('DE123456789')).toBe(true);
    expect(isValidUid('X')).toBe(false);
  });
  it('normalisiert', () => expect(normalizeUid(' atu 1234 5678 ')).toBe('ATU12345678'));
});

describe('PLZ & E-Mail', () => {
  it('PLZ: 4–5 Ziffern', () => {
    expect(isValidZip('1060')).toBe(true);
    expect(isValidZip(' 80331 ')).toBe(true);
    expect(isValidZip('106')).toBe(false);
    expect(isValidZip('A-1060')).toBe(false);
  });
  it('E-Mail', () => {
    expect(isValidEmail('max@example.com')).toBe(true);
    expect(isValidEmail('max@example')).toBe(false);
    expect(isValidEmail('max example.com')).toBe(false);
  });
});

describe('validateOnboardingStep', () => {
  const today = new Date(2026, 9, 3);
  const complete: OnboardingData = {
    full_name: 'Max Mustermann',
    business_name: '',
    business_type: 'neue_selbstaendige',
    svs_registration_date: '2024-03-01',
    is_kleinunternehmer: true,
    profit_method: 'euer',
    pausch_type: null,
    industry_code: null,
    address: 'Mariahilfer Straße 1',
    zip_code: '1060',
    city: 'Wien',
    iban: 'AT61 1904 3002 3457 3201',
    uid_number: '',
    invoice_number_format: 'YYYY-NNN',
  };

  it('vollständige Daten: keine Fehler in allen Schritten', () => {
    for (const step of [1, 2, 3] as const) expect(validateOnboardingStep(step, complete, today)).toEqual({});
  });

  it('verwendet standardmäßig das heutige Datum', () => {
    expect(validateOnboardingStep(1, complete)).toEqual({});
  });

  it('Schritt 1: Pflichtfelder', () => {
    const e = validateOnboardingStep(1, { ...complete, full_name: ' ', business_type: null, svs_registration_date: '' }, today);
    expect(Object.keys(e).sort()).toEqual(['business_type', 'full_name', 'svs_registration_date']);
  });

  it.each(['1900-01-01', '2028-01-01', 'kein-datum'])('Schritt 1: ungültiges Datum %s', (date) => {
    expect(validateOnboardingStep(1, { ...complete, svs_registration_date: date }, today).svs_registration_date).toBeDefined();
  });

  it('Schritt 1: Anmeldung im nächsten Jahr ist erlaubt (geplante Gründung)', () => {
    expect(validateOnboardingStep(1, { ...complete, svs_registration_date: '2027-01-01' }, today)).toEqual({});
  });

  it('Schritt 2: Kleinunternehmer und Gewinnermittlung erforderlich', () => {
    const e = validateOnboardingStep(2, { ...complete, is_kleinunternehmer: null, profit_method: null }, today);
    expect(Object.keys(e).sort()).toEqual(['is_kleinunternehmer', 'profit_method']);
  });

  it('Schritt 2: Pauschalierung braucht Art', () => {
    expect(validateOnboardingStep(2, { ...complete, profit_method: 'pauschal' }, today).pausch_type).toBeDefined();
  });

  it('Schritt 2: KU-Pauschalierung nur für Kleinunternehmer', () => {
    const e = validateOnboardingStep(
      2,
      { ...complete, is_kleinunternehmer: false, profit_method: 'pauschal', pausch_type: 'ku', industry_code: 'service' },
      today,
    );
    expect(e.pausch_type).toContain('nur für Kleinunternehmer');
  });

  it('Schritt 2: KU-Pauschalierung braucht Branche', () => {
    const data = { ...complete, profit_method: 'pauschal' as const, pausch_type: 'ku' as const };
    expect(validateOnboardingStep(2, data, today).industry_code).toBeDefined();
    expect(validateOnboardingStep(2, { ...data, industry_code: 'trade' }, today)).toEqual({});
  });

  it('Schritt 2: Basispauschalierung ohne Branche ok', () => {
    expect(validateOnboardingStep(2, { ...complete, profit_method: 'pauschal', pausch_type: 'basis_6' }, today)).toEqual({});
  });

  it('Schritt 3: Adresse, PLZ, Ort, IBAN', () => {
    const e = validateOnboardingStep(3, { ...complete, address: '', zip_code: 'x', city: '', iban: '' }, today);
    expect(Object.keys(e).sort()).toEqual(['address', 'city', 'iban', 'zip_code']);
  });

  it('Schritt 3: ungültige IBAN und UID', () => {
    const e = validateOnboardingStep(3, { ...complete, iban: 'AT62 1904 3002 3457 3201', uid_number: 'ATU123' }, today);
    expect(e.iban).toContain('ungültig');
    expect(e.uid_number).toContain('ungültig');
  });
});

describe('translateAuthError', () => {
  it.each([
    ['Invalid login credentials', 'E-Mail oder Passwort ist falsch.'],
    ['Email not confirmed', 'bestätige'],
    ['User already registered', 'bereits ein Konto'],
    ['A user with this email address has already been registered', 'bereits ein Konto'],
    ['Password should be at least 8 characters', 'mindestens 8 Zeichen'],
    ['Password is too short', 'mindestens 8 Zeichen'],
    ['Password is known to be weak', 'mindestens 8 Zeichen'],
    ['Email rate limit exceeded', 'Zu viele Versuche'],
    ['Unable to validate email address: invalid format', 'gültige E-Mail'],
    ['Failed to fetch', 'Keine Verbindung'],
    ['something else', 'schiefgelaufen'],
  ])('%s', (input, expected) => {
    expect(translateAuthError(input)).toContain(expected);
  });
});
