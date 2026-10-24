import { describe, expect, it } from 'vitest';
import { corsHeadersFor, isAllowedOrigin, parseAllowedOrigins, withCors } from '../../supabase/functions/_shared/cors';

const PROD = parseAllowedOrigins('https://klaro.zesawa.com', undefined);
const TEST = parseAllowedOrigins('http://localhost:5173', 'https://*.vercel.app, http://localhost:4173/');

describe('parseAllowedOrigins', () => {
  it('nimmt APP_URL und zusätzliche Origins, ohne Leerzeichen und Schrägstrich am Ende', () => {
    expect(TEST).toEqual(['http://localhost:5173', 'https://*.vercel.app', 'http://localhost:4173']);
  });

  it('fällt ohne APP_URL auf die lokale Entwicklung zurück', () => {
    expect(parseAllowedOrigins(undefined, '')).toEqual(['http://localhost:5173']);
  });
});

describe('isAllowedOrigin', () => {
  it('Produktion erlaubt nur die eigene Domain', () => {
    expect(isAllowedOrigin('https://klaro.zesawa.com', PROD)).toBe(true);
    expect(isAllowedOrigin('https://Klaro.Zesawa.com', PROD)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', PROD)).toBe(false);
    expect(isAllowedOrigin('http://klaro.zesawa.com', PROD)).toBe(false);
    expect(isAllowedOrigin('https://klaro.zesawa.com.evil.example', PROD)).toBe(false);
    expect(isAllowedOrigin('http://localhost:5173', PROD)).toBe(false);
    expect(isAllowedOrigin(null, PROD)).toBe(false);
  });

  it('„*“ steht für genau einen Teil des Hostnamens', () => {
    expect(isAllowedOrigin('https://epu-manager-abc123-team.vercel.app', TEST)).toBe(true);
    expect(isAllowedOrigin('https://a.b.vercel.app', TEST)).toBe(false);
    expect(isAllowedOrigin('https://vercel.app.evil.example', TEST)).toBe(false);
    expect(isAllowedOrigin('https://xvercel.app', TEST)).toBe(false);
  });
});

describe('corsHeadersFor / withCors', () => {
  it('setzt Allow-Origin nur für erlaubte Origins', () => {
    expect(corsHeadersFor('https://klaro.zesawa.com', PROD)['Access-Control-Allow-Origin']).toBe('https://klaro.zesawa.com');
    expect(corsHeadersFor('https://evil.example', PROD)).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('beantwortet Preflight selbst und ergänzt die Header an Antworten', async () => {
    let called = 0;
    const handler = withCors(PROD, async () => {
      called++;
      return new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } });
    });
    const origin = { origin: 'https://klaro.zesawa.com' };

    const preflight = await handler(new Request('https://x.supabase.co/f', { method: 'OPTIONS', headers: origin }));
    expect(called).toBe(0);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://klaro.zesawa.com');

    const res = await handler(new Request('https://x.supabase.co/f', { method: 'POST', headers: origin }));
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://klaro.zesawa.com');
    expect(res.headers.get('Content-Type')).toBe('application/json');

    const foreign = await handler(new Request('https://x.supabase.co/f', { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('wirft der Handler, kommt ein 500 mit CORS-Headern', async () => {
    const handler = withCors(PROD, async () => {
      throw new Error('kaputt');
    });
    const res = await handler(new Request('https://x.supabase.co/f', { method: 'POST', headers: { origin: 'https://klaro.zesawa.com' } }));
    expect(res.status).toBe(500);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://klaro.zesawa.com');
  });

  it('funktioniert auch mit unveränderlichen Headern', async () => {
    const handler = withCors(PROD, async () => Response.redirect('https://klaro.zesawa.com/', 302));
    const res = await handler(new Request('https://x.supabase.co/f', { method: 'POST', headers: { origin: 'https://klaro.zesawa.com' } }));
    expect(res.status).toBe(302);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://klaro.zesawa.com');
  });
});
