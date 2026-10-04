import { describe, expect, it } from 'vitest';
import { SVS_2026 } from '@/constants/svs2026';
import {
  basisFromQuarterlyPrescription,
  calculateBeitragsgrundlage,
  calculateQuarterlyPrescription,
  calculateReserveRecommendation,
  calculateSVSContributions,
  getNachzahlungsWarning,
  getNextSVSDueDate,
  getSVSAlerts,
  getSVSPhase,
  getSVSYear,
  getVorlaeufigeBeitragsgrundlage,
  projectAnnualProfit,
} from '@/lib/svs';

/** Abweichung höchstens 2 % (Toleranz laut svs-validator). */
const within2Percent = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(0.02);

const withoutAccident = (c: { total: number; accident: number }) => c.total - c.accident;

describe('SVS_2026 Konstanten', () => {
  it('reserveRate entspricht der Summe der Beitragssätze', () => {
    const { health, pension, provision } = SVS_2026.rates;
    expect(health + pension + provision).toBeCloseTo(SVS_2026.reserveRate, 6);
  });

  it('UV-Fixbetrag = 12,95 €/Monat', () => {
    expect(SVS_2026.accidentFixed / 12).toBeCloseTo(12.95, 2);
  });

  it('Versicherungsgrenze = 12 × Mindestbeitragsgrundlage', () => {
    expect(SVS_2026.minBasisMonthly * 12).toBeCloseTo(SVS_2026.registrationThreshold, 2);
  });
});

describe('getSVSYear / getSVSPhase', () => {
  const reg = new Date(2024, 2, 1);

  it.each([
    [new Date(2024, 5, 1), 1, 'year1_2'],
    [new Date(2025, 11, 31), 2, 'year1_2'],
    [new Date(2026, 9, 3), 3, 'year3'],
    [new Date(2027, 0, 1), 4, 'year4plus'],
    [new Date(2032, 0, 1), 9, 'year4plus'],
  ] as const)('%s → Jahr %i, Phase %s', (today, year, phase) => {
    expect(getSVSYear(reg, today)).toBe(year);
    expect(getSVSPhase(reg, today)).toBe(phase);
  });

  it('Anmeldung in der Zukunft zählt als Jahr 1', () => {
    expect(getSVSYear(new Date(2027, 0, 1), new Date(2026, 0, 1))).toBe(1);
  });

  it('verwendet standardmäßig das heutige Datum', () => {
    expect(getSVSYear(new Date())).toBe(1);
    expect(getSVSPhase(new Date())).toBe('year1_2');
  });
});

describe('calculateBeitragsgrundlage', () => {
  it('rechnet vorgeschriebene SVS-Beiträge zum Gewinn hinzu', () => {
    expect(calculateBeitragsgrundlage(30000, 1929.72)).toBe(31929.72);
  });
});

