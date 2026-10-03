// Abo-Status (Testphase / aktiv / abgelaufen) für Anzeige und Paywall
import type { SubscriptionStatus } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessState =
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
): AccessState {
  const status = profile.subscription_status as SubscriptionStatus;
  if (status === 'active') return { kind: 'active' };
  if (status === 'trial') {
    const daysLeft = getTrialDaysLeft(profile.trial_ends_at, now);
    if (daysLeft > 0) return { kind: 'trial', daysLeft };
  }
  return { kind: 'expired' };
}
