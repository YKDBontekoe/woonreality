import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUYER_PROFILE, estimateBidRange, formatEuro, profileCompletion } from "../src/lib/purchase";

test("profile completion reflects the five core fields", () => {
  assert.equal(profileCompletion(DEFAULT_BUYER_PROFILE), 100);
  assert.equal(profileCompletion({ ...DEFAULT_BUYER_PROFILE, searchArea: "" }), 80);
});

test("bid scenarios stay rounded to practical increments", () => {
  assert.deepEqual(estimateBidRange(525000), { cautious: 520000, balanced: 527500, strong: 535500 });
  assert.equal(estimateBidRange(0), null);
});

test("currency formatting is Dutch and compact", () => {
  assert.equal(formatEuro(527500), "€ 527.500");
  assert.equal(formatEuro(null), "—");
});
