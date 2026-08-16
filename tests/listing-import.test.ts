import assert from "node:assert/strict";
import test from "node:test";
import { POST as importListing } from "@/app/api/listing/user/[bagId]/import/route";
import {
  extractFundaListingFromHtml,
  isFundaListingUrl,
  listingFromImportedFacts,
  mergeListingFacts,
} from "@/src/lib/listing-import";

const BAG_ID = "0200100000000001";
const LISTING_URL = "https://www.funda.nl/detail/koop/epe/huis-12345678-korenstraat-18/12345678/";

const FIXTURE_HTML = `<!doctype html>
<html lang="nl"><body>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Residence",
  "numberOfRooms": 5,
  "numberOfBedrooms": 4,
  "floorSize": { "@type": "QuantitativeValue", "value": 128, "unitCode": "MTK" },
  "offers": { "@type": "Offer", "price": 525000, "priceCurrency": "EUR" },
  "datePosted": "2026-08-01"
}
</script>
<dl>
  <dt>Woonoppervlakte</dt><dd>128 m²</dd>
  <dt>Perceeloppervlakte</dt><dd>240 m²</dd>
  <dt>Energielabel</dt><dd>C</dd>
  <dt>Bouwjaar</dt><dd>1987</dd>
  <dt>Aantal kamers</dt><dd>5</dd>
  <dt>Aantal slaapkamers</dt><dd>4</dd>
  <dt>Aantal badkamers</dt><dd>1</dd>
  <dt>Soort woonhuis</dt><dd>Eengezinswoning</dd>
  <dt>Bijdrage VvE</dt><dd>€ 145</dd>
  <dt>Isolatie</dt><dd>Dak, muur en vloer</dd>
  <dt>Balkon</dt><dd>Ja</dd>
</dl>
<p>Ruime woning. Vraagprijs € 525.000. Erfpacht.</p>
</body></html>`;

test("isFundaListingUrl accepts a listing and rejects search or other hosts", () => {
  assert.equal(isFundaListingUrl(LISTING_URL), true);
  assert.equal(isFundaListingUrl("https://www.funda.nl/koop/epe/huis-12345678-korenstraat-18/"), true);
  assert.equal(isFundaListingUrl("https://www.funda.nl/zoeken/koop?selected_area=%5B%22epe%22%5D"), false);
  assert.equal(isFundaListingUrl("https://www.funda.nl/koop/epe/"), false);
  assert.equal(isFundaListingUrl("https://www.pararius.nl/koop/epe/huis-12345678"), false);
  assert.equal(isFundaListingUrl("http://www.funda.nl/detail/koop/epe/huis-12345678-korenstraat-18/12345678/"), false);
});

test("extractFundaListingFromHtml reads JSON-LD and kenmerken without storing description", () => {
  const facts = extractFundaListingFromHtml(FIXTURE_HTML);
  assert.equal(facts.askingPrice, 525000);
  assert.equal(facts.livingAreaM2, 128);
  assert.equal(facts.plotAreaM2, 240);
  assert.equal(facts.roomCount, 5);
  assert.equal(facts.bedroomCount, 4);
  assert.equal(facts.bathroomCount, 1);
  assert.equal(facts.energyLabel, "C");
  assert.equal(facts.constructionYear, 1987);
  assert.equal(facts.propertyType, "Eengezinswoning");
  assert.equal(facts.vveContribution, 145);
  assert.equal(facts.insulation, "Dak, muur en vloer");
  assert.equal(facts.balcony, true);
  assert.ok(facts.notes.some((note) => /erfpacht/i.test(note)));
  const listing = listingFromImportedFacts(LISTING_URL, facts, "2026-08-16T10:00:00.000Z");
  assert.equal(listing.provider, "Funda (door jou toegevoegd)");
  assert.equal(listing.externalId, "12345678");
  assert.equal(listing.pricePerM2, Math.round(525000 / 128));
  assert.equal(listing.description, undefined);
});

test("mergeListingFacts keeps existing values and fills gaps", () => {
  const merged = mergeListingFacts(
    { askingPrice: 510000, notes: ["Handmatig"] },
    { askingPrice: 525000, livingAreaM2: 128, bedroomCount: 4, notes: ["Funda"] },
  );
  assert.equal(merged.askingPrice, 510000);
  assert.equal(merged.livingAreaM2, 128);
  assert.equal(merged.bedroomCount, 4);
  assert.deepEqual(merged.notes, ["Handmatig", "Funda"]);
});

test("import route rejects invalid BAG ids and non-listing URLs without fetching", async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    throw new Error("should not fetch");
  }) as typeof fetch;
  try {
    const badBag = await importListing(new Request("http://localhost/api/listing/user/abc/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceUrl: LISTING_URL }),
    }), { params: Promise.resolve({ bagId: "abc" }) });
    assert.equal(badBag.status, 400);

    const search = await importListing(new Request(`http://localhost/api/listing/user/${BAG_ID}/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceUrl: "https://www.funda.nl/zoeken/koop" }),
    }), { params: Promise.resolve({ bagId: BAG_ID }) });
    assert.equal(search.status, 400);
    const searchBody = await search.json() as { error?: string };
    assert.match(searchBody.error ?? "", /Funda-advertentielink|zoekresultaat/i);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("import route extracts a fixture page for guests without requiring Supabase", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.equal(String(input), LISTING_URL);
    return new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  try {
    const response = await importListing(new Request(`http://localhost/api/listing/user/${BAG_ID}/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceUrl: LISTING_URL }),
    }), { params: Promise.resolve({ bagId: BAG_ID }) });
    assert.equal(response.status, 200);
    const body = await response.json() as { listing?: { askingPrice?: number; livingAreaM2?: number }; persisted?: boolean };
    assert.equal(body.listing?.askingPrice, 525000);
    assert.equal(body.listing?.livingAreaM2, 128);
    assert.equal(body.persisted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
