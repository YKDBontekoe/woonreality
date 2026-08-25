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
  const existingFacts = mergeListingFacts(
    factsFromUnknown(existing?.extracted_json),
    extractListingFacts(existing?.pasted_text ?? ""),
    { prefer: "existing" },
  );
  if (existing?.asking_price != null) existingFacts.askingPrice = existing.asking_price;
  const facts = mergeListingFacts(existingFacts, imported.facts);
  const { error } = await supabase.from("user_listings").upsert({
    user_id: userId,
    bag_vbo_id: bagVboId,
    source_url: imported.sourceUrl,
    asking_price: facts.askingPrice ?? existing?.asking_price ?? null,
    extracted_json: facts,
    updated_at: fetchedAt,
  }, { onConflict: "user_id,bag_vbo_id" });
  if (error) throw error;
  return { facts, persisted: true };
}
