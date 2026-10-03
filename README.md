# Klaro

*Endlich weißt du, was dir wirklich bleibt.*

Financial Co-Pilot für österreichische Einzelunternehmer und Neue Selbständige: Einnahmen/Ausgaben, Gewinnermittlung (EÜR / Pauschalierung), SVS-Tracker mit Rücklagen-Empfehlung, §11-UStG-konforme Rechnungen.

## Stack
React 18 · TypeScript · Vite · Tailwind CSS v3 · Supabase (Auth, Postgres, RLS) · Stripe · @react-pdf/renderer · Vitest · Playwright

## Setup
```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev                  # http://localhost:5173
```

> ⚠️ Nur Variablen mit `VITE_`-Prefix landen im Browser. Der Stripe Secret Key (`STRIPE_SECRET_KEY`)
> wird ausschließlich in Supabase Edge Functions verwendet.

## Scripts
| Befehl | Zweck |
|---|---|
| `npm run dev` | Dev-Server |
| `npm run build` | Typecheck + Production-Build |
| `npm run test` | Unit-Tests (Vitest) |
| `npm run test:coverage` | Coverage (100 % Pflicht für svs/profit/tax) |
| `npm run test:e2e` | E2E-Tests (Playwright) |

## Jährliches Update
SVS-Werte liegen ausschließlich in `src/constants/svs2026.ts`. Für ein neues Jahr eine neue Datei anlegen – nie Werte im Code hardcoden.

## Stripe (Abo „Klaro Pro“, 19 €/Monat)
Checkout, Kundenportal und Webhook laufen als Supabase Edge Functions (`supabase/functions/`).
Secrets liegen nur in Supabase (`supabase secrets list`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `APP_URL`.

```bash
supabase functions deploy create-checkout-session create-portal-session stripe-webhook --use-api
```

Der Webhook (`/functions/v1/stripe-webhook`) aktualisiert `profiles.subscription_status`. Nach Ablauf der Testphase
ohne Abo verhindert die Datenbank neue bzw. ausgestellte Rechnungen (weicher Paywall).
Testkarte: `4242 4242 4242 4242`, beliebiges Datum in der Zukunft, beliebige CVC.

## Hosting
Frontend: Vercel · Backend: Supabase (Region Frankfurt, DSGVO)
