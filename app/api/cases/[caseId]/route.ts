import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

async function ownedCase(caseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { supabase, user: null, purchaseCase: null };
  const { data: purchaseCase } = await supabase.from("purchase_cases").select("*").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
  return { supabase, user: auth.user, purchaseCase };
}

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await ownedCase(caseId);
    if (!user) return NextResponse.json({ error: "Log in om dit dossier te bekijken." }, { status: 401 });
    if (!purchaseCase) return NextResponse.json({ error: "Dossier niet gevonden." }, { status: 404 });
    const [{ data: tasks }, { data: documents }, { data: findings }] = await Promise.all([
      supabase.from("case_tasks").select("*").eq("case_id", caseId).eq("user_id", user.id).order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("case_documents").select("*").eq("case_id", caseId).eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("document_findings").select("*").eq("case_id", caseId).eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    return NextResponse.json({ case: purchaseCase, tasks: tasks ?? [], documents: documents ?? [], findings: findings ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dossier kon niet worden geladen." }, { status: 502 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await ownedCase(caseId);
    if (!user) return NextResponse.json({ error: "Log in om dit dossier te wijzigen." }, { status: 401 });
    if (!purchaseCase) return NextResponse.json({ error: "Dossier niet gevonden." }, { status: 404 });
    const body = await request.json() as { title?: string; stage?: string; status?: string };
    const allowedStages = ["profile", "shortlist", "documents", "viewing", "offer", "contract", "transfer"];
    if (body.stage && !allowedStages.includes(body.stage)) return NextResponse.json({ error: "Onbekende dossierstap." }, { status: 400 });
    const { data, error } = await supabase.from("purchase_cases").update({
      ...(body.title?.trim() ? { title: body.title.trim() } : {}),
      ...(body.stage ? { stage: body.stage } : {}),
      ...(body.status ? { status: body.status } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", caseId).eq("user_id", user.id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ case: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dossier kon niet worden bijgewerkt." }, { status: 502 });
  }
}
