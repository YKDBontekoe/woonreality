import assert from "node:assert/strict";
import test from "node:test";
import {
  aiInputFingerprint,
  assemblePromptDocuments,
  buildSynthesisPrompt,
  compactAnalysisDto,
  DEFAULT_AI_REASONING,
  DEFAULT_AI_RESEARCH_MODEL,
  DEFAULT_AI_SYNTHESIS_MODEL,
  isPrivateIpAddress,
  listingSynthesisDto,
  LISTING_MAX_AGGREGATE_CHARS,
  LISTING_MAX_DESCRIPTION_CHARS,
  quoteMatchesSource,
  resolvedResearchModel,
  resolvedSynthesisModel,
  SOURCE_MAX_DOCS,
  SOURCE_MAX_TOTAL_CHARS,
  sourceContext,
  sourceId,
  sourceSnippets,
  wrapUntrustedListingText,
} from "@/src/lib/analysis/research";
import { resolveReadyReport } from "@/src/lib/db/repository";
import { listingNeedsExtension, mergeListings } from "@/src/lib/listing-merge";
import type { AiReportRow } from "@/src/lib/supabase/database.types";
import type { Analysis, Evidence, Property, PropertyListing, ResearchSource } from "@/src/lib/types";

const LISTING_URL = "https://www.funda.nl/detail/koop/epe/huis-12345678-korenstraat-18/12345678/";

function sampleEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "evidence-bag",
    source: "PDOK / BAG",
    sourceUrl: "https://api.pdok.nl/bag/vbo/0200100000000001",
    fetchedAt: "2026-08-01T00:00:00.000Z",
    confidence: "high",
    ...overrides,
  };
}

function sampleSource(id: string, url: string, type: ResearchSource["type"] = "official"): ResearchSource {
  return {
    id,
    title: id,
    url,
    type,
    fetchedAt: "2026-08-01T00:00:00.000Z",
  };
}

function sampleReadyReport(fingerprint: string, overrides: Partial<AiReportRow> = {}): AiReportRow {
  const generatedAt = "2026-08-01T00:00:00.000Z";
  return {
    id: "report-1",
    property_id: "property-1",
    report_version: "2026.08.ai.v3",
    prompt_version: "2026.08.ai-prompt.v3",
    input_fingerprint: fingerprint,
    status: "ready",
    user_id: null,
    report_json: { verdict: { title: "Klaar", summary: "OK", confidence: "medium" } },
    source_manifest_json: [],
    research_model: "openai/gpt-5.6-luna",
    synthesis_model: "openai/gpt-5.6-luna",
    usage_json: null,
    error_code: null,
    generated_at: generatedAt,
    expires_at: "2099-08-01T00:00:00.000Z",
    created_at: generatedAt,
    updated_at: generatedAt,
    ...overrides,
  };
}

function sampleProperty(): Property {
  return {
    bagVboId: "0200100000000001",
    bagPandIds: ["p1"],
    addressLabel: "Korenstraat 18, 8161 HP Epe",
    street: "Korenstraat",
    houseNumber: 18,
    postcode: "8161HP",
    city: "Epe",
    municipality: "Epe",
    coordinates: { lat: 52.35, lng: 5.98 },
    buildingYear: 1987,
    areaM2: 120,
    isResidential: true,
  };
}

function sampleListing(overrides: Partial<PropertyListing> = {}): PropertyListing {
  return {
    provider: "Funda (door jou toegevoegd)",
    externalId: "12345678",
    sourceUrl: LISTING_URL,
    fetchedAt: "2026-08-01T00:00:00.000Z",
    status: "active",
    askingPrice: 525000,
    pricePerM2: 4102,
    livingAreaM2: 128,
    bedroomCount: 4,
    description: "Lichte hoekwoning met tuin.",
    ownership: "Erfpacht",
    extraKenmerken: { Isolatie: "Dak en muur" },
    ...overrides,
  };
}

function sampleAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  const property = sampleProperty();
  return {
    property,
    overallScore: 7.2,
    analysisVersion: "2026.08.v1",
    scoringVersion: "2026.08.score",
    signals: Array.from({ length: 12 }, (_, index) => ({
      key: `signal-${index}`,
      label: `Signaal ${index}`,
      value: index,
      score: 6,
      severity: "neutral" as const,
      summary: "x".repeat(400),
      action: "Check",
      confidence: "medium" as const,
      evidence: [],
    })),
    components: [],
    evidence: [],
    generatedAt: "2026-08-01T00:00:00.000Z",
    sources: ["BAG"],
    domains: [{
      key: "woning",
      label: "Woning",
      score: 7,
      signalKeys: ["energy"],
      available: true,
      summary: "Redelijk",
      hasUnscoredAttention: false,
    }],
    everydayInsights: [
      { title: "Geluid", summary: "Let op de weg.", tone: "attention", signalKeys: ["noise"] },
    ],
    highlights: [{ type: "attention", signalKey: "noise", text: "Verkeerslawaai" }],
    dataCoverage: { available: 8, total: 10, label: "Goed" },
    sourceStatuses: [],
    knownGaps: [{ key: "flood", label: "Overstroming", summary: "Niet gemodelleerd", checkUrl: "https://www.risicokaart.nl", checkLabel: "Risicokaart" }],
    nearbyProperties: [],
    ...overrides,
  };
}

test("default AI models are GPT-5.6 Luna with medium reasoning", () => {
  const previousResearch = process.env.AI_RESEARCH_MODEL;
  const previousSynthesis = process.env.AI_SYNTHESIS_MODEL;
  delete process.env.AI_RESEARCH_MODEL;
  delete process.env.AI_SYNTHESIS_MODEL;
  try {
    assert.equal(DEFAULT_AI_RESEARCH_MODEL, "openai/gpt-5.6-luna");
    assert.equal(DEFAULT_AI_SYNTHESIS_MODEL, "openai/gpt-5.6-luna");
    assert.equal(DEFAULT_AI_REASONING, "medium");
    assert.equal(resolvedResearchModel(), "openai/gpt-5.6-luna");
    assert.equal(resolvedSynthesisModel(), "openai/gpt-5.6-luna");
  } finally {
    if (previousResearch === undefined) delete process.env.AI_RESEARCH_MODEL;
    else process.env.AI_RESEARCH_MODEL = previousResearch;
    if (previousSynthesis === undefined) delete process.env.AI_SYNTHESIS_MODEL;
    else process.env.AI_SYNTHESIS_MODEL = previousSynthesis;
  }
});

test("listingSynthesisDto stays under the aggregate cap and includes risk flags", () => {
  const listing = sampleListing({
    description: "A".repeat(20_000),
    textSections: Array.from({ length: 12 }, (_, index) => ({
      title: `Sectie ${index}`,
      text: "B".repeat(5_000),
    })),
    extraKenmerken: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`Kenmerk ${index}`, "C".repeat(800)])),
  });
  const dto = listingSynthesisDto(listing);
  assert.ok(dto);
  const serialized = JSON.stringify(dto);
  assert.ok((dto.description ?? "").length <= LISTING_MAX_DESCRIPTION_CHARS);
  assert.ok((dto.textSections?.length ?? 0) <= 4);
  assert.ok(serialized.length < LISTING_MAX_AGGREGATE_CHARS + 2_000);
  assert.ok(dto.riskFlags?.some((flag) => flag.key === "erfpacht"));
});

test("compactAnalysisDto omits the full signal dump", () => {
  const compact = compactAnalysisDto(sampleAnalysis());
  assert.equal("signals" in compact, false);
  assert.equal(compact.overallScore, 7.2);
  assert.equal(compact.insights.length, 1);
  assert.ok(!JSON.stringify(compact).includes("x".repeat(400)));
});

test("synthesis prompt contains listing risk flags and no full signal dump", () => {
  const analysis = sampleAnalysis();
  const listing = sampleListing();
  const prompt = buildSynthesisPrompt(analysis.property, analysis, listing, [{
    source: {
      id: "web-listing",
      title: "Advertentietekst",
      url: LISTING_URL,
      type: "listing",
      fetchedAt: listing.fetchedAt,
    },
    text: listing.description ?? "",
  }]);
  assert.match(prompt, /erfpacht/);
  assert.match(prompt, /riskFlags/);
  assert.doesNotMatch(prompt, /"key":"signal-11"/);
  assert.match(prompt, /UNTRUSTED_LISTING_DATA/);
  const parsed = JSON.parse(prompt) as { deterministicAnalysis: { signals?: unknown } };
  assert.equal(parsed.deterministicAnalysis.signals, undefined);
});

