// EPC-QR-Code („Zahlen mit Code“ / GiroCode) nach EPC069-12, Version 002.
// Österreichische und deutsche Banking-Apps lesen damit Empfänger, IBAN, Betrag und Verwendungszweck ein.
import { isValidIban } from './validation';

const MAX_NAME = 70;
const MAX_REMITTANCE = 140;
const MAX_AMOUNT = 999_999_999.99;

export function buildEpcPayload(params: {
  name: string | null | undefined;
  iban: string | null | undefined;
  amount: number;
  remittance: string;
  bic?: string;
}): string | null {
  const name = params.name?.trim();
  const iban = params.iban?.replace(/\s+/g, '').toUpperCase();
  if (!name || !iban || !isValidIban(iban)) return null;
  if (!(params.amount >= 0.01 && params.amount <= MAX_AMOUNT)) return null;

  return [
    'BCD', // Service Tag
    '002', // Version (BIC innerhalb des EWR optional)
    '1', // Zeichensatz UTF-8
    'SCT', // SEPA Credit Transfer
    params.bic?.trim() ?? '',
    name.slice(0, MAX_NAME),
    iban,
    `EUR${params.amount.toFixed(2)}`,
    '', // Purpose Code
    '', // strukturierte Referenz (nicht zusammen mit unstrukturierter erlaubt)
    params.remittance.trim().slice(0, MAX_REMITTANCE),
  ].join('\n');
}
