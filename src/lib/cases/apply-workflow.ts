import { loadTaskEngineInput, syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { normalizeCaseStage, propertyStageFromCase } from "@/src/lib/journey";
import type { z } from "zod";
import type { workflowBodySchema } from "@/src/lib/validation/workspace";
import type { createSupabaseServerClient } from "@/src/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type WorkflowPayload = z.infer<typeof workflowBodySchema>;

type ApplyOptions = {
  /** Optional case status change applied together with the stage update. */
  status?: "active" | "closed";
  /** Optional timeline event recorded alongside the update. */
  event?: { eventType: string; payload: Record<string, unknown> };
};

/**
 * Canonical write path for case workflow state (finance, deadlines, stage).
 * The workflow API, bid-draft save, cockpit stage dropdown and viewing
 * debrief all use this so the per-address data and the case never drift.
 */
export async function applyWorkflowUpdate(supabase: ServerClient, userId: string, purchaseCase: { id: string; stage: string; property_id: string | null }, payload: WorkflowPayload, options: ApplyOptions = {}): Promise<void> {
  const { error } = await supabase.rpc("apply_case_workflow", { p_case_id: purchaseCase.id, p_payload: payload });
  if (error) throw error;
  const stage = payload.stage ?? normalizeCaseStage(purchaseCase.stage);
  const { error: caseError } = await supabase.from("purchase_cases").update({
    ...(options.status ? { status: options.status } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", purchaseCase.id).eq("user_id", userId);
  if (caseError) throw caseError;
  const { data: property, error: propertyError } = purchaseCase.property_id
    ? await supabase.from("properties").select("bag_vbo_id").eq("id", purchaseCase.property_id).maybeSingle()
    : { data: null, error: null };
  if (propertyError) throw propertyError;
  if (property?.bag_vbo_id) {
    const { error: savedError } = await supabase.from("saved_properties").update({
      stage: propertyStageFromCase(stage),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("bag_vbo_id", property.bag_vbo_id);
    if (savedError) throw savedError;
  }
  if (options.event) {
    const { error: eventError } = await supabase.from("case_events").insert({
      case_id: purchaseCase.id,
      user_id: userId,
      event_type: options.event.eventType,
      payload: asJson(options.event.payload),
    });
    if (eventError) throw eventError;
  }
  await syncEngineTasks(supabase, userId, await loadTaskEngineInput(supabase, userId, {
    caseId: purchaseCase.id,
    stage,
    bagVboId: property?.bag_vbo_id,
  }));
}

function asJson(value: unknown) {
  return value as never;
}
