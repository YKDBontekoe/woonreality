import assert from "node:assert/strict";
import test from "node:test";
import { pdokAddressSearchUrl, pdokLocationSearchUrl } from "@/src/lib/sources/pdok/client";
import { searchAddresses, searchLocations } from "@/src/lib/sources/pdok/location";

test("pdokLocationSearchUrl enables adres, woonplaats, gemeente and plaats collections", () => {
  const url = pdokLocationSearchUrl("Amsterdam", 10);
  assert.match(url, /adres%5Bversion%5D=1/);
  assert.match(url, /woonplaats%5Bversion%5D=1/);
  assert.match(url, /gemeentegebied%5Bversion%5D=1/);
  assert.match(url, /plaats%5Bversion%5D=1/);
  assert.match(url, /limit=10/);
});

test("pdokAddressSearchUrl keeps adres-only search for listing resolution", () => {
  const url = pdokAddressSearchUrl("Korenstraat 18, Epe");
  assert.match(url, /adres%5Bversion%5D=1/);
  assert.doesNotMatch(url, /woonplaats%5Bversion%5D=1/);
});

test("searchLocations ranks places before addresses for place-name queries", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("location-api")) {
      return Response.json({
        features: [
          {
            id: "adres-1",
            geometry: { coordinates: [5.98, 52.35] },
            properties: {
              collection_id: "adres",
              display_name: "Amsterdamweg 1, Almere",
              href: ["https://api.pdok.nl/kadaster/bag/ogc/v2/collections/adres/items/adres-1"],
              score: 1.2,
            },
          },
          {
            id: "gemeente-1",
            geometry: { coordinates: [4.89, 52.37] },
            properties: {
              collection_id: "gemeentegebied",
              display_name: "Amsterdam, Noord-Holland",
              href: ["https://api.pdok.nl/kadaster/bestuurlijkegebieden/ogc/v1/collections/gemeentegebied/items/gemeente-1"],
              score: 1.04,
            },
          },
        ],
      });
    }
    if (url.includes("bestuurlijkegebieden")) {
      return Response.json({ properties: { identificatie: "GM0363", naam: "Amsterdam", ligt_in_provincie_naam: "Noord-Holland" } });
    }
    if (url.includes("/adres/items/")) {
      return Response.json({ properties: { adresseerbaar_object_identificatie: "1234567890123456" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const results = await searchLocations("Amsterdam", 10);
    assert.equal(results.length, 2);
    assert.equal(results[0]?.kind, "gemeente");
    assert.equal(results[1]?.kind, "adres");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("searchLocations ranks addresses first when the query contains a digit", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("location-api")) {
      return Response.json({
        features: [
          {
            id: "woonplaats-1",
            geometry: { coordinates: [5.95, 52.35] },
            properties: {
              collection_id: "woonplaats",
              display_name: "Epe, Epe (Gelderland)",
              href: ["https://api.pdok.nl/kadaster/bag/ogc/v2/collections/woonplaats/items/wp-1"],
              score: 1.1,
            },
          },
          {
            id: "adres-1",
            geometry: { coordinates: [5.98, 52.35] },
            properties: {
              collection_id: "adres",
              display_name: "Korenstraat 18, 8161 HP Epe",
              href: ["https://api.pdok.nl/kadaster/bag/ogc/v2/collections/adres/items/adres-1"],
              score: 1.0,
            },
          },
        ],
      });
    }
    if (url.includes("/adres/items/")) {
      return Response.json({ properties: { adresseerbaar_object_identificatie: "1234567890123456" } });
    }
    if (url.includes("/woonplaats/items/")) {
      return Response.json({ properties: { identificatie: "1344", woonplaats: "Epe", provincie_naam: "Gelderland" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const results = await searchLocations("Korenstraat 18, Epe", 10);
    assert.equal(results[0]?.kind, "adres");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("searchAddresses stays address-only and adds kind adres", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("location-api")) {
      return Response.json({
        features: [{
          id: "adres-1",
          geometry: { coordinates: [5.98, 52.35] },
          properties: {
            collection_id: "adres",
            display_name: "Korenstraat 18, 8161 HP Epe",
            href: ["https://api.pdok.nl/kadaster/bag/ogc/v2/collections/adres/items/adres-1"],
            score: 1,
          },
        }],
      });
    }
    if (url.includes("/adres/items/")) {
      return Response.json({ properties: { adresseerbaar_object_identificatie: "1234567890123456" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const results = await searchAddresses("Korenstraat 18, Epe");
    assert.equal(results.length, 1);
    assert.equal(results[0]?.kind, "adres");
    assert.equal(results[0]?.bagVboId, "1234567890123456");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
