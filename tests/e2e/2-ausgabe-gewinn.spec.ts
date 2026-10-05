// Flow 2: Ausgabe erfassen → Gewinnberechnung aktualisiert sich korrekt (inkl. 50-%-Regel für Bewirtung)
import type { Page } from '@playwright/test';
import { completeProfile, createUser, expect, login, parseEuro, seedPaidInvoices, test } from './support';

async function addExpense(page: Page, category: string, amount: string) {
  await page.getByRole('button', { name: 'Ausgabe erfassen' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: category }).click();
  await dialog.getByLabel('Betrag (brutto, €)').fill(amount);
  return dialog;
}

test('Ausgaben senken den Gewinn – Bewirtung nur zur Hälfte', async ({ page, cleanup }) => {
  const { email, client } = await createUser('ausgaben', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null });
  await seedPaidInvoices(client, [10_000]);
  await login(page, email);

  // Ausgangslage: noch keine Ausgaben in der Jahresrechnung
  await page.goto('/gewinn');
  // Je Zeile: erster Wert = Betrag, zweiter = Anteil am Umsatz
  const expenses = page.getByTestId('ytd-expenses').locator('span').first();
  const einkuenfte = page.getByTestId('ytd-einkuenfte').locator('span').first();
  await expect(expenses).toHaveText(/^€\s0$/);
  const before = parseEuro((await einkuenfte.textContent()) ?? '');

  // Software 1.000 € → voll absetzbar
  await page.goto('/ausgaben');
  let dialog = await addExpense(page, 'Software & Abos', '1000');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('expenses-total')).toHaveText(/1\.000,00/);

  // Geschäftsessen 200 € → nur 100 € absetzbar
  dialog = await addExpense(page, 'Bewirtung (50%)', '200');
  await expect(dialog.getByTestId('deductible-preview')).toContainText('100,00');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  // Jahresrechnung: 1.000 + 100 = 1.100 € absetzbar; die Einkünfte sinken um 1.100 € minus 15 % Grundfreibetrag = 935 €
  await page.goto('/gewinn');
  await expect(expenses).toHaveText(/^€\s1\.100$/);
  const after = parseEuro((await einkuenfte.textContent()) ?? '');
  expect(before - after).toBe(935);
});

test('Gerät über 1.000 € wird zur Anlage und auf mehrere Jahre verteilt', async ({ page, cleanup }) => {
  const { email, client } = await createUser('anlage', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null });
  await seedPaidInvoices(client, [10_000]);
  await login(page, email);
  const year = new Date().getFullYear();

  // Laptop 1.500 € im März (Kleinunternehmer: brutto zählt) → 3 Jahre à 500 €
  await page.goto('/ausgaben');
  const dialog = await addExpense(page, 'Geräte & Ausrüstung', '1500');
  await dialog.getByLabel('Datum').fill(`${year}-03-10`);
  await dialog.getByLabel('Beschreibung').fill('Laptop');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog.getByText('Bitte gib die Nutzungsdauer in ganzen Jahren ein.')).toBeVisible();
  await dialog.getByLabel('Wie lange nutzt du es?').selectOption('3');
  await expect(dialog.getByTestId('depreciation-preview')).toContainText('500,00');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  // Keine sofort absetzbare Ausgabe, sondern eine Anlage
  await expect(page.getByTestId('expenses-total')).toHaveText(/0,00/);
  await expect(page.getByTestId('depreciation-total')).toHaveText(/500,00/);
  await page.getByRole('tab', { name: /Anlagen/ }).click();
  await expect(page.getByTestId('asset-row')).toContainText('Laptop');
  await expect(page.getByTestId('asset-row')).toContainText(new RegExp(`Restwert Ende ${year}: €\\s1\\.000,00`));

  // Jahresrechnung (ganzes Jahr): 500 € Abschreibung
  await page.goto('/gewinn');
  await page.getByRole('radio', { name: 'Ganzes Jahr (erwartet)' }).click();
  await expect(page.getByTestId('full-depreciation').locator('span').first()).toHaveText(/^€\s500$/);
});
