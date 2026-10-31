// Kilometer einer Fahrt über OpenRouteService (HeiGIT, Heidelberg): Orte suchen (Geocoding) → Route → Strecke.
// Reine Logik mit übergebenem fetch – wird auch von den Unit-Tests (Vitest) geprüft.
import type { AssistantVehicle } from './assistant.ts';

const ORS = 'https://api.openrouteservice.org';
// Mitte Österreichs – Orte ohne Land („Neustadt“) werden zuerst hier gesucht
const FOCUS = { lon: 14.55, lat: 47.52 };
// Hängt der Routenplaner, lieber ohne Kilometer weiter als die ganze Anfrage warten lassen
const TIMEOUT_MS = 8000;

export interface Place {
  label: string;
  lon: number;
  lat: number;
}

export interface Route {
  from: Place;
  to: Place;
  km: number; // einfache Strecke, auf ganze Kilometer gerundet
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Freie Suche für Adressen („Herrengasse 16, Graz“) und Orte; strukturierte Suche, wenn neben dem Ort etwas genannt
 * ist, das keine Adresse ist („Hauptbahnhof“ in Salzburg) – die freie Suche findet solche Ziele oft im falschen Ort,
 * die strukturierte landet zumindest im richtigen Ort (für das Kilometergeld genau genug).
 */
async function search(text: string, city: string, apiKey: string, fetchFn: Fetch, country: string | null): Promise<Place | null> {
  const structured = !!city && !/\d/.test(text) && text.trim().toLowerCase() !== city.trim().toLowerCase();
  const params = new URLSearchParams({
    size: '1',
    ...(structured
      ? { locality: city, address: text, ...(country && { country }) }
      : {
          text: text || city,
          'focus.point.lon': String(FOCUS.lon),
          'focus.point.lat': String(FOCUS.lat),
          layers: 'address,street,venue,locality,localadmin,county,neighbourhood,borough',
          ...(country && { 'boundary.country': country }),
        }),
  });
  const res = await fetchFn(`${ORS}/geocode/search${structured ? '/structured' : ''}?${params}`, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ORS-Geocoding ${res.status}`);
  const data = (await res.json()) as { features?: { geometry?: { coordinates?: number[] }; properties?: { label?: string } }[] };
  const f = data.features?.[0];
  const [lon, lat] = f?.geometry?.coordinates ?? [];
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  return { label: f?.properties?.label ?? text, lon, lat };
}

/**
 * Ort suchen – zuerst in Österreich (sonst landet „Salzburg Hauptbahnhof“ schon einmal in Deutschland), erst wenn
 * dort nichts passt, überall. null, wenn nichts gefunden wurde.
 */
export async function geocode(text: string, city: string, apiKey: string, fetchFn: Fetch = fetch): Promise<Place | null> {
  return (await search(text, city, apiKey, fetchFn, 'AT')) ?? (await search(text, city, apiKey, fetchFn, null));
}

const PROFILES: Record<AssistantVehicle, string> = { car: 'driving-car', motorbike: 'driving-car', bike: 'cycling-regular' };

/** Strecke zwischen zwei Orten in km (einfache Strecke) – null, wenn keine Route gefunden wurde. */
export async function routeKm(from: Place, to: Place, vehicle: AssistantVehicle, apiKey: string, fetchFn: Fetch = fetch): Promise<number | null> {
  const res = await fetchFn(`${ORS}/v2/directions/${PROFILES[vehicle]}`, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: [[from.lon, from.lat], [to.lon, to.lat]], instructions: false, geometry: false }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 404 = keine Route zwischen den Punkten (z. B. über das Meer), 400 = z. B. Strecke zu lang
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`ORS-Route ${res.status}`);
  const data = (await res.json()) as { routes?: { summary?: { distance?: number } }[] };
  const meters = data.routes?.[0]?.summary?.distance;
  return typeof meters === 'number' && meters > 0 ? Math.max(1, Math.round(meters / 1000)) : null;
}

/** Startadresse aus dem Profil, wenn die Person keinen Startort genannt hat („Fahrt nach Graz“). */
export function profileAddress(p: { address?: string | null; zip_code?: string | null; city?: string | null; country?: string | null } | null): string {
  if (!p) return '';
  const place = [p.zip_code, p.city].filter(Boolean).join(' ');
  return [p.address, place, p.country && p.country !== 'AT' ? p.country : null].filter(Boolean).join(', ');
}

/** Ganze Route: beide Orte suchen und die Strecke berechnen. null, wenn ein Ort oder die Route nicht gefunden wird. */
export async function findRoute(
  start: { text: string; city: string },
  end: { text: string; city: string },
  vehicle: AssistantVehicle,
  apiKey: string,
  fetchFn: Fetch = fetch,
): Promise<Route | null> {
  const [from, to] = await Promise.all([geocode(start.text, start.city, apiKey, fetchFn), geocode(end.text, end.city, apiKey, fetchFn)]);
  if (!from || !to) return null;
  const km = await routeKm(from, to, vehicle, apiKey, fetchFn);
  return km === null ? null : { from, to, km };
}
