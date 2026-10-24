# Klaro – Instructions for Claude

## Session start
- At the start of every new session, before anything else, tell me the current status of the project:
  - git state (branch, uncommitted changes, last commits, anything not pushed)
  - what is live on production vs. only on the test project
  - open points and agreed next steps (from memory)
  Keep it short – a few bullet points.

## How we work
- After each step: give a short summary and wait for my confirmation before continuing.
- Only commit once I have tested the change myself.
- Check legal and tax values (SVS, income tax, VAT, flat rates, mileage allowance, …) against primary sources: USP, BMF, WKO, RIS. The master prompt (`klaro_claude_code_prompt_FINAL.md`) is a general guideline only – its values were wrong several times.
- Explain things in plain language with the pros and cons, and give a recommendation when I have to decide.

## Quality
- After each build step, run the `code-reviewer` and `test-runner` agents.
- Whenever `src/lib/svs.ts` or `src/constants/svs2026.ts` changes, run the `svs-validator` agent.
- Unit tests: `npm test` · E2E: `npm run test:e2e`.
- Vercel builds run in UTC: check date/time-related tests with `TZ=UTC` as well, and avoid tests that depend on the time zone.

## Safety
- Two Supabase projects:
  - Production `klaro-prod` = `zrokseyitjsaohnxdxbe` (live on https://klaro.zesawa.com)
  - Test/Dev = `swvnocrlnmwjewjuxypm`
  - Local development, E2E tests and Vercel previews always use the **test** project only.
- Never read or write personal data on production without my explicit permission.
- Migrations: dry run first, tell me what will change, then push.
- Deploy to production only via `npm run release`.
- Never put secrets (service role key, API keys) into `VITE_` variables – they end up in the browser. Secrets live only in `.env.local` or as Supabase secrets.

## Style and conventions
- App text in German, informal "du", easy to understand for non-experts (no tax jargon without explanation).
- Commit messages in German.
- Mandatory invoice details (§ 11 UStG) are always set by Klaro itself, never by a template.

## Before launch (checklist)
- [ ] Impressum
- [ ] Privacy policy (Anthropic incl. customer data in invoice import, Supabase Ireland, Vercel)
- [ ] Beta notice "keine Steuerberatung"
- [ ] DPA with Anthropic
- [ ] Restrict CORS of the Edge Functions to `APP_URL` (currently `*`)
