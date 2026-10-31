import { describe, expect, it } from 'vitest';
import { buildSchema, normalizeResult, parseRequest } from '../../supabase/functions/assistant/assistant';
import { findRoute, geocode, profileAddress } from '../../supabase/functions/assistant/routing';
import { invoicePrefill, shortPlace, tripPrefill, type TripResult } from '@/lib/assistant';
import type { Product } from '@/types';

const C1 = '11111111-1111-4111-8111-111111111111';
const P1 = '33333333-3333-4333-8333-333333333333';

describe('assistant: Anfrage prüfen', () => {
  const ok = { text: ' Fahrt nach Graz ', today: '2026-10-29', clients: [{ id: C1, name: 'Café Sonne' }], products: [{ id: P1, name: 'Beratung', unit: 'Std.', unit_price: 90 }] };
  it('gültig, Text getrimmt', () => {
    expect(parseRequest(ok)).toMatchObject({ text: 'Fahrt nach Graz', today: '2026-10-29' });
  });
  it.each([
    [null, 'Ungültige Anfrage.'],
    [{ ...ok, text: '  ' }, 'Sag oder schreib'],
    [{ ...ok, text: 'x'.repeat(501) }, 'kürzer'],
    [{ ...ok, clients: [{ id: 'nicht-uuid', name: 'X' }] }, 'Ungültige Anfrage.'],
    [{ ...ok, products: [{ id: P1, name: 'X', unit: null, unit_price: 'teuer' }] }, 'Ungültige Anfrage.'],
    [{ ...ok, clients: Array.from({ length: 501 }, () => ({ id: C1, name: 'X' })) }, 'Ungültige Anfrage.'],
  ])('%#: ungültig', (body, msg) => {
    expect(parseRequest(body)).toEqual(expect.stringContaining(msg));
  });
  it('ungültiges Datum → heute', () => {
    expect((parseRequest({ ...ok, today: 'gestern' }) as { today: string }).today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('assistant: Schema und Antwort', () => {
  it('Schema ohne IDs (Kürzel K…/P…) – auch bei Hunderten Kunden klein', () => {
    const s = JSON.stringify(buildSchema());
    expect(s).toContain('^K[0-9]{1,3}$');
    expect(s.length).toBeLessThan(5000);
  });

  it('Fahrt: unbekannte Werte abgefangen, km nur plausibel', () => {
    const r = normalizeResult(
      { action: 'trip', trip: { from: 'Linz', from_city: 'Linz', to: 'Wien', to_city: 'Wien', to_client_id: 'K2', date: '2026-13-40', purpose: 'Termin', km: -5, round_trip: 'vielleicht', vehicle: 'ufo' }, invoice: null, message: 'ok' },
      [C1],
      [P1],
    );
    expect(r.trip).toMatchObject({ to_client_id: null, date: null, km: null, round_trip: 'unknown', vehicle: null, km_source: null });
    const said = normalizeResult({ action: 'trip', trip: { from: '', to: 'Graz', km: 110.04, round_trip: 'round_trip' }, message: '' }, [], []);
    expect(said.trip).toMatchObject({ km: 110, km_source: 'said', round_trip: 'round_trip' });
  });

  it('Rechnung: fremde IDs verworfen, Menge/Preis abgesichert', () => {
    const r = normalizeResult(
      {
        action: 'invoice',
        invoice: {
          client_id: C1, client_name: 'Huber', service_date: '2026-10-28',
          items: [{ product_id: 'P1', description: 'Beratung', quantity: 0, unit: 'Std.', unit_price: null }, { product_id: 'P9', description: 'Fotos', quantity: 2, unit: '', unit_price: 300.555 }],
        },
        message: 'm',
      },
      [C1],
      [P1],
    );
    expect(r.invoice).toMatchObject({ client_id: null, client_name: 'Huber', service_date: '2026-10-28' });
    expect(r.invoice!.items).toEqual([
      { product_id: P1, description: 'Beratung', quantity: 1, unit: 'Std.', unit_price: null },
      { product_id: null, description: 'Fotos', quantity: 2, unit: '', unit_price: 300.56 },
    ]);
  });

  it('Kürzel → ID', () => {
    const r = normalizeResult({ action: 'invoice', invoice: { client_id: 'K1', client_name: 'Café Sonne', items: [] }, message: '' }, [C1], []);
    expect(r.invoice?.client_id).toBe(C1);
    const t = normalizeResult({ action: 'trip', trip: { from: '', to: 'Graz', to_client_id: 'K1', km: null }, message: '' }, [C1], []);
    expect(t.trip?.to_client_id).toBe(C1);
  });

  it('unbekannte Aktion bzw. fehlende Daten → unknown', () => {
    expect(normalizeResult({ action: 'trip', trip: null, message: 'x' }, [], []).action).toBe('unknown');
    expect(normalizeResult({ action: 'delete_all', message: 'x' }, [], []).action).toBe('unknown');
  });
});

describe('assistant: Routenplaner (OpenRouteService)', () => {
  const feature = (label: string, lon: number, lat: number) => ({ features: [{ geometry: { coordinates: [lon, lat] }, properties: { label } }] });
  const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it('sucht zuerst in Österreich, dann überall', async () => {
    const urls: string[] = [];
    const place = await geocode('Passau', '', 'key', (url) => {
      urls.push(url);
      return respond(urls.length === 1 ? { features: [] } : feature('Passau, BY, Germany', 13.4, 48.6));
    });
    expect(place?.label).toBe('Passau, BY, Germany');
    expect(urls[0]).toContain('boundary.country=AT');
    expect(urls[1]).not.toContain('boundary.country');
  });

  it('kein Adress-Ziel im genannten Ort → strukturierte Suche, Adresse → freie Suche', async () => {
    const urls: string[] = [];
    const f = (url: string) => (urls.push(url), respond(feature('X', 13, 47)));
    await geocode('Hauptbahnhof', 'Salzburg', 'key', f);
    await geocode('Herrengasse 16, 8010 Graz', 'Graz', 'key', f);
    await geocode('Wien', 'Wien', 'key', f);
    expect(urls[0]).toContain('/geocode/search/structured?');
    expect(urls[0]).toContain('locality=Salzburg');
    expect(urls[1]).toContain('/geocode/search?');
    expect(urls[2]).toContain('/geocode/search?');
  });

  it('Route: km gerundet, Fahrrad-Profil, keine Route → null', async () => {
    const calls: string[] = [];
    const f = (url: string) => {
      calls.push(url);
      if (url.includes('/geocode/')) return respond(feature('Ort', 14, 48));
      return respond({ routes: [{ summary: { distance: 21_600 } }] });
    };
    const route = await findRoute({ text: 'Salzburg', city: '' }, { text: 'Hallein', city: '' }, 'bike', 'key', f);
    expect(route?.km).toBe(22);
    expect(calls.at(-1)).toContain('/v2/directions/cycling-regular');
    const none = await findRoute({ text: 'A', city: '' }, { text: 'B', city: '' }, 'car', 'key', (url) =>
      url.includes('/geocode/') ? respond(feature('Ort', 14, 48)) : respond({ error: 'no route' }, 404),
    );
    expect(none).toBeNull();
  });

  it('profileAddress', () => {
    expect(profileAddress({ address: 'Hauptplatz 1', zip_code: '4020', city: 'Linz', country: 'AT' })).toBe('Hauptplatz 1, 4020 Linz');
    expect(profileAddress({ address: null, zip_code: null, city: 'Passau', country: 'DE' })).toBe('Passau, DE');
    expect(profileAddress(null)).toBe('');
  });
});

describe('assistant: Vorschläge für die Formulare', () => {
  const trip: TripResult = {
    from: 'Linz', from_city: 'Linz', to: 'Wien', to_city: 'Wien', to_client_id: null, date: '2026-10-28', purpose: 'Kundentermin',
    km: 178, round_trip: 'unknown', vehicle: null, from_label: 'Hauptplatz 1, Linz, OO, Austria', to_label: 'Vienna, Austria', km_source: 'route',
  };

  it('shortPlace: Bundesland und Land weg, Vienna → Wien', () => {
    expect(shortPlace('Hauptplatz 1, Linz, OO, Austria', '')).toBe('Hauptplatz 1, Linz');
    expect(shortPlace('Vienna, Austria', '')).toBe('Wien');
    expect(shortPlace(null, 'Graz')).toBe('Graz');
  });

  it('Fahrt hin und zurück: doppelte km, Route in der Beschreibung', () => {
    const p = tripPrefill(trip, true, '2026-10-29');
    expect(p.form).toMatchObject({ categoryId: 'reisen', km: '356', vehicle: 'car', date: '2026-10-28', description: 'Kundentermin: Hauptplatz 1, Linz – Wien – Hauptplatz 1, Linz' });
    expect(p.notes[0]).toContain('178 km pro Richtung');
  });

  it('Fahrt nur hin ohne km und Datum', () => {
    const p = tripPrefill({ ...trip, km: null, km_source: null, date: null, purpose: '' }, false, '2026-10-29');
    expect(p.form).toMatchObject({ km: '', date: '2026-10-29', description: 'Hauptplatz 1, Linz – Wien' });
    expect(p.notes).toEqual(['Die Kilometer konnte Klaro nicht ermitteln – trag sie bitte ein.']);
  });

  it('Rechnung: Produktpreis, genannter Preis hat Vorrang', () => {
    const products = [{ id: P1, name: 'Beratung', details: '', unit: 'Std.', unit_price: 90 }] as unknown as Product[];
    const p = invoicePrefill(
      {
        client_id: C1, client_name: 'Café Sonne', service_date: null,
        items: [
          { product_id: P1, description: 'Beratung', quantity: 1.5, unit: '', unit_price: null },
          { product_id: P1, description: 'Beratung', quantity: 1, unit: '', unit_price: 120 },
          { product_id: null, description: 'Fotos', quantity: 1, unit: '', unit_price: null },
        ],
      },
      products,
    );
    expect(p.clientId).toBe(C1);
    expect(p.rows).toEqual([
      { description: 'Beratung', quantity: '1,5', unit: 'Std.', unit_price: '90' },
      { description: 'Beratung', quantity: '1', unit: 'Std.', unit_price: '120' },
      { description: 'Fotos', quantity: '1', unit: '', unit_price: '' },
    ]);
  });
});
