// Länderauswahl für Kundenadressen (ISO 3166-1 alpha-2), häufigste zuerst
export const COUNTRIES = [
  { value: 'AT', label: 'Österreich' },
  { value: 'DE', label: 'Deutschland' },
  { value: 'CH', label: 'Schweiz' },
  { value: 'IT', label: 'Italien' },
  { value: 'LI', label: 'Liechtenstein' },
  { value: 'SI', label: 'Slowenien' },
  { value: 'HU', label: 'Ungarn' },
  { value: 'CZ', label: 'Tschechien' },
  { value: 'SK', label: 'Slowakei' },
  { value: 'NL', label: 'Niederlande' },
  { value: 'FR', label: 'Frankreich' },
  { value: 'GB', label: 'Vereinigtes Königreich' },
  { value: 'US', label: 'USA' },
] as const;

export function countryName(code: string | null | undefined): string {
  return COUNTRIES.find((c) => c.value === code)?.label ?? code ?? '';
}
