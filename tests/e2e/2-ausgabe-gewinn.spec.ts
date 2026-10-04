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
