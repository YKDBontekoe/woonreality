import assert from "node:assert/strict";
import test from "node:test";
import { analyzePlace } from "@/src/lib/analysis/analyze-place";

const buurtProperties = {
  buurtnaam: "Epe Centrum",
  gemeentenaam: "Epe",
  buurtcode: "BU02320000",
  wijkcode: "WK023200",
  gemeentecode: "GM0232",
  aantal_inwoners: 1670,
  grote_supermarkt_gemiddelde_afstand_in_km: 0.4,
  basisonderwijs_gemiddelde_afstand_in_km: 0.5,
};

test("analyzePlace returns neighborhood signals for a buurt code", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/collections/buurten/items") && url.includes("buurtcode=BU02320000")) {
      return Response.json({
        features: [{
          bbox: [5.96, 52.35, 5.98, 52.36],
          properties: buurtProperties,
        }],
      });
    }
    if (url.includes("86296NED")) {
      return Response.json({ value: [] });
    }
    if (url.includes("47018NED")) {
      return Response.json({ value: [] });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const place = await analyzePlace("buurt", "BU02320000");
    assert.ok(place);
    assert.equal(place.kind, "buurt");
    assert.equal(place.name, "Epe Centrum");
    assert.ok(place.signals.some((signal) => signal.key === "cbs-context"));
    assert.ok(place.signals.some((signal) => signal.key === "schools"));
    assert.equal(place.buurten.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analyzePlace lists child buurten for a gemeente", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/collections/gemeenten/items") && url.includes("gemeentecode=GM0232")) {
      return Response.json({
        features: [{
          bbox: [5.84, 52.25, 6.09, 52.39],
          properties: {
            gemeentenaam: "Epe",
            gemeentecode: "GM0232",
            aantal_inwoners: 33168,
          },
        }],
      });
    }
    if (url.includes("/collections/buurten/items") && url.includes("gemeentecode=GM0232")) {
      return Response.json({
        features: [
          { properties: { buurtcode: "BU02320000", buurtnaam: "Epe Centrum", aantal_inwoners: 1670 } },
          { properties: { buurtcode: "BU02320001", buurtnaam: "Hoge Weerd", aantal_inwoners: 900 } },
        ],
      });
    }
    if (url.includes("86296NED") || url.includes("47018NED")) {
      return Response.json({ value: [] });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const place = await analyzePlace("gemeente", "GM0232");
    assert.ok(place);
    assert.equal(place.kind, "gemeente");
    assert.equal(place.name, "Epe");
    assert.equal(place.buurten.length, 2);
    assert.equal(place.buurten[0]?.name, "Epe Centrum");
    assert.equal(place.buurtenTruncated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analyzePlace resolves woonplaats via Polygon geometry and gemeente lookup", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/collections/woonplaats/items") && url.includes("identificatie=1344")) {
      return Response.json({
        features: [{
          properties: {
            identificatie: "1344",
            woonplaats: "Epe",
            bronhouder_identificatie: "0232",
            provincie_naam: "Gelderland",
          },
          geometry: {
            type: "Polygon",
            coordinates: [[[5.95, 52.35], [5.96, 52.35], [5.96, 52.36], [5.95, 52.36], [5.95, 52.35]]],
          },
        }],
      });
    }
    if (url.includes("/collections/gemeenten/items") && url.includes("gemeentecode=GM0232")) {
      return Response.json({
        features: [{
          properties: {
            gemeentenaam: "Epe",
            gemeentecode: "GM0232",
            aantal_inwoners: 33168,
          },
          geometry: {
            type: "MultiPolygon",
            coordinates: [[[[5.84, 52.25], [6.09, 52.25], [6.09, 52.39], [5.84, 52.39], [5.84, 52.25]]]],
          },
        }],
      });
    }
    if (url.includes("/collections/buurten/items") && url.includes("gemeentecode=GM0232")) {
      return Response.json({
        features: [
          { properties: { buurtcode: "BU02320000", buurtnaam: "Epe Centrum", aantal_inwoners: 1670 } },
        ],
      });
    }
    if (url.includes("86296NED") || url.includes("47018NED")) {
      return Response.json({ value: [] });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const place = await analyzePlace("woonplaats", "1344");
    assert.ok(place);
    assert.equal(place.kind, "woonplaats");
    assert.equal(place.name, "Epe");
    assert.equal(place.subtitle, "Gelderland");
    assert.equal(place.buurten.length, 1);
    assert.ok(place.signals.some((signal) => signal.key === "schools"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analyzePlace survives rejected optional SES lookup", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/collections/buurten/items") && url.includes("buurtcode=BU02320000")) {
      return Response.json({
        features: [{
          bbox: [5.96, 52.35, 5.98, 52.36],
          properties: buurtProperties,
        }],
      });
    }
    if (url.includes("86296NED")) {
      throw new Error("SES unavailable");
    }
    if (url.includes("47018NED")) {
      return Response.json({ value: [] });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const place = await analyzePlace("buurt", "BU02320000");
    assert.ok(place);
    assert.equal(place.sources.find((source) => source.source === "CBS SES-WOA")?.status, "unavailable");
    assert.ok(place.signals.some((signal) => signal.key === "cbs-context"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
