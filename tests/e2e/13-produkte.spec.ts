// Flow 13: Leistungen & Produkte – aus bisherigen Rechnungen übernehmen, anlegen, in der Rechnung auswählen und speichern
import { completeProfile, createUser, expect, login, seedPaidInvoices, test } from './support';

test('Produkte anlegen und beim Rechnungschreiben auswählen', async ({ page, cleanup }) => {
  const { email, client } = await createUser('produkte', cleanup);
  await completeProfile(client);
  // „Beratung“ steht auf zwei Rechnungen → wird als Produkt vorgeschlagen
  await seedPaidInvoices(client, [90, 90]);
  await login(page, email);

  await page.goto('/produkte');
  await expect(page.getByRole('heading', { name: 'Leistungen & Produkte' })).toBeVisible();
  const suggestions = page.getByRole('region', { name: 'Aus deinen bisherigen Rechnungen' });
  await expect(suggestions.getByText('Beratung')).toBeVisible();
  await suggestions.getByRole('button', { name: '1 übernehmen' }).click();
  await expect(suggestions).toBeHidden();
  await expect(page.getByRole('button', { name: 'Beratung bearbeiten' }).first()).toBeVisible();

  // Neues Produkt mit mehreren Zeilen
  await page.getByRole('button', { name: 'Neu anlegen' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Bezeichnung').fill('Website-Wartung');
  await form.getByLabel(/Weitere Zeilen/).fill('- Updates\n- Backups');
  await form.getByLabel(/^Einheit/).fill('Monat');
  await form.getByLabel(/Preis pro Einheit/).fill('49,90');
  await form.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('€ 49,90 / Monat')).toBeVisible();

  // Doppelte Bezeichnung wird abgefangen
  await page.getByRole('button', { name: 'Neu anlegen' }).click();
  await form.getByLabel('Bezeichnung').fill('beratung');
  await form.getByLabel(/Preis pro Einheit/).fill('1');
  await form.getByRole('button', { name: 'Speichern' }).click();
  await expect(form.getByText('Diese Bezeichnung gibt es schon.')).toBeVisible();
  await form.getByRole('button', { name: 'Abbrechen' }).click();

  // Rechnung: beim Tippen vorschlagen, Klick übernimmt Text, Einheit und Preis
  const { data: kunde } = await client.from('clients').select('id').limit(1).single();
  await page.goto('/rechnungen/neu');
  await page.getByLabel('Kunde').selectOption(kunde!.id);
  const description = page.getByRole('combobox', { name: /Bezeichnung/ });
  await description.first().fill('wart');
  await page.getByRole('option', { name: /Website-Wartung/ }).click();
  await expect(description.first()).toHaveValue('Website-Wartung\n- Updates\n- Backups');
  await expect(page.getByLabel(/^Einheit/).first()).toHaveValue('Monat');
  await expect(page.getByLabel(/Einzelpreis/).first()).toHaveValue('49,9');

  // Aus Liste wählen → neue Zeile
  await page.getByRole('button', { name: 'Aus Liste wählen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Beratung/ }).click();
  await expect(description.nth(1)).toHaveValue('Beratung');
  await expect(page.getByLabel(/Einzelpreis/).nth(1)).toHaveValue('90');

  // Eigene Position als Produkt speichern
  await page.getByRole('button', { name: 'Position hinzufügen' }).click();
  await description.nth(2).fill('Workshop');
  await page.keyboard.press('Escape');
  await page.getByLabel(/Einzelpreis/).nth(2).fill('300');
  await page.getByRole('button', { name: 'Position 3 als Produkt speichern' }).click();
  await expect(page.getByRole('dialog').getByLabel('Bezeichnung')).toHaveValue('Workshop');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Workshop gespeichert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Position 3 als Produkt speichern' })).toBeHidden();

  await page.getByRole('button', { name: 'Entwurf speichern' }).click();
  await expect(page).toHaveURL(/\/rechnungen\/[0-9a-f-]{36}$/);

  // Verwendete Produkte sind als „zuletzt verwendet“ markiert
  await expect
    .poll(async () => {
      const { data } = await client.from('products').select('name, last_used_at').order('name');
      return data?.map((p) => [p.name, !!p.last_used_at]);
    })
    .toEqual([
      ['Beratung', true],
      ['Website-Wartung', true],
      ['Workshop', true],
    ]);

  // Löschen ändert die Rechnung nicht
  await page.goto('/produkte');
  await page.getByRole('button', { name: 'Workshop löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('button', { name: 'Workshop bearbeiten' })).toHaveCount(0);
  const { data: draft } = await client.from('invoices').select('line_items').eq('status', 'draft').single();
  expect((draft!.line_items as { description: string }[]).map((i) => i.description)).toEqual([
    'Website-Wartung\n- Updates\n- Backups',
    'Beratung',
    'Workshop',
  ]);
});
