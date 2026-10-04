import { describe, expect, it } from 'vitest';
import {
  describeSvsChange,
  describeTaxChange,
  isSectionDirty,
  profileToSettingsData,
  sectionPatch,
  toProfilePatch,
  validateSection,
  type SettingsData,
} from '@/lib/profileSettings';
import type { Profile } from '@/types';

const profile = {
  id: 'u1',
  full_name: 'Max Mustermann',
  business_name: null,
  business_type: 'gewerbetreibend',
  svs_registration_date: '2024-03-01',
  svs_exempt: false,
  is_kleinunternehmer: true,
  profit_method: 'pauschal',
  pausch_type: 'ku',
  industry_code: 'service',
  address: 'Mariahilfer Straße 1',
  zip_code: '1060',
  city: 'Wien',
  country: 'AT',
  iban: 'AT61 1904 3002 3457 3201',
  account_holder: 'Max Mustermann',
  uid_number: null,
  invoice_number_format: 'YYYY-NNN',
  invoice_footer_text: null,
  home_office: true,
  other_income_kind: 'employment',
  other_income_amount: 18000,
} as unknown as Profile;

const saved = profileToSettingsData(profile);
const with_ = (patch: Partial<SettingsData>): SettingsData => ({ ...saved, ...patch });
const today = new Date(2026, 9, 4);

describe('profileToSettingsData', () => {
  it('null-Felder werden zu leeren Strings', () => {
    expect(saved.business_name).toBe('');
    expect(saved.uid_number).toBe('');
    expect(saved.invoice_footer_text).toBe('');
    expect(saved.is_kleinunternehmer).toBe(true);
  });
});

describe('toProfilePatch', () => {
  it('normalisiert IBAN, UID und leere Felder', () => {
    const p = toProfilePatch(with_({ iban: 'at611904300234573201', uid_number: ' atu12345678 ', business_name: '  ' }));
    expect(p.iban).toBe('AT61 1904 3002 3457 3201');
    expect(p.uid_number).toBe('ATU12345678');
    expect(p.business_name).toBeNull();
  });

  it('andere Einkünfte: Betrag nur bei Gehalt/Pension', () => {
    expect(saved.other_income_amount).toBe('18000');
    expect(toProfilePatch(saved)).toMatchObject({ home_office: true, other_income_kind: 'employment', other_income_amount: 18000 });
    expect(toProfilePatch(with_({ other_income_amount: '18.500,50' })).other_income_amount).toBe(18500.5);
    expect(toProfilePatch(with_({ other_income_kind: 'none' })).other_income_amount).toBeNull();
  });

  it('EÜR: keine Pauschalierungsart, kein Wirtschaftszweig', () => {
    const p = toProfilePatch(with_({ profit_method: 'euer' }));
    expect(p.pausch_type).toBeNull();
    expect(p.industry_code).toBeNull();
  });

  it('Basispauschalierung: kein Wirtschaftszweig', () => {
    expect(toProfilePatch(with_({ pausch_type: 'basis_15' })).industry_code).toBeNull();
  });
});

describe('sectionPatch', () => {
  it('enthält nur die Felder des Abschnitts', () => {
    expect(Object.keys(sectionPatch('accounting', saved)).sort()).toEqual(
      ['home_office', 'industry_code', 'is_kleinunternehmer', 'other_income_amount', 'other_income_kind', 'pausch_type', 'profit_method'].sort(),
    );
    expect(sectionPatch('invoicing', saved)).toHaveProperty('invoice_footer_text', null);
    expect(sectionPatch('invoicing', saved)).not.toHaveProperty('full_name');
  });

  it('SVS-Ausnahme nur für Gewerbetreibende', () => {
    expect(sectionPatch('identity', with_({ svs_exempt: true })).svs_exempt).toBe(true);
    expect(sectionPatch('identity', with_({ svs_exempt: true, business_type: 'neue_selbstaendige' })).svs_exempt).toBe(false);
  });
});

describe('isSectionDirty', () => {
  it('erkennt Änderungen nur im eigenen Abschnitt', () => {
    const changed = with_({ city: 'Graz' });
    expect(isSectionDirty('invoicing', changed, saved)).toBe(true);
    expect(isSectionDirty('identity', changed, saved)).toBe(false);
  });

  it('reine Formatierung (Leerzeichen, Kleinschreibung) zählt nicht als Änderung', () => {
    expect(isSectionDirty('invoicing', with_({ iban: 'at611904300234573201', city: 'Wien ' }), saved)).toBe(false);
  });
});

