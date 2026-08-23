import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getSharedAnalysis } from "@/src/lib/analysis/service";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { buildBidStrategy, type BidScenarioKey } from "@/src/lib/bid-strategy";
import { applyWorkflowUpdate } from "@/src/lib/cases/apply-workflow";
import { buyerProfileIsConfigured, normalizeBuyerProfile } from "@/src/lib/purchase";
import { logWarn } from "@/src/lib/logger";
import { isValidBagId } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

const bidDraftBodySchema = z.object({
  askingPrice: z.number().finite().nonnegative().nullable().optional(),
  selected: z.enum(["cautious", "balanced", "strong"]).optional(),
}).strict();

async function contextFor(bagId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  return { supabase, user: auth.user, valid: isValidBagId(bagId), bagId };
}

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  try {
    const { bagId: rawBagId } = await context.params;
    const result = await contextFor(decodeURIComponent(rawBagId));
    if (!result.valid) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    if (!result.user) return NextResponse.json({ error: "Log in om een bodconcept te bewaren." }, { status: 401 });
    const { data, error } = await result.supabase.from("property_bid_drafts").select("asking_price,selected_scenario,updated_at").eq("user_id", result.user.id).eq("bag_vbo_id", result.bagId).maybeSingle();
    if (error) return NextResponse.json({ error: "Bodconcept kon niet worden geladen." }, { status: 503 });
    return NextResponse.json({ draft: data });
  } catch {
    return NextResponse.json({ error: "Bodopslag is nog niet beschikbaar, omdat de aankoopomgeving niet met Supabase is gekoppeld." }, { status: 503 });
  }
}

/**
 * The case workflow is the single source of truth once a dossier exists.
 * Saving a bid draft therefore also derives the workflow state here on the
 * server, instead of the client PATCHing two endpoints that could drift.
 */
async function syncCaseWorkflow(bagId: string, userId: string, askingPrice: number | null, selected: BidScenarioKey | undefined): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: propertyRow } = await supabase.from("properties").select("id").eq("bag_vbo_id", bagId).maybeSingle();
  if (!propertyRow) return false;
  const { data: purchaseCase } = await supabase.from("purchase_cases").select("id,stage,property_id,status").eq("user_id", userId).eq("property_id", propertyRow.id).eq("status", "active").maybeSingle();
  if (!purchaseCase) return false;

  const property = await getPropertyById(bagId);
  const [analysis, profileResult] = await Promise.all([
    getSharedAnalysis(property),
    supabase.from("profiles").select("preferences_json").eq("id", userId).maybeSingle(),
  ]);
  const preferences = (profileResult.data?.preferences_json ?? {}) as Record<string, unknown>;
  const buyerProfile = normalizeBuyerProfile(preferences.buyerProfile);
  const configured = buyerProfileIsConfigured(buyerProfile, preferences.buyerProfile);
  const scenario: BidScenarioKey = selected ?? "balanced";
  const strategy = buildBidStrategy(askingPrice ?? 0, analysis, configured ? buyerProfile : null);
  const chosen = strategy?.scenarios[scenario];
  await applyWorkflowUpdate(supabase, userId, purchaseCase, {
    ...(askingPrice != null ? { askingPrice } : {}),
    ...(chosen ? { offerAmount: chosen.amount, financingCondition: chosen.financingCondition, inspectionCondition: chosen.inspectionCondition, reasons: chosen.reasons.slice(0, 8) } : {}),
    scenario,
    stage: "offer",
  });
  return true;
}

export async function PATCH(request: Request, context: { params: Promise<{ bagId: string }> }) {
  try {
    const { bagId: rawBagId } = await context.params;
    const result = await contextFor(decodeURIComponent(rawBagId));
    if (!result.valid) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
    if (!result.user) return NextResponse.json({ error: "Log in om een bodconcept te bewaren." }, { status: 401 });
    const parsed = bidDraftBodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige bodgegevens." }, { status: 400 });
    const payload: { user_id: string; bag_vbo_id: string; asking_price?: number | null; selected_scenario?: "cautious" | "balanced" | "strong"; updated_at: string } = { user_id: result.user.id, bag_vbo_id: result.bagId, updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(parsed.data, "askingPrice")) payload.asking_price = parsed.data.askingPrice;
    if (Object.prototype.hasOwnProperty.call(parsed.data, "selected")) payload.selected_scenario = parsed.data.selected;
    const { data, error } = await result.supabase.from("property_bid_drafts").upsert(payload, { onConflict: "user_id,bag_vbo_id" }).select("asking_price,selected_scenario,updated_at").single();
    if (error) return NextResponse.json({ error: "Bodconcept kon niet worden opgeslagen." }, { status: 502 });

    let workflowSynced = false;
    try {
      workflowSynced = await syncCaseWorkflow(result.bagId, result.user.id, payload.asking_price ?? null, payload.selected_scenario);
    } catch (syncError) {
      // The draft is saved; a failed dossier sync must not lose the user's work.
      logWarn("Bid draft saved but case workflow sync failed", syncError);
    }
    return NextResponse.json({ draft: data, workflowSynced });
  } catch {
    return NextResponse.json({ error: "Bodopslag is nog niet beschikbaar, omdat de aankoopomgeving niet met Supabase is gekoppeld." }, { status: 503 });
  }
}
