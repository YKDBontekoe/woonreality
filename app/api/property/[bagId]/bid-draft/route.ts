import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

const bidDraftBodySchema = z.object({
  askingPrice: z.number().finite().nonnegative().nullable().optional(),
  selected: z.enum(["cautious", "balanced", "strong"]).optional(),
}).strict();

async function contextFor(bagId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  return { supabase, user: auth.user, valid: /^\d{16}$/.test(bagId), bagId };
}

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  try {
    const { bagId: rawBagId } = await context.params;
    const result = await contextFor(decodeURIComponent(rawBagId));
    if (!result.valid) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    if (!result.user) return NextResponse.json({ error: "Log in om een bodconcept te bewaren." }, { status: 401 });
    const { data, error } = await result.supabase.from("property_bid_drafts").select("asking_price,selected_scenario,updated_at").eq("user_id", result.user.id).eq("bag_vbo_id", result.bagId).maybeSingle();
    if (error) return NextResponse.json({ error: "Bodconcept kon niet worden geladen." }, { status: 503 });
    return NextResponse.json({ draft: data });
  } catch {
    return NextResponse.json({ error: "Bodopslag is nog niet beschikbaar. Log in en koppel Supabase om concepten te bewaren." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ bagId: string }> }) {
  try {
    const { bagId: rawBagId } = await context.params;
    const result = await contextFor(decodeURIComponent(rawBagId));
    if (!result.valid) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    if (!result.user) return NextResponse.json({ error: "Log in om een bodconcept te bewaren." }, { status: 401 });
    const parsed = bidDraftBodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige bodgegevens." }, { status: 400 });
    const payload: { user_id: string; bag_vbo_id: string; asking_price?: number | null; selected_scenario?: "cautious" | "balanced" | "strong"; updated_at: string } = { user_id: result.user.id, bag_vbo_id: result.bagId, updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(parsed.data, "askingPrice")) payload.asking_price = parsed.data.askingPrice;
    if (Object.prototype.hasOwnProperty.call(parsed.data, "selected")) payload.selected_scenario = parsed.data.selected;
    const { data, error } = await result.supabase.from("property_bid_drafts").upsert(payload, { onConflict: "user_id,bag_vbo_id" }).select("asking_price,selected_scenario,updated_at").single();
    if (error) return NextResponse.json({ error: "Bodconcept kon niet worden opgeslagen." }, { status: 502 });
    return NextResponse.json({ draft: data });
  } catch {
    return NextResponse.json({ error: "Bodopslag is nog niet beschikbaar. Log in en koppel Supabase om concepten te bewaren." }, { status: 503 });
  }
}
