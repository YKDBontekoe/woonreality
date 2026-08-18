import assert from "node:assert/strict";
import test from "node:test";
import {
  LISTING_HISTORY_LIMIT,
  comparisonListingFromUserRow,
  formatCapturedAt,
  listingHistoryFromRows,
  listingHistoryItemFromRow,
  type ListingHistoryRow,
} from "../src/lib/listing-history";

const BAG_A = "0232010000003562";
const BAG_B = "0232010000003563";
const FUNDA_URL = "https://www.funda.nl/detail/koop/epe/huis-12345678-korenstraat-18/12345678/";
const CAPTURED = "2026-08-18T12:00:00.000Z";

function row(overrides: ListingHistoryRow = {}): ListingHistoryRow {
  return {
    bag_vbo_id: BAG_A,
    source_url: FUNDA_URL,
    asking_price: 525000,
    extracted_json: {
      addressLabel: "Korenstraat 18",
      city: "Epe",
      postcode: "8161 HP",
      livingAreaM2: 128,
      roomCount: 5,
      energyLabel: "C",
      vveContribution: 145,
      description: "Lichte hoekwoning die niet in de geschiedenispayload mag.",
    },
    created_at: "2026-08-01T09:00:00.000Z",
    updated_at: CAPTURED,
    ...overrides,
  };
}

test("listing history keeps Funda listings and drops price-only rows", () => {
  const items = listingHistoryFromRows([
    row(),
    row({
      bag_vbo_id: BAG_B,
      source_url: null,
      asking_price: 400000,
      extracted_json: { askingPrice: 400000 },
    }),
    row({
      bag_vbo_id: "0232010000003564",
      source_url: "https://www.funda.nl/zoeken/koop?selected_area=%5B%22epe%22%5D",
    }),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].bagVboId, BAG_A);
  assert.equal(items[0].addressLabel, "Korenstraat 18");
  assert.equal(items[0].city, "Epe");
  assert.equal(items[0].postcode, "8161 HP");
  assert.equal(items[0].askingPrice, 525000);
  assert.equal(items[0].livingAreaM2, 128);
  assert.equal(items[0].roomCount, 5);
  assert.equal(items[0].energyLabel, "C");
  assert.equal(items[0].vveContribution, 145);
  assert.equal(items[0].sourceUrl, FUNDA_URL);
  assert.doesNotMatch(JSON.stringify(items[0]), /geschiedenispayload/);
});

test("listing history falls back to the Funda slug when kenmerken have no address", () => {
  const item = listingHistoryItemFromRow(row({
    asking_price: null,
    extracted_json: {},
  }));
  assert.ok(item);
  assert.equal(item.addressLabel, "Korenstraat 18");
  assert.equal(item.city, "Epe");
  assert.equal(item.askingPrice, null);
});

test("listing history prefers extracted address over the URL slug", () => {
  const item = listingHistoryItemFromRow(row({
    extracted_json: {
      addressLabel: "Brinklaan 3",
      city: "Apeldoorn",
      street: "Brinklaan",
      houseNumber: 3,
    },
  }));
  assert.ok(item);
  assert.equal(item.addressLabel, "Brinklaan 3");
  assert.equal(item.city, "Apeldoorn");
});

test("listing history sorts by capture time and caps at 50", () => {
  const rows = Array.from({ length: LISTING_HISTORY_LIMIT + 1 }, (_, index) => row({
    bag_vbo_id: `02320100000035${String(index).padStart(2, "0")}`,
    updated_at: new Date(Date.parse("2026-08-01T00:00:00.000Z") + index * 60_000).toISOString(),
    extracted_json: {},
  }));
  const items = listingHistoryFromRows(rows);
  assert.equal(items.length, LISTING_HISTORY_LIMIT);
  assert.equal(items[0].bagVboId, "0232010000003550");
  assert.equal(items.at(-1)?.bagVboId, "0232010000003501");
  assert.equal(items.some((item) => item.bagVboId === "0232010000003500"), false);
});

test("comparison listing facts read kenmerken without copying listing text", () => {
  const facts = comparisonListingFromUserRow({
    asking_price: 525000,
    extracted_json: {
      livingAreaM2: 128,
      roomCount: 5,
      bedroomCount: 4,
      energyLabel: "C",
      vveContribution: 145,
      description: "niet meenemen",
    },
  });
  assert.deepEqual(facts, {
    askingPrice: 525000,
    livingAreaM2: 128,
    roomCount: 5,
    bedroomCount: 4,
    energyLabel: "C",
    vveContribution: 145,
  });
});

test("formatCapturedAt uses Dutch relative time", () => {
  const now = Date.parse("2026-08-18T12:00:00.000Z");
  assert.match(formatCapturedAt("2026-08-18T11:59:30.000Z", now), /30 seconden geleden/);
  assert.match(formatCapturedAt("2026-08-18T10:00:00.000Z", now), /2 uur geleden/);
  assert.match(formatCapturedAt("2026-07-01T12:00:00.000Z", now), /1-7-2026|01-07-2026|1 jul/);
});
