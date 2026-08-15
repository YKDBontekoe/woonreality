import { NextResponse } from "next/server";
import { extractListingFacts, isHttpUrl } from "@/src/lib/listing-intake";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { userListingBodySchema } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  if (!/^\d{16}$/.test(bagId)) return NextResponse.json({ error: "Ongeldig BAG-adres." }, { status: 400 });
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ listing: null }, { status: 401 });
    const { data, error } = await supabase.from("user_listings").select("*").eq("user_id", user.id).eq("bag_vbo_id", bagId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ listing: data });
  } catch {
    return NextResponse.json({ error: "Advertentiegegevens konden niet worden geladen." }, { status: 502 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  if (!/^\d{16}$/.test(bagId)) return NextResponse.json({ error: "Ongeldig BAG-adres." }, { status: 400 });
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: "Log in om advertentiegegevens te bewaren." }, { status: 401 });
    const parsed = userListingBodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige advertentiegegevens." }, { status: 400 });
    if (parsed.data.sourceUrl && !isHttpUrl(parsed.data.sourceUrl)) return NextResponse.json({ error: "De bronlink is geen geldige URL." }, { status: 400 });
    const facts = extractListingFacts(parsed.data.pastedText ?? "");
    const askingPrice = parsed.data.askingPrice ?? facts.askingPrice ?? null;
    const payload = {
      user_id: user.id,
      bag_vbo_id: bagId,
      source_url: parsed.data.sourceUrl ?? null,
      asking_price: askingPrice,
      pasted_text: parsed.data.pastedText ?? null,
      extracted_json: facts,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("user_listings").upsert(payload, { onConflict: "user_id,bag_vbo_id" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ listing: data, facts });
  } catch {
    return NextResponse.json({ error: "Advertentiegegevens konden niet worden opgeslagen." }, { status: 502 });
  }
}
