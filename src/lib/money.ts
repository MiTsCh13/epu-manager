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

/**
 * Zahl aus Benutzereingabe lesen – akzeptiert deutsches und englisches Format:
 * „1.234,50“, „1234,5“, „1234.50“, „€ 95“. Ungültig → NaN.
 */
export function parseDecimal(input: string): number {
  let s = input.replace(/[€\s]/g, '');
  if (s === '') return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // „1.234,50“
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // „1.234“ = Tausender
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Zahl für Eingabefelder: 1234.5 → „1234,5“ */
export function formatDecimalInput(value: number): string {
  return String(value).replace('.', ',');
}
