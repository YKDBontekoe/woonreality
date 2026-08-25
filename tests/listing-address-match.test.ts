import assert from "node:assert/strict";
import test from "node:test";
import { expectedAddressFromQuery, pickAddressMatch } from "@/src/lib/listing-address-match";
import type { AddressSearchResult } from "@/src/lib/types";

function address(displayName: string, bagVboId = "0200100000000001"): AddressSearchResult {
  return {
    kind: "adres",
    id: `adres-${bagVboId}`,
    bagVboId,
    displayName,
    coordinates: { lat: 52.35, lng: 5.98 },
    href: `https://api.pdok.nl/bag/adres/items/${bagVboId}`,
    score: 1,
  };
}

test("expectedAddressFromQuery extracts street words, number and city", () => {
  const expected = expectedAddressFromQuery("Korenstraat 18 A, Epe");
  assert.deepEqual(expected.streetWords, ["korenstraat"]);
  assert.equal(expected.houseNumber, 18);
  assert.equal(expected.houseAddition, "a");
  assert.equal(expected.city, "epe");
});

test("pickAddressMatch prefers the result that matches street, number and city", () => {
  const results = [
    address("Korenstraat 26, 7331 BC Apeldoorn", "0200100000000002"),
    address("Korenstraat 18, 8161 HP Epe"),
  ];
  const match = pickAddressMatch("Korenstraat 18, Epe", results);
  assert.equal(match?.address.bagVboId, "0200100000000001");
  assert.equal(match?.confidence, "high");
});

test("pickAddressMatch handles diacritics in street names", () => {
  const match = pickAddressMatch("Sgr. van Cuyckstraat 4, Epe", [
    address("'s-Gravenweg 4, 8161 DA Epe", "0200100000000009"),
    address("S'Gr van Cuyckstraat 4, 8161 EE Epe"),
  ]);
  assert.match(match?.address.displayName ?? "", /Cuyck/i);
});

test("pickAddressMatch reports low confidence when nothing matches the expected number", () => {
  const match = pickAddressMatch("Korenstraat 18, Epe", [
    address("Korenstraat 3, 8161 HP Epe", "0200100000000003"),
  ]);
  assert.equal(match?.confidence, "low");
});

test("pickAddressMatch keeps medium confidence for partial street matches", () => {
  const match = pickAddressMatch("Van Leijenberghlaan 2 T, Amsterdam", [
    address("Leijenberghlaan 2, 1082 GA Amsterdam", "0200100000000004"),
  ]);
  assert.equal(match?.confidence, "medium");
});
