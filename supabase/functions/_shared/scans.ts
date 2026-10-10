// Gemeinsame Helfer für die Lese-Functions mit Claude (read-receipt, read-invoice-design):
// Anmeldung, Antworten, Tageslimit und Protokoll in receipt_scans (je Art getrennt gezählt).
import { createClient } from 'npm:@supabase/supabase-js@2';

/** Service-Role-Client: umgeht RLS – nur serverseitig verwenden. */
export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export async function getUserId(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

export type ScanKind = 'receipt' | 'invoice_design';

/**
 * Anthropic-Guthaben aufgebraucht: Anthropic antwortet mit 400 „credit balance is too low“. Das ist kein Fehler der
 * Datei, sondern betrifft alle – deshalb eigene Meldung (503) und ein eindeutiger Log-Eintrag.
 */
export function isBillingError(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  const message = e instanceof Error ? e.message : '';
  return status === 400 && /credit balance/i.test(message);
}

export const UNAVAILABLE = 'Das automatische Auslesen ist gerade vorübergehend nicht verfügbar. Bitte versuche es später erneut.';

const DAY_MS = 24 * 60 * 60 * 1000;
// Über alle Konten und beide Arten – Notbremse für die Kosten (≈ 20–40 $ pro Tag)
export const GLOBAL_DAILY_LIMIT = 1000;

/**
 * Lesevorgang vorab als „pending“ eintragen und erst dann zählen – so zählen auch gleichzeitige Anfragen sofort.
 * Gibt die ID zurück oder eine Fehlerantwort (Limit erreicht bzw. Protokoll nicht möglich).
 */
export async function reserveScan(
  userId: string,
  kind: ScanKind,
  model: string,
  limits: { daily: number; busy: string; userLimit: string; globalLimit: string },
): Promise<{ id: string } | { response: Response }> {
  const busy = () => ({ response: json({ error: limits.busy }, 500) });
  const { data, error } = await admin.from('receipt_scans').insert({ user_id: userId, kind, status: 'pending', model }).select('id').single();
  if (error || !data) {
    console.error(`${kind}: Protokoll fehlgeschlagen`, error);
    return busy();
  }
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [mine, all] = await Promise.all([
    admin.from('receipt_scans').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', kind).gte('created_at', since),
    admin.from('receipt_scans').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ]);
  if (mine.error || all.error) {
    console.error(`${kind}: Limit-Abfrage fehlgeschlagen`, mine.error ?? all.error);
    await releaseScan(data.id);
    return busy();
  }
  if ((mine.count ?? 0) > limits.daily) {
    await releaseScan(data.id);
    return { response: json({ error: limits.userLimit }, 429) };
  }
  if ((all.count ?? 0) > GLOBAL_DAILY_LIMIT) {
    console.error(`${kind}: globales Tageslimit erreicht`);
    await releaseScan(data.id);
    return { response: json({ error: limits.globalLimit }, 429) };
  }
  return { id: data.id };
}

/** Vorgang ohne Kosten (abgelehnt, Anthropic nicht erreichbar) – zählt nicht gegen das Limit. */
export async function releaseScan(id: string) {
  await admin.from('receipt_scans').delete().eq('id', id);
}

export async function finishScan(id: string, status: 'ok' | 'refusal' | 'error', model: string, usage: { input_tokens: number; output_tokens: number }) {
  const { error } = await admin
    .from('receipt_scans')
    .update({ status, model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens })
    .eq('id', id);
  if (error) console.error('Protokoll fehlgeschlagen', error);
}
