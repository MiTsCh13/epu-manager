// Stripe-Webhook: hält profiles.subscription_status aktuell. Signatur wird geprüft; kein JWT (Stripe ruft auf).
import Stripe from 'npm:stripe@17.7.0';
import { admin, stripe } from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

/** Stripe-Status → Klaro-Status ('active' | 'expired'); null = unverändert lassen. */
function mapStatus(status: Stripe.Subscription.Status): 'active' | 'expired' | null {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due': // Zahlung wird erneut versucht – Zugang vorerst behalten
      return 'active';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'expired';
    default:
      return null; // incomplete, paused
  }
}

async function syncSubscription(sub: Stripe.Subscription) {
  const status = mapStatus(sub.status);
  if (!status) return;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const periodEnd = sub.items.data[0]?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const update = {
    subscription_status: status,
    stripe_customer_id: customerId,
    subscription_renews_at: status === 'active' && periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    subscription_cancel_at_period_end: status === 'active' ? sub.cancel_at_period_end : false,
  };
  // Zuordnung über die Kunden-ID, sonst über die user_id in den Metadaten
  const { data } = await admin.from('profiles').update(update).eq('stripe_customer_id', customerId).select('id');
  if ((!data || data.length === 0) && sub.metadata?.user_id) {
    await admin.from('profiles').update(update).eq('id', sub.metadata.user_id);
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Signatur fehlt', { status: 400 });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, cryptoProvider);
  } catch (e) {
    console.error('Ungültige Signatur', e);
    return new Response('Ungültige Signatur', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          if (!sub.metadata?.user_id && session.client_reference_id) sub.metadata = { ...sub.metadata, user_id: session.client_reference_id };
          await syncSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Webhook-Verarbeitung fehlgeschlagen', event.type, e);
    return new Response('Fehler', { status: 500 }); // Stripe versucht es erneut
  }
});