describe('calculateSVSContributions – Testfälle svs-validator', () => {
  it('Gewinn 0 €: Mindestbeitrag ~147 €/Monat + UV 12,95 €/Monat', () => {
    const c = calculateSVSContributions(0);
    expect(c.basisGrundlage).toBe(6613.2);
    expect(c.health).toBe(449.7);
    expect(c.pension).toBe(1223.44);
    expect(c.provision).toBe(101.18);
    expect(c.accident).toBe(155.4);
    expect(c.total).toBe(1929.72);
    within2Percent(withoutAccident(c) / 12, 147);
  });

  it('Gewinn 20.000 €: ~5.366 €/Jahr (ohne UV)', () => {
    const c = calculateSVSContributions(20000);
    within2Percent(withoutAccident(c), 5366);
    expect(c.total).toBe(5521.4);
  });

  it('Gewinn 40.000 €: ~10.731 €/Jahr (ohne UV)', () => {
    const c = calculateSVSContributions(40000);
    within2Percent(withoutAccident(c), 10731);
    expect(c.total).toBe(10887.4);
  });

  it('Gewinn 55.000 €: ~14.755 €/Jahr (ohne UV)', () => {
    const c = calculateSVSContributions(55000);
    within2Percent(withoutAccident(c), 14755);
    expect(c.total).toBe(14911.9);
  });

  it('Gewinn ab 97.020 €: Höchstbeitrag gedeckelt (~26.030 € ohne UV)', () => {
    const atMax = calculateSVSContributions(97020);
    const above = calculateSVSContributions(250000);
    expect(atMax.basisGrundlage).toBe(97020);
    expect(above).toEqual(atMax);
    within2Percent(withoutAccident(atMax), 26030);
    expect(atMax.total).toBe(26185.87);
  });

  it('Neue Selbständige unter der Versicherungsgrenze zahlen nichts', () => {
    expect(calculateSVSContributions(6000, { businessType: 'neue_selbstaendige' }).total).toBe(0);
  });

  it('Neue Selbständige ab der Versicherungsgrenze zahlen regulär', () => {
    expect(calculateSVSContributions(20000, { businessType: 'neue_selbstaendige' }).total).toBe(5521.4);
  });

  it('Gewerbetreibende unter der Grenze zahlen den Mindestbeitrag', () => {
    expect(calculateSVSContributions(3000, { businessType: 'gewerbetreibend' }).total).toBe(1929.72);
  });

  it('Kleinstunternehmer-Ausnahme: nur Unfallversicherung', () => {
    const c = calculateSVSContributions(4000, { exempt: true });
    expect(c).toEqual({ health: 0, pension: 0, provision: 0, accident: 155.4, total: 155.4, basisGrundlage: 0 });
  });
});

describe('projectAnnualProfit', () => {
  it('rechnet linear auf 12 Monate hoch', () => {
    expect(projectAnnualProfit({ currentProfit: 15000, monthsElapsed: 6 })).toEqual({
      projected: 30000,
      low: 25500,
      high: 34500,
    });
  });

  it('erlaubt Bruchteile von Monaten', () => {
    expect(projectAnnualProfit({ currentProfit: 9000, monthsElapsed: 4.5 }).projected).toBe(24000);
  });

  it('ohne vergangene Zeit: aktueller Stand', () => {
    expect(projectAnnualProfit({ currentProfit: 1200, monthsElapsed: 0 }).projected).toBe(1200);
  });

  it('begrenzt auf 0–12 Monate', () => {
    expect(projectAnnualProfit({ currentProfit: 60000, monthsElapsed: 14 }).projected).toBe(60000);
    expect(projectAnnualProfit({ currentProfit: 500, monthsElapsed: -2 }).projected).toBe(500);
  });
});

describe('calculateReserveRecommendation', () => {
  it('40.000 € Gewinn: SVS + vereinfachte ESt', () => {
    const r = calculateReserveRecommendation(40000);
    expect(r.svsAmount).toBe(10887.4);
    // 40.000 − 10.887,40 = 29.112,60; GFB 4.366,89 → 24.745,71 zu versteuern
    expect(r.incomeTaxAmount).toBe(2516.71);
    expect(r.totalReserve).toBe(13404.11);
    expect(r.perInvoiceRate).toBe(0.34);
  });

  it('andere Einkünfte: nur die zusätzliche Steuer durch die Selbständigkeit', () => {
    // 24.745,71 € zu versteuern; Steuer(42.745,71) − Steuer(18.000) = 8.545,48 − 892,20
    const r = calculateReserveRecommendation(40000, { otherIncome: 18000 });
    expect(r.svsAmount).toBe(10887.4);
    expect(r.incomeTaxAmount).toBeGreaterThan(calculateReserveRecommendation(40000).incomeTaxAmount);
    expect(r.incomeTaxAmount).toBe(7653.28);
  });

  it('bezieht den Prozentsatz auf die Einnahmen, wenn bekannt', () => {
    const r = calculateReserveRecommendation(40000, { projectedRevenue: 50000 });
    expect(r.perInvoiceRate).toBe(0.27);
  });

  it('geringer Gewinn: nur SVS-Mindestbeitrag, keine ESt', () => {
    const r = calculateReserveRecommendation(5000);
    expect(r.svsAmount).toBe(1929.72);
    expect(r.incomeTaxAmount).toBe(0);
  });

  it('kein Gewinn: Rate 0', () => {
    expect(calculateReserveRecommendation(0).perInvoiceRate).toBe(0);
  });

  it('Rate ist höchstens 100 %', () => {
    expect(calculateReserveRecommendation(1000).perInvoiceRate).toBe(1);
  });
});

