import { describe, expect, it } from 'vitest';
import { changedTaxFields, describeTaxDiff, laterSettings, planTaxChange, profileForYear, sameTaxSettings, settingSince, taxChangeLog, taxSettingsFor, yearOfDate } from '@/lib/taxYears';
import { formatEuro } from '@/lib/money';
import type { Profile, TaxYear } from '@/types';

// Profil = Stand aus dem Onboarding: Kleinunternehmerin, KU-Pauschalierung 20 %, kein Gehalt
const profile = {
  id: 'u1',
  full_name: 'Lena Muster',
  is_kleinunternehmer: true,
  profit_method: 'pauschal',
  pausch_type: 'ku',
  industry_code: 'service',
  svs_exempt: false,
  home_office: true,
  other_income_kind: 'none',
  other_income_amount: null,
} as unknown as Profile;

const row = (year: number, patch: Partial<TaxYear>): TaxYear => ({
  user_id: 'u1',
  year,
  is_kleinunternehmer: true,
  profit_method: 'pauschal',
  pausch_type: 'ku',
  industry_code: 'service',
  svs_exempt: false,
  home_office: true,
  other_income_kind: 'none',
  other_income_amount: null,
  updated_at: '2026-10-25T00:00:00Z',
  ...patch,
});

// Ab 2026 keine Kleinunternehmerin mehr → EÜR; ab 2028 zusätzlich ein Gehalt
const rows = [row(2028, { is_kleinunternehmer: false, profit_method: 'euer', pausch_type: null, industry_code: null, other_income_kind: 'employment', other_income_amount: 18000 }), row(2026, { is_kleinunternehmer: false, profit_method: 'euer', pausch_type: null, industry_code: null })];

describe('taxSettingsFor / profileForYear', () => {
  it('ohne Jahres-Einstellungen gilt das Profil', () => {
    expect(taxSettingsFor(profile, [], 2026).is_kleinunternehmer).toBe(true);
    expect(profileForYear(profile, [], 2026)).toEqual(profile);
  });

  it('vor der ersten Zeile gilt das Profil, danach die letzte Zeile bis zum Jahr (auch unsortiert)', () => {
    expect(taxSettingsFor(profile, rows, 2025)).toMatchObject({ is_kleinunternehmer: true, profit_method: 'pauschal' });
    expect(taxSettingsFor(profile, rows, 2026)).toMatchObject({ is_kleinunternehmer: false, profit_method: 'euer', other_income_kind: 'none' });
    expect(taxSettingsFor(profile, rows, 2027)).toMatchObject({ is_kleinunternehmer: false, other_income_kind: 'none' });
    expect(taxSettingsFor(profile, rows, 2030)).toMatchObject({ other_income_kind: 'employment', other_income_amount: 18000 });
  });

  it('profileForYear übernimmt nur die Steuerfelder, der Rest bleibt aus dem Profil', () => {
    const p = profileForYear(profile, rows, 2026);
    expect(p.full_name).toBe('Lena Muster');
    expect(p.is_kleinunternehmer).toBe(false);
    expect(p).not.toHaveProperty('year');
    expect(p).not.toHaveProperty('user_id');
  });
});

describe('yearOfDate', () => {
  it('Jahr aus ISO-Datum, sonst das laufende Jahr', () => {
    const today = new Date(2026, 9, 26);
    expect(yearOfDate('2025-12-31', today)).toBe(2025);
    expect(yearOfDate('2027-01-01T00:00:00Z', today)).toBe(2027);
    expect(yearOfDate('', today)).toBe(2026);
    expect(yearOfDate(null, today)).toBe(2026);
    expect(yearOfDate('kein Datum', today)).toBe(2026);
  });
});

describe('sameTaxSettings', () => {
  it('Betrag als Zahl oder Text gilt gleich, leer = 0', () => {
    const a = taxSettingsFor(profile, [], 2026);
    expect(sameTaxSettings(a, { ...a })).toBe(true);
    expect(sameTaxSettings({ ...a, other_income_amount: 18000 }, { ...a, other_income_amount: '18000' as unknown as number })).toBe(true);
    expect(sameTaxSettings({ ...a, other_income_amount: null }, { ...a, other_income_amount: 0 })).toBe(true);
    expect(sameTaxSettings(a, { ...a, home_office: false })).toBe(false);
  });
});

