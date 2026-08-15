import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

async function ownedCase(caseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { supabase, user: null, purchaseCase: null };
  const { data: purchaseCase } = await supabase.from("purchase_cases").select("id,stage").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
  return { supabase, user: auth.user, purchaseCase };
}

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await ownedCase(caseId);
    if (!user) return NextResponse.json({ error: "Log in om je aankoopworkflow te bekijken." }, { status: 401 });
    if (!purchaseCase) return NextResponse.json({ error: "Dossier niet gevonden." }, { status: 404 });
    const [{ data: finance }, { data: valuation }, { data: bid }] = await Promise.all([
      supabase.from("case_finance").select("*").eq("case_id", caseId).eq("user_id", user.id).maybeSingle(),
      supabase.from("valuation_snapshots").select("*").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("bid_drafts").select("*").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return NextResponse.json({ finance, valuation, bid, stage: purchaseCase.stage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow kon niet worden geladen." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await ownedCase(caseId);
    if (!user) return NextResponse.json({ error: "Log in om je aankoopworkflow op te slaan." }, { status: 401 });
    if (!purchaseCase) return NextResponse.json({ error: "Dossier niet gevonden." }, { status: 404 });
    const body = await request.json() as { askingPrice?: number; offerAmount?: number; financingAmount?: number; contractAmount?: number; transferDate?: string; financingCondition?: boolean; inspectionCondition?: boolean; stage?: string };
    const now = new Date().toISOString();
    const conditions = { contractAmount: body.contractAmount ?? null, financingCondition: body.financingCondition ?? true, inspectionCondition: body.inspectionCondition ?? true };

    if (body.askingPrice != null) {
      const { data: latest } = await supabase.from("valuation_snapshots").select("version").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle();
      const version = (latest?.version ?? 0) + 1;
      const low = Math.round((body.askingPrice * .985) / 500) * 500;
      const high = Math.round((body.askingPrice * 1.015) / 500) * 500;
      const { error } = await supabase.from("valuation_snapshots").insert({ case_id: caseId, user_id: user.id, version, low_value: low, midpoint_value: body.askingPrice, high_value: high, methodology: { type: "asking-price-screening", askingPrice: body.askingPrice, note: "Indicatieve rekenschets; geen taxatie." } });
      if (error) throw error;
    }

    if (body.offerAmount != null) {
      const { data: latest } = await supabase.from("bid_drafts").select("version").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle();
      const version = (latest?.version ?? 0) + 1;
      const { error } = await supabase.from("bid_drafts").insert({ case_id: caseId, user_id: user.id, version, amount: body.offerAmount, transfer_date: body.transferDate || null, conditions, body: `Bodconcept ${body.offerAmount.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}`, status: "draft" });
      if (error) throw error;
    }

    if (body.financingAmount != null || body.transferDate !== undefined) {
      const { error } = await supabase.from("case_finance").upsert({ case_id: caseId, user_id: user.id, maximum_price: body.offerAmount ?? null, financing_amount: body.financingAmount ?? null, financing_status: body.financingCondition === false ? "without-condition" : "required", transfer_preference: body.transferDate || null, updated_at: now }, { onConflict: "case_id" });
      if (error) throw error;
    }

    if (body.stage && ["profile", "shortlist", "documents", "viewing", "offer", "contract", "transfer"].includes(body.stage)) {
      const { error } = await supabase.from("purchase_cases").update({ stage: body.stage, updated_at: now }).eq("id", caseId).eq("user_id", user.id);
      if (error) throw error;
      await supabase.from("case_events").insert({ case_id: caseId, user_id: user.id, event_type: "stage_changed", payload: { from: purchaseCase.stage, to: body.stage } });
    }
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow kon niet worden opgeslagen." }, { status: 502 });
  }
}
