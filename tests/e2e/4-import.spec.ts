// Flow 4: Bisherige Einnahmen und Ausgaben aus Excel einfügen → zuordnen → übernehmen → rückgängig machen
import { completeProfile, createUser, expect, login, test } from './support';

test('Import aus Excel: Einnahmen, Ausgaben, Anlage und SVS – und wieder rückgängig', async ({ page, cleanup }) => {
  const { email, client } = await createUser('import', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null });
  await login(page, email);

  const now = new Date();
  const d = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  // So sieht es aus, wenn man Zeilen aus Excel kopiert (Tabulatoren, Titelzeile, Summenzeile)
  const pasted = [
    `Meine EAR ${now.getFullYear()}`,
    'Datum\tBeschreibung\tKategorie\tEinnahmen\tAusgaben',
    `${d}\tWebsite Muster GmbH\tHonorar\t1.500,00\t`,
    `${d}\tAdobe Creative Cloud\tSoftware\t\t59,99`,
    `${d}\tSVS Quartal\tSozialversicherung\t\t900,00`,
    `${d}\tMacBook Pro\tHardware\t\t2.400,00`,
    `${d}\tMittagessen mit Kundin\tBewirtung\t\t80,00`,
    `${d}\tESt-Vorauszahlung\tFinanzamt\t\t300,00`,
    `\tSumme\t\t1.500,00\t3.739,99`,
  ].join('\n');

  await page.goto('/importieren');
  await page.getByTestId('import-paste').fill(pasted);
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Spalten: Klaro erkennt Überschrift und Spalten selbst; Summenzeile fällt weg
  await expect(page.getByTestId('import-row-count')).toContainText('6 Einträge erkannt');
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Kategorien: Vorschläge prüfen
  await expect(page.getByLabel('Zuordnung für Finanzamt')).toHaveValue('skip');
  await expect(page.getByLabel('Zuordnung für Sozialversicherung')).toHaveValue('svs');
  await expect(page.getByLabel('Zuordnung für Hardware')).toHaveValue('cat:geraete');
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Prüfen und übernehmen
  await expect(page.getByTestId('import-review-list')).toBeVisible();
  await page.getByTestId('import-submit').click();
  const done = page.getByRole('status').filter({ hasText: 'Übernommen!' });
  await expect(done).toContainText('1 Einnahme, 2 Ausgaben, 1 Anlage, 1 SVS-Beitrag');

  // Ausgaben: Software voll, Geschäftsessen zur Hälfte; MacBook als Anlage
  await page.goto('/ausgaben');
  await expect(page.getByTestId('expenses-total')).toHaveText(/99,99/);
  await expect(page.getByRole('tab', { name: 'Anlagen (1)' })).toBeVisible();

  // Einnahme erscheint bei den Rechnungen als weitere Einnahme und zählt mit
  await page.goto('/rechnungen');
  await expect(page.getByTestId('other-incomes')).toContainText('Website Muster GmbH');
  await expect(page.getByTestId('invoices-earned')).toHaveText(/1\.500/);

  // Rückgängig machen
  await page.goto('/importieren');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rückgängig machen' }).click();
  await expect(page.getByText('Bisherige Importe')).toBeHidden();
  await page.goto('/ausgaben');
  await expect(page.getByTestId('expenses-total')).toHaveText(/0,00/);
});
