import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string; findingId: string }> }) {
  const { caseId, findingId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Log in om aandachtspunten bij te werken." }, { status: 401 });
  const body = await request.json() as { status?: string };
  if (!body.status || !["open", "resolved", "ignored"].includes(body.status)) return NextResponse.json({ error: "Ongeldige status." }, { status: 400 });
  const { data, error } = await supabase.from("document_findings").update({ status: body.status }).eq("id", findingId).eq("case_id", caseId).eq("user_id", auth.user.id).select("*").single();
  if (error) return NextResponse.json({ error: "Aandachtspunt kon niet worden bijgewerkt." }, { status: 502 });
  return NextResponse.json({ finding: data });
}
