import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUYER_PROFILE, EMPTY_BUYER_PROFILE, buyerProfileIsConfigured, formatEuro, normalizeBuyerProfile, profileCompletion } from "../src/lib/purchase";
import { buyerProfileSchema, checklistBodySchema, workspaceBodySchema } from "../src/lib/validation/workspace";
import { buildBidStrategy } from "../src/lib/bid-strategy";
import { estimateBuyerCosts, transferTaxRate } from "../src/lib/costs";
import { analyzeDocumentText } from "../src/lib/documents/analyze";
import { caseStageFromProperty, nextPurchaseAction, normalizeCaseStage, viewingDebriefStage } from "../src/lib/journey";
import { extractListingFacts, parseDutchNumber } from "../src/lib/listing-intake";
import { hrefForTask, suggestCaseTasks } from "../src/lib/tasks";

test("profile completion reflects the core intake fields", () => {
  assert.equal(profileCompletion({ ...DEFAULT_BUYER_PROFILE }), 100);
  assert.equal(profileCompletion({ ...DEFAULT_BUYER_PROFILE, searchArea: "", maxCommuteMinutes: 0 }), 71);
  assert.equal(buyerProfileIsConfigured({ ...DEFAULT_BUYER_PROFILE, maxCommuteMinutes: 0 }, { budget: 1 }), false);
  assert.equal(buyerProfileIsConfigured({ ...DEFAULT_BUYER_PROFILE }, { budget: 1 }), true);
});

test("legacy buyer profiles pick up new fields without crashing", () => {
  const profile = normalizeBuyerProfile({ budget: 400000, monthlyPayment: 1800, ownFunds: 40000, searchArea: "Epe", bedrooms: 3, garden: true, parking: false, remoteWork: false });
  assert.equal(profile.household, "family");
  assert.equal(profile.householdSpecified, false);
  assert.equal(profile.firstTimeBuyer, false);
  assert.equal(profile.acceptVve, true);
  assert.equal(buyerProfileIsConfigured(profile, { budget: 400000 }), false);
  const specified = normalizeBuyerProfile({ ...profile, household: "single", maxCommuteMinutes: 30 });
  assert.equal(specified.householdSpecified, true);
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

  const unavailable = buildBidStrategy(525000, null, EMPTY_BUYER_PROFILE);
  assert.ok(unavailable);
  assert.notEqual(unavailable.recommended, "strong");
  assert.ok(unavailable.scenarios.strong.amount <= 525000);
  assert.equal(unavailable.scenarios.strong.financingCondition, true);
  assert.equal(unavailable.scenarios.strong.inspectionCondition, true);
});

