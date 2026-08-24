import { NextResponse } from "next/server";
import { applyWorkflowUpdate } from "@/src/lib/cases/apply-workflow";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { workflowBodySchema } from "@/src/lib/validation/workspace";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { normalizeCaseStage } from "@/src/lib/journey";

export const runtime = "nodejs";

async function ownedCase(caseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return { supabase, user: null, purchaseCase: null };
  const { data: purchaseCase, error: caseError } = await supabase.from("purchase_cases").select("id,stage,property_id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
  if (caseError) throw caseError;
  return { supabase, user: auth.user, purchaseCase };
}

export async function GET(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await ownedCase(caseId);
    if (!user) return NextResponse.json({ error: t("errors.loginToViewWorkflow") }, { status: 401 });
    if (!purchaseCase) return NextResponse.json({ error: t("errors.caseNotFound") }, { status: 404 });
    const [financeResult, valuationResult, bidResult] = await Promise.all([
      supabase.from("case_finance").select("*").eq("case_id", caseId).eq("user_id", user.id).maybeSingle(),
      supabase.from("valuation_snapshots").select("*").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("bid_drafts").select("*").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (financeResult.error) throw financeResult.error;
    if (valuationResult.error) throw valuationResult.error;
    if (bidResult.error) throw bidResult.error;
    return NextResponse.json({ finance: financeResult.data, valuation: valuationResult.data, bid: bidResult.data, stage: normalizeCaseStage(purchaseCase.stage) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow kon niet worden geladen." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await ownedCase(caseId);
    if (!user) return NextResponse.json({ error: t("errors.loginToSaveWorkflow") }, { status: 401 });
    if (!purchaseCase) return NextResponse.json({ error: t("errors.caseNotFound") }, { status: 404 });
    const parsed = workflowBodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige workflowgegevens." }, { status: 400 });
    await applyWorkflowUpdate(supabase, user.id, purchaseCase, parsed.data);
    const stage = parsed.data.stage ?? normalizeCaseStage(purchaseCase.stage);
    return NextResponse.json({ saved: true, stage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow kon niet worden opgeslagen." }, { status: 502 });
  }
}
