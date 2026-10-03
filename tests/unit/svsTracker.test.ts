import { describe, expect, it } from 'vitest';
import { buildSvsTracker, monthsElapsedInYear, type TrackerInput } from '@/lib/svsTracker';

// Testdaten wie „Klaro Test GmbH“: EÜR, Kleinunternehmer, Anmeldung 01.03.2024, Stichtag 03.10.2026
const base: TrackerInput = {
  today: new Date(2026, 9, 3),
  registrationDate: new Date(2024, 2, 1),
  businessType: 'neue_selbstaendige',
  exempt: false,
  isKleinunternehmer: true,
  profitMethod: 'euer',
  pauschType: null,
  industryType: null,
  quarterlyPrescription: null,
  current: { revenueNet: 15450, revenueGross: 15450, deductibleExpenses: 1450.85, svsPaid: 1447.32 },
  previous: null,
};

describe('monthsElapsedInYear', () => {
  it('Jahresanfang 0, Jahresmitte ~6', () => {
    expect(monthsElapsedInYear(new Date(2026, 0, 1))).toBe(0);
    expect(monthsElapsedInYear(new Date(2026, 6, 2))).toBeCloseTo(6, 1);
  });
});

describe('buildSvsTracker', () => {
  const m = buildSvsTracker(base);

  it('SVS-Jahr und Phase', () => {
    expect(m.svsYear).toBe(3);
    expect(m.phase).toBe('year3');
  });

  it('Gewinn bis heute und Berechnungsbasis (+ SVS-Hinzurechnung)', () => {
    expect(m.profitYtd).toBe(12551.83);
    expect(m.basisYtd).toBe(13999.15);
  });

  it('Jahresrechnung bisher: Einnahmen → … → zu versteuern (ESt nur fürs ganze Jahr)', () => {
    expect(m.breakdown.ytd).toEqual({
      revenue: 15450,
      expenses: 1450.85,
      basis: 13999.15,
      svs: 1447.32,
      profit: 12551.83,
      grundfreibetrag: 1882.77,
      taxable: 10669.06,
      incomeTax: null,
      remaining: null,
    });
  });

  it('Jahresrechnung hochgerechnet: konsistent mit Rücklage und SVS', () => {
    const p = m.breakdown.projected;
    expect(p.basis).toBe(m.projection.projected);
    expect(p.basis).toBeCloseTo(p.revenue - p.expenses, 1);
    expect(p.svs).toBe(m.expectedSvs);
    expect(p.incomeTax).toBe(m.reserve.incomeTaxAmount);
    expect(p.svs + (p.incomeTax ?? 0)).toBeCloseTo(m.reserve.totalReserve, 2);
    expect(p.remaining).toBeCloseTo(p.profit - (p.incomeTax ?? 0), 2);
  });

  it('Am 1. Jänner: keine Hochrechnung (Faktor 1)', () => {
    const t = buildSvsTracker({ ...base, today: new Date(2026, 0, 1) });
    expect(t.breakdown.projected.revenue).toBe(15450);
  });

  it('Hochrechnung auf 12 Monate', () => {
    expect(m.projection.projected).toBeCloseTo(13999.15 / monthsElapsedInYear(base.today) * 12, 1);
    expect(m.revenueProjected).toBeGreaterThan(15450);
  });

  it('Rücklage: Gesamt minus bereits bezahlte SVS', () => {
    expect(m.reserve.totalReserve).toBeGreaterThan(0);
    expect(m.reserveOpen).toBeCloseTo(m.reserve.totalReserve - 1447.32, 2);
    expect(m.reserve.perInvoiceRate).toBeGreaterThan(0);
  });

  it('Jahr 3 ohne Vorschreibung: Mindestbasis vorläufig, Nachzahlung erwartet', () => {
    expect(m.provisionalBasis).toBe(6613.2);
    expect(m.provisionalSvs).toBe(1929.72);
    // Nachzahlung ist Teil des erwarteten SVS-Beitrags (Jahr 3: alle Zweige)
    expect(m.expectedSvs - m.provisionalSvs).toBeCloseTo(m.warning.estimatedNachzahlung, 0);
    expect(m.quarterlyAmount).toBe(482.43);
    expect(m.prescriptionKnown).toBe(false);
    expect(m.warning.hasWarning).toBe(true);
    expect(m.warning.estimatedNachzahlung).toBeGreaterThan(3000);
  });

  it('Alerts: Phase 3 + Fälligkeit 30.11. noch > 30 Tage entfernt', () => {
    expect(m.alerts.map((a) => a.id)).toEqual(['phase-year3']);
    expect(m.nextDue).toEqual(new Date(2026, 10, 30));
  });

  it('bekannte Vorschreibung hat Vorrang', () => {
    const t = buildSvsTracker({ ...base, quarterlyPrescription: 1200 });
    expect(t.prescriptionKnown).toBe(true);
    expect(t.quarterlyAmount).toBe(1200);
    expect(t.provisionalBasis).toBeGreaterThan(17000);
  });

  it('Jahr 4+: Vorjahresbasis aus Vorjahresdaten', () => {
    const t = buildSvsTracker({
      ...base,
      registrationDate: new Date(2020, 0, 1),
      previous: { revenueNet: 30000, revenueGross: 30000, deductibleExpenses: 5000, svsPaid: 2000 },
    });
    expect(t.phase).toBe('year4plus');
    expect(t.provisionalBasis).toBe(25000); // 30.000 − 5.000 − 2.000 + 2.000
  });

  it('ohne Anmeldedatum: Jahr 1', () => {
    const t = buildSvsTracker({ ...base, registrationDate: null, businessType: null });
    expect(t.svsYear).toBe(1);
    expect(t.phase).toBe('year1_2');
  });

  it('Kleinstunternehmer-Ausnahme bzw. unter Versicherungsgrenze: keine Nachzahlung', () => {
    expect(buildSvsTracker({ ...base, exempt: true }).warning.hasWarning).toBe(false);
    const low = buildSvsTracker({ ...base, current: { revenueNet: 3000, revenueGross: 3000, deductibleExpenses: 0, svsPaid: 0 } });
    expect(low.notInsured).toBe(true);
    expect(low.warning.hasWarning).toBe(false);
  });

  it('Pauschalierung und keine Einnahmen', () => {
    const t = buildSvsTracker({
      ...base,
      profitMethod: 'pauschal',
      pauschType: 'ku',
      industryType: 'service',
      businessType: 'gewerbetreibend',
      current: { revenueNet: 0, revenueGross: 0, deductibleExpenses: 0, svsPaid: 0 },
    });
    expect(t.revenueProjected).toBe(0);
    expect(t.reserve.perInvoiceRate).toBe(0);
    // Gewerbetreibende zahlen auch ohne Gewinn den Mindestbeitrag
    expect(t.reserve.svsAmount).toBe(1929.72);
  });

  it('Kleinunternehmergrenze: Alert ab 45.000 € Umsatz', () => {
    const t = buildSvsTracker({ ...base, current: { ...base.current, revenueGross: 47000 } });
    expect(t.alerts.map((a) => a.id)).toContain('ku-approaching');
  });
});