describe('getVorlaeufigeBeitragsgrundlage / calculateQuarterlyPrescription', () => {
  it('Neugründer: Mindestbasis', () => {
    expect(getVorlaeufigeBeitragsgrundlage('year1_2', 50000)).toBe(6613.2);
    expect(getVorlaeufigeBeitragsgrundlage('year3', 50000)).toBe(6613.2);
  });

  it('ab Jahr 4: Vorjahresgewinn (gedeckelt), sonst Mindestbasis', () => {
    expect(getVorlaeufigeBeitragsgrundlage('year4plus', 30000)).toBe(30000);
    expect(getVorlaeufigeBeitragsgrundlage('year4plus', 200000)).toBe(97020);
    expect(getVorlaeufigeBeitragsgrundlage('year4plus')).toBe(6613.2);
  });

  it('Quartalsvorschreibung = Jahresbeitrag / 4', () => {
    expect(calculateQuarterlyPrescription('year3')).toBe(482.43);
    expect(calculateQuarterlyPrescription('year4plus', 40000)).toBe(2721.85);
    expect(calculateQuarterlyPrescription('year1_2', undefined, { exempt: true })).toBe(38.85);
  });
});

describe('getNachzahlungsWarning', () => {
  it('Neugründer Jahr 3, 40.000 €: ~9.036 € Nachzahlung, kritisch', () => {
    const w = getNachzahlungsWarning({ phase: 'year3', projectedProfit: 40000 });
    within2Percent(w.estimatedNachzahlung, 9036);
    expect(w.estimatedNachzahlung).toBe(8957.68);
    expect(w.hasWarning).toBe(true);
    expect(w.urgency).toBe('critical');
    expect(w.message).toContain('Erwartete Nachzahlung');
  });

  it('Jahr 1–2: nur PV + Selbständigenvorsorge, Hinweis auf späteren Zeitpunkt', () => {
    const w = getNachzahlungsWarning({ phase: 'year1_2', projectedProfit: 20000 });
    // (20.000 − 6.613,20) × (18,5 % + 1,53 %)
    expect(w.estimatedNachzahlung).toBe(2681.38);
    expect(w.urgency).toBe('info');
    expect(w.message).toContain('2 bis 3 Jahre');
  });

  it('Jahr 4+: Differenz zur Vorjahresbasis, Warnung', () => {
    const w = getNachzahlungsWarning({ phase: 'year4plus', projectedProfit: 35000, previousYearProfit: 30000 });
    expect(w.estimatedNachzahlung).toBe(1341.5);
    expect(w.urgency).toBe('warning');
  });

  it('keine Nachzahlung bei gleichbleibendem oder sinkendem Gewinn', () => {
    const w = getNachzahlungsWarning({ phase: 'year4plus', projectedProfit: 25000, previousYearProfit: 30000 });
    expect(w).toMatchObject({ hasWarning: false, estimatedNachzahlung: 0, urgency: 'info' });
  });

  it('keine Nachzahlung bei Gewinn unter Mindestbasis', () => {
    expect(getNachzahlungsWarning({ phase: 'year3', projectedProfit: 5000 }).hasWarning).toBe(false);
  });
});

describe('basisFromQuarterlyPrescription', () => {
  it('rechnet die Vorschreibung exakt auf die Basis zurück', () => {
    expect(basisFromQuarterlyPrescription(calculateQuarterlyPrescription('year4plus', 40000))).toBeCloseTo(40000, 0);
    expect(basisFromQuarterlyPrescription(482.43)).toBe(6613.2);
  });
  it('begrenzt auf Mindest-/Höchstbasis', () => {
    expect(basisFromQuarterlyPrescription(0)).toBe(6613.2);
    expect(basisFromQuarterlyPrescription(100000)).toBe(97020);
  });
  it('Nachzahlung mit bekannter vorläufiger Basis', () => {
    const w = getNachzahlungsWarning({ phase: 'year4plus', projectedProfit: 50000, provisionalBasis: 40000 });
    expect(w.estimatedNachzahlung).toBe(2683);
  });
});

