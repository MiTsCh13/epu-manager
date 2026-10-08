// Beleg auslesen: Foto/PDF → Claude → Felder + Kategorie-Vorschlag für das Ausgaben-Formular.
// Der Beleg wird hier nicht gespeichert (das passiert erst beim Speichern der Ausgabe im Bucket „receipts“).
// Jeder Lesevorgang landet in receipt_scans – für das Tageslimit und die Kostenkontrolle.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildSchema,
  buildUserText,
  DAILY_LIMIT,
  GLOBAL_DAILY_LIMIT,
  MAX_BODY_BYTES,
  MODEL,
  normalizeResult,
  parseRequest,
  SYSTEM_PROMPT,
  type ImageType,
} from './receipt.ts';

// Ein Beleg dauert 5–20 s – lieber früh abbrechen als in das Zeitlimit der Edge Function laufen
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 60_000, maxRetries: 1 });

/** Service-Role-Client: umgeht RLS – nur serverseitig verwenden. */
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// Gleiche CORS-/Antwort-Helfer wie in _shared/stripe.ts – dort hängen sie am Stripe-Client, den wir hier nicht brauchen
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lesevorgang vorab als „pending“ eintragen und erst dann zählen – so zählen auch gleichzeitige Anfragen sofort.
 * Gibt die ID zurück oder eine Fehlerantwort (Limit erreicht bzw. Protokoll nicht möglich).
 */
async function reserveScan(userId: string): Promise<{ id: string } | { response: Response }> {
  const busy = () => ({ response: json({ error: 'Klaro kann den Beleg gerade nicht lesen. Bitte versuche es später erneut.' }, 500) });
  const { data, error } = await admin.from('receipt_scans').insert({ user_id: userId, status: 'pending', model: MODEL }).select('id').single();
  if (error || !data) {
    console.error('read-receipt: Protokoll fehlgeschlagen', error);
    return busy();
  }
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [mine, all] = await Promise.all([
    admin.from('receipt_scans').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
    admin.from('receipt_scans').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ]);
  if (mine.error || all.error) {
    console.error('read-receipt: Limit-Abfrage fehlgeschlagen', mine.error ?? all.error);
    await releaseScan(data.id);
    return busy();
  }
  if ((mine.count ?? 0) > DAILY_LIMIT) {
    await releaseScan(data.id);
    return {
      response: json({ error: `Du hast in den letzten 24 Stunden schon ${DAILY_LIMIT} Belege auslesen lassen. Bitte trag diesen Beleg selbst ein oder versuche es morgen wieder.` }, 429),
    };
  }
  if ((all.count ?? 0) > GLOBAL_DAILY_LIMIT) {
    console.error('read-receipt: globales Tageslimit erreicht');
    await releaseScan(data.id);
    return { response: json({ error: 'Das Auslesen von Belegen ist heute ausgelastet. Bitte trag den Beleg selbst ein oder versuche es morgen wieder.' }, 429) };
  }
  return { id: data.id };
}

/** Vorgang ohne Kosten (abgelehnt, Anthropic nicht erreichbar) – zählt nicht gegen das Limit. */
async function releaseScan(id: string) {
  await admin.from('receipt_scans').delete().eq('id', id);
}

async function finishScan(id: string, status: 'ok' | 'refusal' | 'error', model: string, usage: { input_tokens: number; output_tokens: number }) {
  const { error } = await admin
    .from('receipt_scans')
    .update({ status, model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens })
    .eq('id', id);
  if (error) console.error('read-receipt: Protokoll fehlgeschlagen', error);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user) return json({ error: 'Nicht angemeldet.' }, 401);

  // Größe vor dem Einlesen prüfen – der Body landet sonst komplett im Speicher
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'Der Beleg ist größer als 5 MB.' }, 413);
  const parsed = parseRequest(await req.json().catch(() => null));
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  // Tageslimit (rollierend 24 h) – schützt vor Kostenexplosion bei Fehlern oder Missbrauch
  const reserved = await reserveScan(user.id);
  if ('response' in reserved) return reserved.response;
  const scanId = reserved.id;

  const categoryIds = parsed.categories.map((c) => c.id);
  const document =
    parsed.mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: parsed.data } }
      : {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: parsed.mediaType as ImageType, data: parsed.data },
        };

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // Lehnt das Modell ab, springt serverseitig das von Anthropic empfohlene Ersatzmodell ein
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: buildSchema(categoryIds) } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [document, { type: 'text', text: buildUserText(parsed.categories, parsed.today) }] }],
    });

    if (response.stop_reason === 'refusal') {
      await finishScan(scanId, 'refusal', response.model, response.usage);
      return json({ error: 'Diesen Beleg konnte Klaro nicht auslesen. Bitte trag ihn selbst ein.' }, 422);
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    if (response.stop_reason === 'max_tokens' || !textBlock || textBlock.type !== 'text') {
      await finishScan(scanId, 'error', response.model, response.usage);
      return json({ error: 'Klaro konnte den Beleg nicht vollständig lesen. Bitte trag ihn selbst ein.' }, 502);
    }

    const result = normalizeResult(JSON.parse(textBlock.text), categoryIds);
    await finishScan(scanId, 'ok', response.model, response.usage);
    return json({ result });
  } catch (e) {
    // Ohne Antwort von Anthropic sind keine Kosten entstanden → zählt nicht gegen das Limit
    await releaseScan(scanId);
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
      console.error('read-receipt: Anthropic überlastet', e.status);
      return json({ error: 'Klaro ist gerade ausgelastet. Bitte versuche es in einer Minute erneut.' }, 503);
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error('read-receipt: Anfrage abgelehnt', e.message);
      return json({ error: 'Diesen Beleg konnte Klaro nicht lesen – ist die Datei vielleicht beschädigt oder passwortgeschützt?' }, 422);
    }
    console.error('read-receipt', e);
    return json({ error: 'Klaro kann den Beleg gerade nicht lesen. Bitte versuche es später erneut.' }, 500);
  }
});
