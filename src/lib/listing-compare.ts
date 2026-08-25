import type { Analysis, PropertyListing } from "@/src/lib/types";

export type ListingDiscrepancyKey =
  | "postcode"
  | "livingArea"
  | "constructionYear"
  | "pricePerM2"
  | "askingVsWoz";

export type ListingDiscrepancySeverity = "mismatch" | "attention" | "match";

export type ListingDiscrepancy = {
  key: ListingDiscrepancyKey;
  severity: ListingDiscrepancySeverity;
  /** Raw value as stated in the advertentie, for the UI to format. */
  listingValue: number | string | null;
  /** Raw value from official data (BAG / WOZ), for the UI to format. */
  officialValue: number | string | null;
};

const AREA_TOLERANCE = 0.05;
const YEAR_TOLERANCE = 1;
const PRICE_PER_M2_TOLERANCE = 0.1;
const WOZ_ATTENTION_RATIO = 1.25;

function normalizePostcode(value: string | null | undefined) {
  return (value ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase();
}

function relDiff(a: number, b: number) {
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / base;
}

/**
 * Deterministic "advertentie vs. openbare data" comparison. The listing is
 * what the seller claims; the analysis carries what BAG/WOZ actually report.
 * Absence on either side is never a mismatch — it is simply not compared.
 */
export function listingDiscrepancies(
  listing: PropertyListing | null | undefined,
  analysis: Pick<Analysis, "property" | "wozBenchmark">,
): ListingDiscrepancy[] {
  if (!listing) return [];
  const items: ListingDiscrepancy[] = [];

  const listingPostcodeValue = extractListingPostcode(listing);
  if (listingPostcodeValue && analysis.property.postcode) {
    items.push({
      key: "postcode",
      severity: listingPostcodeValue === normalizePostcode(analysis.property.postcode) ? "match" : "mismatch",
      listingValue: listingPostcodeValue,
      officialValue: analysis.property.postcode,
    });
  }

  if (listing.livingAreaM2 && analysis.property.areaM2) {
    items.push({
      key: "livingArea",
      severity: relDiff(listing.livingAreaM2, analysis.property.areaM2) <= AREA_TOLERANCE ? "match" : "mismatch",
      listingValue: listing.livingAreaM2,
      officialValue: analysis.property.areaM2,
    });
  }

  if (listing.constructionYear && analysis.property.buildingYear) {
    items.push({
      key: "constructionYear",
      severity: Math.abs(listing.constructionYear - analysis.property.buildingYear) <= YEAR_TOLERANCE ? "match" : "mismatch",
      listingValue: listing.constructionYear,
      officialValue: analysis.property.buildingYear,
    });
  }

  if (listing.askingPrice && listing.livingAreaM2 && listing.pricePerM2) {
    const recomputed = Math.round(listing.askingPrice / listing.livingAreaM2);
    items.push({
      key: "pricePerM2",
      severity: relDiff(recomputed, listing.pricePerM2) <= PRICE_PER_M2_TOLERANCE ? "match" : "attention",
      listingValue: listing.pricePerM2,
      officialValue: recomputed,
    });
  }

  const buurtAverage = analysis.wozBenchmark?.buurtAverage;
  if (buurtAverage && buurtAverage > 1 && listing.askingPrice && listing.askingPrice > 1) {
    const ratio = listing.askingPrice / buurtAverage;
    items.push({
      key: "askingVsWoz",
      severity: ratio >= WOZ_ATTENTION_RATIO ? "attention" : "match",
      listingValue: listing.askingPrice,
      officialValue: Math.round(buurtAverage),
    });
  }

  return items;
}

/** Funda postcodes appear in the captured address label ("1234 AB Somewheretown"). */
function extractListingPostcode(listing: PropertyListing): string | null {
  const candidates = [listing.extraKenmerken?.postcode, listing.addressLabel];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = candidate.match(/\b([1-9][0-9]{3}\s?[A-Za-z]{2})\b/);
    if (match) return normalizePostcode(match[1]);
  }
  return null;
}
