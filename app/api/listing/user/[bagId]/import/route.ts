import { NextResponse } from "next/server";
import { extractListingFacts, isHttpUrl } from "@/src/lib/listing-intake";
import {
  factsFromUnknown,
  importFundaListing,
  isFundaListingUrl,
  listingFromImportedFacts,
  ListingImportError,
  mergeListingFacts,
} from "@/src/lib/listing-import";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { userListingImportBodySchema } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  if (!/^\d{16}$/.test(bagId)) return NextResponse.json({ error: "Ongeldig BAG-adres." }, { status: 400 });
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
  if (!isFundaListingUrl(parsed.data.sourceUrl)) {
    return NextResponse.json({ error: "Dit is geen Funda-advertentielink. Plak de link van één woning, geen zoekresultaat." }, { status: 400 });
  }

  let imported;
  try {
    imported = await importFundaListing(parsed.data.sourceUrl);
  } catch (error) {
    const message = error instanceof ListingImportError
      ? error.message
      : "De Funda-pagina kon niet worden opgehaald. Plak de vraagprijs of een stuk advertentietekst.";
    const status = error instanceof ListingImportError && error.code === "invalid_url" ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  const fetchedAt = new Date().toISOString();
  let facts = imported;
  let persisted = false;

  try {
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
      );
      if (existing?.asking_price != null) existingFacts.askingPrice = existing.asking_price;
      facts = mergeListingFacts(existingFacts, imported);
      const { error } = await supabase.from("user_listings").upsert({
        user_id: user.id,
        bag_vbo_id: bagId,
        source_url: parsed.data.sourceUrl,
        asking_price: facts.askingPrice ?? existing?.asking_price ?? null,
        extracted_json: facts,
        updated_at: fetchedAt,
      }, { onConflict: "user_id,bag_vbo_id" });
      if (error) throw error;
      persisted = true;
    }
  } catch {
    persisted = false;
  }

  return NextResponse.json({
    listing: listingFromImportedFacts(parsed.data.sourceUrl, facts, fetchedAt),
    facts,
    persisted,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
