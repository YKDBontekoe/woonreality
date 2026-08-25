import { NextResponse } from "next/server";
import { apiContext, jsonError, loadOwnedCase, routeError } from "@/src/lib/api/handlers";
import { loadTaskEngineInput, syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { isAcceptedCaseStageInput, normalizeCaseStage } from "@/src/lib/journey";

export const runtime = "nodejs";

function bagFromCase(purchaseCase: unknown) {
  const row = (purchaseCase && typeof purchaseCase === "object" ? purchaseCase : {}) as { properties?: unknown };
  const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
  return property && typeof property === "object" && "bag_vbo_id" in property ? String((property as { bag_vbo_id: string }).bag_vbo_id) : null;
}

export async function GET(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { t } = apiContext(request);
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await loadOwnedCase(caseId);
    if (!user) return jsonError(t("errors.loginToViewCase"), 401);
    if (!purchaseCase) return jsonError(t("errors.caseNotFound"), 404);
    const [{ data: tasks }, { data: documents }, { data: findings }, { data: events }] = await Promise.all([
      supabase.from("case_tasks").select("*").eq("case_id", caseId).eq("user_id", user.id).order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("case_documents").select("*").eq("case_id", caseId).eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("document_findings").select("*").eq("case_id", caseId).eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("case_events").select("*").eq("case_id", caseId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    return NextResponse.json({
      case: { ...purchaseCase, stage: normalizeCaseStage(purchaseCase.stage), bagVboId: bagFromCase(purchaseCase) },
      tasks: tasks ?? [],
      documents: documents ?? [],
      findings: findings ?? [],
      events: events ?? [],
    });
  } catch (error) {
    return routeError(error, t("errors.caseLoadFailed"), 502);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { t } = apiContext(request);
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await loadOwnedCase(caseId);
    if (!user) return jsonError(t("errors.loginToUpdateCase"), 401);
    if (!purchaseCase) return jsonError(t("errors.caseNotFound"), 404);
    const body = await request.json() as { title?: string; stage?: string; status?: string };
    if (typeof body.stage === "string" && body.stage.trim() && !isAcceptedCaseStageInput(body.stage)) {
      return jsonError("Onbekende dossierstap.", 400);
    }
    const { data, error } = await supabase.rpc("apply_case_stage", {
      p_case_id: caseId,
      p_stage: body.stage?.trim() || null,
      p_title: body.title?.trim() || null,
      p_status: body.status || null,
    });
    if (error || !data) throw error ?? new Error(t("errors.caseUpdateFailed"));
    const updated = data as Record<string, unknown>;
    const stage = normalizeCaseStage(typeof updated.stage === "string" ? updated.stage : purchaseCase.stage);
    await syncEngineTasks(supabase, user.id, await loadTaskEngineInput(supabase, user.id, {
      caseId,
      stage,
      bagVboId: bagFromCase(purchaseCase),
    }));
    return NextResponse.json({ case: { ...updated, stage, bagVboId: bagFromCase(purchaseCase) } });
  } catch (error) {
    return routeError(error, t("errors.caseUpdateFailed"), 502);
  }
}
