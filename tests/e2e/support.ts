// Hilfen für die E2E-Tests: eigene Testnutzer pro Test (über die Admin-API, ohne Mailversand),
// Daten per API, Aufräumen über die Admin-API (wie „delete-account“). Der Service-Role-Key bleibt in .env.local (nie VITE_).
import type { EmailOtpType, Session } from '@supabase/supabase-js';
import { test as base, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const PASSWORD = 'KlaroE2E-2026!';

type Client = SupabaseClient<Database>;

function newClient(): Client {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen in .env.local');
  return createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

function adminClient(): Client {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local');
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Sitzungen der Testnutzer: login() gibt sie an den Browser weiter, statt sich ein zweites Mal anzumelden.
// Jede Passwort-Anmeldung zählt gegen das Auth-Limit von Supabase (150 pro 5 Minuten und IP).
const sessions = new Map<string, Session>();

export function uniqueEmail(tag: string): string {
  return `klaro-e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * Testnutzer über die Admin-API anlegen – es geht keine Mail raus. Standard: E-Mail schon bestätigt und angemeldet;
 * mit `confirmed: false` wie nach einer Registrierung, deren Link noch nicht geklickt wurde.
 */
export async function createUser(
  tag: string,
  cleanup: (email: string) => void,
  { confirmed = true }: { confirmed?: boolean } = {},
): Promise<{ email: string; client: Client }> {
  const email = uniqueEmail(tag);
  cleanup(email);
  const { error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: confirmed,
    user_metadata: { full_name: 'E2E Test' },
  });
  if (error) throw new Error(`Testnutzer konnte nicht angelegt werden: ${error.message}`);
  const client = newClient();
  if (confirmed) {
    sessions.set(email, await signIn(client, email));
  }
  return { email, client };
}

/**
 * Mit Passwort anmelden. Supabase erlaubt 30 Anmeldungen auf einmal, danach eine alle 2 Sekunden (pro IP) –
 * läuft die Suite mehrmals hintereinander, wartet der Test kurz und versucht es erneut, statt fehlzuschlagen.
 */
async function signIn(client: Client, email: string): Promise<Session> {
  const info = test.info();
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (!error) return data.session;
    if (error.status !== 429 || attempt >= 8) throw new Error(`Testnutzer konnte sich nicht anmelden: ${error.message}`);
    const wait = 2_000 * 2 ** Math.min(attempt, 4) * (1 + Math.random()); // gestreut, damit nicht alle Worker gleichzeitig wiederkommen
    info.setTimeout(info.timeout + wait);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/**
 * Link wie aus der Mail-Vorlage (supabase/templates), aber ohne Mail: die Admin-API erzeugt den Token.
 * `signup` legt dabei den (unbestätigten) Nutzer an – so wie eine echte Registrierung.
 */
export async function emailLink(
  type: 'signup' | 'recovery',
  email: string,
  options: { password?: string; fullName?: string } = {},
): Promise<string> {
  const admin = adminClient().auth.admin;
  const { data, error } =
    type === 'signup'
      ? await admin.generateLink({ type, email, password: options.password ?? PASSWORD, options: { data: { full_name: options.fullName } } })
      : await admin.generateLink({ type, email });
  if (error) throw new Error(`Link konnte nicht erzeugt werden: ${error.message}`);
  const otpType: EmailOtpType = type === 'signup' ? 'email' : type;
  return `/auth/bestaetigen?token_hash=${data.properties.hashed_token}&type=${otpType}`;
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

/**
 * Testnutzer samt aller Daten löschen – dieselben Schritte wie die Edge Function „delete-account“ (ohne Stripe,
 * Testnutzer haben kein Abo), aber direkt über die Admin-API. So zählt das Aufräumen nicht gegen die
 * Anmelde-Limits von Supabase Auth (viele Testläufe hintereinander liefen sonst in „rate limit reached“).
 */
async function deleteUser(email: string) {
  const admin = adminClient();
  // generateLink liefert die Nutzer-ID ohne Anmeldung; schlägt fehl, wenn es den Nutzer nie gab
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !link.user) return;
  const id = link.user.id;
  // Belege sowie Logos/Kopfbilder der Rechnungs-Vorlagen
  for (const bucket of ['receipts', 'branding']) {
    const { data: files } = await admin.storage.from(bucket).list(id, { limit: 1000 });
    if (files && files.length > 0) await admin.storage.from(bucket).remove(files.map((f) => `${id}/${f.name}`));
  }
  const { error: dataError } = await admin.rpc('delete_user_data', { p_user: id });
  if (dataError) throw new Error(`Daten von ${email} konnten nicht gelöscht werden: ${dataError.message}`);
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw new Error(`Testnutzer ${email} konnte nicht gelöscht werden: ${error.message}`);
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

/** Im Browser anmelden: mit der Sitzung aus createUser (ohne weitere Anmeldung), sonst über das Formular. */
export async function login(page: Page, email: string) {
  const session = sessions.get(email);
  if (session) {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    await page.goto('/login');
    await page.evaluate(([key, value]) => localStorage.setItem(key!, value!), [`sb-${ref}-auth-token`, JSON.stringify(session)]);
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    return;
  }
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