describe('getNextSVSDueDate', () => {
  it.each([
    [new Date(2026, 9, 3), new Date(2026, 10, 30)],
    [new Date(2026, 0, 15), new Date(2026, 1, 28)],
    [new Date(2026, 4, 31), new Date(2026, 4, 31)], // Fälligkeitstag selbst
    [new Date(2026, 11, 5), new Date(2027, 1, 28)], // Jahreswechsel
    [new Date(2028, 1, 10), new Date(2028, 1, 29)], // Schaltjahr
  ])('%s → %s', (today, expected) => {
    expect(getNextSVSDueDate(today)).toEqual(expected);
  });

  it('verwendet standardmäßig das heutige Datum', () => {
    expect(getNextSVSDueDate().getTime()).toBeGreaterThanOrEqual(new Date().setHours(0, 0, 0, 0));
  });
});

describe('getSVSAlerts', () => {
  const base = { isKleinunternehmer: true, phase: 'year1_2' as const, quarterlyAmount: 482.43 };
  const farFromDue = new Date(2026, 8, 1); // 1.9. → nächste Fälligkeit 30.11. (90 Tage)
  const ids = (a: { id: string }[]) => a.map((x) => x.id);

  it('keine Alerts im Normalfall', () => {
    expect(getSVSAlerts({ ...base, annualRevenue: 30000, today: farFromDue })).toEqual([]);
  });

  it('Umsatz > 45.000 €: Vorwarnung Kleinunternehmergrenze', () => {
    const a = getSVSAlerts({ ...base, annualRevenue: 45001, today: farFromDue });
    expect(ids(a)).toEqual(['ku-approaching']);
    expect(a[0]?.urgency).toBe('warning');
    expect(a[0]?.message).toContain('55.000');
  });

  it('Umsatz > 55.000 €: kritisch', () => {
    const a = getSVSAlerts({ ...base, annualRevenue: 55001, today: farFromDue });
    expect(ids(a)).toEqual(['ku-exceeded']);
    expect(a[0]?.urgency).toBe('critical');
  });

  it('Ausnahme verloren: kritischer Hinweis', () => {
    const a = getSVSAlerts({ ...base, annualRevenue: 0, exemptionLost: true, today: farFromDue });
    expect(ids(a)).toEqual(['exemption-lost']);
    expect(a[0]?.urgency).toBe('critical');
  });

  it('keine KU-Warnung für USt-pflichtige Unternehmer', () => {
    expect(getSVSAlerts({ ...base, isKleinunternehmer: false, annualRevenue: 80000, today: farFromDue })).toEqual([]);
  });

  it('Phase-Hinweise für Jahr 3 und Jahr 4+', () => {
    expect(ids(getSVSAlerts({ ...base, phase: 'year3', annualRevenue: 0, today: farFromDue }))).toEqual(['phase-year3']);
    expect(ids(getSVSAlerts({ ...base, phase: 'year4plus', annualRevenue: 0, today: farFromDue }))).toEqual([
      'phase-year4plus',
    ]);
  });

  it('30 Tage vor Fälligkeit: Erinnerung mit Betrag und Datum', () => {
    const a = getSVSAlerts({ ...base, annualRevenue: 0, today: new Date(2026, 9, 31) });
    expect(ids(a)).toEqual(['svs-due']);
    expect(a[0]?.message).toContain('30.11.2026');
    expect(a[0]?.message).toMatch(/482/);
  });

  it('31 Tage vor Fälligkeit: noch keine Erinnerung', () => {
    expect(getSVSAlerts({ ...base, annualRevenue: 0, today: new Date(2026, 9, 30) })).toEqual([]);
  });

  it('verwendet standardmäßig das heutige Datum', () => {
    expect(Array.isArray(getSVSAlerts({ ...base, annualRevenue: 0 }))).toBe(true);
  });
});
