import { NextResponse } from "next/server";
import { apiContext, jsonError, loadOwnedCase, parseJsonBody, routeError } from "@/src/lib/api/handlers";
import { applyWorkflowUpdate } from "@/src/lib/cases/apply-workflow";
import { workflowBodySchema } from "@/src/lib/validation/workspace";
import { normalizeCaseStage } from "@/src/lib/journey";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { t } = apiContext(request);
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await loadOwnedCase(caseId, "id,stage,property_id");
    if (!user) return jsonError(t("errors.loginToViewWorkflow"), 401);
    if (!purchaseCase) return jsonError(t("errors.caseNotFound"), 404);
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
    return routeError(error, "Workflow kon niet worden geladen.", 503);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { t } = apiContext(request);
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await loadOwnedCase(caseId, "id,stage,property_id");
    if (!user) return jsonError(t("errors.loginToSaveWorkflow"), 401);
    if (!purchaseCase) return jsonError(t("errors.caseNotFound"), 404);
    const parsed = await parseJsonBody(request, workflowBodySchema, "Ongeldige workflowgegevens.");
    if (!parsed.ok) return parsed.response;
    await applyWorkflowUpdate(supabase, user.id, purchaseCase, parsed.data);
    const stage = parsed.data.stage ?? normalizeCaseStage(purchaseCase.stage);
    return NextResponse.json({ saved: true, stage });
  } catch (error) {
    return routeError(error, "Workflow kon niet worden opgeslagen.", 502);
  }
}
