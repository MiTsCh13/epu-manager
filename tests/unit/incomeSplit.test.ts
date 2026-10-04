import { describe, expect, it } from 'vitest';
import { buildIncomeSplit } from '@/lib/incomeSplit';
import type { BreakdownColumn } from '@/lib/svsTracker';

const column = (patch: Partial<BreakdownColumn>): BreakdownColumn => ({
  revenue: 40000,
  expenses: 8000,
  basis: 32000,
  svs: 8600,
  profit: 23400,
  grundfreibetrag: 3510,
  taxable: 19890,
  incomeTax: 1270,
  remaining: 22130,
  ...patch,
});

describe('buildIncomeSplit', () => {
  it('Einnahmen = Ausgaben + SVS + ESt + was bleibt; Anteile summieren sich auf 100 %', () => {
    const split = buildIncomeSplit(column({}))!;
    expect(split.segments.map((s) => s.key)).toEqual(['expenses', 'svs', 'incomeTax', 'remaining']);
    expect(split.segments.map((s) => s.value)).toEqual([8000, 8600, 1270, 22130]);
    expect(split.segments[0]?.share).toBeCloseTo(0.2, 5);
    expect(split.segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 5);
    expect(split.deficit).toBe(false);
  });

  it('ohne Einnahmen kein Balken', () => {
    expect(buildIncomeSplit(column({ revenue: 0 }))).toBeNull();
  });

  it('Verlust: nichts bleibt, Balken auf die Kosten skaliert', () => {
    const split = buildIncomeSplit(column({ revenue: 3000, expenses: 1000, svs: 2500, incomeTax: 0, remaining: -500 }))!;
    expect(split.deficit).toBe(true);
    expect(split.segments.find((s) => s.key === 'remaining')?.value).toBe(0);
    expect(split.segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 5);
  });
});
