/** Kaufmännisch auf Cent runden (vermeidet Float-Artefakte wie 0.1 + 0.2). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const euroFormatter = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
const euroFormatterRounded = new Intl.NumberFormat('de-AT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** 1234.5 → „€ 1.234,50“ (bzw. ohne Cent mit `rounded`). */
export function formatEuro(value: number, rounded = false): string {
  return (rounded ? euroFormatterRounded : euroFormatter).format(value);
}
