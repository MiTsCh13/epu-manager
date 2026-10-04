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

## E2E-Tests (Playwright)
`npm run test:e2e` startet den Dev-Server und prüft die drei kritischen Flows auf Desktop und Handy:
Registrierung → Onboarding → Rechnung → PDF · Ausgaben → Gewinn · Umsatzgrenze 45.000 € → Warnung.
Die Tests laufen gegen das Supabase-Projekt aus `.env.local`, legen eigene Testnutzer (`klaro-e2e-…@example.com`) an
und löschen sie danach über `delete-account`. Voraussetzung: „Confirm email“ ist im Projekt ausgeschaltet –
**vor dem Launch wieder einschalten** (dann ein eigenes Test-Projekt verwenden).

## Jährliches Update
SVS-Werte liegen ausschließlich in `src/constants/svs2026.ts`. Für ein neues Jahr eine neue Datei anlegen – nie Werte im Code hardcoden.

## Kostenlos-Modus
Klaro ist vorerst **kostenlos und unbegrenzt** nutzbar: keine Testphase, kein Abo-Hinweis, keine Paywall.
Die Stripe-Integration unten bleibt im Code. Einschalten: `VITE_BILLING_ENABLED=true` (Vercel + `.env.local`) und
`has_active_access()` per Migration wieder auf die Abo-Prüfung umstellen (siehe `20261005000001_free_access.sql`).

## Stripe (Abo „Klaro Pro“, 19 €/Monat) – derzeit ausgeschaltet
Checkout, Kundenportal und Webhook laufen als Supabase Edge Functions (`supabase/functions/`).
Secrets liegen nur in Supabase (`supabase secrets list`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `APP_URL`.

```bash
supabase functions deploy create-checkout-session create-portal-session stripe-webhook delete-account --use-api
```

Der Webhook (`/functions/v1/stripe-webhook`) aktualisiert `profiles.subscription_status`. Nach Ablauf der Testphase
ohne Abo verhindert die Datenbank neue bzw. ausgestellte Rechnungen (weicher Paywall).
Testkarte: `4242 4242 4242 4242`, beliebiges Datum in der Zukunft, beliebige CVC.

## Konto löschen (DSGVO Art. 17)
Die Edge Function `delete-account` beendet laufende Stripe-Abos, löscht alle Belegfotos und über
`delete_user_data()` sämtliche Daten des Nutzers, danach den Auth-Nutzer. Der Stripe-Kunde bleibt wegen der
Aufbewahrungspflicht für Zahlungsbelege (§ 132 BAO) bestehen.

## Hosting
Frontend: Vercel · Backend: Supabase (Region Frankfurt, DSGVO)
