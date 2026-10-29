import { describe, expect, it } from 'vitest';
import { buildInvoiceEmail, composeUrl, isPlausibleEmail } from '@/lib/invoiceEmail';

const base = {
  invoice_number: '2026-007',
  is_honorarnote: false,
  total: 1200,
  due_date: '2026-11-14',
  status: 'sent' as const,
  payment_method: 'transfer',
  client_snapshot: { name: 'Tischlerei Holz', email: ' office@holz.at ' },
  issuer_snapshot: { full_name: 'Anna Berger', business_name: 'Berger Design' },
};

describe('buildInvoiceEmail', () => {
  it('Überweisung: Empfänger, Betreff, Betrag und Fälligkeit', () => {
    const m = buildInvoiceEmail(base, new Date(2026, 9, 29));
    expect(m.to).toBe('office@holz.at');
    expect(m.subject).toBe('Rechnung 2026-007 – Berger Design');
    expect(m.body).toMatch(/^Guten Tag Tischlerei Holz,\n\nanbei erhalten Sie meine Rechnung 2026-007 über € 1\.200,00\./);
    expect(m.body).toContain('bis 14.11.2026');
    expect(m.body.endsWith('Freundliche Grüße\nAnna Berger\nBerger Design')).toBe(true);
    expect(m.body).not.toMatch(/[\u00a0\u202f]/);
  });

  it('überfällig: kein Datum in der Vergangenheit, sondern „umgehend“', () => {
    const body = buildInvoiceEmail(base, new Date(2026, 10, 20)).body;
    expect(body).toContain('umgehend');
    expect(body).not.toContain('14.11.2026');
    // am Fälligkeitstag selbst noch mit Datum
    expect(buildInvoiceEmail(base, new Date(2026, 10, 14)).body).toContain('bis 14.11.2026');
  });

  it('bar bezahlt bzw. bezahlt: kein Zahlungsaufruf', () => {
    expect(buildInvoiceEmail({ ...base, payment_method: 'cash' }).body).toContain('bereits bezahlt');
    expect(buildInvoiceEmail({ ...base, status: 'paid' }).body).not.toContain('überweisen');
  });

  it('Honorarnote, ohne Kunden-E-Mail, ohne Firmenname', () => {
    const m = buildInvoiceEmail({
      ...base,
      is_honorarnote: true,
      due_date: null,
      client_snapshot: { name: 'Max Muster' },
      issuer_snapshot: { full_name: 'Anna Berger', business_name: null },
    });
    expect(m.to).toBe('');
    expect(m.subject).toBe('Honorarnote 2026-007 – Anna Berger');
    expect(m.body).toContain('auf das in der Honorarnote angegebene Konto.');
    expect(m.body.endsWith('Freundliche Grüße\nAnna Berger')).toBe(true);
  });
});

describe('composeUrl', () => {
  const mail = { to: 'office@holz.at', subject: 'Rechnung 1 & mehr', body: 'Zeile 1\nZeile 2' };

  it('Gmail', () => {
    const url = new URL(composeUrl('gmail', mail));
    expect(url.origin).toBe('https://mail.google.com');
    expect(url.searchParams.get('to')).toBe('office@holz.at');
    expect(url.searchParams.get('su')).toBe('Rechnung 1 & mehr');
    expect(url.searchParams.get('body')).toBe('Zeile 1\nZeile 2');
  });

  it.each([
    ['outlook', 'https://outlook.live.com/mail/0/deeplink/compose'],
    ['outlook365', 'https://outlook.office.com/mail/deeplink/compose'],
  ] as const)('%s', (provider, base) => {
    const url = new URL(composeUrl(provider, mail));
    expect(url.origin + url.pathname).toBe(base);
    expect(url.searchParams.get('to')).toBe('office@holz.at');
    expect(url.searchParams.get('subject')).toBe('Rechnung 1 & mehr');
    expect(url.searchParams.get('body')).toBe('Zeile 1\nZeile 2');
  });

  it('mailto: Zeilenumbrüche als CRLF, ohne Empfänger fehlt to', () => {
    expect(composeUrl('mailto', mail)).toBe('mailto:office@holz.at?subject=Rechnung%201%20%26%20mehr&body=Zeile%201%0D%0AZeile%202');
    expect(composeUrl('gmail', { ...mail, to: '' })).not.toContain('to=');
  });
});

describe('isPlausibleEmail', () => {
  it.each([
    ['office@holz.at', true],
    [' a@b.co ', true],
    ['office@holz', false],
    ['office holz@x.at', false],
    ['', false],
  ])('%s → %s', (v, ok) => expect(isPlausibleEmail(v)).toBe(ok));
});
