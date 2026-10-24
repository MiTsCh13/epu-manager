// Öffnet das Stripe-Kundenportal (Zahlungsmethode, Rechnungen, Kündigung).
import { admin, ALLOWED_ORIGINS, appOrigin, getUser, json, stripe } from '../_shared/stripe.ts';
import { withCors } from '../_shared/cors.ts';

Deno.serve(withCors(ALLOWED_ORIGINS, async (req) => {
  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Nicht angemeldet.' }, 401);
    const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
    if (!profile?.stripe_customer_id) return json({ error: 'Noch kein Abo vorhanden.' }, 404);

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appOrigin(req)}/einstellungen`,
      locale: 'de',
    });
    return json({ url: session.url });
  } catch (e) {
    console.error('portal', e);
    return json({ error: 'Die Abo-Verwaltung konnte nicht geöffnet werden.' }, 500);
  }
}));
