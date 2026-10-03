import { describe, expect, it } from 'vitest';
import { buildEpcPayload } from '@/lib/epcQr';

describe('buildEpcPayload (EPC069-12)', () => {
  const base = { name: 'Klaro Test GmbH', iban: 'AT61 1904 3002 3457 3201', amount: 4200, remittance: 'Rechnung 2026-001' };

  it('erzeugt den Standard-Inhalt', () => {
    expect(buildEpcPayload(base)).toBe(
      ['BCD', '002', '1', 'SCT', '', 'Klaro Test GmbH', 'AT611904300234573201', 'EUR4200.00', '', '', 'Rechnung 2026-001'].join('\n'),
    );
  });

  it('mit BIC, Kürzung von Name (70) und Verwendungszweck (140)', () => {
    const p = buildEpcPayload({ ...base, bic: ' GIBAATWWXXX ', name: 'N'.repeat(80), remittance: 'R'.repeat(200), amount: 0.01 })!;
    const lines = p.split('\n');
    expect(lines[4]).toBe('GIBAATWWXXX');
    expect(lines[5]).toHaveLength(70);
    expect(lines[7]).toBe('EUR0.01');
    expect(lines[10]).toHaveLength(140);
  });

  it.each([
    ['ohne Namen', { name: '  ' }],
    ['Name null', { name: null }],
    ['ohne IBAN', { iban: undefined }],
    ['ungültige IBAN', { iban: 'AT62 1904 3002 3457 3201' }],
    ['Betrag 0', { amount: 0 }],
    ['Betrag zu hoch', { amount: 1_000_000_000 }],
    ['Betrag NaN', { amount: NaN }],
  ])('kein QR-Code: %s', (_, patch) => {
    expect(buildEpcPayload({ ...base, ...patch })).toBeNull();
  });
});
