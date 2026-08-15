import { NextResponse } from "next/server";
import { loadTaskEngineInput, syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { workflowBodySchema } from "@/src/lib/validation/workspace";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { normalizeCaseStage, propertyStageFromCase } from "@/src/lib/journey";

export const runtime = "nodejs";

async function ownedCase(caseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return { supabase, user: null, purchaseCase: null };
  const { data: purchaseCase, error: caseError } = await supabase.from("purchase_cases").select("id,stage,property_id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
  if (caseError) throw caseError;
  return { supabase, user: auth.user, purchaseCase };
}

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await ownedCase(caseId);
    if (!user) return NextResponse.json({ error: "Log in om je aankoopworkflow te bekijken." }, { status: 401 });
    if (!purchaseCase) return NextResponse.json({ error: "Dossier niet gevonden." }, { status: 404 });
    const [financeResult, valuationResult, bidResult] = await Promise.all([
      supabase.from("case_finance").select("*").eq("case_id", caseId).eq("user_id", user.id).maybeSingle(),
      supabase.from("valuation_snapshots").select("*").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("bid_drafts").select("*").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (financeResult.error) throw financeResult.error;
    if (valuationResult.error) throw valuationResult.error;
    if (bidResult.error) throw bidResult.error;
    return NextResponse.json({ finance: financeResult.data, valuation: valuationResult.data, bid: bidResult.data, stage: normalizeCaseStage(purchaseCase.stage) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow kon niet worden geladen." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await ownedCase(caseId);
    if (!user) return NextResponse.json({ error: "Log in om je aankoopworkflow op te slaan." }, { status: 401 });
    if (!purchaseCase) return NextResponse.json({ error: "Dossier niet gevonden." }, { status: 404 });
    const parsed = workflowBodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige workflowgegevens." }, { status: 400 });
    const { error } = await supabase.rpc("apply_case_workflow", { p_case_id: caseId, p_payload: parsed.data });
    if (error) throw error;
    const stage = parsed.data.stage ?? normalizeCaseStage(purchaseCase.stage);
    const { data: property, error: propertyError } = purchaseCase.property_id
      ? await supabase.from("properties").select("bag_vbo_id").eq("id", purchaseCase.property_id).maybeSingle()
      : { data: null, error: null };
    if (propertyError) throw propertyError;
    if (property?.bag_vbo_id) {
      const { error: savedError } = await supabase.from("saved_properties").update({
        stage: propertyStageFromCase(stage),
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("bag_vbo_id", property.bag_vbo_id);
      if (savedError) throw savedError;
    }
    await syncEngineTasks(supabase, user.id, await loadTaskEngineInput(supabase, user.id, {
      caseId,
      stage,
      bagVboId: property?.bag_vbo_id,
    }));
    return NextResponse.json({ saved: true, stage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow kon niet worden opgeslagen." }, { status: 502 });
  }
}
