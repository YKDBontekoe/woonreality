import { NextResponse } from "next/server";
import { loadTaskEngineInput, syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { isAcceptedCaseStageInput, normalizeCaseStage } from "@/src/lib/journey";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

async function ownedCase(caseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { supabase, user: null, purchaseCase: null };
  const { data: purchaseCase } = await supabase.from("purchase_cases").select("*, properties(bag_vbo_id, address_label, area_m2, build_year)").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
  return { supabase, user: auth.user, purchaseCase };
}

function bagFromCase(purchaseCase: { properties?: unknown }) {
  const property = Array.isArray(purchaseCase.properties) ? purchaseCase.properties[0] : purchaseCase.properties;
  return property && typeof property === "object" && "bag_vbo_id" in property ? String((property as { bag_vbo_id: string }).bag_vbo_id) : null;
}

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await ownedCase(caseId);
    if (!user) return NextResponse.json({ error: "Log in om dit dossier te bekijken." }, { status: 401 });
    if (!purchaseCase) return NextResponse.json({ error: "Dossier niet gevonden." }, { status: 404 });
    const [{ data: tasks }, { data: documents }, { data: findings }, { data: events }] = await Promise.all([
      supabase.from("case_tasks").select("*").eq("case_id", caseId).eq("user_id", user.id).order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("case_documents").select("*").eq("case_id", caseId).eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("document_findings").select("*").eq("case_id", caseId).eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("case_events").select("*").eq("case_id", caseId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    return NextResponse.json({
      case: { ...purchaseCase, stage: normalizeCaseStage(purchaseCase.stage), bagVboId: bagFromCase(purchaseCase) },
      tasks: tasks ?? [],
      documents: documents ?? [],
      findings: findings ?? [],
      events: events ?? [],
    });
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
    if (typeof body.stage === "string" && body.stage.trim() && !isAcceptedCaseStageInput(body.stage)) {
      return NextResponse.json({ error: "Onbekende dossierstap." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("apply_case_stage", {
      p_case_id: caseId,
      p_stage: body.stage?.trim() || null,
      p_title: body.title?.trim() || null,
      p_status: body.status || null,
    });
    if (error || !data) throw error ?? new Error("Dossier kon niet worden bijgewerkt.");
    const updated = data as Record<string, unknown>;
    const stage = normalizeCaseStage(typeof updated.stage === "string" ? updated.stage : purchaseCase.stage);
    await syncEngineTasks(supabase, user.id, await loadTaskEngineInput(supabase, user.id, {
      caseId,
      stage,
      bagVboId: bagFromCase(purchaseCase),
    }));
    return NextResponse.json({ case: { ...updated, stage, bagVboId: bagFromCase(purchaseCase) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dossier kon niet worden bijgewerkt." }, { status: 502 });
  }
}
