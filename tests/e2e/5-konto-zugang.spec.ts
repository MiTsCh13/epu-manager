// Flow 5: Zugang zum Konto – Passwort vergessen, abgelaufene Links, Anmeldung ohne bestätigte E-Mail.
// Mails werden nicht verschickt: Anfragen an Supabase, die eine Mail auslösen würden, werden nachgestellt,
// die Links erzeugt die Admin-API.
import { createClient } from '@supabase/supabase-js';
import { completeProfile, createUser, emailLink, expect, PASSWORD, test } from './support';

const NEW_PASSWORD = 'KlaroNeu-2026!';

test('Passwort vergessen: Link anfordern, neues Passwort festlegen, damit anmelden', async ({ page, cleanup }) => {
  const { email, client } = await createUser('passwort', cleanup);
  await completeProfile(client);

  let recoverRequested = false;
  await page.route('**/auth/v1/recover**', async (route) => {
    recoverRequested = true;
    await route.fulfill({ json: {} });
  });

  await page.goto('/login');
  await page.getByRole('link', { name: 'Passwort vergessen?' }).click();
  // Seite wird nachgeladen – bis dahin steht noch das Login-Formular (mit eigenem E-Mail-Feld) da
  await expect(page.getByRole('heading', { name: 'Passwort vergessen?' })).toBeVisible();
  await page.getByLabel('E-Mail').fill(email);
  await page.getByRole('button', { name: 'Link schicken' }).click();
  await expect(page.getByRole('heading', { name: 'Schau in dein Postfach' })).toBeVisible();
  expect(recoverRequested).toBe(true);

  // Klick auf den Link aus der Mail
  await page.goto(await emailLink('recovery', email));
  await expect(page.getByRole('heading', { name: 'Neues Passwort festlegen' })).toBeVisible();
  await page.getByLabel('Neues Passwort', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Neues Passwort wiederholen').fill('etwas anderes');
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await expect(page.getByText('Die beiden Passwörter stimmen nicht überein.')).toBeVisible();
  await page.getByLabel('Neues Passwort wiederholen').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await expect(page.getByText('Dein neues Passwort ist gespeichert.')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // Ohne frischen Link führt /passwort-neu zu „Passwort ändern“ (mit aktuellem Passwort) in den Einstellungen
  await page.goto('/passwort-neu');
  await expect(page).toHaveURL(/\/einstellungen/);

  // Das neue Passwort gilt
  const fresh = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await fresh.auth.signInWithPassword({ email, password: NEW_PASSWORD });
  expect(error).toBeNull();
});

test('abgelaufener oder schon benutzter Link: verständliche Meldung statt Fehlerseite', async ({ page }) => {
  await page.goto('/auth/bestaetigen?token_hash=gibt-es-nicht&type=email');
  await expect(page.getByRole('heading', { name: 'Das hat leider nicht geklappt' })).toBeVisible();
  await expect(page.getByText('Dieser Link ist abgelaufen oder wurde schon verwendet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zur Anmeldung' })).toBeVisible();

  await page.goto('/auth/bestaetigen?token_hash=gibt-es-nicht&type=recovery');
  await expect(page.getByRole('link', { name: 'Neuen Link anfordern' })).toBeVisible();
});

test('Anmeldung ohne bestätigte E-Mail: Hinweis und neuer Bestätigungslink', async ({ page, cleanup }) => {
  const { email } = await createUser('unbestaetigt', cleanup, { confirmed: false });

  let resendBody: { type?: string; email?: string } | null = null;
  await page.route('**/auth/v1/resend**', async (route) => {
    resendBody = route.request().postDataJSON();
    await route.fulfill({ json: {} });
  });

  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByText('Bitte bestätige zuerst deine E-Mail-Adresse')).toBeVisible();
  await page.getByRole('button', { name: 'Bestätigungsmail erneut senden' }).click();
  await expect(page.getByText('Wir haben dir die E-Mail noch einmal geschickt.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Erneut senden \(in \d+ s\)/ })).toBeDisabled();
  expect(resendBody).toMatchObject({ type: 'signup', email });
});
