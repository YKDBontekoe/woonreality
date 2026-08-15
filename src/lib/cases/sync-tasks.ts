import { suggestCaseTasks, taskSource, type TaskEngineInput } from "@/src/lib/tasks";
import type { createSupabaseServerClient } from "@/src/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function syncEngineTasks(supabase: ServerClient, userId: string, input: TaskEngineInput) {
  const suggestions = suggestCaseTasks(input);
  const { data: existing } = await supabase.from("case_tasks").select("source").eq("case_id", input.caseId).eq("user_id", userId);
  const sources = new Set((existing ?? []).map((row) => row.source).filter(Boolean));
  const rows = suggestions.filter((task) => !sources.has(task.source)).map((task) => ({
    case_id: input.caseId,
    user_id: userId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    source: task.source,
    status: "open",
  }));
  if (!rows.length) return suggestions;
  await supabase.from("case_tasks").insert(rows);
  return suggestions;
}

export { taskSource };
