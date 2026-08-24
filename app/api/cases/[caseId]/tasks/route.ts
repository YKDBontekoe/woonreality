import { NextResponse } from "next/server";
import { loadTaskEngineInput, syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { normalizeCaseStage } from "@/src/lib/journey";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { suggestCaseTasks } from "@/src/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  const { caseId } = await context.params;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: t("errors.loginToRefreshTasks") }, { status: 401 });
    const { data: purchaseCase } = await supabase.from("purchase_cases").select("id,stage,property_id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
    if (!purchaseCase) return NextResponse.json({ error: t("errors.caseNotFound") }, { status: 404 });

    const { data: property, error: propertyError } = purchaseCase.property_id
      ? await supabase.from("properties").select("bag_vbo_id").eq("id", purchaseCase.property_id).maybeSingle()
      : { data: null, error: null };
    if (propertyError) throw propertyError;

    const input = await loadTaskEngineInput(supabase, auth.user.id, {
      caseId,
      stage: normalizeCaseStage(purchaseCase.stage),
      bagVboId: property?.bag_vbo_id,
    });
    await syncEngineTasks(supabase, auth.user.id, input);
    const { data: tasks, error: tasksError } = await supabase.from("case_tasks").select("*").eq("case_id", caseId).eq("user_id", auth.user.id).eq("status", "open").order("created_at", { ascending: true });
    if (tasksError) throw tasksError;
    return NextResponse.json({ tasks: tasks ?? [], suggested: suggestCaseTasks(input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : t("errors.tasksRefreshFailed") }, { status: 502 });
  }
}
