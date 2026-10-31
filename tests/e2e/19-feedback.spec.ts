// Flow 19: Feedback & Wünsche – aus Seitenleiste bzw. Handy-Menü senden; nur der Betreiber kann es lesen
import { adminClient, completeProfile, createUser, expect, login, test } from './support';

test('Feedback senden – mit Erlaubnis zu antworten', async ({ page, cleanup }, testInfo) => {
  const { email, client } = await createUser('feedback', cleanup);
  await completeProfile(client);
  await login(page, email);
  await page.goto('/ausgaben');

  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await page.getByRole('button', { name: 'Feedback & Wünsche' }).click();
  const dialog = page.getByRole('dialog', { name: 'Feedback & Wünsche' });
  await expect(dialog).toBeVisible();

  // Ohne Auswahl und Text geht nichts weg
  await dialog.getByRole('button', { name: 'Senden' }).click();
  await expect(dialog.getByText('Wähl bitte aus, worum es geht.')).toBeVisible();

  await expect(dialog.getByText('Schreib bitte ein paar Worte.')).toBeVisible();
  await dialog.getByText('Wunsch', { exact: true }).click();
  // Meldung verschwindet, sobald das Feld passt
  await expect(dialog.getByText('Wähl bitte aus, worum es geht.')).toHaveCount(0);
  await dialog.getByLabel('Deine Nachricht').fill('Bitte einen Export für meine Steuerberaterin.');
  await dialog.getByRole('checkbox', { name: /Du darfst mir antworten/ }).check();
  await dialog.getByRole('button', { name: 'Senden' }).click();
  const thanks = page.getByRole('dialog', { name: 'Danke für dein Feedback!' });
  await expect(thanks).toBeVisible();
  await thanks.getByRole('button', { name: 'Fertig' }).click();
  await expect(thanks).toBeHidden();

  // Nutzer selbst sieht kein Feedback (auch das eigene nicht), der Betreiber schon – mit E-Mail aus dem Konto
  const own = await client.from('feedback').select('id');
  expect(own.data).toEqual([]);
  const { data: user } = await client.auth.getUser();
  const { data: rows } = await adminClient().from('feedback').select('*').eq('user_id', user.user!.id);
  expect(rows).toHaveLength(1);
  expect(rows![0]).toMatchObject({ kind: 'wish', page: '/ausgaben', contact_ok: true, email, status: 'new' });

  // E-Mail und Status lassen sich nicht selbst setzen
  const spoof = await client.from('feedback').insert({ kind: 'other', message: 'Test', contact_ok: false, email: 'fremd@example.com', status: 'done' });
  expect(spoof.error).toBeNull();
  const { data: second } = await adminClient().from('feedback').select('email, status').eq('user_id', user.user!.id).eq('kind', 'other');
  expect(second).toEqual([{ email: null, status: 'new' }]);

  // Feedback im Namen eines anderen Kontos geht nicht
  const other = await createUser('feedback-anderer', cleanup);
  const { data: otherUser } = await other.client.auth.getUser();
  const foreign = await client.from('feedback').insert({ user_id: otherUser.user!.id, kind: 'bug', message: 'Fremd' });
  expect(foreign.error).not.toBeNull();
  const { data: foreignRows } = await adminClient().from('feedback').select('id').eq('user_id', otherUser.user!.id);
  expect(foreignRows).toEqual([]);
});
