import { NextResponse } from "next/server";
import { apiContext, currentUser, jsonError, routeError } from "@/src/lib/api/handlers";
import { loadTaskEngineInput, syncEngineTasks, taskSource } from "@/src/lib/cases/sync-tasks";
import { normalizeCaseStage } from "@/src/lib/journey";

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string; findingId: string }> }) {
  const { t } = apiContext(request);
  const { caseId, findingId } = await context.params;
  try {
    const { supabase, user } = await currentUser();
    if (!user) return jsonError(t("errors.loginToUpdateFindings"), 401);
    const body = await request.json() as { status?: string };
    if (!body.status || !["open", "resolved", "ignored"].includes(body.status)) return jsonError("Ongeldige status.", 400);
    const { data, error } = await supabase.from("document_findings").update({ status: body.status }).eq("id", findingId).eq("case_id", caseId).eq("user_id", user.id).select("*").single();
    if (error) return jsonError("Aandachtspunt kon niet worden bijgewerkt.", 502);

    const taskStatus = body.status === "open" ? "open" : "done";
    const { error: taskError } = await supabase
      .from("case_tasks")
      .update({ status: taskStatus })
      .eq("case_id", caseId)
      .eq("user_id", user.id)
      .eq("source", taskSource(`finding-${data.title}`));
    if (taskError) throw taskError;

    const { data: purchaseCase, error: caseError } = await supabase.from("purchase_cases").select("id,stage,property_id").eq("id", caseId).eq("user_id", user.id).maybeSingle();
    if (caseError) throw caseError;
    if (purchaseCase) {
      const { data: property } = purchaseCase.property_id
        ? await supabase.from("properties").select("bag_vbo_id").eq("id", purchaseCase.property_id).maybeSingle()
        : { data: null };
      await syncEngineTasks(supabase, user.id, await loadTaskEngineInput(supabase, user.id, {
        caseId,
        stage: normalizeCaseStage(purchaseCase.stage),
        bagVboId: property?.bag_vbo_id,
      }));
    }
    return NextResponse.json({ finding: data });
  } catch (error) {
    return routeError(error, "Aandachtspunt kon niet worden bijgewerkt.", 502);
  }
}
