import {
  addressQueryFromFacts,
  EXTENSION_REQUIRED_NOTE,
  factsFromFundaUrl,
  factsFromUnknown,
  FUNDA_USER_PROVIDER,
  fundaListingId,
  isFundaChallengeHtml,
  isFundaHost,
  isFundaListingUrl,
  listingFactsAreSparse,
  listingFromImportedFacts,
  listingFromUserRecord,
  ListingImportError,
  mergeListingFacts,
  normalizeFundaListingUrl,
  parseFundaListingAddress,
  uniqueNotes,
  USER_PROVIDER,
  type ImportedListingFacts,
  type ListingTextSection,
} from "@/src/lib/listing-extract";

export {
  addressQueryFromFacts,
  factsFromUnknown,
  FUNDA_USER_PROVIDER,
  fundaListingId,
  isFundaChallengeHtml,
  isFundaHost,
  isFundaListingUrl,
  listingFactsAreSparse,
  listingFromImportedFacts,
  listingFromUserRecord,
  ListingImportError,
  mergeListingFacts,
  normalizeFundaListingUrl,
  parseFundaListingAddress,
  USER_PROVIDER,
};
export type { ImportedListingFacts, ListingTextSection };

export function inspectFundaListing(sourceUrl: string): { facts: ImportedListingFacts; blocked: boolean; sourceUrl: string } {
  const normalized = normalizeFundaListingUrl(sourceUrl);
  if (!normalized) {
    throw new ListingImportError("Dit is geen Funda-advertentielink. Plak de link van één woning, geen zoekresultaat.", "invalid_url");
  }
  const urlFacts = factsFromFundaUrl(normalized);
  return {
    facts: {
      ...urlFacts,
      notes: uniqueNotes([...urlFacts.notes, EXTENSION_REQUIRED_NOTE]),
    },
    blocked: true,
    sourceUrl: normalized,
  };
}

export function importFundaListing(sourceUrl: string): { facts: ImportedListingFacts; blocked: boolean; sourceUrl: string } {
  return inspectFundaListing(sourceUrl);
}
