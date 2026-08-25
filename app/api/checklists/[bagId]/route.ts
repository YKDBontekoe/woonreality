import { NextResponse } from "next/server";
import { apiContext, currentUser, invalidBagIdResponse } from "@/src/lib/api/handlers";
import { checklistBodySchema, MAX_CHECKLIST_BODY_BYTES, isValidBagId } from "@/src/lib/validation/workspace";
import { loadTaskEngineInput, syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { logWarn } from "@/src/lib/logger";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { t } = apiContext(request);
  try {
    const { bagId: rawBagId } = await context.params;
    const decodedBagId = decodeURIComponent(rawBagId);
    const valid = isValidBagId(decodedBagId);
    const { supabase, user } = await currentUser();
    if (!valid) return invalidBagIdResponse(t("errors.invalidPropertyAddress"));
    if (!user) return NextResponse.json({ error: t("errors.loginToSaveChecklist") }, { status: 401 });
    const { data, error } = await supabase.from("property_checklists").select("items_json").eq("user_id", user.id).eq("bag_vbo_id", decodedBagId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ items: Array.isArray(data?.items_json) ? data.items_json : null });
  } catch (error) {
    if (error instanceof URIError) return NextResponse.json({ error: t("errors.invalidPropertyAddress") }, { status: 400 });
    return NextResponse.json({ error: t("errors.checklistNotConfigured") }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { t } = apiContext(request);
  try {
    const { bagId: rawBagId } = await context.params;
    const decodedBagId = decodeURIComponent(rawBagId);
    const valid = isValidBagId(decodedBagId);
    const { supabase, user } = await currentUser();
    if (!valid) return invalidBagIdResponse(t("errors.invalidPropertyAddress"));
    if (!user) return NextResponse.json({ error: t("errors.loginToSaveChecklist") }, { status: 401 });
    const rawBody = await request.text();
    if (rawBody.length > MAX_CHECKLIST_BODY_BYTES) return NextResponse.json({ error: "Checklist is te groot." }, { status: 413 });
    let parsedJson: unknown;
    try { parsedJson = JSON.parse(rawBody); } catch { return NextResponse.json({ error: t("errors.checklistInvalid") }, { status: 400 }); }
    const parsed = checklistBodySchema.safeParse(parsedJson);
    if (!parsed.success) return NextResponse.json({ error: t("errors.checklistInvalid") }, { status: 400 });
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
    if (error instanceof URIError) return NextResponse.json({ error: t("errors.invalidPropertyAddress") }, { status: 400 });
    return NextResponse.json({ error: t("errors.checklistSaveFailed") }, { status: 502 });
  }
}
