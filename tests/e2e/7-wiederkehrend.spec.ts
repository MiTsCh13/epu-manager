// Flow 7: Wiederkehrende Ausgaben – anlegen, fällige Zahlungen übernehmen/anpassen/überspringen, automatisch buchen,
// pausieren und Serie löschen (Zahlungen bleiben).
import { completeProfile, createUser, expect, login, test } from './support';

const pad = (n: number) => String(n).padStart(2, '0');
/** Erster Tag des Monats vor `monthsAgo` Monaten, als ISO-Datum. */
function firstOfMonth(monthsAgo: number): string {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() - monthsAgo, 1);
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-01`;
}

test('Wiederkehrende Ausgabe anlegen, Zahlungen überspringen und anpassen, Serie löschen', async ({ page, cleanup }) => {
  const { email, client } = await createUser('wiederkehrend', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null });
  await login(page, email);

  // Seit dem 1. vor zwei Monaten monatlich → zwei weitere Zahlungen sind schon fällig
  await page.goto('/ausgaben');
  await page.getByRole('button', { name: 'Ausgabe erfassen' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Büro & Software' }).click();
  await dialog.getByLabel('Betrag (brutto, €)').fill('30');
  await dialog.getByLabel('Datum').fill(firstOfMonth(2));
  await dialog.getByLabel('Beschreibung').fill('Cloud-Speicher');
  await dialog.getByLabel('Wiederkehrende Ausgabe').check();
  await expect(dialog.getByLabel('Wie oft?')).toHaveValue('1');
  await expect(dialog.getByTestId('recurring-catch-up')).toContainText('2 weitere Zahlungen');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  // Fällig: 2 – die ältere überspringen, die neuere übernehmen und gleich anpassen
  const due = page.getByTestId('recurring-due');
  await expect(due).toContainText('Fällige wiederkehrende Ausgaben (2)');
  await due.getByRole('button', { name: 'Überspringen' }).click();
  await expect(due).toContainText('Fällige wiederkehrende Ausgaben (1)');
  await due.getByRole('button', { name: 'Anpassen' }).click();
  await expect(due).toBeHidden();
  const edit = page.getByRole('dialog');
  await expect(edit).toContainText('Ausgabe bearbeiten');
  await expect(edit.getByTestId('expense-series-note')).toContainText('monatlich');
  await edit.getByLabel('Betrag (brutto, €)').fill('35');
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(edit).toBeHidden();

  // Serie im Reiter „Wiederkehrend“: monatlich, nächste Zahlung am 1. des nächsten Monats
  await page.getByRole('tab', { name: 'Wiederkehrend (1)' }).click();
  const list = page.getByTestId('recurring-list');
  await expect(list).toContainText('Cloud-Speicher');
  await expect(list).toContainText('monatlich');
  const [y, m] = firstOfMonth(-1).split('-');
  await expect(list).toContainText(`nächste am 01.${m}.${y}`);

  // Pausieren und fortsetzen
  await list.getByRole('button', { name: 'Cloud-Speicher pausieren' }).click();
  await expect(list).toContainText('pausiert');
  await list.getByRole('button', { name: 'Cloud-Speicher fortsetzen' }).click();
  await expect(list).not.toContainText('pausiert');

  // Serie löschen – die Zahlungen bleiben als normale Ausgaben
  await list.getByRole('button', { name: 'Serie Cloud-Speicher beenden oder löschen' }).click();
  const remove = page.getByRole('dialog');
  await remove.getByText('Serie löschen', { exact: true }).click();
  await remove.getByRole('button', { name: 'Löschen' }).click();
  await expect(list).toBeHidden();
  const { data: rows } = await client.from('expenses').select('amount, recurring_id').order('expense_date');
  expect(rows?.map((r) => Number(r.amount))).toEqual([30, 35]);
  expect(rows?.every((r) => r.recurring_id === null)).toBe(true);
});

test('Automatisch buchen und fällige Zahlungen in der Übersicht', async ({ page, cleanup }) => {
  const { email, client } = await createUser('wiederkehrend-auto', cleanup);
  await completeProfile(client, { profit_method: 'euer', pausch_type: null, industry_code: null });
  const template = { category_label: 'Büro & Software', e1a_kz: '9230', amount: 20, deductible_amount: 20, interval_months: 1, start_date: firstOfMonth(2), next_date: firstOfMonth(1) };
  const { error } = await client.from('recurring_expenses').insert([
    { ...template, description: 'Telefon', auto_book: true },
    { ...template, description: 'Webhosting', auto_book: false },
  ]);
  expect(error).toBeNull();
  await login(page, email);

  // Telefon bucht Klaro selbst (letzter und dieser Monat), Webhosting wartet auf Bestätigung
  await expect(page.getByText('Klaro hat 2 wiederkehrende Ausgaben gebucht')).toBeVisible();
  const due = page.getByTestId('recurring-due');
  await expect(due).toContainText('Fällige wiederkehrende Ausgaben (2)');
  await expect(due).toContainText('Webhosting');
  await expect(due).not.toContainText('Telefon');
  await due.getByRole('button', { name: 'Alle übernehmen' }).click();
  await expect(due).toBeHidden();

  // Übersicht: beide laufend, 40 € pro Monat
  const card = page.getByTestId('recurring-card');
  await expect(card).toContainText('2 laufend');
  await expect(card).toContainText(/40,00/);
  await expect(card).toContainText('bucht automatisch');

  const { data: rows } = await client.from('expenses').select('description');
  expect(rows?.map((r) => r.description).sort()).toEqual(['Telefon', 'Telefon', 'Webhosting', 'Webhosting']);

  // „Alle ansehen“ öffnet auf den Ausgaben den Reiter „Wiederkehrend“
  await card.getByRole('link', { name: 'Alle ansehen' }).click();
  await expect(page.getByRole('tab', { name: 'Wiederkehrend (2)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('recurring-list')).toContainText('Telefon');

  // Ausgabenliste: Kennzeichen und Filter „Nur wiederkehrende“
  await page.getByRole('tab', { name: /^Ausgaben/ }).click();
  await page.getByLabel('Kategorie filtern').selectOption({ label: 'Nur wiederkehrende' });
  await expect(page.getByRole('listitem').filter({ hasText: 'Webhosting' }).first()).toContainText('monatlich');
});
