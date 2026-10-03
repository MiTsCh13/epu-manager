import { describe, expect, it } from 'vitest';
import { getAccessState, getTrialDaysLeft } from '@/lib/subscription';

const now = new Date('2026-10-03T12:00:00Z');

describe('getTrialDaysLeft', () => {
  it('rundet angebrochene Tage auf', () => {
    expect(getTrialDaysLeft('2026-10-17T12:00:00Z', now)).toBe(14);
    expect(getTrialDaysLeft('2026-10-03T13:00:00Z', now)).toBe(1);
  });
  it('nie negativ', () => expect(getTrialDaysLeft('2026-09-01T00:00:00Z', now)).toBe(0));
  it('verwendet standardmäßig jetzt', () => expect(getTrialDaysLeft('2000-01-01T00:00:00Z')).toBe(0));
});

describe('getAccessState', () => {
  it('aktives Abo', () => {
    expect(getAccessState({ subscription_status: 'active', trial_ends_at: '2000-01-01' }, now)).toEqual({ kind: 'active' });
  });
  it('laufende Testphase', () => {
    expect(getAccessState({ subscription_status: 'trial', trial_ends_at: '2026-10-10T12:00:00Z' }, now)).toEqual({
      kind: 'trial',
      daysLeft: 7,
    });
  });
  it('abgelaufene Testphase', () => {
    expect(getAccessState({ subscription_status: 'trial', trial_ends_at: '2026-10-01T00:00:00Z' }, now)).toEqual({
      kind: 'expired',
    });
  });
  it('Status expired', () => {
    expect(getAccessState({ subscription_status: 'expired', trial_ends_at: '2099-01-01' })).toEqual({ kind: 'expired' });
  });
});
