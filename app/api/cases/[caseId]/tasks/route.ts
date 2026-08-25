import { NextResponse } from "next/server";
import { apiContext, jsonError, loadOwnedCase, routeError } from "@/src/lib/api/handlers";
import { loadTaskEngineInput, syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { normalizeCaseStage } from "@/src/lib/journey";
import { suggestCaseTasks } from "@/src/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { t } = apiContext(request);
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await loadOwnedCase(caseId, "id,stage,property_id");
    if (!user) return jsonError(t("errors.loginToRefreshTasks"), 401);
    if (!purchaseCase) return jsonError(t("errors.caseNotFound"), 404);

    const { data: property, error: propertyError } = purchaseCase.property_id
      ? await supabase.from("properties").select("bag_vbo_id").eq("id", purchaseCase.property_id).maybeSingle()
      : { data: null, error: null };
    if (propertyError) throw propertyError;

    const input = await loadTaskEngineInput(supabase, user.id, {
      caseId,
      stage: normalizeCaseStage(purchaseCase.stage),
      bagVboId: property?.bag_vbo_id,
    });
    await syncEngineTasks(supabase, user.id, input);
    const { data: tasks, error: tasksError } = await supabase.from("case_tasks").select("*").eq("case_id", caseId).eq("user_id", user.id).eq("status", "open").order("created_at", { ascending: true });
    if (tasksError) throw tasksError;
    return NextResponse.json({ tasks: tasks ?? [], suggested: suggestCaseTasks(input) });
  } catch (error) {
    return routeError(error, t("errors.tasksRefreshFailed"), 502);
  }
}
