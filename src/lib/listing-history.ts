import {
  factsFromUnknown,
  isFundaListingUrl,
  normalizeFundaListingUrl,
  parseFundaListingAddress,
} from "@/src/lib/listing-extract";

export const LISTING_HISTORY_LIMIT = 50;

export type ListingHistoryItem = {
  bagVboId: string;
  addressLabel: string;
  city: string;
  postcode: string;
  sourceUrl: string;
  askingPrice: number | null;
  livingAreaM2: number | null;
  roomCount: number | null;
  bedroomCount: number | null;
  energyLabel: string | null;
  vveContribution: number | null;
  capturedAt: string;
};

export type ListingHistoryRow = {
  bag_vbo_id?: string | null;
  source_url?: string | null;
  asking_price?: number | null;
  extracted_json?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ComparisonListingFacts = {
  askingPrice: number | null;
  livingAreaM2: number | null;
  roomCount: number | null;
  bedroomCount: number | null;
  energyLabel: string | null;
  vveContribution: number | null;
};

const BAG_ID = /^\d{16}$/;

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function streetFromFacts(facts: { street?: string; houseNumber?: number; houseLetter?: string }) {
  if (!facts.street || facts.houseNumber == null) return "";
  return `${facts.street} ${facts.houseNumber}${facts.houseLetter ?? ""}`.trim();
}

export function listingHistoryItemFromRow(row: ListingHistoryRow): ListingHistoryItem | null {
  const bagVboId = row.bag_vbo_id?.trim() ?? "";
  if (!BAG_ID.test(bagVboId)) return null;
  const rawUrl = row.source_url?.trim() ?? "";
  if (!isFundaListingUrl(rawUrl)) return null;
  const sourceUrl = normalizeFundaListingUrl(rawUrl) ?? rawUrl;
  const facts = factsFromUnknown(row.extracted_json);
  const fromUrl = parseFundaListingAddress(sourceUrl);
  const street = streetFromFacts(facts) || fromUrl?.addressLabel || "";
  const addressLabel = facts.addressLabel || street || "Funda-advertentie";
  const capturedAt = row.updated_at || row.created_at || "";
  if (!capturedAt) return null;
  return {
    bagVboId,
    addressLabel,
    city: facts.city || fromUrl?.city || "",
    postcode: facts.postcode || "",
    sourceUrl,
    askingPrice: finiteOrNull(row.asking_price ?? facts.askingPrice),
    livingAreaM2: finiteOrNull(facts.livingAreaM2),
    roomCount: finiteOrNull(facts.roomCount),
    bedroomCount: finiteOrNull(facts.bedroomCount),
    energyLabel: facts.energyLabel ?? null,
    vveContribution: finiteOrNull(facts.vveContribution),
    capturedAt,
  };
}

export function listingHistoryFromRows(rows: ListingHistoryRow[], limit = LISTING_HISTORY_LIMIT): ListingHistoryItem[] {
  return rows
    .map(listingHistoryItemFromRow)
    .filter((item): item is ListingHistoryItem => Boolean(item))
    .sort((left, right) => {
      const delta = Date.parse(right.capturedAt) - Date.parse(left.capturedAt);
      return delta !== 0 ? delta : left.bagVboId.localeCompare(right.bagVboId);
    })
    .slice(0, limit);
}

export function comparisonListingFromUserRow(row: {
  asking_price?: number | null;
  extracted_json?: unknown;
} | null | undefined): ComparisonListingFacts {
  const facts = factsFromUnknown(row?.extracted_json);
  return {
    askingPrice: finiteOrNull(row?.asking_price ?? facts.askingPrice),
    livingAreaM2: finiteOrNull(facts.livingAreaM2),
    roomCount: finiteOrNull(facts.roomCount),
    bedroomCount: finiteOrNull(facts.bedroomCount),
    energyLabel: facts.energyLabel ?? null,
    vveContribution: finiteOrNull(facts.vveContribution),
  };
}

export function formatCapturedAt(iso: string, now = Date.now()) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const deltaSeconds = Math.round((then - now) / 1000);
  const abs = Math.abs(deltaSeconds);
  const rtf = new Intl.RelativeTimeFormat("nl-NL", { numeric: "always" });
  if (abs < 60) return rtf.format(Math.round(deltaSeconds), "second");
  if (abs < 3600) return rtf.format(Math.round(deltaSeconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(deltaSeconds / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(deltaSeconds / 86_400), "day");
  return new Date(then).toLocaleDateString("nl-NL");
}
