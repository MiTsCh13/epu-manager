// Flow 16: Rechnung stornieren – Stornorechnung mit eigener Nummer, Original storniert, optional korrigierter Entwurf
import { completeProfile, createUser, expect, login, parseEuro, test } from './support';

test('Offene und bezahlte Rechnung stornieren, Schutz in der Datenbank', async ({ page, cleanup }) => {
  const { email, client } = await createUser('stornieren', cleanup);
  await completeProfile(client);
  const { data: kunde } = await client.from('clients').insert({ name: 'Tischlerei Holz', address: 'Ring 3', zip_code: '8010', city: 'Graz' }).select('id').single();
  const today = new Date();
  const year = today.getFullYear();
  const iso = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const line = [{ description: 'Beratung', quantity: 2, unit_price: 240, total: 480 }];
  const { data: rows, error } = await client
    .from('invoices')
    .insert([
      { client_id: kunde!.id, invoice_number: `${year}-001`, invoice_date: iso, service_date_from: iso, status: 'paid', paid_at: today.toISOString(), line_items: line },
      { client_id: kunde!.id, invoice_number: `${year}-002`, invoice_date: iso, service_date_from: iso, due_date: iso, status: 'sent', line_items: line },
      { client_id: kunde!.id, invoice_number: `${year}-003`, invoice_date: iso, status: 'draft', line_items: line },
    ])
    .select('id, invoice_number');
  expect(error).toBeNull();
  const [paid, open, draft] = [`${year}-001`, `${year}-002`, `${year}-003`].map((n) => rows!.find((r) => r.invoice_number === n)!);

  // Datenbank: keine Stornorechnung direkt anlegen, kein „storniert“ per Update, Entwürfe nicht stornierbar
  const direct = await client.from('invoices').insert({ cancels_invoice_id: open!.id, invoice_number: 'X-1', invoice_date: iso, status: 'paid' });
  expect(direct.error?.message).toContain('Stornieren');
  const flag = await client.from('invoices').update({ status: 'cancelled' }).eq('id', open!.id);
  expect(flag.error).not.toBeNull();
  const asCancelled = await client.from('invoices').insert({ invoice_number: 'X-4', invoice_date: iso, status: 'cancelled' });
  expect(asCancelled.error?.message).toContain('Stornieren');
  const fakeRef = await client.from('invoices').update({ cancels_invoice_number: '1' }).eq('id', draft!.id);
  expect(fakeRef.error?.message).toContain('Stornieren');
  const future = await client.rpc('cancel_invoice', { p_invoice: open!.id, p_number: 'X-5', p_date: `${year + 1}-12-31` });
  expect(future.error?.message).toContain('Datum');
  const draftCancel = await client.rpc('cancel_invoice', { p_invoice: draft!.id, p_number: 'X-2', p_date: iso });
  expect(draftCancel.error?.message).toContain('kann nicht storniert werden');

  await login(page, email);

  // Offene Rechnung stornieren, ohne korrigierte Rechnung
  await page.goto(`/rechnungen/${open!.id}`);
  await page.getByRole('button', { name: 'Stornieren' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(`mit der Nummer ${year}-004`)).toBeVisible();
  await dialog.getByLabel(/korrigierte Rechnung anlegen/).uncheck();
  await dialog.getByRole('button', { name: 'Stornieren' }).click();
  await expect(page.getByRole('heading', { name: `Stornorechnung ${year}-004` })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`Rechnung ${year}-002`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stornieren' })).toHaveCount(0);

  const { data: afterOpen } = await client.from('invoices').select('invoice_number, status, total, cancelled_at, cancels_invoice_number, client_snapshot').in('invoice_number', [`${year}-002`, `${year}-004`]).order('invoice_number');
  expect(afterOpen![0]).toMatchObject({ status: 'cancelled' });
  expect(afterOpen![0]!.cancelled_at).not.toBeNull();
  expect(afterOpen![1]).toMatchObject({ status: 'cancelled', total: -480, cancels_invoice_number: `${year}-002` });
  expect((afterOpen![1]!.client_snapshot as { name: string }).name).toBe('Tischlerei Holz');

  // Zur stornierten Rechnung: Status + Link zur Stornorechnung, nicht mehr „als bezahlt markieren“
  await page.getByRole('link', { name: `Rechnung ${year}-002` }).click();
  await expect(page.getByText('Storniert', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Stornorechnung ${year}-004` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Als bezahlt markieren' })).toHaveCount(0);

  // Bezahlte Rechnung stornieren, mit korrigiertem Entwurf
  await page.goto(`/rechnungen/${paid!.id}`);
  await page.getByRole('button', { name: 'Stornieren' }).click();
  await expect(dialog.getByText('als Minus-Einnahme')).toBeVisible();
  await dialog.getByRole('button', { name: 'Stornieren' }).click();
  await expect(page.getByPlaceholder('z. B. Website-Gestaltung')).toHaveValue('Beratung', { timeout: 20_000 });
  await expect(page.getByLabel(/Nummer$/)).toHaveValue(`${year}-006`);

  const { data: afterPaid } = await client.from('invoices').select('invoice_number, status, total, paid_at, cancelled_at').in('invoice_number', [`${year}-001`, `${year}-005`, `${year}-006`]).order('invoice_number');
  expect(afterPaid![0]).toMatchObject({ status: 'paid' });
  expect(afterPaid![0]!.cancelled_at).not.toBeNull();
  expect(afterPaid![1]).toMatchObject({ status: 'paid', total: -480 });
  expect(afterPaid![1]!.paid_at).not.toBeNull();
  expect(afterPaid![2]).toMatchObject({ status: 'draft' });

  // Zweites Mal stornieren geht nicht
  const again = await client.rpc('cancel_invoice', { p_invoice: paid!.id, p_number: 'X-3', p_date: iso });
  expect(again.error?.message).toContain('kann nicht storniert werden');

  // Einnahmen: bezahlt + Storno = 0
  await page.goto('/rechnungen');
  await expect(page.getByTestId('invoices-earned')).toBeVisible();
  expect(parseEuro((await page.getByTestId('invoices-earned').textContent()) ?? '')).toBe(0);
});