describe('Verlauf', () => {
  it('describeTaxDiff nennt nur echte Unterschiede in einfachen Worten', () => {
    const before = taxSettingsFor(profile, [], 2025);
    expect(describeTaxDiff(before, before)).toEqual([]);
    expect(describeTaxDiff(before, taxSettingsFor(profile, rows, 2026))).toEqual(['Kleinunternehmer: nein', 'Gewinnermittlung: Einnahmen-Ausgaben-Rechnung']);
    expect(describeTaxDiff(before, { ...before, industry_code: 'trade' })).toEqual(['Gewinnermittlung: Kleinunternehmer-Pauschalierung 45 %']);
    expect(describeTaxDiff(before, { ...before, home_office: null })).toEqual(['Arbeitsplatz zu Hause: offen']);
  });

  it('taxChangeLog: je Jahr gegenüber dem Vorjahr, älteste zuerst, ohne Jahre ohne Änderung', () => {
    const same = row(2027, { is_kleinunternehmer: false, profit_method: 'euer', pausch_type: null, industry_code: null });
    expect(taxChangeLog(profile, [...rows, same])).toEqual([
      { year: 2026, changes: ['Kleinunternehmer: nein', 'Gewinnermittlung: Einnahmen-Ausgaben-Rechnung'] },
      { year: 2028, changes: [`Andere Einkünfte: Gehalt ${formatEuro(18000, true)}`] },
    ]);
  });
});

