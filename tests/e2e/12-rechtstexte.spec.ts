// Flow 12: Impressum und Datenschutz sind ohne Anmeldung erreichbar, Registrierung weist auf Beta und Datenschutz hin.
import { expect, test } from './support';

test('Rechtstexte ohne Anmeldung: Impressum und Datenschutz von der Anmeldung aus', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Impressum' }).click();
  await expect(page).toHaveURL(/\/impressum$/);
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await expect(page.getByText('Hirschgasse 9')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keine Steuerberatung' })).toBeVisible();

  await page.getByRole('link', { name: 'Datenschutz' }).click();
  await expect(page.getByRole('heading', { name: 'Datenschutzerklärung' })).toBeVisible();
  await expect(page.getByText('Anthropic', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page).toHaveURL(/\/impressum$/);

  await page.goto('/registrieren');
  await expect(page.getByText(/in der Testphase \(Beta\)/)).toBeVisible();
  // öffnet in neuem Tab, damit das halb ausgefüllte Formular erhalten bleibt
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'Datenschutzerklärung' }).click()]);
  await expect(popup).toHaveURL(/\/datenschutz$/);
  await expect(page).toHaveURL(/\/registrieren$/);
});
