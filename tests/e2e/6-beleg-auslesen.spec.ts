/// <reference lib="dom" />
// DOM-Typen für DataTransfer/File im Browser-Kontext (page.evaluateHandle)
// Flow 6: Beleg importieren (Knopf, Formular, Drag & Drop) → Klaro liest ihn aus → vorausgefülltes Formular prüfen und speichern; SVS-Vorschreibung erkennen.
// Die Edge Function read-receipt wird nachgestellt – ein Testlauf kostet nichts und hängt nicht vom Modell ab.
import type { Page } from '@playwright/test';
import { completeProfile, createUser, expect, login, test } from './support';

const PDF = { name: 'mediamarkt-maus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Klaro E2E\n%%EOF\n') };
const year = new Date().getFullYear();

async function mockReadReceipt(page: Page, result: Record<string, unknown>) {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/read-receipt', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { result } });
  });
  return requests;
}

const base = {
  vendor: 'MediaMarkt',
  currency: 'EUR',
  vat_country: 'AT',
  likely_private: false,
  svs_quarter: null,
  notes: [] as string[],
};

test('Beleg auslesen: Formular ist vorausgefüllt, Beleg hängt an, gespeichert wird erst nach Prüfung', async ({ page, cleanup }) => {
  const { email, client } = await createUser('beleg', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null, is_kleinunternehmer: false });
  const requests = await mockReadReceipt(page, {
    ...base,
    kind: 'expense',
    date: `${year}-01-20`,
    total: 43.98,
    vat: [{ rate: 20, amount: 5.83 }],
    description: 'Logitech Maus',
    category_id: 'geraete',
    category_reason: 'Eine Computermaus ist Arbeitsausrüstung.',
    notes: ['Im Betrag sind 8,99 € Garantieversicherung ohne Umsatzsteuer enthalten.'],
  });
  await login(page, email);
  await page.goto('/ausgaben');

  await page.getByTestId('receipt-scan-input').setInputFiles(PDF);
  const dialog = page.getByRole('dialog', { name: 'Beleg prüfen' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Klaro hat deinen Beleg gelesen')).toBeVisible();
  await expect(dialog.getByText('8,99 € Garantieversicherung')).toBeVisible();
  await expect(dialog.getByText('Vorschlag von Klaro:')).toBeVisible();
  await expect(dialog.getByLabel('Betrag (brutto, €)')).toHaveValue('43,98');
  await expect(dialog.getByLabel('Datum')).toHaveValue(`${year}-01-20`);
  await expect(dialog.getByLabel('Beschreibung')).toHaveValue('Logitech Maus – MediaMarkt');
  await expect(dialog.getByText('mediamarkt-maus.pdf')).toBeVisible();

  // Anfrage: PDF mit den Kategorien, die für die Person gelten
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ mediaType: 'application/pdf' });
  expect((requests[0]!.categories as { id: string }[]).map((c) => c.id)).toContain('geraete');

  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Logitech Maus – MediaMarkt').first()).toBeVisible();

  const { data } = await client.from('expenses').select('amount, category_label, receipt_url, expense_date');
  expect(data).toHaveLength(1);
  expect(data![0]).toMatchObject({ amount: 43.98, category_label: 'Geräte & Ausrüstung', expense_date: `${year}-01-20` });
  expect(data![0]!.receipt_url).toMatch(/\.pdf$/);
});

test('SVS-Vorschreibung wird erkannt und als SVS-Zahlung eingetragen', async ({ page, cleanup }) => {
  const { email, client } = await createUser('beleg-svs', cleanup);
  await completeProfile(client);
  await mockReadReceipt(page, {
    ...base,
    kind: 'svs',
    vendor: 'SVS',
    date: `${year}-08-31`,
    total: 1369.59,
    vat: [],
    description: 'SVS-Beiträge 3. Quartal',
    category_id: null,
    category_reason: '',
    svs_quarter: 'Q3',
  });
  await login(page, email);
  await page.goto('/ausgaben');

  await page.getByTestId('receipt-scan-input').setInputFiles({ ...PDF, name: 'svs-q3.pdf' });
  const dialog = page.getByRole('dialog', { name: 'SVS-Vorschreibung erkannt' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`Vorschreibung für Q3 ${year}`)).toBeVisible();
  await expect(dialog.getByLabel('Quartal')).toHaveValue('Q3');
  await expect(dialog.getByLabel('Bezahlter Betrag (€)')).toHaveValue('1369,59');
  await dialog.getByRole('button', { name: 'Als bezahlt eintragen' }).click();
  await expect(dialog).toBeHidden();

  const { data } = await client.from('svs_payments').select('amount, quarter, year');
  expect(data).toEqual([{ amount: 1369.59, quarter: 'Q3', year }]);
});

test('Fehler beim Auslesen: Hinweis und selbst eintragen mit angehängtem Beleg', async ({ page, cleanup }) => {
  const { email, client } = await createUser('beleg-fehler', cleanup);
  await completeProfile(client);
  await page.route('**/functions/v1/read-receipt', (route) =>
    route.fulfill({ status: 429, json: { error: 'Du hast in den letzten 24 Stunden schon 50 Belege auslesen lassen.' } }),
  );
  await login(page, email);
  await page.goto('/ausgaben');

  await page.getByTestId('receipt-scan-input').setInputFiles(PDF);
  const dialog = page.getByRole('dialog', { name: 'Das hat leider nicht geklappt' });
  await expect(dialog.getByText('schon 50 Belege')).toBeVisible();
  await dialog.getByRole('button', { name: 'Selbst eintragen' }).click();
  const form = page.getByRole('dialog', { name: 'Beleg prüfen' });
  await expect(form.getByText('mediamarkt-maus.pdf')).toBeVisible();
  await expect(form.getByLabel('Betrag (brutto, €)')).toHaveValue('');
});

