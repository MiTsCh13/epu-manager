// CORS für die Edge Functions: Aus dem Browser darf nur die eigene App aufrufen (APP_URL), dazu optional weitere
// Adressen aus ALLOWED_ORIGINS (kommagetrennt, „*“ steht für einen Teil des Hostnamens, z. B. https://*.vercel.app).
// Ohne Deno-Abhängigkeit, damit Vitest die Logik testen kann.

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type';

export function parseAllowedOrigins(appUrl: string | undefined, extra: string | undefined): string[] {
  const list = [appUrl || 'http://localhost:5173', ...(extra ?? '').split(',')];
  return [...new Set(list.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean))];
}

function matches(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return origin.toLowerCase() === pattern.toLowerCase();
  const escaped = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, '\\$&'));
  return new RegExp(`^${escaped.join('[a-z0-9-]+')}$`, 'i').test(origin);
}

export function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  return !!origin && allowed.some((pattern) => matches(origin, pattern));
}

/** Header für die Antwort – fremde Origins bekommen kein Allow-Origin, der Browser blockt dann. */
export function corsHeadersFor(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, allowed)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

/**
 * Beantwortet Preflight-Anfragen und hängt die CORS-Header an jede Antwort des Handlers. Wirft der Handler, kommt ein
 * 500 mit CORS-Headern zurück – sonst meldet der Browser nur einen CORS-Fehler statt des echten Problems.
 */
export function withCors(allowed: string[], handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeadersFor(req.headers.get('origin'), allowed);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      console.error('Unerwarteter Fehler', e);
      res = new Response(JSON.stringify({ error: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Neue Antwort statt res.headers.set – Header mancher Antworten (z. B. aus fetch) sind unveränderlich
    const headers = new Headers(res.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
