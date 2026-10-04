// Hilfen für die E2E-Tests: eigene Testnutzer pro Test, Daten per API, Aufräumen über „delete-account“.
import { test as base, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
export const PASSWORD = 'KlaroE2E-2026!';

type Client = SupabaseClient<Database>;

function newClient(): Client {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen in .env.local');
  return createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function uniqueEmail(tag: string): string {
  return `klaro-e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Testnutzer per API registrieren (E-Mail-Bestätigung ist im Projekt deaktiviert). */
export async function createUser(tag: string, cleanup: (email: string) => void): Promise<{ email: string; client: Client }> {
  const client = newClient();
  const email = uniqueEmail(tag);
  cleanup(email);
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD, options: { data: { full_name: 'E2E Test' } } });
  if (error || !data.session) {
    throw new Error(`Testnutzer konnte nicht angelegt werden: ${error?.message ?? 'keine Session – ist die E-Mail-Bestätigung aktiv?'}`);
  }
  return { email, client };
}

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/** Onboarding per API überspringen (Kleinunternehmer, Neue Selbständige seit Vorjahr). */
export async function completeProfile(client: Client, overrides: ProfileUpdate = {}) {
  const { data: auth } = await client.auth.getUser();
  const { error } = await client
    .from('profiles')
    .update({
      full_name: 'E2E Test',
      business_type: 'neue_selbstaendige',
      svs_registration_date: `${new Date().getFullYear() - 1}-03-01`,
      is_kleinunternehmer: true,
      profit_method: 'pauschal',
      pausch_type: 'ku',
      industry_code: 'service',
      address: 'Teststraße 1',
      zip_code: '1010',
      city: 'Wien',
      iban: 'AT61 1904 3002 3457 3201',
      account_holder: 'E2E Test',
      onboarding_completed: true,
      ...overrides,
    })
    .eq('id', auth.user!.id);
  if (error) throw new Error(`Profil konnte nicht gespeichert werden: ${error.message}`);
}

let invoiceCounter = 0;

/** Bezahlte Rechnungen (heute) anlegen – zählen als Einnahmen des laufenden Jahres. */
export async function seedPaidInvoices(client: Client, amounts: number[]) {
  const { data: customer, error: clientError } = await client
    .from('clients')
    .insert({ name: 'E2E Kunde GmbH', address: 'Kundengasse 2', zip_code: '1020', city: 'Wien' })
    .select('id')
    .single();
  if (clientError) throw new Error(`Kunde konnte nicht angelegt werden: ${clientError.message}`);

  const today = new Date();
  const year = today.getFullYear();
  const isoDate = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { error } = await client.from('invoices').insert(
    amounts.map((amount) => ({
      client_id: customer.id,
      invoice_number: `${year}-${String(++invoiceCounter).padStart(3, '0')}-E2E`,
      invoice_date: isoDate,
      service_date_from: isoDate,
      status: 'paid',
      paid_at: today.toISOString(),
      line_items: [{ description: 'Beratung', quantity: 1, unit_price: amount, total: amount }],
    })),
  );
  if (error) throw new Error(`Rechnungen konnten nicht angelegt werden: ${error.message}`);
}

/** Testnutzer samt aller Daten löschen (gleicher Weg wie „Konto löschen“ in der App). */
async function deleteUser(email: string) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) return; // wurde nie angelegt
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'LÖSCHEN' }),
  });
  if (!res.ok) throw new Error(`Testnutzer ${email} konnte nicht gelöscht werden (HTTP ${res.status})`);
}

/** `cleanup(email)` merkt Testnutzer vor; nach dem Test werden sie gelöscht – auch wenn der Test fehlschlägt. */
export const test = base.extend<{ cleanup: (email: string) => void }>({
  // eslint-disable-next-line no-empty-pattern
  cleanup: async ({}, use) => {
    const emails: string[] = [];
    await use((email) => emails.push(email));
    for (const email of emails) await deleteUser(email);
  },
});

export { expect };

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** „€ 8.900,00“ → 8900 */
export function parseEuro(text: string): number {
  return Number(text.replace(/[^\d,-]/g, '').replace(',', '.'));
}
