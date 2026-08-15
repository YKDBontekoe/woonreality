import { NextResponse } from "next/server";
import { syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { CASE_STAGES, normalizeCaseStage, propertyStageFromCase } from "@/src/lib/journey";
import { normalizeBuyerProfile } from "@/src/lib/purchase";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

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
    const stage = body.stage ? normalizeCaseStage(body.stage) : undefined;
    if (body.stage && !CASE_STAGES.includes(stage!)) return NextResponse.json({ error: "Onbekende dossierstap." }, { status: 400 });
    const { data, error } = await supabase.from("purchase_cases").update({
      ...(body.title?.trim() ? { title: body.title.trim() } : {}),
      ...(stage ? { stage } : {}),
      ...(body.status ? { status: body.status } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", caseId).eq("user_id", user.id).select("*").single();
    if (error) throw error;
    if (stage && stage !== purchaseCase.stage) {
      await supabase.from("case_events").insert({ case_id: caseId, user_id: user.id, event_type: "stage_changed", payload: { from: purchaseCase.stage, to: stage } });
      const bagVboId = bagFromCase(purchaseCase);
      if (bagVboId) {
        await supabase.from("saved_properties").update({ stage: propertyStageFromCase(stage), updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("bag_vbo_id", bagVboId);
      }
    }
    const { data: profile } = await supabase.from("profiles").select("preferences_json").eq("id", user.id).maybeSingle();
    const [{ data: documents }, { data: findings }] = await Promise.all([
      supabase.from("case_documents").select("document_type").eq("case_id", caseId),
      supabase.from("document_findings").select("title,severity,action,status").eq("case_id", caseId).eq("status", "open"),
    ]);
    await syncEngineTasks(supabase, user.id, {
      profile: normalizeBuyerProfile(record(profile?.preferences_json).buyerProfile),
      profileConfigured: Boolean(record(profile?.preferences_json).buyerProfile),
      stage: stage ?? normalizeCaseStage(data.stage),
      bagVboId: bagFromCase(purchaseCase),
      caseId,
      documentTypes: (documents ?? []).map((item) => item.document_type),
      openFindings: findings ?? [],
      hasAskingPrice: false,
      hasOffer: false,
      hasContractAmount: false,
    });
    return NextResponse.json({ case: { ...data, stage: normalizeCaseStage(data.stage), bagVboId: bagFromCase(purchaseCase) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dossier kon niet worden bijgewerkt." }, { status: 502 });
  }
}
