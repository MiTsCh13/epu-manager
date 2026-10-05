import { describe, expect, it } from 'vitest';
import {
  calculateArbeitsplatzpauschale,
  calculateDeductibleAmount,
  calculateGrundfreibetrag,
  calculateKilometergeld,
  calculateNaechtigung,
  calculateProfit,
  calculateTagesgeld,
  getPauschRate,
  isPauschalierungAllowed,
  otherIncomeAmount,
  sumDeductibleExpenses,
} from '@/lib/profit';

describe('getPauschRate', () => {
  it.each([
    // § 17 Abs. 3a EStG: Dienstleistungsbetriebe laut Verordnung 20 %, alle anderen 45 %
    ['ku', 'service', 0.2],
    ['ku', 'trade', 0.45],
    ['basis_15', 'service', 0.15],
    ['basis_6', 'trade', 0.06],
  ] as const)('%s / %s → %f', (type, industry, rate) => {
    expect(getPauschRate(type, industry)).toBe(rate);
  });

  it('KU-Pauschalierung: Standard ist Dienstleistungsbetrieb (vorsichtig: niedrigerer Satz)', () => {
    expect(getPauschRate('ku')).toBe(0.2);
  });
});

describe('isPauschalierungAllowed', () => {
  it('KU-Pauschalierung bis 55.000 €', () => {
    expect(isPauschalierungAllowed('ku', 55000)).toBe(true);
    expect(isPauschalierungAllowed('ku', 55001)).toBe(false);
  });
  it('Basispauschalierung bis 420.000 €', () => {
    expect(isPauschalierungAllowed('basis_15', 420000)).toBe(true);
    expect(isPauschalierungAllowed('basis_6', 420001)).toBe(false);
  });
});

describe('calculateGrundfreibetrag', () => {
  it('15 % des Gewinns', () => expect(calculateGrundfreibetrag(20000)).toBe(3000));
  it('maximal 4.950 € (ab 33.000 € Gewinn)', () => {
    expect(calculateGrundfreibetrag(33000)).toBe(4950);
    expect(calculateGrundfreibetrag(80000)).toBe(4950);
  });
  it('0 bei Verlust', () => expect(calculateGrundfreibetrag(-5000)).toBe(0));
});

describe('calculateProfit – EÜR', () => {
  it('Einnahmen − absetzbare Ausgaben − SVS − Grundfreibetrag', () => {
    expect(
      calculateProfit({ profitMethod: 'euer', totalRevenue: 50000, totalExpenses: 10000, svsPayments: 5000 }),
    ).toEqual({ grossProfit: 40000, netProfit: 35000, grundfreibetrag: 4950, taxableIncome: 30050 });
  });

  it('zieht die Arbeitsplatzpauschale auch bei EÜR ab', () => {
    const r = calculateProfit({
      profitMethod: 'euer',
      totalRevenue: 20000,
      totalExpenses: 2000,
      svsPayments: 1929.72,
      arbeitsplatzpauschale: 1200,
    });
    expect(r.netProfit).toBe(14870.28);
    expect(r.pauschaleExpenses).toBeUndefined();
  });

  it('Verlust: kein Grundfreibetrag, negatives Einkommen', () => {
    const r = calculateProfit({ profitMethod: 'euer', totalRevenue: 3000, totalExpenses: 4000, svsPayments: 1929.72 });
    expect(r.grundfreibetrag).toBe(0);
    expect(r.taxableIncome).toBe(-2929.72);
  });
});

describe('calculateProfit – Pauschalierung', () => {
  it('KU-Pauschalierung Dienstleistungsbetrieb: 20 % von 27.500 € = 5.500 €', () => {
    const r = calculateProfit({
      profitMethod: 'pauschal',
      pauschType: 'ku',
      industryType: 'service',
      totalRevenue: 27500,
      totalExpenses: 999, // wird bei Pauschalierung ignoriert
      svsPayments: 2000,
      arbeitsplatzpauschale: 300,
    });
    expect(r).toEqual({
      pauschaleExpenses: 5500,
      grossProfit: 22000,
      netProfit: 19700,
      grundfreibetrag: 2955,
      taxableIncome: 16745,
    });
  });

  it('KU-Pauschalierung anderer Betrieb (z. B. Handel): 45 %', () => {
    const r = calculateProfit({
      profitMethod: 'pauschal',
      pauschType: 'ku',
      industryType: 'trade',
      totalRevenue: 30000,
      totalExpenses: 0,
      svsPayments: 0,
    });
    expect(r.pauschaleExpenses).toBe(13500);
    expect(r.netProfit).toBe(16500);
  });

  it('Basispauschalierung 15 % und 6 %', () => {
    const args = { profitMethod: 'pauschal' as const, totalRevenue: 100000, totalExpenses: 0, svsPayments: 10000 };
    expect(calculateProfit({ ...args, pauschType: 'basis_15' }).netProfit).toBe(75000);
    expect(calculateProfit({ ...args, pauschType: 'basis_6' }).netProfit).toBe(84000);
  });

  it('ohne Angabe: KU-Pauschalierung Dienstleistungsbetrieb', () => {
    const r = calculateProfit({ profitMethod: 'pauschal', totalRevenue: 10000, totalExpenses: 0, svsPayments: 0 });
    expect(r.pauschaleExpenses).toBe(2000);
  });

  it('zusätzlich absetzbar; weiterverrechnete Reisekosten mindern die Basis der Pauschale', () => {
    const r = calculateProfit({
      profitMethod: 'pauschal',
      pauschType: 'ku',
      industryType: 'service',
      totalRevenue: 30000,
      totalExpenses: 0,
      svsPayments: 0,
      pauschalExtras: 1500, // 1.000 € weiterverrechnete Reise + 500 € halbe Öffi-Karte
      reimbursedTravel: 1000,
    });
    expect(r.pauschaleExpenses).toBe(5800); // 20 % von 29.000 €
    expect(r.grossProfit).toBe(22700);
  });
});

