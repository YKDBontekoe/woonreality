# Listing and surrounding-address data strategy

Last reviewed: 16 August 2026

## Decision

Do not scrape Funda or Pararius catalogs in WoonReality. Funda's current terms prohibit scraping and data mining without prior written permission; Pararius prohibits commercial screen scraping. `robots.txt` is not a licence and does not override those terms. A crawler would also be brittle because page markup and bot protection can change without notice.

WoonReality **does not HTTP-GET Funda**. A user may paste **one listing URL** so we can resolve the official BAG address from the slug via PDOK. Asking price and kenmerken come from the official browser extension: the user opens that listing in their own browser (after any people-check), the extension parses JSON-LD and kenmerken in the tab, and posts **structured facts** — never page HTML.

Use provider adapters with explicit provenance instead:

1. **Now — open official data:** query nearby BAG verblijfsobjecten through PDOK. This provides address, BAG identifier, registered use, usable area and coordinates for surrounding homes. WoonReality now does this within 150 metres and returns a distance-sorted selection of up to 12 homes.
2. **Next — official enrichment:** connect EP-Online for labels, CBS neighbourhood data, DSO/KOOP plans and environmental datasets. These improve the address report without copying portal content.
3. **Commercial market data:** use Kadaster Objectinformatie for the last transaction price and object facts. At review time, the general object block is free and the latest purchase price costs EUR 0.45 per address; access requires a Mijn Kadaster API key.
4. **Current listings:** request a licensed feed or written permission from Funda/NVM/brainbay, or contract with a property-data API vendor. Keep this behind a `ListingProvider` interface so licensing can change without changing the analysis model.
5. **User supplied listing:** the user opens one Funda listing they are looking at. The WoonReality extension extracts kenmerken in that tab and stores them on that user's `user_listings` row, with source URL and timestamp. Search results, related pages, photos and floor plans stay out of scope. Captcha is never bypassed.

## User-initiated Funda import

A logged-in or guest user can paste one `https://www.funda.nl/...` **listing** URL
in search (Funda-link mode) or on the property page. `POST /api/listing/from-url`
reads the address from the URL slug, resolves it via PDOK, and does not fetch the
Funda page. Kenmerken arrive through `POST /api/listing/extension/ingest` after
the user pairs the Chrome/Edge/Firefox extension. This is not a catalog scraper:
there is no crawl, no photo/floor-plan storage, and official BAG/EP-Online facts
are never overwritten.

## Licensed feed integration

WoonReality exposes `GET /api/listing/:bagId` behind a provider-neutral adapter.
Set `LISTING_PROVIDER_URL` to the licensed provider endpoint; the adapter sends
the BAG VBO id, postcode and house number as query parameters and expects JSON
with `externalId`, `sourceUrl`, and the market fields listed below. An optional
`LISTING_PROVIDER_API_KEY` is sent as a bearer token. The route is private and
non-cacheable by default so retention and display remain controlled by the
provider agreement.

This integration intentionally does not capture browser traffic, replay
undocumented portal requests, bypass bot protection, or infer a Funda API from
the site frontend. A Funda/NVM/brainbay connection should use a documented feed
or written permission and can be connected without changing the normalized app
contract.

## Data worth importing from a licensed listing source

- asking price and price per square metre;
- listing status and first publication date;
- advertised living area versus BAG area;
- plot area, room count, property type and construction details;
- energy label (cross-check against EP-Online);
- VvE contribution and reserves when explicitly stated;
- agent-supplied description, floor plans and photos only when the licence permits display and retention.

Every imported value should carry provider, external listing ID, source URL, fetched time, licence/retention class and confidence. Conflicts should be shown rather than silently overwriting BAG or EP-Online facts.

## Guardrails

- Never bypass login, CAPTCHA, rate limiting or bot protection.
- Do not store photos, floor plans or full listing HTML.
- Do not infer resident or owner characteristics from address-level data.
- Cache according to the provider contract and support deletion/expiry.
- Keep market asking data separate from official registry facts and model estimates.

## Primary references

- Funda terms: <https://www.funda.nl/voorwaarden-en-beleid/gebruiksvoorwaarden/>
- Pararius terms: <https://www.pararius.nl/info/algemene-voorwaarden>
- PDOK BAG API: <https://api.pdok.nl/kadaster/bag/ogc/v2?f=html>
- Kadaster Objectinformatie API: <https://www.kadaster.nl/-/objectinformatie-api>
- EP-Online public API: <https://public.ep-online.nl/swagger>
