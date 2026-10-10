// Flow 10: Eigenes Format für Rechnungsnummern (aus dem Import übernommen) und Rechnung bar bezahlt
import { completeProfile, createUser, expect, login, test } from './support';

test('Import erkennt Nummernformat, Rechnung zählt weiter und wird bar bezahlt ausgestellt', async ({ page, cleanup }) => {
  const { email, client } = await createUser('nummer-bar', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null });
  await login(page, email);

  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const d = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const pasted = [
    'Datum\tRechnungsnummer\tBeschreibung\tEinnahmen',
    `${d}\tRE_${yy}0011\tLogo Bäckerei\t300,00`,
    `${d}\tRE_${yy}0012\tWebsite Tischlerei\t1.200,00`,
  ].join('\n');

  // Import: Klaro erkennt das Format und fragt, ob neue Rechnungen so weiterzählen
  await page.goto('/importieren');
  await page.getByTestId('import-paste').fill(pasted);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByTestId('import-row-count')).toContainText('2 Einträge erkannt');
  await page.getByRole('button', { name: 'Weiter' }).click();
  if (await page.getByRole('heading', { name: /Kategorien/ }).isVisible()) await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByTestId('import-submit').click();
  await expect(page.getByText(`Die nächste wäre RE_${yy}0013`)).toBeVisible();
  await page.getByRole('button', { name: 'Format übernehmen' }).click();
  await expect(page.getByText(`deine nächste Rechnung bekommt die Nummer RE_${yy}0013`)).toBeVisible();
  const { data: profile } = await client.from('profiles').select('invoice_number_format').single();
  expect(profile!.invoice_number_format).toBe('RE_{JJ}{NNNN}');

  // Neue Rechnung: Nummer im übernommenen Format
  const { data: kunde } = await client.from('clients').insert({ name: 'Café Sonne', address: 'Ring 3', zip_code: '8010', city: 'Graz' }).select().single();
  await page.goto('/rechnungen/neu');
  await page.getByLabel('Kunde').selectOption(kunde!.id);
  await expect(page.getByLabel(/Nummer$/)).toHaveValue(`RE_${yy}0013`);
  await page.getByPlaceholder('z. B. Website-Gestaltung').fill('Fotos Speisekarte');
  await page.getByPlaceholder('0,00').fill('250');

  // Bar bezahlt: Text unten wechselt auf den Bar-Text, keine Fälligkeit
  await page.getByRole('radio', { name: 'Bar bezahlt' }).click();
  await expect(page.getByLabel('Text unten')).toHaveValue('Der Rechnungsbetrag wurde bar bezahlt und dankend erhalten.');
  await expect(page.getByLabel('Zahlbar bis')).toBeHidden();
  // Platzhalter per Knopf auch in der Rechnung
  await page.getByLabel('Text unten').fill('Bar erhalten: ');
  await page.getByRole('button', { name: '+ Rechnungsbetrag' }).nth(1).click();
  await expect(page.getByLabel('Text unten')).toHaveValue('Bar erhalten: {Rechnungsbetrag}');

  // Zurück auf Überweisung behält selbst geschriebenen Text
  await page.getByRole('radio', { name: 'Überweisung' }).click();
  await expect(page.getByLabel('Zahlbar bis')).toBeVisible();
  await expect(page.getByLabel('Text unten')).toHaveValue('Bar erhalten: {Rechnungsbetrag}');
  await page.getByRole('radio', { name: 'Bar bezahlt' }).click();

  await page.getByRole('button', { name: 'Ausstellen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Jetzt ausstellen' }).click();
  await expect(page.getByRole('button', { name: 'PDF herunterladen' })).toBeVisible({ timeout: 20_000 });

  const { data: invoice } = await client.from('invoices').select('invoice_number, status, paid_at, invoice_date, due_date, payment_method').single();
  expect(invoice).toMatchObject({ invoice_number: `RE_${yy}0013`, status: 'paid', payment_method: 'cash', due_date: null });
  expect(invoice!.paid_at!.slice(0, 10)).toBe(invoice!.invoice_date);
});
