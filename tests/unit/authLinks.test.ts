import { describe, expect, it, vi } from 'vitest';

// authLinks spricht für resend/reset mit Supabase – hier geht es nur um die reine Link-Logik
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const { destinationFor, isSendLimitError, parseConfirmLink, parseLinkError, NEW_PASSWORD_PATH } = await import('@/lib/authLinks');

describe('parseConfirmLink', () => {
  it('liest token_hash und type aus dem Link der Vorlage', () => {
    expect(parseConfirmLink('?token_hash=abc123&type=email')).toEqual({ tokenHash: 'abc123', type: 'email' });
    expect(parseConfirmLink('?type=recovery&token_hash=x')).toEqual({ tokenHash: 'x', type: 'recovery' });
  });

  it('lehnt unvollständige oder unbekannte Links ab', () => {
    expect(parseConfirmLink('')).toBeNull();
    expect(parseConfirmLink('?token_hash=abc')).toBeNull();
    expect(parseConfirmLink('?type=email')).toBeNull();
    expect(parseConfirmLink('?token_hash=abc&type=sms')).toBeNull();
  });
});

describe('parseLinkError', () => {
  it('liest Fehler von Supabase aus Hash oder Query', () => {
    expect(parseLinkError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', '')).toBe(
      'Email link is invalid or has expired',
    );
    expect(parseLinkError('', '?error=access_denied&error_code=otp_expired')).toBe('otp_expired');
    expect(parseLinkError('#error=server_error', '')).toBe('server_error');
  });

  it('ohne Fehler: null', () => {
    expect(parseLinkError('', '')).toBeNull();
    expect(parseLinkError('#access_token=abc&type=signup', '?token_hash=x&type=email')).toBeNull();
  });
});

describe('destinationFor', () => {
  it('Bestätigung → Setup-Seite, Passwort-Links → neues Passwort', () => {
    expect(destinationFor('email')).toBe('/onboarding');
    expect(destinationFor('signup')).toBe('/onboarding');
    expect(destinationFor('recovery')).toBe(NEW_PASSWORD_PATH);
    expect(destinationFor('invite')).toBe(NEW_PASSWORD_PATH);
    expect(destinationFor('email_change')).toBe('/einstellungen');
    expect(destinationFor('magiclink')).toBe('/');
  });
});

describe('isSendLimitError', () => {
  it('erkennt Wartezeit- und Limit-Fehler (zählen bei „Passwort vergessen“ als Erfolg)', () => {
    expect(isSendLimitError('For security purposes, you can only request this after 52 seconds.')).toBe(true);
    expect(isSendLimitError('Email rate limit exceeded')).toBe(true);
    expect(isSendLimitError('Failed to fetch')).toBe(false);
  });
});
