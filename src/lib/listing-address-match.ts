import type { AddressSearchResult } from "@/src/lib/types";

export type AddressMatchConfidence = "high" | "medium" | "low";

export type AddressMatch = {
  address: AddressSearchResult;
  confidence: AddressMatchConfidence;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ExpectedAddress = {
  streetWords: string[];
  houseNumber?: number;
  houseAddition?: string;
  city?: string;
};

export function expectedAddressFromQuery(query: string): ExpectedAddress {
  const parts = query.split(",").map((part) => normalizeText(part)).filter(Boolean);
  const streetPart = parts[0] ?? "";
  const numberMatch = streetPart.match(/(\d{1,5})\s*([a-z]{0,4})$/);
  const houseNumber = numberMatch ? Number(numberMatch[1]) : undefined;
  const streetWords = normalizeText(numberMatch ? streetPart.slice(0, numberMatch.index) : streetPart)
    .split(" ")
    .filter(Boolean);
  return {
    streetWords,
    houseNumber,
    houseAddition: numberMatch?.[2]?.trim() || undefined,
    city: parts.at(-1),
  };
}

function scoreResult(result: AddressSearchResult, expected: ExpectedAddress) {
  const displayName = normalizeText(result.displayName);
  const displayParts = result.displayName.split(",").map((part) => part.trim());
  const words = new Set(displayName.split(" "));
  const matchedStreetWords = expected.streetWords.filter((word) => words.has(word));
  const streetRatio = expected.streetWords.length
    ? matchedStreetWords.length / expected.streetWords.length
    : 0;
  const numberMatches = expected.houseNumber != null
    && new RegExp(`\\b${expected.houseNumber}\\b`).test(displayName);
  const city = expected.city ? normalizeText(expected.city) : undefined;
  const cityMatches = city ? words.has(city) || displayName.includes(city) : false;
  let score = 0;
  if (numberMatches) score += 10;
  else if (expected.houseNumber != null) score -= 6;
  score += streetRatio * 8;
  if (cityMatches) score += 3;
  else if (city) score -= 1;
  return { score, streetRatio, numberMatches, cityMatches, firstSegment: normalizeText(displayParts[0] ?? "") };
}

export function pickAddressMatch(
  query: string,
  results: AddressSearchResult[],
): AddressMatch | undefined {
  if (!results.length) return undefined;
  const expected = expectedAddressFromQuery(query);
  const scored = results.map((address) => {
    const { score, streetRatio, numberMatches, cityMatches } = scoreResult(address, expected);
    let confidence: AddressMatchConfidence = "low";
    if (numberMatches && streetRatio >= 0.99) confidence = cityMatches || !expected.city ? "high" : "medium";
    else if (numberMatches && streetRatio >= 0.5) confidence = "medium";
    else if (expected.houseNumber == null && streetRatio >= 0.5) confidence = "medium";
    return { address, confidence, score };
  });
  const best = scored.reduce((left, right) => (right.score > left.score ? right : left));
  return best;
}
