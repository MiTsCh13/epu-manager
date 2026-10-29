// Flow 15: Ausgestellte Rechnung per E-Mail senden (ohne Postfach-Anbindung: PDF herunterladen + Mail öffnen)
import { completeProfile, createUser, expect, login, test } from './support';

test('Rechnung per E-Mail: Vorschlag, Gmail öffnen, als verschickt merken', async ({ page, cleanup }) => {
  const { email, client } = await createUser('rechnung-mail', cleanup);
  await completeProfile(client);
  const { data: kunde } = await client
    .from('clients')
    .insert({ name: 'Tischlerei Holz', email: 'office@holz.example', address: 'Ring 3', zip_code: '8010', city: 'Graz' })
    .select('id')
    .single();
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { data: invoice, error } = await client
    .from('invoices')
    .insert({
      client_id: kunde!.id,
      invoice_number: `${today.getFullYear()}-MAIL-1`,
      invoice_date: iso,
      service_date_from: iso,
      due_date: iso,
      status: 'sent',
      line_items: [{ description: 'Beratung', quantity: 1, unit_price: 480, total: 480 }],
    })
    .select('id')
    .single();
  expect(error).toBeNull();

  await login(page, email);
  await page.goto(`/rechnungen/${invoice!.id}`);
  await page.getByRole('button', { name: 'Per E-Mail senden' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('An')).toHaveValue('office@holz.example');
  await expect(dialog.getByLabel('Betreff')).toHaveValue(new RegExp(`^Rechnung ${today.getFullYear()}-MAIL-1`));
  await expect(dialog.getByLabel('Text')).toHaveValue(/^Guten Tag Tischlerei Holz,/);

  // Tippen im Text bleibt im Feld (Fokus springt nicht zurück)
  await dialog.getByLabel('Text').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' PS');
  await expect(dialog.getByLabel('Text')).toBeFocused();
  await expect(dialog.getByLabel('Text')).toHaveValue(/ PS/);

  // Ungültige Adresse sperrt die Knöpfe
  await dialog.getByLabel('An').fill('office@holz');
  await expect(dialog.getByLabel('An')).toHaveValue('office@holz');
  await expect(dialog.getByText('Bitte prüfe die E-Mail-Adresse.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Gmail' })).toBeDisabled();
  await dialog.getByLabel('An').fill('buchhaltung@holz.example');

  // Gmail: PDF wird heruntergeladen, neue Mail öffnet sich mit Empfänger und Betreff
  await page.evaluate(() => {
    window.open = ((url: string) => {
      (window as unknown as { __opened: string }).__opened = url;
      return null;
    }) as typeof window.open;
  });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Gmail' }).click({ timeout: 20_000 });
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  const opened = new URL(await page.evaluate(() => (window as unknown as { __opened: string }).__opened));
  expect(opened.hostname).toBe('mail.google.com');
  expect(opened.searchParams.get('to')).toBe('buchhaltung@holz.example');

  await dialog.getByRole('button', { name: 'Erledigt – als verschickt merken' }).click();
  await expect(page.getByText(/Per E-Mail verschickt am/)).toBeVisible();
  const { data: saved } = await client.from('invoices').select('emailed_at, status').eq('id', invoice!.id).single();
  expect(saved!.emailed_at).not.toBeNull();
  expect(saved!.status).toBe('sent');
});
