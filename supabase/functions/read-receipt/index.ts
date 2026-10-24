// Beleg auslesen: Foto/PDF → Claude → Felder + Kategorie-Vorschlag für das Ausgaben-Formular.
// Der Beleg wird hier nicht gespeichert (das passiert erst beim Speichern der Ausgabe im Bucket „receipts“).
// Jeder Lesevorgang landet in receipt_scans – für das Tageslimit und die Kostenkontrolle.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { ALLOWED_ORIGINS, finishScan, getUserId, isBillingError, json, releaseScan, reserveScan, UNAVAILABLE } from '../_shared/scans.ts';
import { withCors } from '../_shared/cors.ts';
import {
  buildSchema,
  buildUserText,
  DAILY_LIMIT,
  MAX_BODY_BYTES,
  MODEL,
  normalizeResult,
  parseRequest,
  SYSTEM_PROMPT,
  type ImageType,
} from './receipt.ts';

// Ein Beleg dauert 5–20 s – lieber früh abbrechen als in das Zeitlimit der Edge Function laufen
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 60_000, maxRetries: 1 });

const LIMITS = {
  daily: DAILY_LIMIT,
  busy: 'Klaro kann den Beleg gerade nicht lesen. Bitte versuche es später erneut.',
  userLimit: `Du hast in den letzten 24 Stunden schon ${DAILY_LIMIT} Belege auslesen lassen. Bitte trag diesen Beleg selbst ein oder versuche es morgen wieder.`,
  globalLimit: 'Das Auslesen von Belegen ist heute ausgelastet. Bitte trag den Beleg selbst ein oder versuche es morgen wieder.',
};

Deno.serve(withCors(ALLOWED_ORIGINS, async (req) => {
  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Nicht angemeldet.' }, 401);

  // Größe vor dem Einlesen prüfen – der Body landet sonst komplett im Speicher
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'Der Beleg ist größer als 5 MB.' }, 413);
  const parsed = parseRequest(await req.json().catch(() => null));
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  // Tageslimit (rollierend 24 h) – schützt vor Kostenexplosion bei Fehlern oder Missbrauch
  const reserved = await reserveScan(userId, 'receipt', MODEL, LIMITS);
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

    let raw: unknown;
    try {
      raw = JSON.parse(textBlock.text);
    } catch {
      // Antwort bezahlt, aber unbrauchbar → zählt (nicht freigeben)
      await finishScan(scanId, 'error', response.model, response.usage);
      return json({ error: 'Klaro konnte den Beleg nicht vollständig lesen. Bitte trag ihn selbst ein.' }, 502);
    }
    const result = normalizeResult(raw, categoryIds);
    await finishScan(scanId, 'ok', response.model, response.usage);
    return json({ result });
  } catch (e) {
    // Ohne Antwort von Anthropic sind keine Kosten entstanden → zählt nicht gegen das Limit
    await releaseScan(scanId);
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
      console.error('read-receipt: Anthropic überlastet', e.status);
      return json({ error: 'Klaro ist gerade ausgelastet. Bitte versuche es in einer Minute erneut.' }, 503);
    }
    if (isBillingError(e)) {
      console.error('read-receipt: ANTHROPIC-GUTHABEN AUFGEBRAUCHT – bitte in der Anthropic Console aufladen');
      return json({ error: UNAVAILABLE }, 503);
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error('read-receipt: Anfrage abgelehnt', e.message);
      return json({ error: 'Diesen Beleg konnte Klaro nicht lesen – ist die Datei vielleicht beschädigt oder passwortgeschützt?' }, 422);
    }
    console.error('read-receipt', e);
    return json({ error: 'Klaro kann den Beleg gerade nicht lesen. Bitte versuche es später erneut.' }, 500);
  }
}));
