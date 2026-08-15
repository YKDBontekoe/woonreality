# WoonReality

> Weet waar je écht gaat wonen.

WoonReality is a Next.js vertical slice for a transparent Dutch property reality check. A user searches an address, the app resolves the BAG identity, loads nearby BGT context, and returns explainable signals with source evidence.

## Included in this MVP

- PDOK Location API address autocomplete
- BAG-backed VBO/pand identity, geometry, building year, and surface area
- BGT road, green-area, and water context within approximately 250 m
- Mapbox GL JS map with building overlay, search radius, and tokenless fallback preview
- RIVM WMS screening for road noise and air quality
- CBS 2024 neighbourhood context, NDOV halte proximity, and DSO spatial topics
- Nearby BAG homes within 150 m, including registered usable area and links to their reports
- Deterministic, versioned score components
- Optional AI woningonderzoek via Vercel AI Gateway with municipal and official web sources
- Evidence and caveats on every signal
- Shareable `/woning/[bagId]` property URLs
- Vercel-ready API routes and a protected source-health Cron route
- Drizzle/Postgres schema for the next persistence step

When the Supabase URL, publishable key and server-only secret key are present, analysis requests upsert the property and append evidence plus the versioned analysis to Supabase Postgres. Without them, the same response remains available through Next.js cache headers and reports `cache-only` persistence.

The heat card remains a first-screening proxy. RIVM noise and air values are official public raster/model sources, but are not a facade measurement or personal exposure assessment.

Funda and Pararius scraping was assessed and intentionally rejected because their current terms restrict automated extraction. The supported data-source roadmap and licensed alternatives are documented in [`docs/listing-data-strategy.md`](docs/listing-data-strategy.md).

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then try `Korenstraat 18, Epe`.

Useful checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

GitHub automation

Pull requests and pushes to `main` run the quality pipeline in `.github/workflows/ci.yml`. The pipeline runs tests, lint, TypeScript checking, and a production build. The checked-in `.github/rulesets/main.json` is an importable GitHub branch ruleset that requires the `quality` check, one approving review, resolved review threads, linear history, and squash merges. Import it from the repository's Settings → Rules → Rulesets page, or with the GitHub CLI/API when repository administration permissions are available.

## API routes

```text
GET /api/address/search?q=...
GET /api/property/:bagId
GET /api/analysis/:bagId
GET /api/ai-analysis/:bagId
POST /api/ai-analysis/:bagId
GET /api/listing/:bagId
GET /api/cron/source-health
GET /api/health
```

The source adapters live below `src/lib/sources/`, the normalized contracts are in `src/lib/types.ts`, and score calculation is in `src/lib/scoring/`.

Current listing data is available only through an explicitly configured licensed
provider (`LISTING_PROVIDER_URL`, with optional API key and provider name). The
provider must accept `bagVboId`, `postcode`, and `houseNumber` query parameters
and return a normalized JSON object containing at least `externalId` and an
HTTPS `sourceUrl`. The app does not call or reverse-engineer undocumented Funda
endpoints.

## Vercel setup

1. Create or select a Supabase project and configure its Auth redirect URL for `/auth/callback`.
2. Create or select a Vercel team/project.
3. Import this repository with framework preset `Next.js`.
4. Add the variables from `.env.example` in Project Settings → Environment Variables.
5. Set `CRON_SECRET`; Vercel will send it as `Authorization: Bearer ...` to the cron route.
6. Deploy with the production branch. `vercel.json` schedules source-health checks daily at 03:15 UTC.

With Supabase configured, apply the checked-in schema migration with:

```bash
supabase link --project-ref <your-project-ref>
npm run db:push
npm run db:types
```

The Supabase migration creates the public analysis tables, private purchase-case tables, RLS policies, and the private `purchase-documents` Storage bucket. No Neon database or Drizzle migration is used.

The prepared deployment commands are `npm run vercel:link` and `npm run vercel:deploy`.

### Main-branch deployment pipeline

`.github/workflows/ci.yml` runs quality checks for pull requests and pushes. On a successful push to `main`, it then links the Supabase project and applies `supabase/migrations/`. Vercel's Git integration deploys the same `main` push to production.

Configure these GitHub Actions secrets in the `production` environment:

- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`

Configure the Supabase and application environment variables in Vercel Project Settings. The pipeline never passes database or service secrets to the browser.

The first slice does not require any API keys because PDOK, CBS, RIVM, and NDOV are open services. Add `NEXT_PUBLIC_MAPBOX_TOKEN` for the interactive map, `EPONLINE_API_KEY` for energy labels, and `DSO_API_KEY` for spatial planning topics.

AI woningonderzoek is enabled with `AI_GATEWAY_API_KEY` and the Supabase variables. The app uses Vercel AI Gateway with `AI_RESEARCH_MODEL` for source research/document extraction and `AI_SYNTHESIS_MODEL` for the structured report. Reports are stored for `AI_REPORT_TTL_DAYS` (default seven days), cite their source URLs, and never alter the deterministic Reality Score. `AI_ALLOWED_DOMAINS` and `LISTING_ALLOWED_HOSTS` limit additional web and listing sources.

## Included in this MVP

The purchase cockpit slice is now included. `/mijn-aankoop` works as a database-backed dashboard with a buyer profile, saved-home board, property stages, next actions, and links into the existing transparent woningcheck. Buyer preferences, saved homes, comparison selection, viewing checklists, bid drafts, valuation snapshots, finance data, and purchase workflow data are stored through Supabase with user-scoped RLS. The UI keeps drafts user-controlled but no longer uses browser storage for product data.

## Next slices

1. Persist `properties`, `source_cache`, `evidence`, and `analyses` through the Drizzle schema.
2. Add official RIVM/Atlas raster sampling for additional greenery and climate layers.
3. Add DSO/KOOP document detail links and timeline presentation.
4. Add RDW parking, schools, and route-based transit accessibility.
5. Build the 3D/AHN Sun Time Machine after the basic chain has usage.

## Product boundaries

WoonReality is screening and decision support. It does not replace a building inspection, acoustic or foundation survey, soil investigation, legal planning advice, appraisal, or formal permit check. Public-data absence is not proof that a risk is absent.
