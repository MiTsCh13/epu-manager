// Flow 14: Steuer-Einstellungen pro Jahr – Wechsel ab nächstem Jahr, Rechnung nach Leistungsjahr, Zurücknehmen
import { completeProfile, createUser, expect, login, test } from './support';

test('Kleinunternehmer ab nächstem Jahr beenden: heuer bleibt, Rechnung im neuen Jahr mit USt', async ({ page, cleanup }) => {
  const { email, client } = await createUser('steuerjahr', cleanup);
  await completeProfile(client, { home_office: false, other_income_kind: 'none' });
  await login(page, email);
  const year = new Date().getFullYear();

  await page.goto('/einstellungen#steuer');
  const card = page.locator('#steuer');
  await card.getByText('Ich verrechne Umsatzsteuer').click();
  await card.getByText('Du erfasst jede Ausgabe einzeln.').click();

  // Ohne Auswahl „Ab wann gilt das?“ speichert Klaro nicht
  await card.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Bitte wähle, ab wann die Änderung gilt.')).toBeVisible();
  await card.getByTestId('accounting-tax-start').getByText(`Ab ${year + 1}`, { exact: true }).click();
  await card.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText(`Gespeichert – gilt ab ${year + 1}`)).toBeVisible();
  // Formular zeigt wieder die Werte von heuer und gilt als gespeichert
  await expect(card.getByRole('button', { name: 'Gespeichert' })).toBeDisabled();
  await expect(card.getByTestId('accounting-tax-start')).toBeHidden();
  await expect(card.getByRole('radio', { name: /Bis .*55\.000.* Umsatz/ })).toBeChecked();

  // Heuer bleibt Kleinunternehmer (Profil unverändert), ab nächstem Jahr eine eigene Einstellung
  const history = page.getByTestId('tax-history');
  await expect(history.getByText(`Ab ${year + 1}`)).toBeVisible();
  await expect(history.getByText(/Kleinunternehmer: nein · Gewinnermittlung: Einnahmen-Ausgaben-Rechnung/)).toBeVisible();
  const { data: profile } = await client.from('profiles').select('is_kleinunternehmer').single();
  expect(profile!.is_kleinunternehmer).toBe(true);
  const { data: rows } = await client.from('tax_years').select('year, is_kleinunternehmer, profit_method');
  expect(rows).toEqual([{ year: year + 1, is_kleinunternehmer: false, profit_method: 'euer' }]);

  // Rechnung: Leistung heuer → Kleinunternehmer-Hinweis, Leistung nächstes Jahr → USt-Auswahl mit 20 %
  await page.goto('/rechnungen/neu');
  await expect(page.getByText(/Als Kleinunternehmer verrechnest du keine USt/)).toBeVisible();
  await page.getByLabel('Tag der Leistung').fill(`${year + 1}-01-15`);
  await expect(page.getByLabel('Umsatzsteuer')).toHaveValue('20');
  await page.getByLabel('Tag der Leistung').fill(`${year}-12-15`);
  await expect(page.getByText(/Als Kleinunternehmer verrechnest du keine USt/)).toBeVisible();

  // Zurücknehmen: wieder alles wie vorher
  await page.goto('/einstellungen#steuer');
  await history.getByRole('button', { name: `Änderung ab ${year + 1} zurücknehmen` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Zurücknehmen' }).click();
  await expect(page.getByText(`Änderung ab ${year + 1} zurückgenommen`)).toBeVisible();
  await expect(history).toBeHidden();
  const { data: after } = await client.from('tax_years').select('year');
  expect(after).toEqual([]);
});