test("starter transfer tax requires age, self-occupancy and unused exemption", () => {
  const eligible = { firstTimeBuyer: true, buyerAge: 30, selfOccupied: true, priorExemptionUsed: false };
  assert.equal(transferTaxRate({ firstTimeBuyer: true }, 500000), 0.02);
  assert.equal(transferTaxRate(eligible, 500000), 0);
  assert.equal(transferTaxRate(eligible, 600000), 0.02);
  assert.equal(transferTaxRate({ ...eligible, buyerAge: 40 }, 500000), 0.02);
  const costs = estimateBuyerCosts(500000, { ...eligible, ownFunds: 70000, budget: 500000 });
  assert.ok(costs);
  assert.equal(costs.lines.find((line) => line.key === "transfer-tax")?.amount, 0);
  const ineligible = estimateBuyerCosts(500000, { firstTimeBuyer: true, ownFunds: 70000, budget: 500000 });
  assert.ok(ineligible);
  assert.equal(ineligible.transferTaxRate, 0.02);
  assert.ok(costs.lines.some((line) => line.key === "notary-transfer"));
  assert.ok(typeof costs.deductibleTotal === "number");
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

test("listing intake extracts asking price and labelled area from pasted Dutch text", () => {
  const facts = extractListingFacts("Woonoppervlakte 128 m². Perceeloppervlakte 240 m². Vraagprijs € 525.000. Energielabel C. 4 slaapkamers. Erfpacht.");
  assert.equal(facts.askingPrice, 525000);
  assert.equal(facts.livingAreaM2, 128);
  assert.equal(facts.plotAreaM2, 240);
  assert.equal(facts.energyLabel, "C");
  assert.equal(facts.bedroomCount, 4);
  assert.ok(facts.notes.some((note) => /erfpacht/i.test(note)));
  const unlabeled = extractListingFacts("Ruime woning van 128 m² plus berging 12 m². Vraagprijs € 525.000.");
  assert.equal(unlabeled.livingAreaM2, undefined);
  assert.equal(unlabeled.plotAreaM2, undefined);
  assert.equal(parseDutchNumber("525.000"), 525000);
  assert.equal(parseDutchNumber("128.5"), 128.5);
  assert.equal(parseDutchNumber("1.234,56"), 1234.56);
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

test("task engine derives bedenktijd and voorbehoud deadlines once the koopovereenkomst is signed", () => {
  const signedToday = new Date();
  const signedAt = `${signedToday.getFullYear()}-${String(signedToday.getMonth() + 1).padStart(2, "0")}-${String(signedToday.getDate()).padStart(2, "0")}`;
  const tasks = suggestCaseTasks({
    profileConfigured: true,
    profile: DEFAULT_BUYER_PROFILE,
    stage: "contract",
    caseId: "11111111-1111-1111-1111-111111111111",
    bagVboId: "0232010000003562",
    documentTypes: ["brochure", "vragenlijst"],
    openFindings: [],
    hasAskingPrice: true,
    hasOffer: true,
    hasContractAmount: true,
    contractReceivedAt: signedAt,
    contractSignedAt: signedAt,
    financingWeeks: 6,
    inspectionWeeks: 2,
  });
  const bedenktijd = tasks.find((task) => task.key === "deadline-bedenktijd");
  const financing = tasks.find((task) => task.key === "deadline-financing");
  const inspection = tasks.find((task) => task.key === "deadline-inspection");
  assert.ok(bedenktijd?.dueAt);
  assert.ok(financing?.dueAt);
  assert.ok(inspection?.dueAt);
  assert.ok(new Date(bedenktijd!.dueAt!).getTime() < new Date(financing!.dueAt!).getTime());
  const due = new Date(bedenktijd!.dueAt!);
  const midday = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 12, 0, 0);
  assert.ok(due.getTime() > midday.getTime(), "dueAt must remain valid through midday on the due date");
});

test("task engine skips deadlines that already passed", () => {
  const tasks = suggestCaseTasks({
    profileConfigured: true,
    profile: DEFAULT_BUYER_PROFILE,
    stage: "contract",
    caseId: "11111111-1111-1111-1111-111111111111",
    bagVboId: "0232010000003562",
    documentTypes: ["brochure", "vragenlijst"],
    openFindings: [],
    hasAskingPrice: true,
    hasOffer: true,
    hasContractAmount: true,
    contractSignedAt: "2020-01-05",
    financingWeeks: 6,
  });
  assert.equal(tasks.some((task) => task.key.startsWith("deadline-")), false);
});

test("engine task hrefs resolve persisted sources without rebuilding suggestions", () => {
  assert.equal(hrefForTask({ source: "engine:finding-Lekkage" }, { caseId: "abc" }), "/mijn-aankoop/abc#bevindingen");
  assert.equal(hrefForTask({ source: "engine:contract-check" }, { caseId: "abc" }), "/mijn-aankoop/abc#koopakte");
  assert.equal(hrefForTask({ source: "engine:inspection-book" }, { caseId: "abc" }), "/mijn-aankoop/abc#koopakte");
  assert.equal(hrefForTask({ source: "user:custom" }, { caseId: "abc" }), "/mijn-aankoop/abc");
});
