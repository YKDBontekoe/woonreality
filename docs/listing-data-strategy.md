# Listing and surrounding-address data strategy

Last reviewed: 16 August 2026

## Decision

Do not scrape Funda or Pararius catalogs in WoonReality. Funda's current terms prohibit scraping and data mining without prior written permission; Pararius prohibits commercial screen scraping. `robots.txt` is not a licence and does not override those terms. A crawler would also be brittle because page markup and bot protection can change without notice.

A user may still paste **one listing URL** they are looking at. WoonReality then fetches only that page, on that click, to fill missing asking-price and kenmerken fields. Search results, related pages, photos and floor plans stay out of scope.

Use provider adapters with explicit provenance instead:

1. **Now — open official data:** query nearby BAG verblijfsobjecten through PDOK. This provides address, BAG identifier, registered use, usable area and coordinates for surrounding homes. WoonReality now does this within 150 metres and returns a distance-sorted selection of up to 12 homes.
2. **Next — official enrichment:** connect EP-Online for labels, CBS neighbourhood data, DSO/KOOP plans and environmental datasets. These improve the address report without copying portal content.
3. **Commercial market data:** use Kadaster Objectinformatie for the last transaction price and object facts. At review time, the general object block is free and the latest purchase price costs EUR 0.45 per address; access requires a Mijn Kadaster API key.
4. **Current listings:** request a licensed feed or written permission from Funda/NVM/brainbay, or contract with a property-data API vendor. Keep this behind a `ListingProvider` interface so licensing can change without changing the analysis model.
5. **User supplied listing:** optionally let a user paste a Funda listing URL, brochure text, page HTML or export. WoonReality fetches **only the single URL the user submitted**, extracts kenmerken, retains the source URL and timestamp, and never crawls search results or related pages. If Funda blocks the request, the user pastes advertentietekst or page HTML instead — still without bypassing bot protection.

## User-initiated Funda import

A logged-in or guest user can paste one `https://www.funda.nl/...` **listing** URL
in search (Funda-link mode), on the property page, or in the landing intake.
`POST /api/listing/from-url` extracts the address from the URL and page, resolves
it via PDOK, and stores kenmerken plus free-text sections. `POST /api/listing/user/:bagId/import`
does the same when the BAG id is already known. Search pages and other hosts are
rejected. This is not a catalog scraper: there is no crawl, no photo/floor-plan
storage, and official BAG/EP-Online facts are never overwritten.

If Funda blocks the fetch with a bot-check, the address is still parsed from the
listing URL so the woningcheck can open. The user can then paste kenmerken or the
page HTML from Funda (after completing the check in their own browser). We never
bypass CAPTCHA or bot protection; pasted content is treated as user-supplied.

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
- Do not store photos, floor plans or descriptions unless the licence explicitly allows it.
- Do not infer resident or owner characteristics from address-level data.
- Cache according to the provider contract and support deletion/expiry.
- Keep market asking data separate from official registry facts and model estimates.

## Primary references

- Funda terms: <https://www.funda.nl/voorwaarden-en-beleid/gebruiksvoorwaarden/>
- Pararius terms: <https://www.pararius.nl/info/algemene-voorwaarden>
- PDOK BAG API: <https://api.pdok.nl/kadaster/bag/ogc/v2?f=html>
- Kadaster Objectinformatie API: <https://www.kadaster.nl/-/objectinformatie-api>
- EP-Online public API: <https://public.ep-online.nl/swagger>
