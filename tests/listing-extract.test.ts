import assert from "node:assert/strict";
import test from "node:test";
import {
  buildListingExtractPrompt,
  hasListingExtractText,
  listingExtractFingerprint,
} from "@/src/lib/analysis/listing-extract";
import type { PropertyListing } from "@/src/lib/types";

function listing(overrides: Partial<PropertyListing> = {}): PropertyListing {
  return {
    provider: "Funda (door jou toegevoegd)",
    externalId: "keteldiep-10",
    sourceUrl: "https://www.funda.nl/detail/koop/dordrecht/huis-keteldiep-10/1/",
    fetchedAt: "2026-08-17T00:00:00.000Z",
    status: "active",
    askingPrice: 325000,
    livingAreaM2: 101,
    description: "Keurig onderhouden eengezinswoning met drie slaapkamers, een verzorgde, zonnige tuin gelegen op het Westen. De keuken is gedateerd maar functioneel. CV-ketel Intergas 2026.",
    ...overrides,
  };
}

test("hasListingExtractText requires substantial free text", () => {
  assert.equal(hasListingExtractText(null), false);
  assert.equal(hasListingExtractText(listing({ description: "kort" })), false);
  assert.equal(hasListingExtractText(listing()), true);
  assert.equal(hasListingExtractText(listing({
    description: undefined,
    textSections: [{ title: "Indeling", text: "Begane grond: hal, woonkamer en keuken. Eerste verdieping: drie slaapkamers." }],
  })), true);
});

test("listing extract prompt wraps untrusted text and does not compare BAG", () => {
  const prompt = buildListingExtractPrompt(listing());
  assert.match(prompt, /UNTRUSTED_LISTING_DATA/);
  assert.match(prompt, /Geen BAG-vergelijking/);
  assert.doesNotMatch(prompt, /bagVboId|areaM2/);
  assert.match(prompt, /325000/);
  assert.match(prompt, /haal alle genoemde koperpunten/i);
});

test("listing extract fingerprint changes when the description changes", () => {
  const first = listingExtractFingerprint(listing());
  const second = listingExtractFingerprint(listing({ description: `${listing().description} Extra zin over fundering.` }));
  assert.notEqual(first, second);
});

test("listing extract fingerprint changes when the resolved model changes", () => {
  const previousSynthesis = process.env.AI_SYNTHESIS_MODEL;
  const previousResearch = process.env.AI_RESEARCH_MODEL;
  try {
    delete process.env.AI_RESEARCH_MODEL;
    process.env.AI_SYNTHESIS_MODEL = "openai/model-a";
    const first = listingExtractFingerprint(listing());
    process.env.AI_SYNTHESIS_MODEL = "openai/model-b";
    const second = listingExtractFingerprint(listing());
    assert.notEqual(first, second);
  } finally {
    if (previousSynthesis == null) delete process.env.AI_SYNTHESIS_MODEL;
    else process.env.AI_SYNTHESIS_MODEL = previousSynthesis;
    if (previousResearch == null) delete process.env.AI_RESEARCH_MODEL;
    else process.env.AI_RESEARCH_MODEL = previousResearch;
  }
});
