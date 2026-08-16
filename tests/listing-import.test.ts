import assert from "node:assert/strict";
import test from "node:test";
import { POST as importFromUrl } from "@/app/api/listing/from-url/route";
import { POST as importListing } from "@/app/api/listing/user/[bagId]/import/route";
import {
  extractFundaListingFromHtml,
  inspectFundaListing,
  isFundaChallengeHtml,
  isFundaListingUrl,
  listingFromImportedFacts,
  mergeListingFacts,
  parseFundaListingAddress,
} from "@/src/lib/listing-import";

const BAG_ID = "0200100000000001";
const LISTING_URL = "https://www.funda.nl/detail/koop/epe/huis-12345678-korenstraat-18/12345678/";

const FIXTURE_HTML = `<!doctype html>
<html lang="nl"><body>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": ["House", "Product"],
  "name": "Korenstraat 18",
  "description": "Lichte hoekwoning met tuin op het zuiden en een ruime woonkamer aan de straat.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Korenstraat 18",
    "postalCode": "8161 HP",
    "addressLocality": "Epe"
  },
  "numberOfRooms": 5,
  "numberOfBedrooms": 4,
  "floorSize": { "@type": "QuantitativeValue", "value": 128, "unitCode": "MTK" },
  "offers": { "@type": "Offer", "price": 525000, "priceCurrency": "EUR" },
  "datePosted": "2026-08-01"
}
</script>
<h1>Korenstraat 18</h1>
<h2>Omschrijving</h2>
<p>Lichte hoekwoning met tuin op het zuiden en een ruime woonkamer aan de straat. De keuken is recent vernieuwd.</p>
<h2>Buurt</h2>
<p>Epe-centrum met winkels, scholen en groen op loopafstand. De Veluwe begint achter de wijk.</p>
<dl>
  <dt>Vraagprijs</dt><dd>€ 525.000 k.k.</dd>
  <dt>Wonen</dt><dd>128 m²</dd>
  <dt>Perceeloppervlakte</dt><dd>240 m²</dd>
  <dt>Energielabel</dt><dd>C</dd>
  <dt>Bouwjaar</dt><dd>1987</dd>
  <dt>Aantal kamers</dt><dd>5 kamers (4 slaapkamers)</dd>
  <dt>Aantal badkamers</dt><dd>1</dd>
  <dt>Soort woonhuis</dt><dd>Eengezinswoning</dd>
  <dt>Bijdrage VvE</dt><dd>€ 145</dd>
  <dt>Isolatie</dt><dd>Dak, muur en vloer</dd>
  <dt>Balkon</dt><dd>Ja</dd>
  <dt>Eigendomssituatie</dt><dd>Volle eigendom</dd>
</dl>
<p>Ruime woning. Vraagprijs € 525.000. Erfpacht.</p>
</body></html>`;

const CHALLENGE_HTML = `<!doctype html><html><head><title>Je bent bijna op de pagina die je zoekt [funda]</title></head>
<body><h1>Je bent bijna op de pagina die je zoekt</h1>
<form id="fundaCaptchaForm" action="/__akam_recaptcha_validate"></form>
<script>grecaptcha.render("fundaCaptchaInput")</script>
</body></html>`;

test("isFundaListingUrl accepts a listing and rejects search or other hosts", () => {
  assert.equal(isFundaListingUrl(LISTING_URL), true);
  assert.equal(isFundaListingUrl("https://www.funda.nl/koop/epe/huis-12345678-korenstraat-18/"), true);
  assert.equal(isFundaListingUrl("https://www.funda.nl/zoeken/koop?selected_area=%5B%22epe%22%5D"), false);
  assert.equal(isFundaListingUrl("https://www.funda.nl/koop/epe/"), false);
  assert.equal(isFundaListingUrl("https://www.pararius.nl/koop/epe/huis-12345678"), false);
  assert.equal(isFundaListingUrl("http://www.funda.nl/detail/koop/epe/huis-12345678-korenstraat-18/12345678/"), true);
});

test("parseFundaListingAddress reads city, street and house number from the slug", () => {
  const epe = parseFundaListingAddress(LISTING_URL);
  assert.equal(epe?.city, "Epe");
  assert.equal(epe?.street, "Korenstraat");
  assert.equal(epe?.houseNumber, 18);
  assert.equal(epe?.query, "Korenstraat 18, Epe");
  const amsterdam = parseFundaListingAddress("https://www.funda.nl/detail/koop/amsterdam/appartement-44451286-van-leijenberghlaan-2-t/44451286/");
  assert.equal(amsterdam?.city, "Amsterdam");
  assert.equal(amsterdam?.street, "Van Leijenberghlaan");
  assert.equal(amsterdam?.houseNumber, 2);
  assert.equal(amsterdam?.houseLetter, "T");
  const currentFormat = parseFundaListingAddress("https://www.funda.nl/detail/koop/epe/appartement-brinklaan-3/43346549/");
  assert.equal(currentFormat?.city, "Epe");
  assert.equal(currentFormat?.street, "Brinklaan");
  assert.equal(currentFormat?.houseNumber, 3);
  assert.equal(currentFormat?.query, "Brinklaan 3, Epe");
  const apeldoorn = parseFundaListingAddress("https://www.funda.nl/detail/koop/apeldoorn/appartement-korenstraat-26/43923102/");
  assert.equal(apeldoorn?.street, "Korenstraat");
  assert.equal(apeldoorn?.houseNumber, 26);
  assert.equal(apeldoorn?.city, "Apeldoorn");
  assert.equal(apeldoorn?.query, "Korenstraat 26, Apeldoorn");
});