describe('Ausgaben-Sonderregeln', () => {
  it('Bewirtung: nur 50 % absetzbar', () => {
    expect(calculateDeductibleAmount({ amount: 124.5, isBewirtung: true })).toBe(62.25);
  });
  it('Bewirtung hat Vorrang vor deductibleRate', () => {
    expect(calculateDeductibleAmount({ amount: 100, isBewirtung: true, deductibleRate: 1 })).toBe(50);
  });
  it('Kategorie-Satz (z. B. Öffi-Jahreskarte 50 %)', () => {
    expect(calculateDeductibleAmount({ amount: 365, deductibleRate: 0.5 })).toBe(182.5);
  });
  it('Standard: voll absetzbar', () => {
    expect(calculateDeductibleAmount({ amount: 49.9 })).toBe(49.9);
  });
  it('Kilometergeld 0,50 €/km', () => {
    expect(calculateKilometergeld(180)).toBe(90);
    expect(calculateKilometergeld(12.5)).toBe(6.25);
    expect(calculateKilometergeld(-3)).toBe(0);
  });
});

describe('sumDeductibleExpenses', () => {
  it('verwendet deductible_amount, nie amount', () => {
    expect(
      sumDeductibleExpenses([
        { amount: 124.5, deductible_amount: 62.25, is_bewirtung: true },
        { amount: 714, deductible_amount: 714, is_bewirtung: false },
      ]),
    ).toBe(776.25);
  });
  it('berechnet fehlende Werte nach den Regeln (Bewirtung 50 %)', () => {
    expect(
      sumDeductibleExpenses([
        { amount: 100, deductible_amount: null, is_bewirtung: true },
        { amount: 10.1, deductible_amount: null, is_bewirtung: false },
      ]),
    ).toBe(60.1);
  });
  it('leere Liste → 0', () => expect(sumDeductibleExpenses([])).toBe(0));
});

describe('calculateArbeitsplatzpauschale', () => {
  const base = { homeOffice: true, otherIncomeKind: 'none' as const, otherIncomeAmount: null, year: 2026 };

  it('nicht von zu Hause bzw. unbeantwortet: keine Pauschale', () => {
    expect(calculateArbeitsplatzpauschale({ ...base, homeOffice: false }).amount).toBe(0);
    expect(calculateArbeitsplatzpauschale({ ...base, homeOffice: null })).toEqual({ amount: 0, size: null, kz: null, months: 0 });
  });

  it('ohne andere Einkünfte: groß, 1.200 €, KZ 9217', () => {
    expect(calculateArbeitsplatzpauschale(base)).toEqual({ amount: 1200, size: 'gross', kz: '9217', months: 12 });
  });

  it('Gehalt über 13.539 €: klein, 300 €, KZ 9215', () => {
    const r = calculateArbeitsplatzpauschale({ ...base, otherIncomeKind: 'employment', otherIncomeAmount: 18000 });
    expect(r).toEqual({ amount: 300, size: 'klein', kz: '9215', months: 12 });
  });

  it('Gehalt bis 13.539 € oder Pension: weiterhin groß', () => {
    expect(calculateArbeitsplatzpauschale({ ...base, otherIncomeKind: 'employment', otherIncomeAmount: 13539 }).size).toBe('gross');
    expect(calculateArbeitsplatzpauschale({ ...base, otherIncomeKind: 'pension', otherIncomeAmount: 30000 }).size).toBe('gross');
  });

  it('Anmeldejahr: 1/12 pro angefangenem Monat', () => {
    // Anmeldung 15. März → März bis Dezember = 10 Monate
    const r = calculateArbeitsplatzpauschale({ ...base, registrationDate: new Date(2026, 2, 15) });
    expect(r).toMatchObject({ amount: 1000, months: 10 });
    expect(calculateArbeitsplatzpauschale({ ...base, registrationDate: new Date(2025, 2, 15) }).amount).toBe(1200);
    expect(calculateArbeitsplatzpauschale({ ...base, registrationDate: new Date(2027, 0, 1) }).amount).toBe(0);
  });
});

describe('otherIncomeAmount', () => {
  it('nur bei Gehalt oder Pension', () => {
    expect(otherIncomeAmount('employment', 18000)).toBe(18000);
    expect(otherIncomeAmount('pension', 12000)).toBe(12000);
    expect(otherIncomeAmount('none', 18000)).toBe(0);
    expect(otherIncomeAmount(null, 18000)).toBe(0);
    expect(otherIncomeAmount('employment', null)).toBe(0);
  });
});

describe('Diäten und Nächtigung', () => {
  it.each([
    [3, 0], // erst bei MEHR als 3 Stunden
    [3.01, 10], // 4 angefangene Stunden à 2,50 €
    [9.5, 25],
    [11, 27.5],
    [11.5, 30],
    [24, 30],
    [26, 30], // Rest 2 Stunden: nichts
    [30, 45], // 24 h + 6 angefangene Stunden
    [48, 60],
    [51, 60], // Rest genau 3 Stunden: nichts
    [36, 60], // Rest 12 Stunden: volles Tagesgeld
    [-2, 0],
    [0, 0],
  ])('Tagesgeld bei %f Stunden = %f €', (hours, amount) => {
    expect(calculateTagesgeld(hours)).toBe(amount);
  });

  it('Nächtigung pauschal 17 € pro Nacht', () => {
    expect(calculateNaechtigung(2)).toBe(34);
    expect(calculateNaechtigung(0)).toBe(0);
  });
});
