import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUYER_PROFILE, EMPTY_BUYER_PROFILE, formatEuro, normalizeBuyerProfile, profileCompletion } from "../src/lib/purchase";
import { buyerProfileSchema, checklistBodySchema, workspaceBodySchema } from "../src/lib/validation/workspace";
import { buildBidStrategy } from "../src/lib/bid-strategy";
import { estimateBuyerCosts, transferTaxRate } from "../src/lib/costs";
import { analyzeDocumentText } from "../src/lib/documents/analyze";
import { caseStageFromProperty, nextPurchaseAction, normalizeCaseStage, viewingDebriefStage } from "../src/lib/journey";
import { extractListingFacts } from "../src/lib/listing-intake";
import { suggestCaseTasks } from "../src/lib/tasks";

test("profile completion reflects the core intake fields", () => {
  assert.equal(profileCompletion({ ...DEFAULT_BUYER_PROFILE }), 100);
  assert.equal(profileCompletion({ ...DEFAULT_BUYER_PROFILE, searchArea: "", maxCommuteMinutes: 0 }), 71);
});

test("legacy buyer profiles pick up new fields without crashing", () => {
  const profile = normalizeBuyerProfile({ budget: 400000, monthlyPayment: 1800, ownFunds: 40000, searchArea: "Epe", bedrooms: 3, garden: true, parking: false, remoteWork: false });
  assert.equal(profile.household, "family");
  assert.equal(profile.firstTimeBuyer, false);
  assert.equal(profile.acceptVve, true);
});

test("bid strategy is risk-based and never a fake market band", () => {
  const calm = buildBidStrategy(525000, { signals: [] } as never, EMPTY_BUYER_PROFILE);
  assert.ok(calm);
  assert.equal(calm.recommended, "strong");
  assert.ok(calm.scenarios.cautious.amount < 525000);
  assert.ok(calm.valuationNote.includes("Geen taxatie") || calm.valuationNote.includes("geen taxatie") || /geen taxatie|Kadaster|vraagprijs/i.test(calm.valuationNote));

  const risky = buildBidStrategy(525000, { signals: [{ key: "foundation", label: "Fundering", severity: "attention", summary: "Voor 1945", action: "Vraag rapport" }] } as never, { ...EMPTY_BUYER_PROFILE, budget: 500000, firstTimeBuyer: true });
  assert.ok(risky);
  assert.equal(risky.recommended, "cautious");
  assert.ok(risky.scenarios.cautious.amount <= 500000);
  assert.equal(risky.scenarios.cautious.financingCondition, true);
  assert.equal(risky.scenarios.cautious.inspectionCondition, true);
});

test("starter transfer tax is zero under the threshold", () => {
  assert.equal(transferTaxRate({ firstTimeBuyer: true }, 500000), 0);
  assert.equal(transferTaxRate({ firstTimeBuyer: true }, 600000), 0.02);
  const costs = estimateBuyerCosts(500000, { firstTimeBuyer: true, ownFunds: 70000, budget: 500000 });
  assert.ok(costs);
  assert.equal(costs.lines[0].amount, 0);
});

test("currency formatting is Dutch and compact", () => {
  assert.equal(formatEuro(527500), "€ 527.500");
  assert.equal(formatEuro(null), "—");
});

test("workspace and checklist validators reject unknown or malformed fields", () => {
  assert.equal(workspaceBodySchema.safeParse({ action: "stage", bagVboId: "0232010000003562", stage: "__proto__" }).success, false);
  assert.equal(buyerProfileSchema.safeParse({ ...DEFAULT_BUYER_PROFILE, unexpected: true }).success, false);
  assert.equal(workspaceBodySchema.safeParse({ action: "profile", buyerProfile: DEFAULT_BUYER_PROFILE }).success, true);
  assert.equal(checklistBodySchema.safeParse({ items: [{ id: "1", label: "Vraag", checked: true, extra: "nee" }] }).success, false);
});

test("case stages map from legacy values", () => {
  assert.equal(normalizeCaseStage("profile"), "intake");
  assert.equal(normalizeCaseStage("documents"), "research");
  assert.equal(caseStageFromProperty("offered"), "negotiation");
});

test("next action prefers login, then profile, then a concrete case step", () => {
  assert.equal(nextPurchaseAction({ profileConfigured: false, savedCount: 0 }).href, "/mijn-aankoop#woonprofiel");
  assert.equal(nextPurchaseAction({ profileConfigured: true, savedCount: 0 }).href, "/#zoek-adres");
  assert.match(nextPurchaseAction({ profileConfigured: true, savedCount: 1, caseId: "abc", caseStage: "viewing", bagVboId: "0232010000003562" }).href, /bezichtiging/);
});

test("viewing debrief advances the journey", () => {
  assert.deepEqual(viewingDebriefStage("continue"), { propertyStage: "offer", caseStage: "offer" });
  assert.equal(viewingDebriefStage("drop").propertyStage, "dropped");
});

test("listing intake extracts asking price and area from pasted Dutch text", () => {
  const facts = extractListingFacts("Ruime woning van 128 m². Vraagprijs € 525.000. Energielabel C. 4 slaapkamers. Erfpacht.");
  assert.equal(facts.askingPrice, 525000);
  assert.equal(facts.livingAreaM2, 128);
  assert.equal(facts.energyLabel, "C");
  assert.equal(facts.bedroomCount, 4);
  assert.ok(facts.notes.some((note) => /erfpacht/i.test(note)));
});

test("document analysis flags BAG area mismatch and leakage", () => {
  const findings = analyzeDocumentText({
    documentType: "brochure",
    filename: "brochure.pdf",
    text: "Woonoppervlakte 150 m2. Let op: er is lekkage op zolder. Vraagprijs € 480.000.",
    bagAreaM2: 110,
    buildingYear: 1932,
  });
  assert.ok(findings.some((item) => /oppervlakte/i.test(item.title)));
  assert.ok(findings.some((item) => /lekkage/i.test(item.title)));
});

test("task engine asks for core documents and a bid when the stage requires it", () => {
  const tasks = suggestCaseTasks({
    profileConfigured: true,
    profile: DEFAULT_BUYER_PROFILE,
    stage: "offer",
    caseId: "11111111-1111-1111-1111-111111111111",
    bagVboId: "0232010000003562",
    documentTypes: [],
    openFindings: [{ title: "Lekkage", severity: "high", action: "Vraag foto's" }],
    hasAskingPrice: true,
    hasOffer: false,
    hasContractAmount: false,
  });
  assert.ok(tasks.some((task) => task.key === "docs-core"));
  assert.ok(tasks.some((task) => task.key === "bid-draft"));
  assert.ok(tasks.some((task) => /Lekkage/.test(task.title)));
});
