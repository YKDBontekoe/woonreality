import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";
import { extractListingFacts } from "@/src/lib/listing-intake";
import {
  addressQueryFromFacts,
  EXTENSION_REQUIRED_NOTE,
  factsFromFundaUrl,
  factsFromUnknown,
  FUNDA_USER_PROVIDER,
  fundaListingId,
  hasValue,
  isFundaChallengeHtml,
  isFundaHost,
  isFundaListingUrl,
  listingCaptureQuality,
  listingCaptureIsStale,
  listingFactsAreSparse,
  listingFromImportedFacts,
  listingFromUserRecord,
  ListingImportError,
  LISTING_STALE_AFTER_DAYS,
  mergeListingFacts,
  normalizeFundaListingUrl,
  parseFundaListingAddress,
  uniqueNotes,
  USER_PROVIDER,
  type ImportedListingFacts,
  type ListingCaptureQuality,
  type ListingTextSection,
} from "@/src/lib/listing-extract";

export {
  addressQueryFromFacts,
  factsFromUnknown,
  FUNDA_USER_PROVIDER,
  fundaListingId,
  hasValue,
  isFundaChallengeHtml,
  isFundaHost,
  isFundaListingUrl,
  listingCaptureIsStale,
  listingCaptureQuality,
  listingFactsAreSparse,
  listingFromImportedFacts,
  listingFromUserRecord,
  ListingImportError,
  LISTING_STALE_AFTER_DAYS,
  mergeListingFacts,
  normalizeFundaListingUrl,
  parseFundaListingAddress,
  USER_PROVIDER,
};
export type { ImportedListingFacts, ListingCaptureQuality, ListingTextSection };

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

export type ExistingUserListingRow = {
  asking_price?: number | null;
  extracted_json?: unknown;
  pasted_text?: string | null;
};

/**
 * A fresh extension capture wins over stored facts (it is newer); the stored
 * asking_price only fills a gap so an old manually typed price never overrides
 * what the advertentie shows today.
 */
export function mergeExistingUserListing(
  existing: ExistingUserListingRow | null | undefined,
  incoming: ImportedListingFacts,
): ImportedListingFacts {
  const existingFacts = mergeListingFacts(
    factsFromUnknown(existing?.extracted_json),
    extractListingFacts(existing?.pasted_text ?? ""),
    { prefer: "existing" },
  );
  const merged = mergeListingFacts(existingFacts, incoming);
  if (!hasValue(merged.askingPrice) && existing?.asking_price != null) merged.askingPrice = existing.asking_price;
  return merged;
}

export async function persistImportedListingFacts(
  supabase: SupabaseClient<Database>,
  userId: string,
  bagVboId: string,
  imported: { sourceUrl: string; facts: ImportedListingFacts },
  fetchedAt = new Date().toISOString(),
): Promise<{ facts: ImportedListingFacts; persisted: boolean }> {
  const { data: existing } = await supabase
    .from("user_listings")
    .select("asking_price, extracted_json, pasted_text")
    .eq("user_id", userId)
    .eq("bag_vbo_id", bagVboId)
    .maybeSingle();
  const facts = mergeExistingUserListing(existing, imported.facts);
  const { error } = await supabase.from("user_listings").upsert({
    user_id: userId,
    bag_vbo_id: bagVboId,
    source_url: imported.sourceUrl,
    asking_price: facts.askingPrice ?? null,
    extracted_json: facts,
    updated_at: fetchedAt,
  }, { onConflict: "user_id,bag_vbo_id" });
  if (error) throw error;
  return { facts, persisted: true };
}
