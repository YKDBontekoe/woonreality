import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

function validBagId(value: string) { return /^\d{16}$/.test(value); }

async function userForBag(bagId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  return { supabase, user: auth.user, valid: validBagId(bagId) };
}

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  try {
    const { supabase, user, valid } = await userForBag(decodeURIComponent(bagId));
    if (!valid) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    if (!user) return NextResponse.json({ error: "Log in om je checklist te bewaren." }, { status: 401 });
    const { data, error } = await supabase.from("property_checklists").select("items_json").eq("user_id", user.id).eq("bag_vbo_id", decodeURIComponent(bagId)).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ items: Array.isArray(data?.items_json) ? data.items_json : null });
  } catch {
    return NextResponse.json({ error: "De checklistopslag is nog niet gekoppeld aan Supabase." }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  const decodedBagId = decodeURIComponent(bagId);
  try {
    const { supabase, user, valid } = await userForBag(decodedBagId);
    if (!valid) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    if (!user) return NextResponse.json({ error: "Log in om je checklist te bewaren." }, { status: 401 });
    const body = await request.json() as { items?: unknown };
    if (!Array.isArray(body.items) || body.items.length > 100) return NextResponse.json({ error: "Ongeldige checklist." }, { status: 400 });
    const { data, error } = await supabase.from("property_checklists").upsert({ user_id: user.id, bag_vbo_id: decodedBagId, items_json: body.items, updated_at: new Date().toISOString() }, { onConflict: "user_id,bag_vbo_id" }).select("items_json").single();
    if (error) throw error;
    return NextResponse.json({ items: data.items_json });
  } catch {
    return NextResponse.json({ error: "Je checklist kon niet worden opgeslagen. Controleer de Supabase-koppeling en probeer opnieuw." }, { status: 502 });
  }
}
