// Flow 3: Umsatz über 45.000 € → Warnung vor der Kleinunternehmergrenze erscheint
import { completeProfile, createUser, expect, login, seedPaidInvoices, test } from './support';

const WARNING = /Du näherst dich der Kleinunternehmergrenze/;

test('Warnung erscheint erst, wenn der Umsatz 45.000 € übersteigt', async ({ page, cleanup }) => {
  const { email, client } = await createUser('grenze', cleanup);
  await completeProfile(client);
  await seedPaidInvoices(client, [30_000]);
  await login(page, email);

  // 30.000 € – noch keine Warnung
  await page.goto('/gewinn');
  await expect(page.getByTestId('svs-year')).toBeVisible();
  await expect(page.getByText(WARNING)).toHaveCount(0);

  // + 16.000 € = 46.000 € – Warnung
  await seedPaidInvoices(client, [16_000]);
  await page.reload();
  await expect(page.getByText(WARNING)).toBeVisible();
  await expect(page.getByText(/Du hast die Umsatzgrenze überschritten/)).toHaveCount(0);
});
