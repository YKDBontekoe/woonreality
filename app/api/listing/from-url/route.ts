import { NextResponse } from "next/server";
import { extractListingFacts, isHttpUrl } from "@/src/lib/listing-intake";
import {
  addressQueryFromFacts,
  factsFromUnknown,
  inspectFundaListing,
  listingFromImportedFacts,
  ListingImportError,
  mergeListingFacts,
  normalizeFundaListingUrl,
} from "@/src/lib/listing-import";
import { searchAddresses } from "@/src/lib/sources/pdok/location";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { userListingImportBodySchema } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Plak een geldige Funda-advertentielink." }, { status: 400 });
  }
  const parsed = userListingImportBodySchema.safeParse(raw);
  const sourceUrl = parsed.success ? normalizeFundaListingUrl(parsed.data.sourceUrl) : null;
  if (!parsed.success || !isHttpUrl(parsed.data.sourceUrl) || !sourceUrl) {
    return NextResponse.json({ error: "Dit is geen Funda-advertentielink. Plak de link van één woning, geen zoekresultaat." }, { status: 400 });
  }

  let inspected;
  try {
    inspected = await inspectFundaListing(sourceUrl);
  } catch (error) {
    const message = error instanceof ListingImportError
      ? error.message
      : "De Funda-pagina kon niet worden ingelezen.";
    return NextResponse.json({ error: message }, { status: error instanceof ListingImportError && error.code === "invalid_url" ? 400 : 502 });
  }

  const query = addressQueryFromFacts(inspected.facts, inspected.sourceUrl)?.trim();
  if (!query) {
    return NextResponse.json({ error: "We konden geen adres uit deze Funda-link halen. Zoek het adres handmatig." }, { status: 422 });
  }

  let results;
  try {
    results = await searchAddresses(query, 6);
  } catch {
    return NextResponse.json({ error: "Het adres uit de advertentie kon nu niet worden opgezocht. Probeer het later of zoek op adres." }, { status: 502 });
  }
  const address = results[0];
  if (!address) {
    return NextResponse.json({
      error: `We herkenden het adres niet (${query}). Zoek het adres handmatig.`,
      query,
      facts: inspected.facts,
      blocked: inspected.blocked,
    }, { status: 404 });
  }

  const fetchedAt = new Date().toISOString();
  let facts = inspected.facts;
  let persisted = false;
  try {
    const { supabase, user } = await currentUser();
    if (user) {
      const { data: existing } = await supabase
        .from("user_listings")
        .select("asking_price, extracted_json, pasted_text")
        .eq("user_id", user.id)
        .eq("bag_vbo_id", address.bagVboId)
        .maybeSingle();
      const existingFacts = mergeListingFacts(
        factsFromUnknown(existing?.extracted_json),
        extractListingFacts(existing?.pasted_text ?? ""),
      );
      if (existing?.asking_price != null) existingFacts.askingPrice = existing.asking_price;
      facts = mergeListingFacts(existingFacts, inspected.facts);
      const { error } = await supabase.from("user_listings").upsert({
        user_id: user.id,
        bag_vbo_id: address.bagVboId,
        source_url: inspected.sourceUrl,
        asking_price: facts.askingPrice ?? existing?.asking_price ?? null,
        extracted_json: facts,
        updated_at: fetchedAt,
      }, { onConflict: "user_id,bag_vbo_id" });
      if (error) throw error;
      persisted = true;
    }
  } catch (error) {
    console.warn("user_listings persistence unavailable after from-url import", error);
    persisted = false;
  }

  return NextResponse.json({
    address,
    listing: listingFromImportedFacts(inspected.sourceUrl, facts, fetchedAt),
    facts,
    blocked: inspected.blocked,
    persisted,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
