import { NextResponse } from "next/server";
import { syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { normalizeCaseStage } from "@/src/lib/journey";
import { normalizeBuyerProfile } from "@/src/lib/purchase";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { suggestCaseTasks } from "@/src/lib/tasks";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Log in om taken te vernieuwen." }, { status: 401 });
  const { data: purchaseCase } = await supabase.from("purchase_cases").select("id,stage,property_id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
  if (!purchaseCase) return NextResponse.json({ error: "Dossier niet gevonden." }, { status: 404 });

  const [{ data: documents }, { data: findings }, { data: profile }, { data: property }, { data: bid }, { data: valuation }] = await Promise.all([
    supabase.from("case_documents").select("document_type").eq("case_id", caseId),
    supabase.from("document_findings").select("title,severity,action,status").eq("case_id", caseId).eq("status", "open"),
    supabase.from("profiles").select("preferences_json").eq("id", auth.user.id).maybeSingle(),
    purchaseCase.property_id ? supabase.from("properties").select("bag_vbo_id").eq("id", purchaseCase.property_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("bid_drafts").select("amount,conditions").eq("case_id", caseId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("valuation_snapshots").select("midpoint_value,methodology").eq("case_id", caseId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const input = {
    profile: normalizeBuyerProfile(record(profile?.preferences_json).buyerProfile),
    profileConfigured: Boolean(record(profile?.preferences_json).buyerProfile),
    stage: normalizeCaseStage(purchaseCase.stage),
    bagVboId: property?.bag_vbo_id,
    caseId,
    documentTypes: (documents ?? []).map((item) => item.document_type),
    openFindings: findings ?? [],
    hasAskingPrice: Boolean(record(valuation?.methodology).askingPrice ?? valuation?.midpoint_value),
    hasOffer: Boolean(bid?.amount),
    hasContractAmount: Boolean(record(bid?.conditions).contractAmount),
  };
  await syncEngineTasks(supabase, auth.user.id, input);
  const { data: tasks } = await supabase.from("case_tasks").select("*").eq("case_id", caseId).eq("user_id", auth.user.id).eq("status", "open").order("created_at", { ascending: true });
  return NextResponse.json({ tasks: tasks ?? [], suggested: suggestCaseTasks(input) });
}
