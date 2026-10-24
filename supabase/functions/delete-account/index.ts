// Konto löschen (DSGVO Art. 17): Abo beenden, Belegfotos, Logos und alle Daten löschen, Auth-Nutzer entfernen.
// Der Stripe-Kunde bleibt bestehen – Zahlungsbelege des Abos unterliegen der Aufbewahrungspflicht (§ 132 BAO).
import { admin, ALLOWED_ORIGINS, getUser, json, stripe } from '../_shared/stripe.ts';
import { withCors } from '../_shared/cors.ts';

// Belege sowie Logos und Kopfbilder der Rechnungs-Vorlagen
const BUCKETS = ['receipts', 'branding'];
const CONFIRM_WORD = 'LÖSCHEN';

/** Laufende Abos sofort beenden – schlägt das fehl, wird nichts gelöscht (sonst liefe die Zahlung weiter). */
async function cancelSubscriptions(customerId: string) {
  for await (const sub of stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
    if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
      await stripe.subscriptions.cancel(sub.id);
    }
  }
}

/** Alle Dateien im Ordner des Nutzers löschen (Storage lässt sich nicht per SQL leeren). */
async function deleteFiles(bucket: string, userId: string) {
  for (let round = 0; round < 100; round++) {
    const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
    if (error) throw error;
    if (!data || data.length === 0) return;
    const { error: removeError } = await admin.storage.from(bucket).remove(data.map((f) => `${userId}/${f.name}`));
    if (removeError) throw removeError;
  }
  throw new Error(`Dateien in ${bucket} konnten nicht vollständig gelöscht werden`);
}

Deno.serve(withCors(ALLOWED_ORIGINS, async (req) => {
  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Nicht angemeldet.' }, 401);
    const body = (await req.json().catch(() => null)) as { confirm?: string } | null;
    if (body?.confirm !== CONFIRM_WORD) return json({ error: 'Bitte bestätige die Löschung.' }, 400);

    const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
    if (profile?.stripe_customer_id) await cancelSubscriptions(profile.stripe_customer_id);

    for (const bucket of BUCKETS) await deleteFiles(bucket, user.id);

    const { error: dataError } = await admin.rpc('delete_user_data', { p_user: user.id });
    if (dataError) throw dataError;

    const { error: authError } = await admin.auth.admin.deleteUser(user.id);
    if (authError) throw authError;

    return json({ deleted: true });
  } catch (e) {
    console.error('delete-account', e);
    return json({ error: 'Dein Konto konnte nicht gelöscht werden. Bitte versuche es erneut oder schreib uns.' }, 500);
  }
}));
