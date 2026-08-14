import assert from "node:assert/strict";
import test from "node:test";
import { normalizeListing } from "@/src/lib/sources/listings";

test("normalizeListing maps the licensed feed contract and keeps provenance", () => {
  const listing = normalizeListing({
    listing: {
      id: "listing-123",
      url: "https://provider.example/listings/123",
      status: "available",
      asking_price: "€ 450.000",
      living_area_m2: "92",
      rooms: 5,
      bedrooms: 3,
      construction_year: 1987,
      balcony: "ja",
      solar_panel_count: 8,
      published_at: "2026-08-01",
    },
  }, "Test provider", "2026-08-14T10:00:00.000Z");

  assert.deepEqual(listing, {
    provider: "Test provider",
    externalId: "listing-123",
    sourceUrl: "https://provider.example/listings/123",
    fetchedAt: "2026-08-14T10:00:00.000Z",
    status: "active",
    askingPrice: 450000,
    livingAreaM2: 92,
    roomCount: 5,
    bedroomCount: 3,
    constructionYear: 1987,
    balcony: true,
    solarPanelCount: 8,
    firstPublishedAt: "2026-08-01T00:00:00.000Z",
  });
});

test("normalizeListing rejects payloads without a usable source URL", () => {
  assert.equal(normalizeListing({ id: "listing-123", askingPrice: 450000 }, "Test provider"), null);
});
