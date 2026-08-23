import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { checklistBodySchema, MAX_CHECKLIST_BODY_BYTES, isValidBagId } from "@/src/lib/validation/workspace";
import { loadTaskEngineInput, syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { logWarn } from "@/src/lib/logger";

export const runtime = "nodejs";

async function userForBag(bagId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  return { supabase, user: auth.user, valid: isValidBagId(bagId) };
}

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  try {
    const { bagId: rawBagId } = await context.params;
    const decodedBagId = decodeURIComponent(rawBagId);
    const { supabase, user, valid } = await userForBag(decodedBagId);
    if (!valid) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    if (!user) return NextResponse.json({ error: "Log in om je checklist te bewaren." }, { status: 401 });
    const { data, error } = await supabase.from("property_checklists").select("items_json").eq("user_id", user.id).eq("bag_vbo_id", decodedBagId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ items: Array.isArray(data?.items_json) ? data.items_json : null });
  } catch (error) {
    if (error instanceof URIError) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    return NextResponse.json({ error: "De checklistopslag is nog niet gekoppeld aan Supabase." }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  try {
    const { bagId: rawBagId } = await context.params;
    const decodedBagId = decodeURIComponent(rawBagId);
    const { supabase, user, valid } = await userForBag(decodedBagId);
    if (!valid) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    if (!user) return NextResponse.json({ error: "Log in om je checklist te bewaren." }, { status: 401 });
    const rawBody = await request.text();
    if (rawBody.length > MAX_CHECKLIST_BODY_BYTES) return NextResponse.json({ error: "Checklist is te groot." }, { status: 413 });
    let parsedJson: unknown;
    try { parsedJson = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Ongeldige checklist." }, { status: 400 }); }
    const parsed = checklistBodySchema.safeParse(parsedJson);
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige checklist." }, { status: 400 });
    const { data, error } = await supabase.from("property_checklists").upsert({ user_id: user.id, bag_vbo_id: decodedBagId, items_json: parsed.data.items, updated_at: new Date().toISOString() }, { onConflict: "user_id,bag_vbo_id" }).select("items_json").single();
    if (error) throw error;
    // Keep the dossier task engine in sync: an active case for this address
    // should reflect checklist progress (e.g. viewing completed) immediately.
    try {
      const { data: propertyRow } = await supabase.from("properties").select("id").eq("bag_vbo_id", decodedBagId).maybeSingle();
      if (propertyRow) {
        const { data: purchaseCase } = await supabase.from("purchase_cases").select("id,stage").eq("user_id", user.id).eq("property_id", propertyRow.id).eq("status", "active").maybeSingle();
        if (purchaseCase) {
          await syncEngineTasks(supabase, user.id, await loadTaskEngineInput(supabase, user.id, { caseId: purchaseCase.id, stage: purchaseCase.stage, bagVboId: decodedBagId }));
        }
      }
    } catch (syncError) {
      logWarn("Checklist saved but case task sync failed", syncError);
    }
    return NextResponse.json({ items: data.items_json });
  } catch (error) {
    if (error instanceof URIError) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    return NextResponse.json({ error: "Je checklist kon niet worden opgeslagen. Controleer de Supabase-koppeling en probeer opnieuw." }, { status: 502 });
  }
}
