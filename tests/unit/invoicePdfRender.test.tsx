import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { createInvoicePdfElement } from '@/lib/renderInvoicePdf';
import type { Invoice } from '@/types';

const invoice = {
  invoice_number: '2026-003',
  invoice_date: '2026-04-10',
  due_date: '2026-04-24',
  service_date_from: '2026-04-01',
  service_date_to: '2026-04-30',
  status: 'sent',
  is_honorarnote: false,
  line_items: [
    { description: 'Wartung & Support Q2 (Stunden)', quantity: 20, unit_price: 95, total: 1900 },
    { description: 'Buchungsmodul inkl. Schnittstelle zu Zahlungsanbieter, Tests und Übergabe', quantity: 1, unit_price: 2800, total: 2800 },
  ],
  subtotal: 4700,
  vat_rate: 0,
  vat_amount: 0,
  total: 4700,
  notes: 'Vielen Dank für Ihren Auftrag!',
  footer_text: 'Zahlbar ohne Abzug.',
  client_snapshot: { name: 'Alpenblick Hotel GmbH', address: 'Hauptplatz 5', zip_code: '6020', city: 'Innsbruck', country: 'AT', uid_number: 'ATU12345678' },
  issuer_snapshot: {
    full_name: 'Max Mustermann', business_name: 'Klaro Test GmbH', address: 'Mariahilfer Straße 1', zip_code: '1060',
    city: 'Wien', country: 'AT', iban: 'AT61 1904 3002 3457 3201', account_holder: 'Klaro Test GmbH', is_kleinunternehmer: true,
  },
} as unknown as Invoice;

describe('InvoicePDF rendern', () => {
  it.each([
    ['ausgestellt', invoice],
    ['Entwurf, USt-pflichtig, viele Positionen (mehrseitig)', {
      ...invoice,
      status: 'draft',
      vat_rate: 20,
      vat_amount: 940,
      total: 5640,
      issuer_snapshot: { ...(invoice.issuer_snapshot as object), is_kleinunternehmer: false, uid_number: 'ATU87654321' },
      line_items: Array.from({ length: 40 }, (_, i) => ({ description: `Position ${i + 1}`, quantity: 1, unit_price: 10, total: 10 })),
    } as unknown as Invoice],
  ])('%s → gültiges PDF', async (name, inv) => {
    const { element } = await createInvoicePdfElement(inv);
    const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(2000);
    // Zur Sichtprüfung: PDF_OUT=/pfad npm run test
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${name.split(',')[0]}.pdf`, buffer);
  });
});
