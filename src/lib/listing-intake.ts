export type ExtractedListingFacts = {
  askingPrice?: number;
  livingAreaM2?: number;
  plotAreaM2?: number;
  bedroomCount?: number;
  energyLabel?: string;
  constructionYear?: number;
  vveContribution?: number;
  notes: string[];
};

const PRICE_RE = /(?:€\s*)(\d{1,3}(?:[.\s]\d{3})+|\d{5,7})(?:\s*,-)?/gi;
const AREA_RE = /(\d{2,4}(?:[.,]\d)?)\s*m(?:2|²)/gi;
const YEAR_RE = /\b(19\d{2}|20[0-2]\d)\b/g;
const ENERGY_RE = /\benergielabel\s*[:\s]*([A-G][\+\-]?)\b/i;
const BEDROOM_RE = /(\d{1,2})\s*(?:slaapkamers?|bedrooms?)\b/i;
const VVE_RE = /(?:vve[^€\d]{0,40})(?:€\s*)?(\d{1,4}(?:[.,]\d{2})?)/i;

function parseDutchNumber(value: string) {
  const compact = value.replace(/\s/g, "");
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/\./g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function uniqueNumbers(values: Array<number | undefined>) {
  return [...new Set(values.filter((value): value is number => value != null && value > 0))];
}

export function extractListingFacts(text: string): ExtractedListingFacts {
  const notes: string[] = [];
  const prices = uniqueNumbers([...text.matchAll(PRICE_RE)].map((match) => parseDutchNumber(match[1])));
  const areas = uniqueNumbers([...text.matchAll(AREA_RE)].map((match) => parseDutchNumber(match[1])));
  const years = uniqueNumbers([...text.matchAll(YEAR_RE)].map((match) => Number(match[1])));
  const energy = text.match(ENERGY_RE)?.[1]?.toUpperCase();
  const bedrooms = text.match(BEDROOM_RE)?.[1] ? Number(text.match(BEDROOM_RE)?.[1]) : undefined;
  const vve = text.match(VVE_RE)?.[1] ? parseDutchNumber(text.match(VVE_RE)?.[1] ?? "") : undefined;

  const askingPrice = prices.find((value) => value >= 50_000 && value <= 5_000_000);
  const livingAreaM2 = areas.find((value) => value >= 20 && value <= 600);
  const plotAreaM2 = areas.find((value) => value !== livingAreaM2 && value >= 40 && value <= 8_000);
  const constructionYear = years.find((value) => value >= 1600 && value <= new Date().getFullYear());

  if (!askingPrice && prices.length) notes.push("Er staan bedragen in de tekst, maar geen overtuigende vraagprijs.");
  if (/erfpacht/i.test(text)) notes.push("De tekst noemt erfpacht — controleer canon en afkoop.");
  if (/ouderdomsclausule/i.test(text)) notes.push("Ouderdomsclausule genoemd — laat de notaris dit toelichten.");
  if (/asbest/i.test(text)) notes.push("Asbest wordt genoemd — vraag om rapport of keuring.");

  return {
    ...(askingPrice ? { askingPrice } : {}),
    ...(livingAreaM2 ? { livingAreaM2 } : {}),
    ...(plotAreaM2 ? { plotAreaM2 } : {}),
    ...(bedrooms && bedrooms <= 20 ? { bedroomCount: bedrooms } : {}),
    ...(energy ? { energyLabel: energy } : {}),
    ...(constructionYear ? { constructionYear } : {}),
    ...(vve ? { vveContribution: vve } : {}),
    notes,
  };
}

const LISTING_STORAGE_PREFIX = "woonreality:listing:";

export function listingStorageKey(bagVboId: string) {
  return `${LISTING_STORAGE_PREFIX}${bagVboId}`;
}

export type UserListingDraft = {
  bagVboId: string;
  askingPrice?: number;
  sourceUrl?: string;
  pastedText?: string;
  facts?: ExtractedListingFacts;
};

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
