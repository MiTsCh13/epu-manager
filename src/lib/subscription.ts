// Abo-Status (Testphase / aktiv / abgelaufen) für Anzeige und Paywall
import type { SubscriptionStatus } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Abo-Pflicht eingeschaltet? Solange nicht, ist Klaro kostenlos und unbegrenzt nutzbar
 * (keine Testphase, kein Abo-Hinweis, keine Paywall). Einschalten: VITE_BILLING_ENABLED=true
 * und in der Datenbank has_active_access() wieder auf die Abo-Prüfung umstellen.
 */
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === 'true';

export type AccessState =
  | { kind: 'free' }
  | { kind: 'active' }
  | { kind: 'trial'; daysLeft: number }
  | { kind: 'expired' };

/** Verbleibende Testtage (aufgerundet, nie negativ). */
export function getTrialDaysLeft(trialEndsAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / DAY_MS));
}

export function getAccessState(
  profile: { subscription_status: string; trial_ends_at: string },
  now: Date = new Date(),
  billingEnabled: boolean = BILLING_ENABLED,
): AccessState {
  if (!billingEnabled) return { kind: 'free' };
  const status = profile.subscription_status as SubscriptionStatus;
  if (status === 'active') return { kind: 'active' };
  if (status === 'trial') {
    const daysLeft = getTrialDaysLeft(profile.trial_ends_at, now);
    if (daysLeft > 0) return { kind: 'trial', daysLeft };
  }
  return { kind: 'expired' };
}
