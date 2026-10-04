// Stripe Checkout & Kundenportal über Supabase Edge Functions (Secret Key bleibt serverseitig)
import { invokeFunction } from './functions';

async function redirectTo(fn: 'create-checkout-session' | 'create-portal-session', fallback: string): Promise<string | null> {
  const result = await invokeFunction<{ url?: string }>(fn, fallback);
  if (result.error !== null || !result.data.url) return result.error ?? fallback;
  window.location.assign(result.data.url);
  return null;
}

/** Leitet zu Stripe Checkout weiter. Liefert eine Fehlermeldung oder null. */
export function startCheckout(): Promise<string | null> {
  return redirectTo('create-checkout-session', 'Der Bezahlvorgang konnte nicht gestartet werden.');
}

/** Öffnet das Stripe-Kundenportal (Zahlungsmethode, Rechnungen, Kündigung). */
export function openBillingPortal(): Promise<string | null> {
  return redirectTo('create-portal-session', 'Die Abo-Verwaltung konnte nicht geöffnet werden.');
}
