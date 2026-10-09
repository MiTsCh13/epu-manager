// Flow 8: Rechnungs-Vorlagen – Design wählen, Logo hochladen, Texte anpassen, Vorlage pro Kunde, Rechnung übernimmt sie
import { completeProfile, createUser, expect, login, test } from './support';

// 1×1-PNG als Logo
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('Vorlage anlegen, beim Kunden hinterlegen, Rechnung übernimmt Texte und Gestaltung', async ({ page, cleanup }) => {
  const { email, client } = await createUser('vorlagen', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null });
  await login(page, email);

  // Jede Person hat eine Standard-Vorlage
  await page.goto('/einstellungen#vorlagen');
  const list = page.getByTestId('template-list');
  await expect(list).toContainText('Standard');

  // Neue Vorlage: Design „Elegant“ mit Logo
  await page.getByRole('button', { name: 'Neue Vorlage' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Mit einem Design starten/ }).click();
  await dialog.getByRole('button', { name: /^Elegant/ }).click();
  await dialog.getByLabel('Name der Vorlage').fill('Hochzeiten');
  await dialog.getByTestId('logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO });
  await expect(dialog.getByRole('button', { name: 'Logo ändern' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Vorlage anlegen' }).click();

  // Editor: Vorschau mit anklickbaren Bereichen, Text unten ändern, speichern
  await expect(page).toHaveURL(/\/vorlagen\//);
  await expect(page.getByTestId('template-preview').getByRole('button', { name: 'Text unten bearbeiten' })).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('template-preview').getByRole('button', { name: 'Text unten bearbeiten' }).click();
  const closing = page.getByLabel('Text unter den Positionen');
  await expect(closing).toBeVisible();
  await closing.fill('Danke für euer Vertrauen! Bitte zahlt binnen ');
  await page.getByRole('button', { name: '+ Zahlungsziel' }).click();
  await expect(closing).toHaveValue('Danke für euer Vertrauen! Bitte zahlt binnen {Zahlungsziel}');
  await page.getByTestId('panel-zahlung').getByRole('button').first().click();
  await page.getByLabel('Zahlungsziel in Tagen').fill('7');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('button', { name: 'Gespeichert' })).toBeVisible();

  const { data: templates } = await client.from('invoice_templates').select('id, name, is_default, settings').order('created_at');
  const wedding = templates!.find((t) => t.name === 'Hochzeiten')!;
  expect(wedding.is_default).toBe(false);
  expect(wedding.settings).toMatchObject({ font: 'lora', payment: { days: 7 }, closing: { text: 'Danke für euer Vertrauen! Bitte zahlt binnen {Zahlungsziel}' } });
  expect((wedding.settings as { header: { logoPath: string } }).header.logoPath).toMatch(/\/logo-.+\.png$/);

  // Kunde mit Vorlage „Hochzeiten“
  const { data: couple } = await client.from('clients').insert({ name: 'Anna & Ben Huber', address: 'Hauptplatz 1', zip_code: '4020', city: 'Linz', template_id: wedding.id }).select().single();

  // Neue Rechnung: Kunde wählen → Vorlage, Text unten und Zahlungsziel kommen von der Vorlage
  await page.goto('/rechnungen/neu');
  await page.getByLabel('Kunde').selectOption(couple!.id);
  await expect(page.getByLabel('Vorlage')).toHaveValue(wedding.id);
  await expect(page.getByLabel('Text unten')).toHaveValue('Danke für euer Vertrauen! Bitte zahlt binnen {Zahlungsziel}');
  await page.getByPlaceholder('z. B. Website-Gestaltung').fill('DJ-Set Hochzeit\n- Tonanlage\n- Lichtanlage');
  await page.getByPlaceholder('Std.').fill('Std.');
  await page.getByLabel(/^Menge/).fill('4');
  await page.getByPlaceholder('0,00').fill('150');
  await expect(page.getByTestId('invoice-total')).toHaveText(/600,00/);
  await page.getByRole('button', { name: 'Entwurf speichern' }).click();
  await expect(page).toHaveURL(/\/rechnungen\/[0-9a-f-]{36}$/, { timeout: 20_000 });

  const { data: invoice } = await client.from('invoices').select('template_id, template_snapshot, notes, due_date, invoice_date, line_items').single();
  expect(invoice!.template_id).toBe(wedding.id);
  expect(invoice!.template_snapshot).toMatchObject({ font: 'lora', color: (wedding.settings as { color: string }).color });
  expect(invoice!.notes).toBe('Danke für euer Vertrauen! Bitte zahlt binnen {Zahlungsziel}');
  expect((Date.parse(invoice!.due_date!) - Date.parse(invoice!.invoice_date)) / 86_400_000).toBe(7);
  expect(invoice!.line_items).toEqual([{ description: 'DJ-Set Hochzeit\n- Tonanlage\n- Lichtanlage', quantity: 4, unit_price: 150, total: 600, unit: 'Std.' }]);

  // Entwurf folgt Änderungen an der Vorlage
  await client.from('invoice_templates').update({ settings: { ...(wedding.settings as object), color: '#b4235a' } }).eq('id', wedding.id);
  const { data: refreshed } = await client.from('invoices').select('template_snapshot').single();
  expect(refreshed!.template_snapshot).toMatchObject({ color: '#b4235a' });
});
