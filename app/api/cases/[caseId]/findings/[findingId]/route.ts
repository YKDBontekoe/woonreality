import { NextResponse } from "next/server";
import { loadTaskEngineInput, syncEngineTasks, taskSource } from "@/src/lib/cases/sync-tasks";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { normalizeCaseStage } from "@/src/lib/journey";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string; findingId: string }> }) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  const { caseId, findingId } = await context.params;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: t("errors.loginToUpdateFindings") }, { status: 401 });
    const body = await request.json() as { status?: string };
    if (!body.status || !["open", "resolved", "ignored"].includes(body.status)) return NextResponse.json({ error: "Ongeldige status." }, { status: 400 });
    const { data, error } = await supabase.from("document_findings").update({ status: body.status }).eq("id", findingId).eq("case_id", caseId).eq("user_id", auth.user.id).select("*").single();
    if (error) return NextResponse.json({ error: "Aandachtspunt kon niet worden bijgewerkt." }, { status: 502 });

    const taskStatus = body.status === "open" ? "open" : "done";
    const { error: taskError } = await supabase
      .from("case_tasks")
      .update({ status: taskStatus })
      .eq("case_id", caseId)
      .eq("user_id", auth.user.id)
      .eq("source", taskSource(`finding-${data.title}`));
    if (taskError) throw taskError;

    const { data: purchaseCase, error: caseError } = await supabase.from("purchase_cases").select("id,stage,property_id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
    if (caseError) throw caseError;
    if (purchaseCase) {
      const { data: property } = purchaseCase.property_id
        ? await supabase.from("properties").select("bag_vbo_id").eq("id", purchaseCase.property_id).maybeSingle()
        : { data: null };
      await syncEngineTasks(supabase, auth.user.id, await loadTaskEngineInput(supabase, auth.user.id, {
        caseId,
        stage: normalizeCaseStage(purchaseCase.stage),
        bagVboId: property?.bag_vbo_id,
      }));
    }
    return NextResponse.json({ finding: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Aandachtspunt kon niet worden bijgewerkt." }, { status: 502 });
  }
}
