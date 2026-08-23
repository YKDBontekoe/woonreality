import { NextResponse } from "next/server";
import { extractListingFacts, isHttpUrl } from "@/src/lib/listing-intake";
import {
  factsFromUnknown,
  importFundaListing,
  listingFromImportedFacts,
  ListingImportError,
  mergeListingFacts,
  normalizeFundaListingUrl,
} from "@/src/lib/listing-import";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";
import { userListingImportBodySchema, isValidBagId } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  if (!isValidBagId(bagId)) return NextResponse.json({ error: "Ongeldig BAG-adres." }, { status: 400 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige advertentiegegevens." }, { status: 400 });
  }
  const parsed = userListingImportBodySchema.safeParse(raw);
  if (!parsed.success || !isHttpUrl(parsed.data.sourceUrl)) {
    return NextResponse.json({ error: "Plak een geldige Funda-advertentielink." }, { status: 400 });
  }
  const sourceUrl = normalizeFundaListingUrl(parsed.data.sourceUrl);
  if (!sourceUrl) {
    return NextResponse.json({ error: "Dit is geen Funda-advertentielink. Plak de link van één woning, geen zoekresultaat." }, { status: 400 });
  }

  let imported;
  try {
    imported = importFundaListing(sourceUrl);
  } catch (error) {
    const message = error instanceof ListingImportError
      ? error.message
      : "Deze Funda-link kon niet worden herkend.";
    const status = error instanceof ListingImportError && error.code === "invalid_url" ? 400 : 422;
    return NextResponse.json({
      error: message,
      blocked: error instanceof ListingImportError && error.code === "blocked",
    }, { status });
  }

  const fetchedAt = new Date().toISOString();
  let facts = imported.facts;
  let persisted = false;

  try {
    if (isSupabaseConfigured()) {
      const { supabase, user } = await currentUser();
      if (user) {
        const { data: existing } = await supabase
          .from("user_listings")
          .select("asking_price, extracted_json, pasted_text")
          .eq("user_id", user.id)
          .eq("bag_vbo_id", bagId)
          .maybeSingle();
        const existingFacts = mergeListingFacts(
          factsFromUnknown(existing?.extracted_json),
          extractListingFacts(existing?.pasted_text ?? ""),
          { prefer: "existing" },
        );
        if (existing?.asking_price != null) existingFacts.askingPrice = existing.asking_price;
        facts = mergeListingFacts(existingFacts, imported.facts);
        const { error } = await supabase.from("user_listings").upsert({
          user_id: user.id,
          bag_vbo_id: bagId,
          source_url: imported.sourceUrl,
          asking_price: facts.askingPrice ?? existing?.asking_price ?? null,
          extracted_json: facts,
          updated_at: fetchedAt,
        }, { onConflict: "user_id,bag_vbo_id" });
        if (error) throw error;
        persisted = true;
      }
    }
  } catch (error) {
    console.warn("user_listings persistence unavailable after listing import", error);
    persisted = false;
  }

  return NextResponse.json({
    listing: listingFromImportedFacts(imported.sourceUrl, facts, fetchedAt),
    facts,
    blocked: imported.blocked,
    persisted,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
