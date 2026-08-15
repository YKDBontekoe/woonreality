import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUYER_PROFILE, estimateBidRange, formatEuro, profileCompletion } from "../src/lib/purchase";
import { checklistBodySchema, workspaceBodySchema } from "../src/lib/validation/workspace";

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

test("workspace and checklist validators reject unknown or malformed fields", () => {
  assert.equal(workspaceBodySchema.safeParse({ action: "stage", bagVboId: "0232010000003562", stage: "__proto__" }).success, false);
  assert.equal(workspaceBodySchema.safeParse({ action: "profile", buyerProfile: { budget: 500000, monthlyPayment: 2000, ownFunds: 50000, searchArea: "Epe", bedrooms: 3, garden: false, parking: false, remoteWork: true, unexpected: true } }).success, false);
  assert.equal(checklistBodySchema.safeParse({ items: [{ id: "1", label: "Vraag", checked: true, extra: "nee" }] }).success, false);
});
