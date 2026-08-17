import assert from "node:assert/strict";
import test from "node:test";
import { listingMatchesBuyerProfile } from "@/src/lib/listing-profile-match";
import { EMPTY_BUYER_PROFILE, DEFAULT_BUYER_PROFILE } from "@/src/lib/purchase";
import type { PropertyListing } from "@/src/lib/types";

function listing(overrides: Partial<PropertyListing> = {}): PropertyListing {
  return {
    provider: "Funda (door jou toegevoegd)",
    externalId: "1",
    sourceUrl: "https://www.funda.nl/detail/koop/dordrecht/huis-1/1/",
    fetchedAt: "2026-08-17T00:00:00.000Z",
    status: "active",
    askingPrice: 325000,
    bedroomCount: 3,
    propertyType: "Eengezinswoning, tussenwoning",
    outdoorSpaceM2: 54,
    gardenOrientation: "westen",
    ...overrides,
  };
}

test("listingMatchesBuyerProfile is unknown without a listing", () => {
  const chips = listingMatchesBuyerProfile(null, DEFAULT_BUYER_PROFILE);
  assert.equal(chips[0]?.status, "unknown");
});

test("listingMatchesBuyerProfile passes bedrooms garden and type when Funda matches", () => {
  const chips = listingMatchesBuyerProfile(listing(), {
    ...EMPTY_BUYER_PROFILE,
    bedrooms: 3,
    garden: true,
    propertyType: "house",
    budget: 400000,
  });
  assert.equal(chips.find((chip) => chip.key === "bedrooms")?.status, "pass");
  assert.equal(chips.find((chip) => chip.key === "garden")?.status, "pass");
  assert.equal(chips.find((chip) => chip.key === "type")?.status, "pass");
  assert.equal(chips.find((chip) => chip.key === "budget")?.status, "pass");
});

test("listingMatchesBuyerProfile fails bedrooms when the listing has fewer", () => {
  const chips = listingMatchesBuyerProfile(listing({ bedroomCount: 2 }), {
    ...EMPTY_BUYER_PROFILE,
    bedrooms: 3,
  });
  assert.equal(chips.find((chip) => chip.key === "bedrooms")?.status, "fail");
});

test("listingMatchesBuyerProfile stays unknown when Funda omits the field", () => {
  const chips = listingMatchesBuyerProfile(listing({ bedroomCount: undefined, parking: undefined }), {
    ...EMPTY_BUYER_PROFILE,
    bedrooms: 3,
    parking: true,
  });
  assert.equal(chips.find((chip) => chip.key === "bedrooms")?.status, "unknown");
  assert.equal(chips.find((chip) => chip.key === "parking")?.status, "unknown");
});

test("listingMatchesBuyerProfile flags VvE when the buyer rejects it", () => {
  const chips = listingMatchesBuyerProfile(listing({ vveContribution: 180 }), {
    ...EMPTY_BUYER_PROFILE,
    acceptVve: false,
  });
  assert.equal(chips.find((chip) => chip.key === "vve")?.status, "fail");
});

test("listingMatchesBuyerProfile leaves VvE unknown when Funda omits it", () => {
  const chips = listingMatchesBuyerProfile(listing({ vveContribution: undefined }), {
    ...EMPTY_BUYER_PROFILE,
    acceptVve: false,
  });
  assert.equal(chips.find((chip) => chip.key === "vve")?.status, "unknown");
});