test("synthesis prompt carries listing free text only once", () => {
  const analysis = sampleAnalysis();
  const listing = sampleListing();
  const prompt = buildSynthesisPrompt(analysis.property, analysis, listing, [{
    source: {
      id: "web-listing",
      title: "Advertentietekst",
      url: LISTING_URL,
      type: "listing",
      fetchedAt: listing.fetchedAt,
    },
    text: listing.description ?? "",
  }]);
  const needle = (listing.description ?? "").slice(0, 60);
  assert.equal(prompt.split(needle).length - 1, 1);
});

test("sourceContext truncates bulky documents", () => {
  const documents = Array.from({ length: 12 }, (_, index) => ({
    source: {
      id: `web-${index}`,
      title: `Bron ${index}`,
      url: `https://www.overheid.nl/doc-${index}`,
      type: "official" as const,
      fetchedAt: "2026-08-01T00:00:00.000Z",
    },
    text: "Z".repeat(20_000),
  }));
  const context = sourceContext(documents);
  assert.ok(context.length <= SOURCE_MAX_TOTAL_CHARS);
  assert.match(context, /SOURCE_ID: web-0/);
});

test("quoteMatchesSource requires a verbatim excerpt from that source", () => {
  const documents = [{
    source: {
      id: "web-a",
      title: "Plan",
      url: "https://www.overheid.nl/plan",
      type: "planning" as const,
      fetchedAt: "2026-08-01T00:00:00.000Z",
    },
    text: "Het omgevingsplan staat een dakkapel toe aan de achterzijde.",
  }];
  assert.equal(quoteMatchesSource("dakkapel toe aan de achterzijde", "web-a", documents), true);
  assert.equal(quoteMatchesSource("er mag een penthouse op", "web-a", documents), false);
  assert.equal(quoteMatchesSource("dakkapel toe aan de achterzijde", "web-missing", documents), false);
});

test("fingerprint changes when listing facts change", () => {
  const analysis = sampleAnalysis();
  const first = aiInputFingerprint(analysis, sampleListing({ askingPrice: 525000 }));
  const second = aiInputFingerprint(analysis, sampleListing({ askingPrice: 499000 }));
  const third = aiInputFingerprint(analysis, sampleListing({ askingPrice: 525000 }));
  assert.notEqual(first, second);
  assert.equal(first, third);
});

test("fingerprint changes when postcode, municipality, or evidence changes", () => {
  const listing = sampleListing();
  const baseline = aiInputFingerprint(sampleAnalysis(), listing);
  const postcodeChanged = aiInputFingerprint(
    sampleAnalysis({ property: { ...sampleProperty(), postcode: "1011AB" } }),
    listing,
  );
  const municipalityChanged = aiInputFingerprint(
    sampleAnalysis({ property: { ...sampleProperty(), municipality: "Apeldoorn" } }),
    listing,
  );
  const evidenceChanged = aiInputFingerprint(
    sampleAnalysis({ evidence: [sampleEvidence({ id: "evidence-dso", source: "DSO", sourceUrl: "https://omgevingswet.overheid.nl/plan" })] }),
    listing,
  );
  assert.notEqual(baseline, postcodeChanged);
  assert.notEqual(baseline, municipalityChanged);
  assert.notEqual(baseline, evidenceChanged);
  assert.notEqual(postcodeChanged, municipalityChanged);
  assert.notEqual(municipalityChanged, evidenceChanged);
});

test("ready report is returned only when the current listing fingerprint still matches", () => {
  const analysis = sampleAnalysis();
  const listing = sampleListing({ askingPrice: 525000 });
  const fingerprint = aiInputFingerprint(analysis, listing);
  const row = sampleReadyReport(fingerprint);
  const ready = resolveReadyReport(row, fingerprint);
  assert.equal(ready.status, "ready");
  assert.ok(ready.report);
  const updatedFingerprint = aiInputFingerprint(analysis, sampleListing({ askingPrice: 499000 }));
  const stale = resolveReadyReport(row, updatedFingerprint);
  assert.equal(stale.status, "stale");
  assert.equal(stale.report, null);
});

