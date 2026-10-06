// Links aus den Auth-Mails (Bestätigung, Passwort zurücksetzen, Magic Link, E-Mail ändern, Einladung).
// Die Vorlagen in supabase/templates verlinken auf {{ .SiteURL }}/auth/bestaetigen?token_hash=…&type=…;
// die App löst den Link per verifyOtp ein – das klappt auch, wenn die Mail auf einem anderen Gerät geöffnet wird.
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { translateAuthError } from './validation';

export const CONFIRM_PATH = '/auth/bestaetigen';
export const NEW_PASSWORD_PATH = '/passwort-neu';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];

export interface ConfirmLink {
  tokenHash: string;
  type: EmailOtpType;
}

/** token_hash und type aus der Adresse lesen – null, wenn der Link unvollständig ist. */
export function parseConfirmLink(search: string): ConfirmLink | null {
  const params = new URLSearchParams(search);
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  if (!tokenHash || !type || !OTP_TYPES.includes(type)) return null;
  return { tokenHash, type };
}

/**
 * Fehler, die Supabase bei Links über /auth/v1/verify (Standardvorlagen) an die Adresse hängt,
 * z. B. #error=access_denied&error_code=otp_expired&error_description=…
 */
export function parseLinkError(hash: string, search: string): string | null {
  for (const part of [hash.replace(/^#/, ''), search.replace(/^\?/, '')]) {
    const params = new URLSearchParams(part);
    const message = params.get('error_description') ?? params.get('error_code') ?? params.get('error');
    if (message) return message;
  }
  return null;
}

/** Wohin es nach dem eingelösten Link weitergeht. */
export function destinationFor(type: EmailOtpType): string {
  switch (type) {
    case 'recovery':
    case 'invite':
      return NEW_PASSWORD_PATH; // erst ein (neues) Passwort festlegen
    case 'email_change':
      return '/einstellungen';
    case 'magiclink':
      return '/';
    default:
      return '/onboarding'; // Setup-Seite; wer schon eingerichtet ist, landet von dort auf dem Dashboard
  }
}

// Merker „kam über einen Passwort-Link“: nur dann darf /passwort-neu ohne das aktuelle Passwort ändern.
// Sonst könnte jemand an einem offen gelassenen Gerät einfach /passwort-neu aufrufen.
const PASSWORD_LINK_KEY = 'klaro-password-link';

export function markPasswordLink(): void {
  try {
    sessionStorage.setItem(PASSWORD_LINK_KEY, '1');
  } catch {
    // ohne sessionStorage (z. B. privater Modus mit Sperre) bleibt /passwort-neu gesperrt – dann hilft „Passwort ändern“ in den Einstellungen
  }
}

export function hasPasswordLink(): boolean {
  try {
    return sessionStorage.getItem(PASSWORD_LINK_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearPasswordLink(): void {
  try {
    sessionStorage.removeItem(PASSWORD_LINK_KEY);
  } catch {
    // nichts zu tun
  }
}

// Die Vorlagen bauen ihre Links auf {{ .SiteURL }} auf. Die Redirect-Adresse geben wir trotzdem mit:
// Supabase prüft sie gegen die Allowlist, und mit den Standardvorlagen landet der Link so ebenfalls hier.
export function confirmRedirectUrl(): string {
  return `${window.location.origin}${CONFIRM_PATH}`;
}

/** Bestätigungsmail erneut schicken. Gibt eine Fehlermeldung zurück oder null. */
export async function resendConfirmation(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: confirmRedirectUrl() },
  });
  return error ? translateAuthError(error.message) : null;
}

/**
 * Mail zum Zurücksetzen des Passworts schicken. Gibt eine Fehlermeldung zurück oder null.
 * Wartezeit-Fehler zählen als Erfolg: Supabase meldet sie nur für bestehende Konten – sonst
 * ließe sich mit einer zweiten Anfrage herausfinden, ob es zu einer Adresse ein Konto gibt.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: confirmRedirectUrl() });
  if (!error || isSendLimitError(error.message)) return null;
  return translateAuthError(error.message);
}

export function isSendLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('security purposes') || m.includes('rate limit');
}
