// Stripe Checkout & Kundenportal über Supabase Edge Functions (Secret Key bleibt serverseitig)
import { supabase } from './supabase';

async function redirectTo(fn: 'create-checkout-session' | 'create-portal-session', fallback: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(fn, { method: 'POST' });
  if (error || !data?.url) {
    // Fehlermeldung der Function (deutsch) bevorzugen
    const ctx = (error as { context?: Response } | null)?.context;
    const body = ctx ? await ctx.json().catch(() => null) : null;
    return (body as { error?: string } | null)?.error ?? data?.error ?? fallback;
  }
  window.location.assign(data.url);
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
