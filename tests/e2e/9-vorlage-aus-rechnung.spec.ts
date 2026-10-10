// Flow 9: Vorlage aus einer bestehenden Rechnung übernehmen – PDF lesen, Bilder herauslösen, Vergleich, anlegen.
// Die Antwort von Claude (read-invoice-design) wird nachgestellt; die Muster-Rechnung liegt in fixtures/.
import { completeProfile, createUser, expect, login, test } from './support';

const result = {
  is_invoice: true,
  name: 'Erika Muster Design',
  header_style: 'classic',
  header_image_id: null,
  header_crop_bottom: null,
  logo_image_id: 'bild1',
  logo_crop: null,
  logo_position: 'right',
  logo_size: 'm',
  tagline: '',
  color: '#c2410c',
  font: 'inter',
  intro: 'Hiermit stelle ich folgende Leistungen in Rechnung:',
  closing_title: '',
  closing_text: 'Bitte überweise den Betrag innerhalb von {Zahlungsziel} mit dem Verwendungszweck {Rechnungsnummer}.',
  closing_boxed: false,
  greeting_text: 'Liebe Grüße,',
  greeting_signature: 'Erika Muster',
  footer_style: 'columns',
  footer_tinted: false,
  footer_contact: ['www.muster.at'],
  footer_bank_extra: ['BIC: BKAUATWW'],
  footer_text: '',
  payment_days: 14,
  payment_terms: '',
  payment_box: false,
  price_first: false,
  ku_note: 'below',
  not_adopted: ['Die Tabelle hat Gitterlinien, die Klaro nicht nachbildet.'],
};

test('Vorlage aus eigener Rechnung übernehmen', async ({ page, cleanup }) => {
  const { email, client } = await createUser('vorlage-import', cleanup);
  await completeProfile(client);
  const requests: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/read-invoice-design', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { result } });
  });
  await login(page, email);

  await page.goto('/einstellungen#vorlagen');
  await page.getByRole('button', { name: 'Neue Vorlage' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Aus meiner Rechnung übernehmen/ }).click();
  await expect(dialog).toContainText('Bis zu 3 Rechnungen pro Tag');
  await dialog.getByTestId('import-input').setInputFiles('tests/e2e/fixtures/rechnung-vorlage.pdf');

  // Vergleich: Original und Klaro-Vorlage, was übernommen wurde und was nicht
  const compare = dialog.getByTestId('import-compare');
  await expect(compare).toBeVisible({ timeout: 30_000 });
  await expect(compare.getByTestId('import-adopted')).toContainText('#c2410c');
  await expect(compare.getByTestId('import-adopted')).toContainText('Kopf: klassisch, mit Logo');
  await expect(compare.getByTestId('import-adopted')).toContainText('Zahlungsziel 14 Tage');
  await expect(compare).toContainText('Gitterlinien');
  await expect(compare.getByLabel('Name der Vorlage')).toHaveValue('Erika Muster Design');

  // Was an Claude ging: Seitenbild, Texte mit Position, das eingebettete Logo samt Lage
  const req = requests[0]!;
  expect(typeof req.page).toBe('string');
  expect(req.pageWidth).toBe(595);
  expect(req.images).toEqual([expect.objectContaining({ id: 'bild1', x: 390, y: 32, width: 150, height: 50, pixelWidth: 60, pixelHeight: 20 })]);
  expect((req.lines as { text: string }[]).map((l) => l.text)).toContain('Rechnung');
  expect(req.colors).toContain('#f28e2c');

  await compare.getByRole('button', { name: 'Passt so' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('template-list')).toContainText('Erika Muster Design');

  const { data: templates } = await client.from('invoice_templates').select('name, settings').eq('name', 'Erika Muster Design');
  const s = templates![0]!.settings as Record<string, Record<string, unknown>>;
  expect(s).toMatchObject({
    color: '#c2410c',
    font: 'inter',
    intro: result.intro,
    closing: { text: result.closing_text },
    footer: { style: 'columns', tinted: false, contact: 'www.muster.at', bankExtra: 'BIC: BKAUATWW' },
    payment: { days: 14, box: false },
  });
  expect(s.header!.logoPath).toMatch(/\/logo-.+\.png$/);
  expect(s.header!.style).toBe('classic');
});
