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

  // Ausgangslage: Gewinn = Einnahmen
  await page.goto('/gewinn');
  const profit = page.getByTestId('ytd-profit');
  await expect(profit).toHaveText(/^€\s10\.000$/);

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

  // Gewinn: 10.000 − 1.000 − 100 = 8.900
  await page.goto('/gewinn');
  await expect(profit).toHaveText(/^€\s8\.900$/);
  expect(parseEuro((await profit.textContent()) ?? '')).toBe(8900);
});
