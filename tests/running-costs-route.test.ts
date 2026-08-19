import assert from "node:assert/strict";
import test from "node:test";
import { GET as getRunningCosts } from "@/app/api/running-costs/[bagId]/route";

const BAG_ID = "0232010000003562";

test("running-costs route rejects Infinity vveContribution without fetching", async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    throw new Error("unexpected fetch");
  }) as typeof fetch;

  try {
    const response = await getRunningCosts(
      new Request(`http://localhost/api/running-costs/${BAG_ID}?vveContribution=Infinity`),
      { params: Promise.resolve({ bagId: BAG_ID }) },
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /Ongeldige VvE/i);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("running-costs route includes vveContribution when valid numeric", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("collections/verblijfsobject/items")) {
        return Response.json({
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [5.98, 52.34] },
              properties: {
                openbare_ruimte_naam: "Korenstraat",
                huisnummer: 18,
                huisletter: null,
                toevoeging: null,
                postcode: "8162WT",
                woonplaats_naam: "Epe",
                provincie_naam: "Gelderland",
                oppervlakte: 107,
                gebruiksdoel: "woonfunctie",
                pand: ["https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items/pand-1?f=json"],
              },
            },
          ],
        });
      }

      if (url.includes("collections/pand/items/pand-1")) {
        return Response.json({
          type: "Feature",
          geometry: { type: "Point", coordinates: [5.98, 52.34] },
          properties: { bouwjaar: 2010 },
        });
      }

      if (url.includes("85592ENG/TypedDataSet")) {
        return Response.json({
          value: [
            {
              VAT: "A048944",
              Periods: "2026MM07",
              VariableSupplyRateContractPrices_3: 0.58,
              EnergyTax_6: 0.73,
              TransportRate_1: 187.85,
              FixedSupplyRateFixedAndVariable_2: 67.48,
              VariableSupplyRateContractPrices_9: 0.15,
              EnergyTax_14: 0.12,
              TransportRate_7: 257.35,
              FixedSupplyRateFixedAndVariable_8: 67.49,
              EnergyTaxRefund_15: -635,
            },
          ],
        });
      }

      if (url.includes("85140NED/TypedDataSet")) {
        return Response.json({
          value: [
            {
              Perioden: "2024JJ00",
              GemiddeldeAardgasleveringTempGecorr_3: 1050,
              GemiddeldeAardgasTempGecPerOpp_13: 10.5,
              GemiddeldeElektriciteitslevering_23: 2750,
            },
          ],
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const response = await getRunningCosts(
      new Request(`http://localhost/api/running-costs/${BAG_ID}?vveContribution=150`),
      { params: Promise.resolve({ bagId: BAG_ID }) },
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { lines: Array<{ key: string; amountMonthly: number }> };
    const vve = body.lines.find((l) => l.key === "vve");
    assert.ok(vve);
    assert.equal(vve?.amountMonthly, 150);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

