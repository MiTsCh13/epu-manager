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
  await form.getByLabel('Beitrag für').selectOption(`Q2|${year}`);
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
  await expect(page.getByText(`Noch keine SVS-Beiträge ${year} bezahlt.`)).toBeVisible();

  // Q4 des Vorjahres, bezahlt im Jänner: zählt im Jahr der Zahlung
  await page.getByRole('button', { name: 'SVS-Beitrag erfassen' }).click();
  const neu = page.getByRole('form', { name: 'SVS-Beitrag erfassen' });
  await neu.getByLabel('Betrag (€)').fill('600');
  await neu.getByLabel('Beitrag für').selectOption(`Q4|${year - 1}`);
  await neu.getByLabel('Bezahlt am').fill(`${year}-01-08`);
  await neu.getByRole('button', { name: 'Speichern' }).click();
  await expect(list).toContainText(`Q4 ${year - 1}`);
  await expect(list).toContainText(`zählt für ${year}`);
  await expect(page.getByText('Bezahlt: € 600,00')).toBeVisible();

  // Im Vorjahr bezahlt, obwohl für dieses Jahr: steht beim Vorjahr
  await client.from('svs_payments').insert({ amount: 99, quarter: 'Q1', year, payment_date: `${year - 1}-12-20` });
  await page.reload();
  await expect(list).not.toContainText('99,00');
});
