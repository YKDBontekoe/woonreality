import { NextResponse } from "next/server";
import { syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { normalizeCaseStage, propertyStageFromCase } from "@/src/lib/journey";
import { buyerProfileIsConfigured, normalizeBuyerProfile } from "@/src/lib/purchase";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/src/lib/supabase/server";
import { suggestCaseTasks } from "@/src/lib/tasks";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

export async function GET() {
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: "Log in om je aankoopdossiers te bekijken." }, { status: 401 });
    const { data, error } = await supabase.from("purchase_cases").select("id,title,stage,status,updated_at,property_id,properties(bag_vbo_id,address_label)").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) throw error;
    const cases = (data ?? []).map((row) => {
      const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
      return {
        id: row.id,
        title: row.title,
        stage: normalizeCaseStage(row.stage),
        status: row.status,
        updated_at: row.updated_at,
        bagVboId: property && typeof property === "object" && "bag_vbo_id" in property ? String(property.bag_vbo_id) : null,
      };
    });
    return NextResponse.json({ cases });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dossiers konden niet worden geladen." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: "Log in om een aankoopdossier te bewaren." }, { status: 401 });
    const body = await request.json() as { bagVboId?: string; title?: string };
    if (!body.bagVboId || !/^\d{16}$/.test(body.bagVboId)) return NextResponse.json({ error: "Kies eerst een geldig woningadres." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Het aankoopdossier kan nog niet worden opgeslagen: Supabase is nog niet gekoppeld." }, { status: 503 });
    const { data: property, error: propertyError } = await admin.from("properties").select("id,address_label,postcode,city,area_m2,build_year").eq("bag_vbo_id", body.bagVboId).maybeSingle();
    if (propertyError || !property) return NextResponse.json({ error: "Open eerst de woninganalyse voordat je een dossier start." }, { status: 404 });

    const { data: existingCase } = await supabase.from("purchase_cases").select("*").eq("user_id", user.id).eq("property_id", property.id).eq("status", "active").maybeSingle();
    if (existingCase) return NextResponse.json({ case: { ...existingCase, stage: normalizeCaseStage(existingCase.stage), bagVboId: body.bagVboId } });

    const { data: profile } = await supabase.from("profiles").select("preferences_json").eq("id", user.id).maybeSingle();
    const buyerProfile = normalizeBuyerProfile(record(profile?.preferences_json).buyerProfile);
    const profileConfigured = buyerProfileIsConfigured(buyerProfile, record(profile?.preferences_json).buyerProfile);
    const stage = profileConfigured ? "research" : "intake";

    const { data: purchaseCase, error } = await supabase.from("purchase_cases").insert({
      user_id: user.id,
      property_id: property.id,
      title: body.title?.trim() || property.address_label,
      stage,
      status: "active",
    }).select("*").single();
    if (error || !purchaseCase) throw error ?? new Error("Dossier kon niet worden aangemaakt.");

    const { error: savedError } = await supabase.from("saved_properties").upsert({
      user_id: user.id,
      bag_vbo_id: body.bagVboId,
      address_label: property.address_label,
      city: property.city,
      postcode: property.postcode,
      stage: propertyStageFromCase(stage),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,bag_vbo_id" });
    if (savedError) throw savedError;

    const { error: eventError } = await supabase.from("case_events").insert({
      case_id: purchaseCase.id,
      user_id: user.id,
      event_type: "case_started",
      payload: { stage },
    });
    if (eventError) throw eventError;

    await syncEngineTasks(supabase, user.id, {
      profile: buyerProfile,
      profileConfigured,
      stage,
      bagVboId: body.bagVboId,
      caseId: purchaseCase.id,
      documentTypes: [],
      openFindings: [],
      hasAskingPrice: false,
      hasOffer: false,
      hasContractAmount: false,
    });

    return NextResponse.json({ case: { ...purchaseCase, bagVboId: body.bagVboId }, tasks: suggestCaseTasks({
      profile: buyerProfile,
      profileConfigured,
      stage,
      bagVboId: body.bagVboId,
      caseId: purchaseCase.id,
      documentTypes: [],
      openFindings: [],
      hasAskingPrice: false,
      hasOffer: false,
      hasContractAmount: false,
    }) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dossier kon niet worden aangemaakt." }, { status: 502 });
  }
}
