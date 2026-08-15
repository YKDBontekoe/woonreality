# AGENTS.md

## Cursor Cloud specific instructions

WoonReality is a single Next.js 15 (App Router) application — there is only one service. It is a transparent Dutch property "reality check": a user searches an address, the app resolves the BAG identity via live open Dutch government APIs (PDOK, CBS, RIVM, NDOV), and returns explainable scored signals. Standard commands live in `package.json` scripts and the README "Run locally" section; use those.

Non-obvious notes for future agents:

- Dependencies are installed by the startup update script (`npm ci`), so you do not need to reinstall. Copy the env file if it is missing: `cp .env.example .env.local`.
- Supabase is optional. With no `NEXT_PUBLIC_SUPABASE_URL` / keys set (the default local state), analysis responses fall back to `cache-only` persistence and the core address-search → property-report flow still works end to end. The Supabase-backed `/mijn-aankoop` purchase cockpit and `/login` require real Supabase credentials to be functional.
- The app calls live external services for its core flow, so the dev VM needs outbound internet. Good smoke tests: `curl localhost:3000/api/health` and `curl "localhost:3000/api/address/search?q=Korenstraat%2018%2C%20Epe"`. A known-good address for manual/GUI testing is `Korenstraat 18, Epe`.
- Run the dev server with `npm run dev` (port 3000). Quality gates mirror CI (`.github/workflows/ci.yml`): `npm test` (node --test, no watch), `npm run lint`, `npm run typecheck`, `npm run build`.
- `npm run db:push` / `npm run db:types` require the Supabase CLI plus a linked project; they are not part of local dev and will fail without Supabase configuration.
