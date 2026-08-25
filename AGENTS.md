# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## What this app is

WoonReality is a **single Next.js 15 (App Router) application** — there is only one service. It is a transparent Dutch property "reality check": a user searches an address, buurt or woonplaats, the app resolves the official BAG identity via live open Dutch government APIs (PDOK, CBS, RIVM, NDOV, plus optional DSO / EP-Online), and returns explainable, versioned scored signals with source evidence. Optional Supabase persistence adds accounts (passkeys/e-mail), saved workspaces, purchase cases, and AI research reports.

Core product principles that constrain code changes:

- **Explainability over black boxes**: every signal carries evidence and caveats; the Reality Score is deterministic and versioned. AI output must never alter it.
- **No portal scraping**: Funda/Pararius scraping was assessed and rejected. Listing kenmerken come from the user's own browser extension (`extensions/woonreality-funda/`) or paste-import; the server never fetches Funda pages.
- **Public-data absence is not proof of absence**: known gaps are disclosed, not hidden.
- Screening/decision support only — not an inspection, appraisal, or legal advice.

## Commands

```bash
npm run dev          # dev server on :3000 (predev packs the browser extension)
npm test             # node --import tsx --test tests/*.test.ts  (no watch)
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm run build        # production build (prebuild packs the extension)
npm run smoke        # route checks against a running server (SMOKE_OFFLINE=1 skips live APIs)
npm run extension:pack   # build Chrome ZIP + Firefox XPI into public/extension/
npm run db:push      # supabase db push — needs Supabase CLI + linked project
npm run db:types     # regenerate src/lib/supabase/database.types.ts
```

Quality gates mirror CI (`.github/workflows/ci.yml`): `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` — all four must pass before pushing. Run them after every change.

## Environment

- Dependencies are installed by the startup update script (`npm ci`) — no reinstall needed in the dev VM.
- Copy `cp .env.example .env.local` if missing.
- **Supabase is optional locally.** With no `NEXT_PUBLIC_SUPABASE_URL` / keys set, analysis responses fall back to `cache-only` persistence and the address-search → property-report flow still works end to end. `/mijn-aankoop`, `/login`, cases, and AI reports require real Supabase credentials.
- The core flow calls **live external services** — the dev VM needs outbound internet.
- Smoke tests: `curl localhost:3000/api/health` and `curl "localhost:3000/api/address/search?q=Korenstraat%2018%2C%20Epe"`. Known-good manual/GUI test address: **`Korenstraat 18, Epe`**.
- `REQUIRE_LOGIN_FOR_SEARCH=false` disables the auth gate on search for local development.
- `db:push` / `db:types` require a linked Supabase project and will fail without configuration — do not treat as part of local dev.

## Architecture map

```
app/
  [locale]/            # i18n page routes (nl default) via next-intl
  api/                 # route handlers (locale-free; see middleware.ts)
components/            # React UI (client components + dashboards)
src/lib/
  sources/             # external API adapters: pdok/ (bag, bgt, location), cbs*, rivm,
                       # ndov, dso, ep-online, politie, ses, bodem, listings
  analysis/            # analyze.ts orchestrates signals; analyze-place.ts for places;
                       # signals/ builders, evidence.ts; AI: llm.ts (shared helpers),
                       # research.ts (report), listing-extract.ts, llm-context.ts
  scoring/score.ts     # deterministic, versioned score components
  types.ts             # normalized contracts shared across adapters/UI/API
  supabase/            # server/browser clients, middleware session refresh, DB types
  db/repository.ts     # persistence layer (Supabase upserts; cache-only fallback)
  mortgage/            # 2026 norms, capacity, schedule, tax — pure calculators
  geo/                 # RD<->WGS84, bbox, haversine measure
  map/                 # Mapbox style/tiles, isochrones, RIVM tile proxy, region layers
  listing-*.ts         # extract/merge/risk/profile-match for listing intake pipeline
  journey-checklist.ts # static end-to-end koopreis checklist
  bid-strategy.ts      # bid drafts + negotiation guidance (incl. ophoogclausule)
tests/                 # node:test suites mirroring lib modules (*.test.ts)
supabase/migrations/   # checked-in SQL schema + RLS (single source of truth)
extension(s)/          # Chrome/Firefox browser extension source + publish tooling
docs/                  # auth-setup.md, listing-data-strategy.md
messages/              # next-intl translation catalogs
```

