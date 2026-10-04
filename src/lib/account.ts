// Konto: Passwort ändern und Konto löschen (DSGVO Art. 17)
import { invokeFunction } from './functions';
import { supabase } from './supabase';
import { translateAuthError } from './validation';

export const DELETE_CONFIRM_WORD = 'LÖSCHEN';

type AccountResult = { field?: 'current' | 'password'; error: string } | null;

/** Aktuelles Passwort prüfen (erneute Anmeldung) – schützt vor Änderungen an einem offen gelassenen Gerät. */
async function verifyPassword(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return null;
  return error.message.toLowerCase().includes('invalid login credentials')
    ? 'Dein aktuelles Passwort stimmt nicht.'
    : translateAuthError(error.message);
}

export async function changePassword(email: string, current: string, next: string): Promise<AccountResult> {
  const wrong = await verifyPassword(email, current);
  if (wrong) return { field: 'current', error: wrong };
  const { error } = await supabase.auth.updateUser({ password: next });
  return error ? { error: translateAuthError(error.message) } : null;
}

export async function deleteAccount(email: string, password: string): Promise<AccountResult> {
  const wrong = await verifyPassword(email, password);
  if (wrong) return { field: 'password', error: wrong };
  const result = await invokeFunction<{ deleted: boolean }>(
    'delete-account',
    'Dein Konto konnte nicht gelöscht werden. Bitte versuche es erneut.',
    { confirm: DELETE_CONFIRM_WORD },
  );
  if (result.error !== null) return { error: result.error };
  // Nutzer existiert nicht mehr – nur noch die lokale Sitzung entfernen
  await supabase.auth.signOut({ scope: 'local' });
  return null;
}
