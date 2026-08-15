import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string; taskId: string }> }) {
  const { caseId, taskId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Log in om taken bij te houden." }, { status: 401 });
  const body = await request.json() as { status?: string };
  if (!body.status || !["open", "done", "skipped"].includes(body.status)) return NextResponse.json({ error: "Ongeldige taakstatus." }, { status: 400 });
  const { data, error } = await supabase.from("case_tasks").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", taskId).eq("case_id", caseId).eq("user_id", auth.user.id).select("*").single();
  if (error) return NextResponse.json({ error: "Taak kon niet worden bijgewerkt." }, { status: 502 });
  return NextResponse.json({ task: data });
}
