// Assistent: ein Satz (gesprochen oder getippt) → Claude → Vorschlag für Fahrt (Kilometergeld) oder Rechnung.
// Gespeichert wird hier nichts – die App öffnet das passende Formular vorausgefüllt, die Person prüft und speichert.
// Jeder Befehl landet in receipt_scans (kind „assistant“) – für das Tageslimit und die Kostenkontrolle.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { admin, ALLOWED_ORIGINS, finishScan, getUserId, isBillingError, json, releaseScan, reserveScan } from '../_shared/scans.ts';
import { withCors } from '../_shared/cors.ts';
import { buildSchema, buildUserText, DAILY_LIMIT, MAX_BODY_BYTES, MODEL, normalizeResult, parseRequest, SYSTEM_PROMPT, type AssistantResult } from './assistant.ts';
import { findRoute, profileAddress } from './routing.ts';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 30_000, maxRetries: 1 });

const ORS_API_KEY = Deno.env.get('ORS_API_KEY');

/**
 * Fahrt ohne genannte Kilometer: Strecke über OpenRouteService berechnen (ohne Startort ab der Firmenadresse).
 * Klappt das nicht, bleibt km leer – die Person trägt sie im Formular selbst ein.
 */
async function addRoute(result: AssistantResult, userId: string): Promise<AssistantResult> {
  const trip = result.trip;
  if (!trip || trip.km !== null || (!trip.to && !trip.to_city && !trip.to_client_id)) return result;
  const missing = (why: string) => ({ ...result, message: [result.message, why].filter(Boolean).join(' ') });
  if (!ORS_API_KEY) return missing('Die Kilometer kann ich gerade nicht berechnen – trag sie bitte selbst ein.');
  // Ohne Startort ab der Firmenadresse; ist das Ziel ein Kunde mit Adresse, diese statt des Namens suchen
  let start = { text: trip.from, city: trip.from_city };
  if (!start.text && !start.city) {
    const { data } = await admin.from('profiles').select('address, zip_code, city, country').eq('id', userId).maybeSingle();
    start = { text: profileAddress(data), city: '' };
    if (!start.text) return missing('Ohne Startort und ohne Firmenadresse in den Einstellungen kann ich die Kilometer nicht berechnen.');
  }
  let end = { text: trip.to, city: trip.to_city };
  if (trip.to_client_id) {
    const { data } = await admin.from('clients').select('address, zip_code, city, country').eq('id', trip.to_client_id).eq('user_id', userId).maybeSingle();
    const address = profileAddress(data);
    if (address) end = { text: address, city: '' };
  }
  if (!end.text && !end.city) return missing('Beim Kunden ist keine Adresse hinterlegt – trag die Kilometer bitte selbst ein.');
  try {
    const route = await findRoute(start, end, trip.vehicle ?? 'car', ORS_API_KEY);
    if (!route) return missing('Die Strecke habe ich nicht gefunden – trag die Kilometer bitte selbst ein.');
    return { ...result, trip: { ...trip, from: trip.from || start.text, km: route.km, km_source: 'route', from_label: route.from.label, to_label: route.to.label } };
  } catch (e) {
    console.error('assistant: OpenRouteService', e instanceof Error ? e.message : e);
    return missing('Die Kilometer kann ich gerade nicht berechnen – trag sie bitte selbst ein.');
  }
}

const BUSY = 'Der Assistent ist gerade nicht erreichbar. Bitte versuche es später erneut.';
const LIMITS = {
  daily: DAILY_LIMIT,
  busy: BUSY,
  userLimit: `Du hast den Assistenten in den letzten 24 Stunden schon ${DAILY_LIMIT}-mal verwendet. Bitte trag es selbst ein oder versuche es morgen wieder.`,
  globalLimit: 'Der Assistent ist heute ausgelastet. Bitte trag es selbst ein oder versuche es morgen wieder.',
};

Deno.serve(withCors(ALLOWED_ORIGINS, async (req) => {
  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Nicht angemeldet.' }, 401);

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'Die Anfrage ist zu groß.' }, 413);
  // Auch ohne content-length (chunked) nicht unbegrenzt einlesen
  const rawBody = await req.text().catch(() => '');
  if (rawBody.length > MAX_BODY_BYTES) return json({ error: 'Die Anfrage ist zu groß.' }, 413);
  let body: unknown = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // unten als ungültige Anfrage gemeldet
  }
  const parsed = parseRequest(body);
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  const reserved = await reserveScan(userId, 'assistant', MODEL, LIMITS);
  if ('response' in reserved) return reserved.response;
  const scanId = reserved.id;

  const clientIds = parsed.clients.map((c) => c.id);
  const productIds = parsed.products.map((p) => p.id);

  let result: AssistantResult;
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: buildSchema() } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserText(parsed) }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens' || !textBlock || textBlock.type !== 'text') {
      await finishScan(scanId, response.stop_reason === 'refusal' ? 'refusal' : 'error', response.model, response.usage);
      return json({ error: 'Das hat Klaro nicht verstanden. Versuch es bitte anders formuliert.' }, 422);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(textBlock.text);
    } catch {
      await finishScan(scanId, 'error', response.model, response.usage);
      return json({ error: 'Das hat Klaro nicht verstanden. Versuch es bitte anders formuliert.' }, 502);
    }
    await finishScan(scanId, 'ok', response.model, response.usage);
    result = normalizeResult(raw, clientIds, productIds);
  } catch (e) {
    // Ohne Antwort von Anthropic sind keine Kosten entstanden → zählt nicht gegen das Limit
    await releaseScan(scanId);
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
      console.error('assistant: Anthropic überlastet', e.status);
      return json({ error: 'Klaro ist gerade ausgelastet. Bitte versuche es in einer Minute erneut.' }, 503);
    }
    if (isBillingError(e)) {
      console.error('assistant: ANTHROPIC-GUTHABEN AUFGEBRAUCHT – bitte in der Anthropic Console aufladen');
      return json({ error: 'Der Assistent ist gerade vorübergehend nicht verfügbar. Bitte versuche es später erneut.' }, 503);
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error('assistant: Anfrage abgelehnt', e.message);
      return json({ error: 'Das hat Klaro nicht verstanden. Versuch es bitte anders formuliert.' }, 422);
    }
    console.error('assistant', e);
    return json({ error: BUSY }, 500);
  }
  // Außerhalb des try: der Befehl ist bezahlt und zählt – ein Fehler beim Routenplaner darf ihn nicht freigeben
  return json({ result: await addRoute(result, userId).catch(() => result) });
}));
