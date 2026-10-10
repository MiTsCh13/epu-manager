// Flow 11: SVS-Beiträge bei den Ausgaben erfassen, bearbeiten und löschen
import { completeProfile, createUser, expect, login, test } from './support';

test('SVS-Beitrag erfassen, bearbeiten und löschen', async ({ page, cleanup }) => {
  const { email, client } = await createUser('svs-edit', cleanup);
  await completeProfile(client);
  await login(page, email);
  const year = new Date().getFullYear();
  await client.from('svs_payments').insert({ amount: 480, quarter: 'Q1', year, payment_date: `${year}-01-02`, notes: 'aus Import' });

  await page.goto('/ausgaben');
  const list = page.getByTestId('svs-list');
  await expect(list).toContainText('480,00');
  await expect(list).toContainText('aus Import');

  // Bearbeiten: Formular ist vorausgefüllt
  await page.getByRole('button', { name: `SVS-Beitrag Q1 ${year} über € 480,00 bearbeiten` }).click();
  const form = page.getByRole('form', { name: 'SVS-Beitrag bearbeiten' });
  await expect(form.getByLabel('Betrag (€)')).toHaveValue('480');
  await form.getByLabel('Betrag (€)').fill('512,34');
  await form.getByLabel('Quartal').selectOption('Q2');
  await form.getByLabel(/^Notiz/).fill('');
  await form.getByRole('button', { name: 'Speichern' }).click();
  await expect(form).toBeHidden();
  await expect(list).toContainText(`Q2 ${year}`);
  await expect(list).toContainText('512,34');
  await expect(list).not.toContainText('aus Import');
  const { data } = await client.from('svs_payments').select('amount, quarter, notes').single();
  expect(data).toEqual({ amount: 512.34, quarter: 'Q2', notes: null });

  // Löschen mit Rückfrage
  await page.getByRole('button', { name: `SVS-Beitrag Q2 ${year} über € 512,34 löschen` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText(`Noch keine SVS-Beiträge für ${year} erfasst.`)).toBeVisible();
});
