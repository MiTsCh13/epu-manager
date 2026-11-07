// Flow 20: Ausgestellte, noch nicht verschickte Rechnung zurück zum Entwurf holen – gleiche Nummer, keine Stornorechnung
import { completeProfile, createUser, expect, login, test } from './support';

test('Rechnung zurück zum Entwurf, ausbessern, wieder ausstellen; Schutz in der Datenbank', async ({ page, cleanup }) => {
  const { email, client } = await createUser('zurueck-entwurf', cleanup);
  await completeProfile(client);
  const { data: kunde } = await client.from('clients').insert({ name: 'Tischlerei Holz', address: 'Ring 3', zip_code: '8010', city: 'Graz' }).select('id').single();
  const today = new Date();
  const year = today.getFullYear();
  const iso = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const line = [{ description: 'Beratng', quantity: 2, unit_price: 100, total: 200 }];
  // Zahlungsziel in der Zukunft: noch nicht überfällig
  const due = `${year + 1}-12-31`;
  const base = { client_id: kunde!.id, invoice_date: iso, service_date_from: iso, due_date: due, line_items: line };
  const { data: rows, error } = await client
    .from('invoices')
    .insert([
      { ...base, invoice_number: `${year}-001`, status: 'sent' },
      { ...base, invoice_number: `${year}-002`, status: 'sent', emailed_at: today.toISOString() },
      { ...base, invoice_number: `${year}-003`, status: 'paid', paid_at: today.toISOString() },
      { ...base, invoice_number: `${year}-004`, status: 'sent' },
    ])
    .select('id, invoice_number');
  expect(error).toBeNull();
  const byNumber = (n: string) => rows!.find((r) => r.invoice_number === `${year}-${n}`)!.id;

  // Datenbank: nicht direkt zum Entwurf, kein selbst gesetzter Zeitpunkt; verschickt, bezahlt und storniert bleiben gesperrt
  const direct = await client.from('invoices').update({ status: 'draft' }).eq('id', byNumber('001'));
  expect(direct.error?.message).toContain('nicht wieder zum Entwurf');
  const stamp = await client.from('invoices').update({ reopened_at: today.toISOString() }).eq('id', byNumber('001'));
  expect(stamp.error?.message).toContain('Zurück zum Entwurf');
  const mailed = await client.rpc('reopen_invoice', { p_invoice: byNumber('002') });
  expect(mailed.error?.message).toContain('schon verschickt');
  const paid = await client.rpc('reopen_invoice', { p_invoice: byNumber('003') });
  expect(paid.error?.message).toContain('Nur offene');
  // Sperren nicht umgehbar: „verschickt“ und „bezahlt“ lassen sich nicht zurücknehmen, reopened_at nicht beim Anlegen setzen
  const unmail = await client.from('invoices').update({ emailed_at: null }).eq('id', byNumber('002'));
  expect(unmail.error?.message).toContain('bleibt verschickt');
  const unpay = await client.from('invoices').update({ status: 'sent', paid_at: null }).eq('id', byNumber('003'));
  expect(unpay.error?.message).toContain('bleibt bezahlt');
  const fakeInsert = await client.from('invoices').insert({ ...base, invoice_number: `${year}-099`, status: 'draft', reopened_at: today.toISOString() });
  expect(fakeInsert.error?.message).toContain('Zurück zum Entwurf');
  // Fremde Rechnung
  const other = await createUser('zurueck-entwurf-anderer', cleanup);
  const foreign = await other.client.rpc('reopen_invoice', { p_invoice: byNumber('001') });
  expect(foreign.error?.message).toContain('nicht gefunden');
  const storno = await client.rpc('cancel_invoice', { p_invoice: byNumber('004'), p_number: `${year}-005`, p_date: iso });
  expect(storno.error).toBeNull();
  for (const id of [byNumber('004'), storno.data!]) {
    const r = await client.rpc('reopen_invoice', { p_invoice: id });
    expect(r.error?.message).toContain('Nur offene');
  }

  await login(page, email);

  // Knopf nur, wo es erlaubt ist
  await page.goto(`/rechnungen/${byNumber('002')}`);
  await expect(page.getByRole('heading', { name: new RegExp(`${year}-002`) })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zurück zum Entwurf' })).toHaveCount(0);
  // Viele Knöpfe: nichts wird abgeschnitten
  await expect(page.getByRole('button', { name: 'Stornieren' })).toBeInViewport({ ratio: 1 });

  await page.goto(`/rechnungen/${byNumber('001')}`);
  await page.getByRole('button', { name: 'Zurück zum Entwurf' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rechnung zurück zum Entwurf?' });
  const confirm = dialog.getByRole('button', { name: 'Zurück zum Entwurf' });
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByText(/schon überfällig/)).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: /noch niemandem gegeben oder geschickt/ }).check();
  await confirm.click();

  // Editor mit gleicher Nummer: ausbessern und wieder ausstellen
  await expect(page.getByLabel(/Nummer$/)).toHaveValue(`${year}-001`, { timeout: 20_000 });
  await expect(page.getByLabel(/Nummer$/)).not.toBeEditable();
  await expect(page.getByText(/war schon ausgestellt/)).toBeVisible();
  await page.getByPlaceholder('z. B. Website-Gestaltung').fill('Beratung');
  await page.getByRole('button', { name: 'Ausstellen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Jetzt ausstellen' }).click();
  // Wieder die Detailansicht: auch die Knöpfe sind wieder da
  await expect(page.getByRole('button', { name: 'Zurück zum Entwurf' })).toBeVisible({ timeout: 20_000 });
  // (Art folgt beim Entwurf dem aktuellen Profil – der Testnutzer stellt Honorarnoten aus)
  await expect(page.getByRole('heading', { name: `Honorarnote ${year}-001` })).toBeVisible();
  await expect(page.getByText('Beratung', { exact: true }).first()).toBeVisible();

  const { data: after } = await client.from('invoices').select('invoice_number, status, reopened_at, line_items').eq('id', byNumber('001')).single();
  expect(after).toMatchObject({ invoice_number: `${year}-001`, status: 'sent' });
  expect(after!.reopened_at).not.toBeNull();
  expect((after!.line_items as { description: string }[])[0]!.description).toBe('Beratung');
  // Keine zusätzliche Stornorechnung (nur die aus dem Schutz-Test oben)
  const { count } = await client.from('invoices').select('id', { count: 'exact', head: true }).not('cancels_invoice_id', 'is', null);
  expect(count).toBe(1);
});