test("sourceId distinguishes different paths on the same host", () => {
  const firstUrl = "https://www.overheid.nl/plan/a";
  const secondUrl = "https://www.overheid.nl/plan/b";
  const firstId = sourceId(firstUrl);
  const secondId = sourceId(secondUrl);
  assert.match(firstId, /^web-[A-Za-z0-9_-]{18}$/);
  assert.notEqual(firstId, secondId);
  const documents = [{
    source: sampleSource(firstId, firstUrl, "planning"),
    text: "Het omgevingsplan staat een dakkapel toe aan de achterzijde.",
  }];
  assert.equal(quoteMatchesSource("dakkapel toe aan de achterzijde", firstId, documents), true);
  assert.equal(quoteMatchesSource("dakkapel toe aan de achterzijde", secondId, documents), false);
});

test("assemblePromptDocuments keeps listing sources inside the prompt budget", () => {
  const listingDocs = [{
    source: sampleSource(sourceId(LISTING_URL), LISTING_URL, "listing"),
    text: "Lichte hoekwoning met tuin.",
  }];
  const extraListingPage = {
    source: sampleSource(sourceId(`${LISTING_URL}#pagina`), LISTING_URL, "listing"),
    text: "Advertentiepagina met extra kenmerken.",
  };
  const fetched = Array.from({ length: 8 }, (_, index) => ({
    source: sampleSource(`web-fetched-${index}`, `https://www.overheid.nl/doc-${index}`),
    text: `Officieel document ${index}`,
  }));
  const documents = assemblePromptDocuments(listingDocs, fetched, extraListingPage);
  assert.equal(documents.length, SOURCE_MAX_DOCS);
  assert.equal(documents[0]?.source.id, listingDocs[0]?.source.id);
  assert.equal(documents[1]?.source.id, extraListingPage.source.id);
  const snippets = sourceSnippets(documents);
  const snippetIds = new Set(snippets.map((item) => item.sourceId));
  for (const document of documents) {
    assert.ok(snippetIds.has(document.source.id));
  }
});

test("isPrivateIpAddress rejects private literals but not public hostnames", () => {
  assert.equal(isPrivateIpAddress("127.0.0.1"), true);
  assert.equal(isPrivateIpAddress("10.0.0.1"), true);
  assert.equal(isPrivateIpAddress("192.168.1.8"), true);
  assert.equal(isPrivateIpAddress("8.8.8.8"), false);
  assert.equal(isPrivateIpAddress("www.overheid.nl"), false);
  assert.equal(isPrivateIpAddress("omgevingswet.overheid.nl"), false);
});

test("mergeListings lets the user listing win and fills licensed gaps", () => {
  const user = sampleListing({ askingPrice: 510000, livingAreaM2: undefined, energyLabel: "C" });
  const licensed = sampleListing({
    provider: "Licensed",
    askingPrice: 600000,
    livingAreaM2: 130,
    energyLabel: "B",
    extraKenmerken: { Parkeren: "Op straat" },
  });
  const merged = mergeListings(user, licensed);
  assert.equal(merged?.askingPrice, 510000);
  assert.equal(merged?.livingAreaM2, 130);
  assert.equal(merged?.energyLabel, "C");
  assert.equal(merged?.extraKenmerken?.Isolatie, "Dak en muur");
  assert.equal(merged?.extraKenmerken?.Parkeren, "Op straat");
});

test("mergeListings puts primary sections before fallback-only sections", () => {
  const merged = mergeListings(
    sampleListing({ textSections: [{ title: "Aanbod", text: "user" }] }),
    sampleListing({
      textSections: [
        { title: "Aanbod", text: "user" },
        { title: "Buurt", text: "licensed-only" },
      ],
    }),
  );
  assert.deepEqual(merged?.textSections, [
    { title: "Aanbod", text: "user" },
    { title: "Buurt", text: "licensed-only" },
  ]);
});

test("listingNeedsExtension is true when askingPrice, pricePerM2, or description is missing", () => {
  assert.equal(listingNeedsExtension(null), true);
  assert.equal(listingNeedsExtension(sampleListing()), false);
  assert.equal(listingNeedsExtension(sampleListing({ askingPrice: undefined })), true);
  assert.equal(listingNeedsExtension(sampleListing({ pricePerM2: undefined })), true);
  assert.equal(listingNeedsExtension(sampleListing({ description: undefined })), true);
  assert.equal(listingNeedsExtension(sampleListing({ livingAreaM2: undefined })), false);
});

test("untrusted listing wrapper is stable for prompt tests", () => {
  assert.match(wrapUntrustedListingText("koop dit huis"), /UNTRUSTED_LISTING_DATA/);
});
