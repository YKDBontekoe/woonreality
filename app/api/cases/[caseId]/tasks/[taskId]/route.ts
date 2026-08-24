import { NextResponse } from "next/server";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string; taskId: string }> }) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  try {
    const { caseId, taskId } = await context.params;
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: t("errors.loginToTrackTasks") }, { status: 401 });
    const body = await request.json() as { status?: string };
    if (!body.status || !["open", "done", "skipped"].includes(body.status)) return NextResponse.json({ error: "Ongeldige taakstatus." }, { status: 400 });
    const { data, error } = await supabase.from("case_tasks").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", taskId).eq("case_id", caseId).eq("user_id", auth.user.id).select("*").single();
    if (error) return NextResponse.json({ error: "Taak kon niet worden bijgewerkt." }, { status: 502 });
    return NextResponse.json({ task: data });
  } catch {
    return NextResponse.json({ error: "Taken bijhouden is nog niet beschikbaar, omdat de aankoopomgeving niet met Supabase is gekoppeld." }, { status: 503 });
  }
}