test("extractFundaListingFromHtml prefers labelled Wonen over JSON-LD floorSize", () => {
  const html = `<!doctype html><html><body>
<script type="application/ld+json">
{"@type":"Apartment","floorSize":{"value":31,"unitCode":"MTK"},"offers":{"price":635000}}
</script>
<dl>
  <dt>Vraagprijs</dt><dd>€ 635.000 k.k.</dd>
  <dt>Wonen</dt><dd>127 m²</dd>
  <dt>Buitenruimte</dt><dd>9 m²</dd>
  <dt>Inhoud</dt><dd>373 m³</dd>
</dl>
</body></html>`;
  const facts = extractFundaListingFromHtml(html);
  assert.equal(facts.livingAreaM2, 127);
  assert.equal(facts.askingPrice, 635000);
  assert.equal(facts.outdoorSpaceM2, 9);
  assert.equal(facts.extraKenmerken?.Wonen, "127 m²");
});

test("extractFundaListingFromHtml reads JSON-LD, kenmerken and free text", () => {
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
  assert.equal(facts.city, "Epe");
  assert.equal(facts.postcode, "8161 HP");
  assert.match(facts.description ?? "", /Lichte hoekwoning/);
  assert.ok(facts.sections?.some((section) => /Buurt/i.test(section.title) && /Veluwe/i.test(section.text)));
  assert.equal(facts.extraKenmerken?.["Eigendomssituatie"], "Volle eigendom");
  assert.ok(facts.notes.some((note) => /erfpacht/i.test(note)));
  const listing = listingFromImportedFacts(LISTING_URL, facts, "2026-08-16T10:00:00.000Z");
  assert.equal(listing.provider, "Funda (door jou toegevoegd)");
  assert.equal(listing.externalId, "12345678");
  assert.equal(listing.pricePerM2, Math.round(525000 / 128));
  assert.match(listing.description ?? "", /Lichte hoekwoning/);
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

test("challenge HTML is detected and inspectFundaListing still returns the URL address", async () => {
  assert.equal(isFundaChallengeHtml(CHALLENGE_HTML), true);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(CHALLENGE_HTML, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const inspected = await inspectFundaListing(LISTING_URL);
    assert.equal(inspected.blocked, true);
    assert.equal(inspected.facts.street, "Korenstraat");
    assert.equal(inspected.facts.houseNumber, 18);
    assert.equal(inspected.facts.city, "Epe");
    assert.ok(inspected.facts.notes.some((note) => /mensen-check|niet vrij/i.test(note)));
  } finally {
    globalThis.fetch = originalFetch;
  }
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
    const body = await response.json() as { listing?: { askingPrice?: number; livingAreaM2?: number; description?: string }; persisted?: boolean };
    assert.equal(body.listing?.askingPrice, 525000);
    assert.equal(body.listing?.livingAreaM2, 128);
    assert.match(body.listing?.description ?? "", /Lichte hoekwoning/);
    assert.equal(body.persisted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("from-url route resolves the BAG address from a Funda listing page", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://www.funda.nl/")) {
      return new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.includes("location-api")) {
      return Response.json({
        features: [{
          id: "adres-1",
          geometry: { coordinates: [5.98, 52.35] },
          properties: {
            display_name: "Korenstraat 18, 8161 HP Epe",
            href: ["https://api.pdok.nl/kadaster/bag/ogc/v2/collections/adres/items/adres-1"],
            score: 1,
          },
        }],
      });
    }
    if (url.includes("/adres/items/")) {
      return Response.json({ properties: { adresseerbaar_object_identificatie: BAG_ID } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  try {
    const response = await importFromUrl(new Request("http://localhost/api/listing/from-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceUrl: LISTING_URL }),
    }));
    assert.equal(response.status, 200);
    const body = await response.json() as {
      address?: { bagVboId?: string; displayName?: string };
      listing?: { askingPrice?: number; description?: string };
      blocked?: boolean;
    };
    assert.equal(body.address?.bagVboId, BAG_ID);
    assert.match(body.address?.displayName ?? "", /Korenstraat 18/);
    assert.equal(body.listing?.askingPrice, 525000);
    assert.match(body.listing?.description ?? "", /Lichte hoekwoning/);
    assert.equal(body.blocked, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
