import { NextResponse } from "next/server";
import { apiContext, invalidBagIdResponse, jsonError, parseJsonBody, routeError } from "@/src/lib/api/handlers";
import { viewingDebriefStage } from "@/src/lib/journey";
import { applyWorkflowUpdate } from "@/src/lib/cases/apply-workflow";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { viewingDebriefSchema, isValidBagId } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { t } = apiContext(request);
  try {
    const { bagId } = await context.params;
    if (!isValidBagId(bagId)) return invalidBagIdResponse(t("errors.invalidBagAddress"));
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return jsonError(t("errors.loginToFinishViewing"), 401);
    const parsedBody = await parseJsonBody(request, viewingDebriefSchema, t("errors.chooseDebriefOutcome"));
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = parsedBody.data;
    const result = viewingDebriefStage(parsed.decision);
    const now = new Date().toISOString();
    const { data: stageRows, error: stageError } = await supabase.from("saved_properties").update({ stage: result.propertyStage, updated_at: now }).eq("user_id", auth.user.id).eq("bag_vbo_id", bagId).select("bag_vbo_id");
    if (stageError || !stageRows?.length) return jsonError(t("errors.savePropertyFirst"), 400);

    let caseId = parsed.caseId;
    if (caseId) {
      const { data: ownedCase } = await supabase.from("purchase_cases").select("id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
      if (!ownedCase) caseId = undefined;
    }
    if (!caseId) {
      const { data: property } = await supabase.from("properties").select("id").eq("bag_vbo_id", bagId).maybeSingle();
      if (property) {
        const { data: purchaseCase } = await supabase.from("purchase_cases").select("id").eq("user_id", auth.user.id).eq("property_id", property.id).eq("status", "active").maybeSingle();
        caseId = purchaseCase?.id;
      }
    }
    if (caseId) {
      const { data: ownedCase } = await supabase.from("purchase_cases").select("id,stage,property_id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
      if (ownedCase) {
        // Canonical workflow write: stage + event + task engine stay in sync.
        await applyWorkflowUpdate(supabase, auth.user.id, ownedCase, { stage: result.caseStage }, {
          status: result.caseStatus,
          event: {
            eventType: "viewing_debrief",
            payload: { decision: parsed.decision, propertyStage: result.propertyStage, caseStage: result.caseStage },
          },
        });
      } else {
        caseId = undefined;
      }
    }
    return NextResponse.json({ ...result, caseId: caseId ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "Supabase is nog niet geconfigureerd.") {
      return jsonError(t("errors.viewingStorageUnavailable"), 503);
    }
    return routeError(error, t("errors.viewingFinishFailed"));
  }
}
