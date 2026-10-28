// Flow 1: Registrierung → Bestätigungslink → Onboarding → erste Rechnung erstellen → PDF herunterladen
import { readFile } from 'node:fs/promises';
import { emailLink, expect, PASSWORD, test, uniqueEmail } from './support';

test('neue:r Nutzer:in stellt die erste Rechnung aus und lädt das PDF herunter', async ({ page, cleanup }) => {
  const email = uniqueEmail('rechnung');
  cleanup(email);

  // Registrierung – die Antwort von Supabase wird nachgestellt, damit keine Mail an @example.com rausgeht
  // (unzustellbare Mails schaden dem Ruf des SMTP-Absenders). Der echte Nutzer entsteht unten mit dem Link.
  let signupRequest: { url: string; body: { email?: string; data?: { full_name?: string } } } | null = null;
  await page.route('**/auth/v1/signup**', async (route) => {
    signupRequest = { url: route.request().url(), body: route.request().postDataJSON() };
    const now = new Date().toISOString();
    await route.fulfill({
      json: {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: '',
        email,
        confirmation_sent_at: now,
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { full_name: 'Erika Musterfrau' },
        identities: [{ identity_id: 'e2e', id: 'e2e', user_id: 'e2e', provider: 'email', identity_data: { email } }],
        created_at: now,
        updated_at: now,
      },
    });
  });
  await page.goto('/registrieren');
  await page.getByLabel('Dein Name').fill('Erika Musterfrau');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Kostenlos starten' }).click();
  await expect(page.getByRole('heading', { name: /schau in dein Postfach/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bestätigungsmail erneut senden' })).toBeVisible();
  expect(signupRequest!.body).toMatchObject({ email, data: { full_name: 'Erika Musterfrau' } });
  expect(decodeURIComponent(signupRequest!.url)).toContain('redirect_to=http://localhost:5173/auth/bestaetigen');

  // Klick auf den Link aus der Bestätigungsmail → Setup-Seite
  await page.goto(await emailLink('signup', email, { fullName: 'Erika Musterfrau' }));
  await expect(page).toHaveURL(/\/onboarding/);

  // Schritt 1 – Wer bist du?
  await expect(page.getByRole('heading', { name: 'Wer bist du?' })).toBeVisible();
  await page.getByText('Du bist ohne Gewerbe selbständig').click();
  await page.getByLabel(/Seit wann bist du/).fill(`${new Date().getFullYear() - 1}-03-01`);
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Schritt 2 – Wie rechnest du ab?
  await expect(page.getByRole('heading', { name: 'Wie rechnest du ab?' })).toBeVisible();
  await page.getByText(/Bis .*55\.000.* Umsatz, keine USt/).click();
  await page.getByText('Du erfasst jede Ausgabe einzeln.').click();
  await page.getByText('Ich habe kein Büro, Atelier und keine Praxis außer Haus.').click();
  await page.getByText('Nur meine Selbständigkeit').click();
  await expect(page.getByText(/1\.200 pro Jahr/)).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Schritt 3 – Bankdaten & Rechnungen
  await expect(page.getByRole('heading', { name: 'Bankdaten & Rechnungen' })).toBeVisible();
  await page.getByLabel('Straße und Hausnummer').fill('Mariahilfer Straße 1');
  await page.getByLabel('PLZ', { exact: true }).fill('1060');
  await page.getByLabel('Ort', { exact: true }).fill('Wien');
  await page.getByPlaceholder('AT12 3456 7890 1234 5678').fill('AT611904300234573201');
  await page.getByRole('button', { name: 'Speichern & abschließen' }).click();

  // Schritt 4 – Willkommen
  await expect(page.getByRole('heading', { name: 'Willkommen bei Klaro!' })).toBeVisible();
  await page.getByRole('link', { name: 'Erste Rechnung erstellen' }).click();
  await expect(page).toHaveURL(/\/rechnungen\/neu/);
  // Neue Selbständige stellen Honorarnoten aus – ohne Auswahl
  await expect(page.getByRole('heading', { name: 'Neue Honorarnote' })).toBeVisible();

  // Kunde anlegen
  await page.getByRole('button', { name: 'Neuer Kunde' }).click();
  const clientDialog = page.getByRole('dialog');
  await clientDialog.getByLabel('Name bzw. Firma').fill('Hochzeitsfotos Huber OG');
  await clientDialog.getByLabel('Straße und Hausnummer').fill('Landstraße 5');
  await clientDialog.getByLabel(/^PLZ/).fill('4020');
  await clientDialog.getByLabel(/^Ort/).fill('Linz');
  await clientDialog.getByRole('button', { name: 'Kunde anlegen' }).click();
  await expect(clientDialog).toBeHidden();
  await expect(page.getByLabel('Kunde')).not.toHaveValue('');

  // Position + Summe
  await page.getByPlaceholder('z. B. Website-Gestaltung').fill('Fotoshooting Hochzeit');
  await page.getByPlaceholder('0,00').fill('850');
  await expect(page.getByTestId('invoice-total')).toHaveText(/850,00/);
  await expect(page.getByText('§ 6 Abs. 1 Z 27 UStG')).toBeVisible();

  // Ausstellen (die fortlaufende Nummer wird asynchron vorgeschlagen)
  await expect(page.getByLabel('Honorarnoten-Nummer')).toHaveValue(/^\d{4}-\d{3}$/);
  await page.getByRole('button', { name: 'Ausstellen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Jetzt ausstellen' }).click();

  // PDF herunterladen
  const downloadButton = page.getByRole('button', { name: 'PDF herunterladen' });
  await expect(downloadButton).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(5_000);
});
