import { z } from "zod";
import { listingFactsAreSparse, normalizeFundaListingUrl, PARSER_VERSION } from "@/src/lib/listing-extract";

const currentYear = new Date().getFullYear() + 1;

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const trimmed = (max: number) => z.string().max(max).transform(stripTags).pipe(z.string().max(max));

export const importedListingFactsSchema = z.object({
  notes: z.array(trimmed(500)).max(20).default([]),
  askingPrice: z.number().finite().min(0).max(10_000_000).optional(),
  livingAreaM2: z.number().finite().min(0).max(20_000).optional(),
  plotAreaM2: z.number().finite().min(0).max(20_000).optional(),
  bedroomCount: z.number().finite().min(0).max(50).optional(),
  energyLabel: trimmed(8).optional(),
  constructionYear: z.number().int().min(1600).max(currentYear).optional(),
  vveContribution: z.number().finite().min(0).max(100_000).optional(),
  roomCount: z.number().finite().min(0).max(50).optional(),
  bathroomCount: z.number().finite().min(0).max(50).optional(),
  volumeM3: z.number().finite().min(0).max(50_000).optional(),
  propertyType: trimmed(120).optional(),
  insulation: trimmed(200).optional(),
  heating: trimmed(200).optional(),
  glazing: trimmed(200).optional(),
  solarPanelCount: z.number().finite().min(0).max(500).optional(),
  outdoorSpaceM2: z.number().finite().min(0).max(20_000).optional(),
  gardenOrientation: trimmed(80).optional(),
  balcony: z.boolean().optional(),
  terrace: z.boolean().optional(),
  parking: trimmed(200).optional(),
  storage: trimmed(200).optional(),
  vveReserveFund: z.number().finite().min(0).max(10_000_000).optional(),
  status: z.enum(["active", "sold", "withdrawn", "unknown"]).optional(),
  firstPublishedAt: trimmed(40).optional(),
  description: trimmed(8_000).optional(),
  addressLabel: trimmed(200).optional(),
  postcode: trimmed(20).optional(),
  city: trimmed(80).optional(),
  street: trimmed(120).optional(),
  houseNumber: z.number().int().min(0).max(99999).optional(),
  houseLetter: trimmed(4).optional(),
  ownership: trimmed(200).optional(),
  neighborhood: trimmed(8_000).optional(),
  extraKenmerken: z.record(z.string(), trimmed(200)).optional(),
  sections: z.array(z.object({
    title: trimmed(120),
    text: trimmed(4_000),
  }).strict()).max(30).optional(),
}).strict();

export const listingCaptureEnvelopeSchema = z.object({
  sourceUrl: z.string().url().max(500),
  capturedAt: z.string().max(40),
  parserVersion: z.number().int().min(1).max(PARSER_VERSION + 20),
  facts: importedListingFactsSchema,
}).strict();

export function parseListingCaptureEnvelope(raw: unknown) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    if ("pageHtml" in record || "pastedContent" in record || "html" in record || "innerHTML" in record) {
      return { success: false as const, error: "Stuur alleen kenmerken, geen pagina-HTML." };
    }
  }
  const parsed = listingCaptureEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return { success: false as const, error: "Ongeldige advertentiegegevens." };
  const sourceUrl = normalizeFundaListingUrl(parsed.data.sourceUrl);
  if (!sourceUrl) {
    return { success: false as const, error: "Dit is geen Funda-advertentielink. Open de pagina van één woning, geen zoekresultaat." };
  }
  const facts = parsed.data.facts;
  const extra = facts.extraKenmerken ?? {};
  if (Object.keys(extra).length > 80) {
    return { success: false as const, error: "Te veel kenmerken in deze capture." };
  }
  if (listingFactsAreSparse(facts) && !facts.street && !facts.addressLabel) {
    return { success: false as const, error: "We vonden te weinig kenmerken op deze pagina." };
  }
  return {
    success: true as const,
    data: {
      sourceUrl,
      capturedAt: parsed.data.capturedAt,
      parserVersion: parsed.data.parserVersion,
      facts,
    },
  };
}
