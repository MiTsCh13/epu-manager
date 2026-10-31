// Flow 18: Kunde im Rechnungs-Editor anlegen, während die Kundenliste noch lädt (langsames Netz) –
// die verspätete Liste darf den neuen Kunden nicht wieder verdrängen („Vollständige Anschrift des Kunden fehlt“)
import { completeProfile, createUser, expect, login, test } from './support';

test('Neuer Kunde bleibt ausgewählt, auch wenn die Kundenliste verspätet ankommt', async ({ page, cleanup }) => {
  const { email, client } = await createUser('kunde-langsam', cleanup);
  await completeProfile(client);
  await login(page, email);

  // Kundenlisten, die vor dem Anlegen abgefragt werden, kommen erst danach an – mit dem alten Stand (ohne neuen Kunden)
  let release!: () => void;
  const created = new Promise<void>((resolve) => (release = resolve));
  let held = false;
  let done = false;
  let fulfilled = false;
  const refetches = new Set<unknown>();
  // Nur die Liste aus useClients (mit Rechnungsanzahl) – nicht das Anlegen (POST) und keine anderen Abfragen
  const isClientList = (url: URL) => url.pathname.endsWith('/rest/v1/clients') && decodeURIComponent(url.search).includes('invoices(count)');
  await page.route(isClientList, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    if (done) {
      refetches.add(route.request());
      return route.continue();
    }
    held = true;
    const response = await route.fetch();
    await created;
    await route.fulfill({ response });
    fulfilled = true;
  });

  await page.goto('/rechnungen/neu');
  await page.getByRole('button', { name: 'Neuer Kunde' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name bzw. Firma').fill('Bäckerei Korn');
  await dialog.getByLabel('Straße und Hausnummer').fill('Hauptplatz 2');
  await dialog.getByLabel(/^PLZ/).fill('4020');
  await dialog.getByLabel(/^Ort/).fill('Linz');
  await dialog.getByRole('button', { name: 'Kunde anlegen' }).click();
  await expect(dialog).toBeHidden();
  done = true;
  // Die Korrektur lädt danach neu – erst diese Antwort zeigt, dass der Kunde bleibt
  // (die zurückgehaltenen Antworten zählen nicht – nur eine nach dem Anlegen neu gestellte Abfrage)
  const reloaded = page.waitForResponse((res) => refetches.has(res.request()));
  release();

  await page.getByPlaceholder('z. B. Website-Gestaltung').fill('Beratung');
  await page.getByPlaceholder('0,00').fill('100');
  // Nach der verspäteten Liste: Kunde noch gewählt, keine fehlende Anschrift
  await expect.poll(() => held && fulfilled).toBe(true);
  await reloaded;
  await expect(page.getByRole('combobox', { name: 'Kunde', exact: true })).toHaveValue(/.+/);
  await expect(page.getByRole('combobox', { name: 'Kunde', exact: true }).locator('option:checked')).toHaveText('Bäckerei Korn');
  await page.getByRole('button', { name: 'Ausstellen' }).click();
  await expect(page.getByText('Vollständige Anschrift des Kunden fehlt.')).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: /ausstellen/i })).toBeVisible();
});
