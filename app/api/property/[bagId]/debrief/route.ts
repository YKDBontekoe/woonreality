import { NextResponse } from "next/server";
import { viewingDebriefStage } from "@/src/lib/journey";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { viewingDebriefSchema } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  try {
    const { bagId } = await context.params;
    if (!/^\d{16}$/.test(bagId)) return NextResponse.json({ error: "Ongeldig BAG-adres." }, { status: 400 });
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Log in om je bezichtiging af te ronden." }, { status: 401 });
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "Kies of je doorgaat, twijfelt of afhaakt." }, { status: 400 });
    }
    const parsed = viewingDebriefSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "Kies of je doorgaat, twijfelt of afhaakt." }, { status: 400 });
    const result = viewingDebriefStage(parsed.data.decision);
    const now = new Date().toISOString();
    const { data: stageRows, error: stageError } = await supabase.from("saved_properties").update({ stage: result.propertyStage, updated_at: now }).eq("user_id", auth.user.id).eq("bag_vbo_id", bagId).select("bag_vbo_id");
    if (stageError || !stageRows?.length) return NextResponse.json({ error: "Bewaar de woning eerst, daarna kun je de bezichtiging afronden." }, { status: 400 });

    let caseId = parsed.data.caseId;
    if (caseId) {
      const { data: ownedCase } = await supabase.from("purchase_cases").select("id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
      if (!ownedCase) caseId = undefined;
    }
    if (!caseId) {
      const { data: property } = await supabase.from("properties").select("id").eq("bag_vbo_id", bagId).maybeSingle();
      if (property) {
        const { data: purchaseCase } = await supabase.from("purchase_cases").select("id").eq("user_id", auth.user.id).eq("property_id", property.id).eq("status", "active").maybeSingle();
        caseId = purchaseCase?.id;
      }
    }
    if (caseId) {
      const { data: ownedCase } = await supabase.from("purchase_cases").select("id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
      if (ownedCase) {
        await supabase.from("purchase_cases").update({ stage: result.caseStage, status: result.caseStatus ?? "active", updated_at: now }).eq("id", caseId).eq("user_id", auth.user.id);
        await supabase.from("case_events").insert({
          case_id: caseId,
          user_id: auth.user.id,
          event_type: "viewing_debrief",
          payload: { decision: parsed.data.decision, propertyStage: result.propertyStage, caseStage: result.caseStage },
        });
      } else {
        caseId = undefined;
      }
    }
    return NextResponse.json({ ...result, caseId: caseId ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "Supabase is nog niet geconfigureerd.") {
      return NextResponse.json({ error: "Je bezichtiging kan nog niet worden afgerond, omdat de aankoopomgeving niet met Supabase is gekoppeld." }, { status: 503 });
    }
    return NextResponse.json({ error: "Je bezichtiging kon niet worden afgerond. Probeer het straks opnieuw." }, { status: 502 });
  }
}
