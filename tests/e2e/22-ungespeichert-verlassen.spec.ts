// Flow 22: Rechnung mit ungespeicherten Änderungen verlassen – Klaro fragt nach (speichern, verwerfen, weiter bearbeiten)
import { completeProfile, createUser, expect, login, test } from './support';

test('Neue Rechnung verlassen: Rückfrage bei Änderungen, keine ohne', async ({ page, cleanup }) => {
  const { email, client } = await createUser('ungespeichert', cleanup);
  await completeProfile(client);
  await login(page, email);
  const back = page.getByRole('link', { name: 'Alle Rechnungen' });
  const dialog = page.getByRole('dialog', { name: 'Änderungen nicht gespeichert' });

  // Ohne eigene Eingabe: einfach weg, auch wenn Klaro Nummer und Texte selbst ausgefüllt hat
  await page.goto('/rechnungen/neu');
  await expect(page.getByLabel(/Nummer$/)).toHaveValue(/\d/);
  await back.click();
  await expect(page).toHaveURL(/\/rechnungen$/);
  await expect(dialog).toHaveCount(0);

  // Mit Eingabe: Rückfrage → weiter bearbeiten → Eingabe ist noch da
  await page.goto('/rechnungen/neu');
  await expect(page.getByLabel(/Nummer$/)).toHaveValue(/\d/);
  await page.getByPlaceholder('z. B. Website-Gestaltung').fill('Fotoshooting');
  await back.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(page).toHaveURL(/\/rechnungen\/neu$/);
  await expect(page.getByPlaceholder('z. B. Website-Gestaltung')).toHaveValue('Fotoshooting');

  // Verwerfen → weg, nichts gespeichert
  await back.click();
  await dialog.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page).toHaveURL(/\/rechnungen$/);
  const { count: none } = await client.from('invoices').select('id', { count: 'exact', head: true });
  expect(none).toBe(0);

  // Als Entwurf speichern → gespeichert und weg
  await page.goto('/rechnungen/neu');
  await expect(page.getByLabel(/Nummer$/)).toHaveValue(/\d/);
  await page.getByPlaceholder('z. B. Website-Gestaltung').fill('Hochzeit');
  await page.getByPlaceholder('0,00').fill('500');
  await back.click();
  await dialog.getByRole('button', { name: 'Als Entwurf speichern' }).click();
  await expect(page).toHaveURL(/\/rechnungen$/);
  const { data: drafts } = await client.from('invoices').select('id, status');
  expect(drafts).toEqual([expect.objectContaining({ status: 'draft' })]);

  // Gespeicherten Entwurf öffnen, ansehen und ohne Änderung verlassen: keine Rückfrage
  await page.goto(`/rechnungen/${drafts![0]!.id}`);
  await expect(page.getByPlaceholder('z. B. Website-Gestaltung')).toHaveValue('Hochzeit');
  await page.getByPlaceholder('z. B. Website-Gestaltung').click();
  await back.click();
  await expect(page).toHaveURL(/\/rechnungen$/);
  await expect(dialog).toHaveCount(0);
});

test('Zurück-Taste des Browsers und Vorlagen-Editor fragen nach', async ({ page, cleanup }) => {
  const { email, client } = await createUser('ungespeichert-vorlage', cleanup);
  await completeProfile(client);
  await login(page, email);
  const dialog = page.getByRole('dialog', { name: 'Änderungen nicht gespeichert' });

  // Zurück-Taste (innerhalb von Klaro zum Editor gekommen)
  await page.goto('/rechnungen');
  await page.getByRole('link', { name: /Neue (Rechnung|Honorarnote)/ }).first().click();
  await expect(page).toHaveURL(/\/rechnungen\/neu$/);
  await expect(page.getByLabel(/Nummer$/)).toHaveValue(/\d/);
  await page.getByPlaceholder('z. B. Website-Gestaltung').fill('Beratung');
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(page).toHaveURL(/\/rechnungen\/neu$/);

  // Vorlagen-Editor: genau eine Rückfrage, Speichern im Fenster
  const { data: tpl } = await client.from('invoice_templates').select('id').eq('is_default', true).single();
  await page.goto(`/vorlagen/${tpl!.id}`);
  const name = page.getByLabel('Name der Vorlage');
  await expect(name).not.toHaveValue('');
  await name.fill('Meine Vorlage');
  await page.getByRole('link', { name: 'Alle Vorlagen' }).click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page).toHaveURL(/\/einstellungen/);
  const { data: saved } = await client.from('invoice_templates').select('name').eq('id', tpl!.id).single();
  expect(saved!.name).toBe('Meine Vorlage');
});
