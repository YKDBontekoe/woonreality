import assert from "node:assert/strict";
import test from "node:test";
import { offerMemoConditions, buildOfferMemo, offerMemoFilename, offerMemoMarkdown } from "@/src/lib/offer-memo";
import { wozRatio } from "@/src/lib/types";

const baseInput = {
  addressLabel: "Korenstraat 18",
  postcodeCity: "8161 Epe",
  generatedAt: "2026-08-23T12:00:00.000Z",
  scenarioKey: "balanced" as const,
  scenarioLabel: "Gebalanceerd",
  bidAmount: 500_000,
  askingPrice: 525_000,
  financingCondition: true,
  inspectionCondition: true,
  costsTotal: 15_000,
  ownFundsNeeded: 80_000,
  attentionPoints: ["RIVM modelleert wegverkeersgeluid van 60 dB Lden."],
};

test("offer memo lists both conditions when they apply", () => {
  const memo = buildOfferMemo(baseInput);
  const conditions = memo.sections.find((section) => section.title === "Voorwaarden");
  assert.ok(conditions?.lines.some((line) => /Financieringsvoorbehoud/.test(line)));
  assert.ok(conditions?.lines.some((line) => /bouwkundige keuring/.test(line)));
});

test("dropping conditions changes the memo wording", () => {
  const conditions = offerMemoConditions({ financingCondition: false, inspectionCondition: false });
  assert.ok(conditions[0].includes("Geen financieringsvoorbehoud"));
  assert.ok(conditions[1].includes("Geen bouwkundig voorbehoud"));
});

test("memo markdown carries the formatted bid and attention points", () => {
  const markdown = offerMemoMarkdown(buildOfferMemo(baseInput));
  assert.match(markdown, /Bod: €\s?500\.000/);
  assert.match(markdown, /Korenstraat 18/);
  assert.match(markdown, /wegverkeersgeluid/);
  assert.match(markdown, /geen advies, taxatie of garantie/);
  assert.doesNotMatch(markdown, /undefined/);
});

test("memo filename is a filesystem-safe slug", () => {
  assert.equal(offerMemoFilename("Korenstraat 18-A"), "bodmemo-korenstraat-18-a");
  assert.equal(offerMemoFilename(""), "bodmemo-woning");
});

test("wozRatio compares asking price to the buurt average", () => {
  assert.equal(wozRatio(400_000, 500_000), 0.8);
  assert.equal(wozRatio(500_000, 500_000), 1);
  assert.equal(wozRatio(600_000, undefined), null);
  assert.equal(wozRatio(0, 500_000), null);
});