const maus = {
  ...base,
  kind: 'expense',
  date: `${year}-01-20`,
  total: 43.98,
  vat: [{ rate: 20, amount: 5.83 }],
  description: 'Logitech Maus',
  category_id: 'geraete',
  category_reason: 'Eine Computermaus ist Arbeitsausrüstung.',
};

function fileTransfer(page: Page) {
  return page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['%PDF-1.4'], 'beleg.pdf', { type: 'application/pdf' }));
    return dt;
  });
}

/** Datei per Drag & Drop ins Fenster ziehen und loslassen (wie aus dem Finder/Explorer). */
async function dragFileIntoWindow(page: Page, release = true) {
  // Erst wenn die Seite gezeichnet ist, hört sie auf Drag & Drop
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const dataTransfer = await fileTransfer(page);
  await page.dispatchEvent('main', 'dragenter', { dataTransfer });
  await expect(page.getByTestId('receipt-drop-overlay')).toBeVisible();
  await expect(page.getByText('Beleg hier loslassen')).toBeVisible();
  if (release) await page.dispatchEvent('main', 'drop', { dataTransfer });
}

test('Beleg im Formular „Ausgabe erfassen“ importieren', async ({ page, cleanup }) => {
  const { email, client } = await createUser('beleg-formular', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null, is_kleinunternehmer: false });
  await mockReadReceipt(page, maus);
  await login(page, email);
  await page.goto('/ausgaben');

  await page.getByRole('button', { name: 'Ausgabe erfassen' }).first().click();
  const empty = page.getByRole('dialog', { name: 'Ausgabe erfassen' });
  await expect(empty.getByText('Beleg importieren und automatisch auslesen')).toBeVisible();
  // Echtes Ablegen auf der Fläche (nicht über das Fenster-Overlay)
  const dataTransfer = await fileTransfer(page);
  await empty.getByTestId('receipt-drop-area').dispatchEvent('dragenter', { dataTransfer });
  await expect(page.getByTestId('receipt-drop-overlay')).toBeHidden();
  await empty.getByTestId('receipt-drop-area').dispatchEvent('drop', { dataTransfer });

  const dialog = page.getByRole('dialog', { name: 'Beleg prüfen' });
  await expect(dialog.getByLabel('Betrag (brutto, €)')).toHaveValue('43,98');
  await expect(dialog.getByText('Beleg importieren und automatisch auslesen')).toBeHidden();
});

test('Drag & Drop ins Fenster: Ausgaben-Seite und Übersicht', async ({ page, cleanup }) => {
  const { email, client } = await createUser('beleg-drop', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null, is_kleinunternehmer: false });
  await mockReadReceipt(page, maus);
  await login(page, email);

  // Ausgaben-Seite
  await page.goto('/ausgaben');
  await dragFileIntoWindow(page);
  await expect(page.getByTestId('receipt-drop-overlay')).toBeHidden();
  const dialog = page.getByRole('dialog', { name: 'Beleg prüfen' });
  await expect(dialog.getByLabel('Betrag (brutto, €)')).toHaveValue('43,98');
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();

  // Übersicht: Loslassen führt zu den Ausgaben und liest dort aus
  await page.goto('/');
  await dragFileIntoWindow(page);
  await expect(page).toHaveURL(/\/ausgaben$/);
  await expect(page.getByRole('dialog', { name: 'Beleg prüfen' }).getByLabel('Beschreibung')).toHaveValue('Logitech Maus – MediaMarkt');
});

test('Drag & Drop: Hinausziehen blendet aus, bei offenem Dialog passiert nichts', async ({ page, cleanup }) => {
  const { email, client } = await createUser('beleg-drop-rand', cleanup);
  await completeProfile(client);
  const requests = await mockReadReceipt(page, maus);
  await login(page, email);
  await page.goto('/ausgaben');
  await expect(page.getByRole('heading', { name: 'Ausgaben', level: 1 })).toBeVisible();

  // Hineinziehen und wieder hinaus (relatedTarget = null: Fenster verlassen)
  const dataTransfer = await fileTransfer(page);
  await page.dispatchEvent('main', 'dragenter', { dataTransfer });
  await expect(page.getByTestId('receipt-drop-overlay')).toBeVisible();
  await page.dispatchEvent('main', 'dragleave', { dataTransfer });
  await expect(page.getByTestId('receipt-drop-overlay')).toBeHidden();

  // Bei offenem Dialog: kein Overlay, kein Auslesen
  await page.getByRole('button', { name: 'Ausgabe erfassen' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).waitFor();
  await page.dispatchEvent('main', 'dragenter', { dataTransfer });
  await page.dispatchEvent('main', 'drop', { dataTransfer });
  await expect(page.getByTestId('receipt-drop-overlay')).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Ausgabe erfassen' })).toBeVisible();
  expect(requests).toHaveLength(0);
});
