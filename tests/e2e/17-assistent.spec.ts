// Flow 17: Assistent – Befehl tippen → Vorschlag → vorausgefülltes Formular (Antwort der Edge Function nachgestellt)
import type { Page } from '@playwright/test';
import { completeProfile, createUser, expect, login, test } from './support';

async function mockAssistant(page: Page, result: unknown) {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/assistant', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { result } });
  });
  return requests;
}

test('Fahrt per Assistent: Hin und zurück wählen, Ausgaben-Formular mit Kilometergeld', async ({ page, cleanup }) => {
  const { email, client } = await createUser('assistent-fahrt', cleanup);
  await completeProfile(client);
  const requests = await mockAssistant(page, {
    action: 'trip',
    trip: {
      from: 'Linz', from_city: 'Linz', to: 'Wien', to_city: 'Wien', to_client_id: null, date: null, purpose: 'Kundentermin',
      km: 178, round_trip: 'unknown', vehicle: null, from_label: 'Linz, OO, Austria', to_label: 'Vienna, Austria', km_source: 'route',
    },
    invoice: null,
    message: 'Ich habe eine Fahrt von Linz nach Wien vorbereitet.',
  });
  await login(page, email);
  await page.goto('/');

  await page.getByRole('button', { name: /Assistent/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Was soll Klaro tun?' });
  await dialog.getByLabel('Dein Befehl').fill('Fahrt von Linz nach Wien');
  await dialog.getByRole('button', { name: 'Senden' }).click();
  await expect(dialog.getByText('Ich habe eine Fahrt von Linz nach Wien vorbereitet.')).toBeVisible();
  expect(requests[0]).toMatchObject({ text: 'Fahrt von Linz nach Wien' });
  await expect(dialog.getByText('178 km pro Richtung (Routenplaner)')).toBeVisible();

  // Klaro fragt jedes Mal nach: ohne Antwort geht es nicht weiter
  const next = dialog.getByRole('button', { name: 'Im Formular prüfen' });
  await expect(next).toBeDisabled();
  await dialog.getByText('Hin und zurück', { exact: true }).click();
  await expect(dialog.getByRole('radio', { name: /Hin und zurück/ })).toBeChecked();
  await next.click();

  await expect(page).toHaveURL(/\/ausgaben/);
  const form = page.getByRole('dialog').filter({ hasText: 'Vom Assistenten vorausgefüllt' });
  await expect(form).toBeVisible();
  await expect(form.getByRole('textbox', { name: /Gefahrene Kilometer/ })).toHaveValue('356');
  await expect(form.getByLabel('Beschreibung')).toHaveValue('Kundentermin: Linz – Wien – Linz');
});

test('Rechnung per Assistent: Kunde und Produkt im Editor vorausgefüllt', async ({ page, cleanup }) => {
  const { email, client } = await createUser('assistent-rechnung', cleanup);
  await completeProfile(client);
  const { data: kunde } = await client.from('clients').insert({ name: 'Café Sonne', address: 'Ring 3', zip_code: '8010', city: 'Graz' }).select('id').single();
  const { data: produkt } = await client.from('products').insert({ name: 'Beratung', unit: 'Std.', unit_price: 90 }).select('id').single();
  const requests = await mockAssistant(page, {
    action: 'invoice',
    trip: null,
    invoice: {
      client_id: kunde!.id,
      client_name: 'Café Sonne',
      service_date: null,
      items: [
        { product_id: produkt!.id, description: 'Beratung', quantity: 3, unit: 'Std.', unit_price: null },
        { product_id: null, description: 'Fotos', quantity: 1, unit: '', unit_price: 300 },
      ],
    },
    message: 'Ich habe eine Rechnung für Café Sonne vorbereitet.',
  });
  await login(page, email);
  await page.goto('/rechnungen');

  await page.getByRole('button', { name: /Assistent/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Was soll Klaro tun?' });
  await dialog.getByLabel('Dein Befehl').fill('Rechnung für Kaffee Sonne mit drei Stunden Beratung und Fotos um 300 Euro');
  await dialog.getByLabel('Dein Befehl').press('Enter');
  await expect(dialog.getByText('Café Sonne', { exact: true })).toBeVisible();
  // Kunden und Produkte gehen mit der Anfrage mit (nur IDs, Namen, Einheit, Preis)
  expect((requests[0]!.clients as { name: string }[]).map((c) => c.name)).toEqual(['Café Sonne']);
  expect(requests[0]!.products).toEqual([{ id: produkt!.id, name: 'Beratung', unit: 'Std.', unit_price: 90 }]);

  await dialog.getByRole('button', { name: 'Rechnung öffnen' }).click();
  await expect(page).toHaveURL(/\/rechnungen\/neu/);
  await expect(page.getByRole('combobox', { name: 'Kunde', exact: true })).toHaveValue(kunde!.id);
  await expect(page.getByLabel('Bezeichnung (Position 1)')).toHaveValue('Beratung');
  await expect(page.getByLabel('Bezeichnung (Position 2)')).toHaveValue('Fotos');
  await expect(page.getByTestId('invoice-total')).toHaveText(/570,00/);
});

test('Assistent: Fehlermeldung der Function wird angezeigt', async ({ page, cleanup }) => {
  const { email, client } = await createUser('assistent-fehler', cleanup);
  await completeProfile(client);
  await page.route('**/functions/v1/assistant', (route) =>
    route.fulfill({ status: 429, json: { error: 'Du hast den Assistenten in den letzten 24 Stunden schon 30-mal verwendet.' } }),
  );
  await login(page, email);
  await page.goto('/');
  await page.getByRole('button', { name: /Assistent/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Was soll Klaro tun?' });
  await dialog.getByRole('button', { name: /Fahrt von Linz nach Wien/ }).click();
  await dialog.getByRole('button', { name: 'Senden' }).click();
  await expect(dialog.getByText('schon 30-mal verwendet')).toBeVisible();
});
