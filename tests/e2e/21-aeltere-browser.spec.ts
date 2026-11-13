// Flow 21: Ältere Browser (z. B. Safari vor 26): PDFs lesen und anzeigen ohne brandneue JavaScript-Funktionen.
// Der Test entfernt sie im Browser, so wie sie in älteren Versionen fehlen.
import { completeProfile, createUser, expect, login, test } from './support';

const removeNewApis = () => {
  const drop = (obj: object, key: string) => {
    try {
      delete (obj as Record<string, unknown>)[key];
    } catch {
      /* nicht löschbar – egal */
    }
  };
  drop(Map.prototype, 'getOrInsertComputed');
  drop(Map.prototype, 'getOrInsert');
  drop(WeakMap.prototype, 'getOrInsertComputed');
  drop(WeakMap.prototype, 'getOrInsert');
  drop(Math, 'sumPrecise');
  drop(Promise, 'try');
  drop(URL, 'parse');
  drop(Uint8Array, 'fromBase64');
  drop(Uint8Array, 'fromHex');
  drop(Uint8Array.prototype, 'toBase64');
  drop(Uint8Array.prototype, 'toHex');
};

test('Rechnungs-Vorschau und Vorlage aus Rechnung ohne neue Browser-Funktionen', async ({ page, cleanup }) => {
  const { email, client } = await createUser('aeltere-browser', cleanup);
  await completeProfile(client);
  const { data: kunde } = await client.from('clients').insert({ name: 'Tischlerei Holz', address: 'Ring 3', zip_code: '8010', city: 'Graz' }).select('id').single();
  const iso = new Date().toISOString().slice(0, 10);
  const { data: inv } = await client
    .from('invoices')
    .insert({ client_id: kunde!.id, invoice_number: 'A-001', invoice_date: iso, service_date_from: iso, due_date: iso, status: 'sent', line_items: [{ description: 'Beratung', quantity: 1, unit_price: 100, total: 100 }] })
    .select('id')
    .single();
  await page.addInitScript(removeNewApis);
  let designRequests = 0;
  await page.route('**/functions/v1/read-invoice-design', async (route) => {
    designRequests++;
    await route.fulfill({ status: 503, json: { error: 'Test' } });
  });
  await login(page, email);

  // PDF-Vorschau einer Rechnung
  await page.goto(`/rechnungen/${inv!.id}`);
  expect(await page.evaluate(() => typeof (Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed)).toBe('undefined');
  await page.getByRole('button', { name: 'Vorschau' }).click();
  await expect(page.getByLabel('Seite 1 von 1')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');

  // Vorlage aus Rechnung: Das PDF wird gelesen und geht an den Assistenten (Antwort hier ein Fehler – egal)
  await page.goto('/einstellungen#vorlagen');
  await page.getByRole('button', { name: 'Neue Vorlage' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Aus meiner Rechnung übernehmen/ }).click();
  await dialog.getByTestId('import-input').setInputFiles('tests/e2e/fixtures/rechnung-vorlage.pdf');
  await expect.poll(() => designRequests, { timeout: 30_000 }).toBe(1);
});