describe('validateSection', () => {
  it('nutzt die Onboarding-Prüfung des passenden Schritts', () => {
    expect(validateSection('invoicing', with_({ iban: 'AT00 0000' }), today)).toHaveProperty('iban');
    expect(validateSection('identity', with_({ full_name: ' ' }), today)).toHaveProperty('full_name');
    expect(validateSection('accounting', with_({ is_kleinunternehmer: false }), today)).toHaveProperty('pausch_type');
    expect(validateSection('identity', saved, today)).toEqual({});
  });
});

describe('describeSvsChange', () => {
  it('keine Hinweise ohne Änderung', () => {
    expect(describeSvsChange(saved, saved, today)).toEqual([]);
  });

  it('Wechsel zu Neuen Selbständigen: Versicherungsgrenze', () => {
    const [n] = describeSvsChange(saved, with_({ business_type: 'neue_selbstaendige' }), today);
    expect(n?.id).toBe('business-type');
    expect(n?.text).toContain('6.613,20');
    expect(n?.text).toContain('Honorarnote');
    expect(n?.text).toContain('vertan');
  });

  it('Wechsel zu Gewerbetreibend: Rechnung statt Honorarnote', () => {
    const [n] = describeSvsChange(with_({ business_type: 'neue_selbstaendige' }), with_({ business_type: 'gewerbetreibend' }), today);
    expect(n?.text).toContain('Rechnung statt Honorarnote');
  });

  it('Anmeldedatum verschiebt die SVS-Phase → Warnung', () => {
    const [n] = describeSvsChange(saved, with_({ svs_registration_date: '2026-01-15' }), today);
    expect(n?.type).toBe('warning');
    expect(n?.title).toContain('SVS-Jahr 1');
    expect(n?.text).toContain('Bisher: Jahr 3');
    expect(n?.text).toContain('Gründungsphase');
  });

  it('gleiches Jahr → kein Hinweis; anderes Jahr gleiche Phase → Info', () => {
    expect(describeSvsChange(saved, with_({ svs_registration_date: '2024-11-01' }), today)).toEqual([]);
    const [n] = describeSvsChange(with_({ svs_registration_date: '2020-01-01' }), with_({ svs_registration_date: '2019-01-01' }), today);
    expect(n?.type).toBe('info');
  });

  it('ungültiges Datum → kein Hinweis', () => {
    expect(describeSvsChange(saved, with_({ svs_registration_date: '' }), today)).toEqual([]);
  });
});

describe('describeTaxChange', () => {
  const ids = (n: { id: string }[]) => n.map((x) => x.id);

  it('keine Hinweise ohne Änderung', () => {
    expect(describeTaxChange(saved, saved, 2)).toEqual([]);
  });

  it('Kleinunternehmer → USt-pflichtig: Entwürfe prüfen, UID nachtragen', () => {
    const [n] = describeTaxChange(saved, with_({ is_kleinunternehmer: false, pausch_type: 'basis_15' }), 2);
    expect(n?.id).toBe('ku-off');
    expect(n?.type).toBe('warning');
    expect(n?.text).toContain('2 Entwürfe');
    expect(n?.text).toContain('UID-Nummer');
    expect(n?.text).toContain('fünf Jahre an diese Entscheidung gebunden');
  });

  it('USt-pflichtig → Kleinunternehmer: Entwürfe werden umgestellt', () => {
    const before = with_({ is_kleinunternehmer: false, pausch_type: 'basis_15', industry_code: null });
    const [n] = describeTaxChange(before, with_({ pausch_type: 'basis_15', industry_code: null }), 1);
    expect(n?.id).toBe('ku-on');
    expect(n?.text).toContain('1 Entwurf wird automatisch auf 0 % USt umgestellt');
    expect(n?.text).toContain('nicht in den letzten fünf Jahren');
  });

  it('ohne Entwürfe kein Entwurfs-Hinweis', () => {
    const [n] = describeTaxChange(saved, with_({ is_kleinunternehmer: false, uid_number: 'ATU12345678' }), 0);
    expect(n?.text).not.toContain('Entw');
    expect(n?.text).not.toContain('Trage danach');
  });

  it('Pauschalierung → EÜR: Bindungsfrist', () => {
    const n = describeTaxChange(saved, with_({ profit_method: 'euer' }), 0);
    expect(ids(n)).toEqual(['pausch-to-euer']);
    expect(n[0]?.text).toContain('fünf Jahren');
  });

  it('EÜR → Pauschalierung: gilt fürs ganze Jahr', () => {
    expect(ids(describeTaxChange(with_({ profit_method: 'euer' }), saved, 0))).toEqual(['euer-to-pausch']);
  });

  it('neuer Pauschalsatz', () => {
    expect(describeTaxChange(saved, with_({ pausch_type: 'basis_6', industry_code: null }), 0)[0]?.title).toContain('6 %');
    expect(describeTaxChange(saved, with_({ industry_code: 'trade' }), 0)[0]?.title).toContain('20 %');
  });
});