describe('planTaxChange – „Ab wann gilt das?“', () => {
  const base = taxSettingsFor(profile, [], 2026);
  const noKU = { ...base, is_kleinunternehmer: false, profit_method: 'euer', pausch_type: null, industry_code: null };
  const plan = (rows: TaxYear[], next: typeof base, start: Parameters<typeof planTaxChange>[4]) =>
    planTaxChange(profile, rows, taxSettingsFor(profile, rows, 2026), next, start, 2026);

  it('ab dem laufenden Jahr: neue Zeile, Profil bleibt für frühere Jahre', () => {
    expect(plan([], noKU, { kind: 'from', year: 2026 })).toEqual({ profile: null, upsert: [{ ...noKU, year: 2026 }], remove: [] });
  });

  it('ab nächstem Jahr: heuer bleibt, wie es war', () => {
    expect(plan([], noKU, { kind: 'from', year: 2027 })).toEqual({ profile: null, upsert: [{ ...noKU, year: 2027 }], remove: [] });
  });

  it('ab einem früheren Jahr: nur die geänderte Angabe wandert in die Jahre danach, andere bleiben je Jahr', () => {
    // 2025: Gehalt 18.000 €, 2026: Pension 12.000 € – geändert wird nur „zu Hause arbeiten“ ab 2024
    const rows = [
      row(2025, { other_income_kind: 'employment', other_income_amount: 18000 }),
      row(2026, { other_income_kind: 'pension', other_income_amount: 12000 }),
    ];
    const next = { ...taxSettingsFor(profile, rows, 2026), home_office: false };
    const p = plan(rows, next, { kind: 'from', year: 2024 });
    expect(p.profile).toBeNull();
    expect(p.remove).toEqual([]);
    expect(p.upsert).toEqual([
      { ...base, home_office: false, year: 2024 },
      { ...pick(rows[0]!), home_office: false, year: 2025 },
      { ...pick(rows[1]!), home_office: false, year: 2026 },
    ]);
  });

  it('spätere eigene Einstellungen übernehmen die Änderung, behalten aber ihre anderen Angaben', () => {
    const rows = [row(2028, { other_income_kind: 'employment', other_income_amount: 18000 })];
    const p = plan(rows, { ...base, home_office: false }, { kind: 'from', year: 2026 });
    expect(p.upsert).toEqual([
      { ...base, home_office: false, year: 2026 },
      { ...pick(rows[0]!), home_office: false, year: 2028 },
    ]);
  });

  it('gleich wie das Jahr davor: keine neue Zeile, überflüssige fallen weg', () => {
    expect(plan([], base, { kind: 'from', year: 2026 })).toEqual({ profile: null, upsert: [], remove: [] });
    // 2027 war schon „kein KU“ geplant – jetzt ab 2026 → 2027 ist überflüssig
    const rows = [row(2027, { is_kleinunternehmer: false, profit_method: 'euer', pausch_type: null, industry_code: null })];
    expect(plan(rows, noKU, { kind: 'from', year: 2026 })).toEqual({ profile: null, upsert: [{ ...noKU, year: 2026 }], remove: [2027] });
  });

  it('nur korrigieren: ohne Jahres-Einstellung ändert sich das Profil (alle Jahre)', () => {
    expect(plan([], noKU, { kind: 'fix' })).toEqual({ profile: noKU, upsert: [], remove: [] });
  });

  it('nur korrigieren: ab dem Jahr der Angabe, die heuer gilt; zurück auf den Stand davor → Zeile fällt weg', () => {
    const rows = [row(2025, { home_office: false })];
    const fixed = { ...taxSettingsFor(profile, rows, 2026), other_income_kind: 'pension', other_income_amount: 12000 };
    expect(plan(rows, fixed, { kind: 'fix' })).toEqual({ profile: null, upsert: [{ ...fixed, year: 2025 }], remove: [] });
    expect(plan(rows, base, { kind: 'fix' })).toEqual({ profile: null, upsert: [], remove: [2025] });
  });

  it('nur die Branche geändert: geplanter Wechsel 2027 (kein KU, EÜR) bleibt erhalten', () => {
    const planned = row(2027, { is_kleinunternehmer: false, profit_method: 'euer', pausch_type: null, industry_code: null });
    const p = plan([planned], { ...base, industry_code: 'trade' }, { kind: 'from', year: 2026 });
    // In 2027 gäbe es ohne Pauschalierung keine Branche → dort gilt die Gewinnermittlung von 2027 weiter
    expect(p.upsert).toEqual([{ ...base, industry_code: 'trade', year: 2026 }]);
    expect(p.remove).toEqual([]);
  });

  it('unmögliche Kombination im späteren Jahr: dort bleibt die eigene Gewinnermittlung', () => {
    // Ab 2026 KU-Pauschalierung (nur als Kleinunternehmer möglich), 2027 war „kein KU, EÜR“ → 2027 bekommt die ganze Gruppe
    const rows = [row(2025, { is_kleinunternehmer: true, profit_method: 'euer', pausch_type: null, industry_code: null }), row(2027, { is_kleinunternehmer: false, profit_method: 'euer', pausch_type: null, industry_code: null })];
    const current = taxSettingsFor(profile, rows, 2026);
    const p = planTaxChange(profile, rows, current, { ...current, profit_method: 'pauschal', pausch_type: 'basis_15' }, { kind: 'from', year: 2026 }, 2026);
    // Basispauschalierung geht auch ohne KU → 2027 behält „kein KU“, übernimmt nur die Pauschalierung
    expect(p.upsert.find((r) => r.year === 2027)).toMatchObject({ is_kleinunternehmer: false, profit_method: 'pauschal', pausch_type: 'basis_15' });
    const ku = planTaxChange(profile, rows, current, { ...current, profit_method: 'pauschal', pausch_type: 'ku', industry_code: 'service' }, { kind: 'from', year: 2026 }, 2026);
    // KU-Pauschalierung in 2027 ohne KU unmöglich → 2027 behält „kein KU, EÜR“
    expect(ku.upsert.map((r) => r.year)).toEqual([2026]);
    expect(ku.remove).toEqual([]);
  });

  it('changedTaxFields: nur geänderte Felder, Betrag als Zahl oder Text gleich', () => {
    expect(changedTaxFields(base, { ...base, home_office: false })).toEqual({ home_office: false });
    expect(changedTaxFields(base, { ...base, industry_code: 'trade' })).toEqual({ industry_code: 'trade' });
    const withSalary = { ...base, other_income_kind: 'employment', other_income_amount: 18000 };
    expect(changedTaxFields(withSalary, { ...withSalary, other_income_amount: '18000' as unknown as number })).toEqual({});
  });

  it('settingSince und laterSettings', () => {
    const rows = [row(2028, {}), row(2025, {})];
    expect(settingSince(rows, 2024)).toBeNull();
    expect(settingSince(rows, 2026)).toBe(2025);
    expect(laterSettings(rows, 2024)).toEqual([2025, 2028]);
    expect(laterSettings(rows, 2026)).toEqual([2028]);
  });
});

// Nur die Steuerfelder einer Zeile (wie in taxYears.ts)
function pick(r: TaxYear) {
  const { user_id: _u, year: _y, updated_at: _t, ...rest } = r;
  return rest;
}
