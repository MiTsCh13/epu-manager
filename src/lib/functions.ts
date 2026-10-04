// Aufruf von Supabase Edge Functions mit deutscher Fehlermeldung
import { supabase } from './supabase';

/** Ruft eine Edge Function auf. Bei Fehlern wird die (deutsche) Meldung der Function bevorzugt. */
export async function invokeFunction<T>(
  name: string,
  fallbackError: string,
  body?: Record<string, unknown>,
): Promise<{ data: T; error: null } | { data: null; error: string }> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(name, { method: 'POST', body });
  if (error || !data || data.error) {
    const ctx = (error as { context?: Response } | null)?.context;
    const errorBody = ctx ? await ctx.json().catch(() => null) : null;
    return { data: null, error: (errorBody as { error?: string } | null)?.error ?? data?.error ?? fallbackError };
  }
  return { data, error: null };
}