### Key data flow

1. `GET /api/address/search` → PDOK Location API autocomplete (`src/lib/sources/pdok/location.ts`).
2. `GET /api/property/:bagId` → BAG VBO/pand identity + geometry (`pdok/bag.ts`), BGT context (`pdok/bgt.ts`).
3. `GET /api/analysis/:bagId` → signal builders (`src/lib/analysis/signals/`) call source adapters; results aggregate through `analyze.ts`; scores computed by `src/lib/scoring/score.ts`; persistence via `src/lib/db/repository.ts` (Supabase upsert or cache-only fallback reported in the response).
4. Listing intake: paste URL (`POST /api/listing/from-url`, slug → BAG only, no fetching) or extension ingest (`POST /api/listing/extension/ingest`, token-authenticated) → merge/dedupe (`listing-merge.ts`) → risk flags (`listing-risk.ts`).
5. AI report (`POST /api/ai-analysis/:bagId`) → two bounded LLM calls via Vercel AI Gateway (`analysis/research.ts`; shared helpers in `analysis/llm.ts`); cites URLs, never touches the deterministic score; deterministic risk flags are passed in so the model doesn't re-discover them. Listing insights (`POST /api/listing-insights/:bagId`) use `analysis/listing-extract.ts`.

### Auth & middleware

`middleware.ts` refreshes the Supabase session first (cookie rotation must survive), then applies next-intl locale routing to page routes only — `/api` and `/auth` bypass locale handling. Search endpoints gate on auth when Supabase is configured (`src/lib/search-auth.ts`). Passkeys/WebAuthn RP ID must stay stable once enrolled (`docs/auth-setup.md`).

### Database

Schema lives in `supabase/migrations/` (public analysis tables, private purchase-case tables, RLS policies, `purchase-documents` Storage bucket). Never edit generated `database.types.ts` by hand — regenerate with `npm run db:types`. All user data access is user-scoped RLS; new tables need migration + RLS + regenerated types.

## Conventions for agents

- **TypeScript strict**; path alias `@/*` and `@/src/lib/*` (check `tsconfig.json`). Typed routes are enabled (`typedRoutes: true` in `next.config.ts`) — use `Link href` values that typecheck against actual routes.
- **Tests use the built-in `node:test` runner** (no Jest/Vitest). Add tests as `tests/<module>.test.ts` next to the naming of existing files; keep units pure and mock network via dependency injection like existing suites do.
- **No comments unless required**; match the concise, Dutch-domain-aware style of neighbouring code (Dutch product terms: woningcheck, koopreis, kenmerken, erfpacht…).
- Server-only secrets (`SUPABASE_SECRET_KEY`, `DSO_API_KEY`, `EPONLINE_API_KEY`, `CRON_SECRET`, `AI_GATEWAY_API_KEY`, `LISTING_PROVIDER_API_KEY`, `BLOB_READ_WRITE_TOKEN`) must never be imported client-side or prefixed `NEXT_PUBLIC_`.
- New API routes: validate input with zod, return errors via helpers in `src/lib/errors.ts`, respect the fetch helper in `src/lib/http/fetch-json.ts`.
- i18n: user-facing strings go through `next-intl`; add keys to both locales in `messages/`. Route handlers stay locale-free.
- Do not add server calls to listing portals or undocumented endpoints; licensed feeds only via `LISTING_PROVIDER_*`.
- Cron route `/api/cron/source-health` is protected by `CRON_SECRET` bearer check; scheduled daily 03:15 UTC in `vercel.json`.

## Deployment notes

- Production: Vercel (Git integration deploys `main`). CI additionally publishes the browser extension to Vercel Blob and applies Supabase migrations on pushes to `main` (secrets in the `production` GitHub environment).
- Branch protection: `.github/rulesets/main.json` requires the `quality` check, one approving review, resolved threads, linear history, squash merges.

## Product boundaries

WoonReality is screening and decision support. It does not replace building inspection, acoustic/foundation surveys, soil investigation, legal planning advice, appraisal, or formal permit checks. Preserve honest-gap disclosures (e.g. risicokaart.nl links) when touching property-page code.
