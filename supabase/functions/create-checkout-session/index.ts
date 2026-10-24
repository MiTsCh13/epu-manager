// Startet Stripe Checkout für „Klaro Pro“ (19 €/Monat) und liefert die Checkout-URL.
import { admin, ALLOWED_ORIGINS, appOrigin, getUser, json, stripe } from '../_shared/stripe.ts';
import { withCors } from '../_shared/cors.ts';

Deno.serve(withCors(ALLOWED_ORIGINS, async (req) => {
  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Nicht angemeldet.' }, 401);

    const { data: profile, error } = await admin
      .from('profiles')
      .select('stripe_customer_id, full_name, business_name, subscription_status')
      .eq('id', user.id)
      .single();
    if (error || !profile) return json({ error: 'Profil nicht gefunden.' }, 404);
    if (profile.subscription_status === 'active') return json({ error: 'Du hast Klaro Pro bereits abonniert.' }, 409);

    // Stripe-Kunde einmalig anlegen und am Profil merken
    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile.business_name || profile.full_name || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const origin = appOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID')!, quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${origin}/einstellungen?abo=erfolg`,
      cancel_url: `${origin}/einstellungen?abo=abgebrochen`,
      locale: 'de',
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_update: { address: 'auto', name: 'auto' },
      tax_id_collection: { enabled: true },
    });
    return json({ url: session.url });
  } catch (e) {
    console.error('checkout', e);
    return json({ error: 'Der Bezahlvorgang konnte nicht gestartet werden.' }, 500);
  }
}));
