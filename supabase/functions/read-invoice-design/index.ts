// Rechnungs-Vorlage aus einer bestehenden Rechnung: erste Seite (Bild + Texte + Bilder) → Claude → Vorlage.
// Die Rechnung wird hier nicht gespeichert. Bilder (Logo, Kopfbild) schneidet der Browser selbst aus dem PDF.
// Jeder Vorgang landet in receipt_scans (kind „invoice_design“) – für das Tageslimit und die Kostenkontrolle.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { ALLOWED_ORIGINS, finishScan, getUserId, isBillingError, json, releaseScan, reserveScan, UNAVAILABLE } from '../_shared/scans.ts';
import { withCors } from '../_shared/cors.ts';
import { buildSchema, buildUserText, DAILY_LIMIT, MAX_BODY_BYTES, MODEL, normalizeResult, parseRequest, SYSTEM_PROMPT } from './design.ts';

// Eine Rechnung dauert 10–30 s – ohne Wiederholung bleibt der Aufruf sicher unter dem Zeitlimit der Edge Function (150 s)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 90_000, maxRetries: 0 });

const BUSY = 'Klaro kann deine Rechnung gerade nicht lesen. Bitte versuche es später erneut.';
const LIMITS = {
  daily: DAILY_LIMIT,
  busy: BUSY,
  userLimit: `Du hast in den letzten 24 Stunden schon ${DAILY_LIMIT} Rechnungen übernommen. Gestalte die Vorlage im Editor weiter oder versuche es morgen wieder.`,
  globalLimit: 'Das Übernehmen von Rechnungen ist heute ausgelastet. Bitte starte mit einem Design oder versuche es morgen wieder.',
};

Deno.serve(withCors(ALLOWED_ORIGINS, async (req) => {
  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Nicht angemeldet.' }, 401);

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'Die Rechnung ist zu groß.' }, 413);
  // Auch ohne content-length (chunked) nicht unbegrenzt einlesen
  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Die Rechnung ist zu groß.' }, 413);
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // unten als ungültige Anfrage gemeldet
  }
  const parsed = parseRequest(body);
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  const reserved = await reserveScan(userId, 'invoice_design', MODEL, LIMITS);
  if ('response' in reserved) return reserved.response;
  const scanId = reserved.id;

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // Lehnt das Modell ab, springt serverseitig das von Anthropic empfohlene Ersatzmodell ein
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: buildSchema(parsed.images.map((i) => i.id)) } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: parsed.page } },
            { type: 'text', text: buildUserText(parsed) },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      await finishScan(scanId, 'refusal', response.model, response.usage);
      return json({ error: 'Diese Rechnung konnte Klaro nicht übernehmen. Starte am besten mit einem Design.' }, 422);
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    if (response.stop_reason === 'max_tokens' || !textBlock || textBlock.type !== 'text') {
      await finishScan(scanId, 'error', response.model, response.usage);
      return json({ error: 'Klaro konnte deine Rechnung nicht vollständig lesen. Bitte versuche es erneut.' }, 502);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(textBlock.text);
    } catch {
      // Antwort bezahlt, aber unbrauchbar → zählt (nicht freigeben)
      await finishScan(scanId, 'error', response.model, response.usage);
      return json({ error: 'Klaro konnte deine Rechnung nicht vollständig lesen. Bitte versuche es erneut.' }, 502);
    }
    const result = normalizeResult(raw, parsed);
    await finishScan(scanId, 'ok', response.model, response.usage);
    return json({ result });
  } catch (e) {
    // Ohne Antwort von Anthropic sind keine Kosten entstanden → zählt nicht gegen das Limit
    await releaseScan(scanId);
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
      console.error('read-invoice-design: Anthropic überlastet', e.status);
      return json({ error: 'Klaro ist gerade ausgelastet. Bitte versuche es in einer Minute erneut.' }, 503);
    }
    if (isBillingError(e)) {
      console.error('read-invoice-design: ANTHROPIC-GUTHABEN AUFGEBRAUCHT – bitte in der Anthropic Console aufladen');
      return json({ error: UNAVAILABLE }, 503);
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error('read-invoice-design: Anfrage abgelehnt', e.message);
      return json({ error: 'Diese Rechnung konnte Klaro nicht lesen.' }, 422);
    }
    console.error('read-invoice-design', e);
    return json({ error: BUSY }, 500);
  }
}));
