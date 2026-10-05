import { describe, expect, it } from 'vitest';
import {
  bookValueAtYearEnd,
  depreciationForYear,
  depreciationSchedule,
  exceedsGwgLimit,
  isHalfYearStart,
  sumDepreciation,
  validateUsefulLife,
} from '@/lib/assets';

describe('GWG-Grenze', () => {
  it('bis 1.000 € sofort absetzbar, darüber verteilen', () => {
    expect(exceedsGwgLimit(1000)).toBe(false);
    expect(exceedsGwgLimit(1000.01)).toBe(true);
  });
});

describe('Halbjahresregel', () => {
  it('Inbetriebnahme bis 30. Juni: ganzes Jahr, ab 1. Juli: halbes Jahr', () => {
    expect(isHalfYearStart('2026-06-30')).toBe(false);
    expect(isHalfYearStart('2026-07-01')).toBe(true);
    expect(isHalfYearStart('2026-12-31')).toBe(true);
  });
});

describe('depreciationSchedule', () => {
  it('Laptop 1.500 € im März, 3 Jahre: je 500 €', () => {
    expect(depreciationSchedule({ cost: 1500, purchaseDate: '2026-03-10', usefulLifeYears: 3 })).toEqual([
      { year: 2026, amount: 500, bookValueEnd: 1000, half: false },
      { year: 2027, amount: 500, bookValueEnd: 500, half: false },
      { year: 2028, amount: 500, bookValueEnd: 0, half: false },
    ]);
  });

  it('Kauf im September: erstes und letztes Jahr halb, ein Jahr länger', () => {
    expect(depreciationSchedule({ cost: 1500, purchaseDate: '2026-09-01', usefulLifeYears: 3 })).toEqual([
      { year: 2026, amount: 250, bookValueEnd: 1250, half: true },
      { year: 2027, amount: 500, bookValueEnd: 750, half: false },
      { year: 2028, amount: 500, bookValueEnd: 250, half: false },
      { year: 2029, amount: 250, bookValueEnd: 0, half: true },
    ]);
  });

  it('Rundungsdifferenz landet im letzten Jahr, Summe = Kaufpreis', () => {
    const plan = depreciationSchedule({ cost: 1234.57, purchaseDate: '2026-02-01', usefulLifeYears: 3 });
    expect(plan.map((p) => p.amount)).toEqual([411.52, 411.52, 411.53]);
    expect(plan.at(-1)!.bookValueEnd).toBe(0);
  });

  it('Abschreibung und Restwert für ein bestimmtes Jahr', () => {
    const a = { cost: 1500, purchaseDate: '2026-09-01', usefulLifeYears: 3 };
    expect(depreciationForYear(a, 2025)).toBe(0);
    expect(depreciationForYear(a, 2027)).toBe(500);
    expect(depreciationForYear(a, 2030)).toBe(0);
    expect(bookValueAtYearEnd(a, 2025)).toBe(1500);
    expect(bookValueAtYearEnd(a, 2027)).toBe(750);
    expect(bookValueAtYearEnd(a, 2035)).toBe(0);
  });

  it('Summe über mehrere Anlagen', () => {
    const assets = [
      { cost: 1500, purchase_date: '2025-03-01', useful_life_years: 3 }, // 2026: 500
      { cost: 2400, purchase_date: '2026-08-15', useful_life_years: 8 }, // 2026: 150 (halb)
      { cost: 3000, purchase_date: '2020-01-01', useful_life_years: 3 }, // längst abgeschrieben
    ];
    expect(sumDepreciation(assets, 2026)).toBe(650);
  });
});

describe('validateUsefulLife', () => {
  it('ganze Jahre zwischen 2 und 50', () => {
    expect(validateUsefulLife('3')).toBeNull();
    expect(validateUsefulLife('')).not.toBeNull();
    expect(validateUsefulLife('2,5')).not.toBeNull();
    expect(validateUsefulLife('1')).toMatch(/sofort/);
    expect(validateUsefulLife('51')).not.toBeNull();
  });
});
