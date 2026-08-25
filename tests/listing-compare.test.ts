import assert from "node:assert/strict";
import test from "node:test";
import { listingDiscrepancies } from "../src/lib/listing-compare";
import type { Analysis, PropertyListing } from "../src/lib/types";

const property = {
  postcode: "1234 AB",
  buildingYear: 1975,
  areaM2: 100,
};

const analysis = {
  property,
  wozBenchmark: { buurtAverage: 320_000, fetchedAt: "2026-08-01T00:00:00.000Z" },
} as unknown as Pick<Analysis, "property" | "wozBenchmark">;

function listing(overrides: Partial<PropertyListing> = {}): PropertyListing {
  return {
    provider: "user",
    externalId: "1",
    sourceUrl: "https://www.funda.nl/detail/koop/x",
    fetchedAt: "2026-08-01T00:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

test("listingDiscrepancies returns nothing without a listing", () => {
  assert.deepEqual(listingDiscrepancies(null, analysis), []);
});

test("postcode mismatch is flagged regardless of formatting", () => {
  const result = listingDiscrepancies(listing({ addressLabel: "Mooi huis in Epe (8191 AA)" }), analysis);
  const postcode = result.find((item) => item.key === "postcode");
  assert.equal(postcode?.severity, "mismatch");
  assert.equal(postcode?.listingValue, "8191AA");
});

test("matching area and build year count as match", () => {
  const result = listingDiscrepancies(listing({ livingAreaM2: 103, constructionYear: 1975 }), analysis);
  assert.equal(result.find((item) => item.key === "livingArea")?.severity, "match");
  assert.equal(result.find((item) => item.key === "constructionYear")?.severity, "match");
});

test("deviating area or year is a mismatch", () => {
  const result = listingDiscrepancies(listing({ livingAreaM2: 130, constructionYear: 1960 }), analysis);
  assert.equal(result.find((item) => item.key === "livingArea")?.severity, "mismatch");
  assert.equal(result.find((item) => item.key === "constructionYear")?.severity, "mismatch");
});

test("inconsistent price per m2 inside the ad draws attention", () => {
  const result = listingDiscrepancies(listing({ askingPrice: 400_000, livingAreaM2: 100, pricePerM2: 2500 }), analysis);
  assert.equal(result.find((item) => item.key === "pricePerM2")?.severity, "attention");
  assert.equal(result.find((item) => item.key === "pricePerM2")?.officialValue, 4000);
});

test("asking price far above buurt WOZ average is attention, not mismatch", () => {
  const result = listingDiscrepancies(listing({ askingPrice: 500_000, wozRatioHint: undefined } as Partial<PropertyListing>), analysis);
  const ratio = result.find((item) => item.key === "askingVsWoz");
  assert.equal(ratio?.severity, "attention");
  assert.equal(ratio?.officialValue, 320_000);
});

test("asking price near buurt WOZ average stays neutral", () => {
  const result = listingDiscrepancies(listing({ askingPrice: 330_000 }), analysis);
  assert.equal(result.find((item) => item.key === "askingVsWoz")?.severity, "match");
});

test("missing official values are simply not compared", () => {
  const empty = { property: { postcode: "", buildingYear: undefined, areaM2: undefined }, wozBenchmark: undefined } as unknown as Pick<Analysis, "property" | "wozBenchmark">;
  const result = listingDiscrepancies(listing({ livingAreaM2: 120, constructionYear: 1900, askingPrice: 400_000 }), empty);
  assert.deepEqual(result, []);
});
