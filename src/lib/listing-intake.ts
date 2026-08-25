import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

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
const YEAR_RE = /\b(19\d{2}|20[0-2]\d)\b/g;
const ENERGY_RE = /\benergielabel\s*[:\s]*([A-G][\+\-]?)\b/i;
const BEDROOM_RE = /(\d{1,2})\s*(?:slaapkamers?|bedrooms?)\b/i;
const VVE_RE = /(?:vve[^€\d]{0,40})(?:€\s*)?(\d{1,4}(?:[.,]\d{2})?)/i;

export function parseDutchNumber(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!compact) return undefined;
  if (compact.includes(",")) {
    const normalized = compact.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(compact)) {
    const parsed = Number(compact.replace(/\./g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const parsed = Number(compact);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function uniqueNumbers(values: Array<number | undefined>) {
  return [...new Set(values.filter((value): value is number => value != null && value > 0))];
}

function labelledArea(text: string, label: string, min: number, max: number) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixed = text.match(new RegExp(`${escaped}[^\\d]{0,24}(\\d{2,4}(?:[.,]\\d)?)\\s*m(?:2|²)`, "i"));
  const prefixedValue = prefixed ? parseDutchNumber(prefixed[1]) : undefined;
  if (prefixedValue != null && prefixedValue >= min && prefixedValue <= max) return prefixedValue;
  const suffixed = text.match(new RegExp(`(\\d{2,4}(?:[.,]\\d)?)\\s*m(?:2|²)[^\\d]{0,16}${escaped}`, "i"));
  const suffixedValue = suffixed ? parseDutchNumber(suffixed[1]) : undefined;
  if (suffixedValue != null && suffixedValue >= min && suffixedValue <= max) return suffixedValue;
  return undefined;
}

export function extractListingFacts(text: string, locale: Locale = "nl"): ExtractedListingFacts {
  const t = getLibTranslator(locale, "lib-domain");
  const notes: string[] = [];
  const prices = uniqueNumbers([...text.matchAll(PRICE_RE)].map((match) => parseDutchNumber(match[1])));
  const years = uniqueNumbers([...text.matchAll(YEAR_RE)].map((match) => Number(match[1])));
  const energy = text.match(ENERGY_RE)?.[1]?.toUpperCase();
  const bedrooms = text.match(BEDROOM_RE)?.[1] ? Number(text.match(BEDROOM_RE)?.[1]) : undefined;
  const vve = text.match(VVE_RE)?.[1] ? parseDutchNumber(text.match(VVE_RE)?.[1] ?? "") : undefined;

  const askingPrice = prices.find((value) => value >= 50_000 && value <= 10_000_000);
  const livingAreaM2 = labelledArea(text, "woonoppervlakte", 20, 600);
  const plotAreaM2 = labelledArea(text, "perceeloppervlakte", 40, 8_000);
  const constructionYear = years.find((value) => value >= 1600 && value <= new Date().getFullYear());

  if (!askingPrice && prices.length) notes.push(t("listingIntake.amountsNoAskingPrice"));
  if (/erfpacht/i.test(text)) notes.push(t("listingIntake.leasehold"));
  if (/ouderdomsclausule/i.test(text)) notes.push(t("listingIntake.ageClause"));
  if (/asbest/i.test(text)) notes.push(t("listingIntake.asbestos"));

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
  facts?: ExtractedListingFacts;
  blocked?: boolean;
  notice?: string;
};

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Research sources and listing source URLs must be HTTPS so the dashboard never renders an insecure external href. */
export function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
