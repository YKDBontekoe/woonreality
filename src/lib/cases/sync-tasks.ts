import { buyerProfileIsConfigured, normalizeBuyerProfile } from "@/src/lib/purchase";
import { normalizeCaseStage } from "@/src/lib/journey";
import { suggestCaseTasks, taskSource, type TaskEngineInput } from "@/src/lib/tasks";
import type { createSupabaseServerClient } from "@/src/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function loadTaskEngineInput(
  supabase: ServerClient,
  userId: string,
  input: { caseId: string; stage: string; bagVboId?: string | null },
): Promise<TaskEngineInput> {
  const [{ data: documents, error: documentsError }, { data: findings, error: findingsError }, { data: profile, error: profileError }, { data: bid, error: bidError }, { data: valuation, error: valuationError }] = await Promise.all([
    supabase.from("case_documents").select("document_type").eq("case_id", input.caseId),
    supabase.from("document_findings").select("title,severity,action,status").eq("case_id", input.caseId).eq("status", "open"),
    supabase.from("profiles").select("preferences_json").eq("id", userId).maybeSingle(),
    supabase.from("bid_drafts").select("amount,conditions").eq("case_id", input.caseId).eq("user_id", userId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("valuation_snapshots").select("midpoint_value,methodology").eq("case_id", input.caseId).eq("user_id", userId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (documentsError) throw documentsError;
  if (findingsError) throw findingsError;
  if (profileError) throw profileError;
  if (bidError) throw bidError;
  if (valuationError) throw valuationError;
  const prefs = record(profile?.preferences_json);
  const buyerProfile = normalizeBuyerProfile(prefs.buyerProfile);
  const conditions = record(bid?.conditions);
  const contractSignedAt = typeof conditions.contractSignedAt === "string" ? conditions.contractSignedAt : null;
  const contractReceivedAt = typeof conditions.contractReceivedAt === "string" ? conditions.contractReceivedAt : null;
  const financingWeeks = typeof conditions.financingWeeks === "number" ? conditions.financingWeeks : null;
  const inspectionWeeks = typeof conditions.inspectionWeeks === "number" ? conditions.inspectionWeeks : null;
  return {
    profile: buyerProfile,
    profileConfigured: buyerProfileIsConfigured(buyerProfile, prefs.buyerProfile),
    stage: normalizeCaseStage(input.stage),
    bagVboId: input.bagVboId,
    caseId: input.caseId,
    documentTypes: (documents ?? []).map((item) => item.document_type),
    openFindings: findings ?? [],
    hasAskingPrice: Boolean(record(valuation?.methodology).askingPrice ?? valuation?.midpoint_value),
    hasOffer: Boolean(bid?.amount),
    hasContractAmount: Boolean(conditions.contractAmount),
    contractReceivedAt,
    contractSignedAt,
    financingWeeks,
    inspectionWeeks,
  };
}

export async function syncEngineTasks(supabase: ServerClient, userId: string, input: TaskEngineInput) {
  const suggestions = suggestCaseTasks(input);
  const { data: existing, error: existingError } = await supabase
    .from("case_tasks")
    .select("id,source,status")
    .eq("case_id", input.caseId)
    .eq("user_id", userId);
  if (existingError) throw existingError;

  const suggestedSources = new Set(suggestions.map((task) => task.source));
  const staleIds = (existing ?? [])
    .filter((row) => row.source?.startsWith("engine:") && row.status === "open" && !suggestedSources.has(row.source))
    .map((row) => row.id);
  if (staleIds.length) {
    const { error: closeError } = await supabase
      .from("case_tasks")
      .update({ status: "done" })
      .in("id", staleIds)
      .eq("case_id", input.caseId)
      .eq("user_id", userId);
    if (closeError) throw closeError;
  }

  const openBySource = new Map(
    (existing ?? [])
      .filter((row) => row.status === "open" && row.source)
      .map((row) => [row.source as string, row]),
  );
  const closedDeadlineSources = new Set(
    (existing ?? [])
      .filter((row) => row.source?.startsWith("engine:deadline-") && row.status !== "open")
      .map((row) => row.source as string),
  );

  const toInsert: Array<{
    case_id: string;
    user_id: string;
    title: string;
    description: string;
    priority: string;
    source: string;
    status: string;
    due_at: string | null;
  }> = [];

  for (const task of suggestions) {
    const open = openBySource.get(task.source);
    if (open) {
      if (task.source.startsWith("engine:deadline-")) {
        const { error: updateError } = await supabase
          .from("case_tasks")
          .update({
            title: task.title,
            description: task.description,
            priority: task.priority,
            due_at: task.dueAt ?? null,
          })
          .eq("id", open.id)
          .eq("case_id", input.caseId)
          .eq("user_id", userId);
        if (updateError) throw updateError;
      }
      continue;
    }
    // Recreate a closed deadline task only when the latest suggestion is still future-dated.
    if (closedDeadlineSources.has(task.source) && task.source.startsWith("engine:deadline-")) {
      if (!task.dueAt || new Date(task.dueAt).getTime() < Date.now()) continue;
    } else if ((existing ?? []).some((row) => row.source === task.source)) {
      continue;
    }
    toInsert.push({
      case_id: input.caseId,
      user_id: userId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      source: task.source,
      status: "open",
      due_at: task.dueAt ?? null,
    });
  }
  if (!toInsert.length) return suggestions;
  const { error: insertError } = await supabase.from("case_tasks").insert(toInsert);
  if (insertError) throw insertError;
  return suggestions;
}

export { taskSource };
