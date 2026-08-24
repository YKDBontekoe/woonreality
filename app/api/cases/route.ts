import { NextResponse } from "next/server";
import { syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { normalizeCaseStage, propertyStageFromCase } from "@/src/lib/journey";
import { buyerProfileIsConfigured, normalizeBuyerProfile } from "@/src/lib/purchase";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/src/lib/supabase/server";
import { suggestCaseTasks } from "@/src/lib/tasks";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { isValidBagId } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

export async function GET(request: Request) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: t("errors.loginToViewCases") }, { status: 401 });
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
    return NextResponse.json({ error: error instanceof Error ? error.message : t("errors.casesLoadFailed") }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: t("errors.loginToSaveCase") }, { status: 401 });
    const body = await request.json() as { bagVboId?: string; title?: string };
    if (!body.bagVboId || !body.bagVboId || !isValidBagId(body.bagVboId)) return NextResponse.json({ error: "Kies eerst een geldig woningadres." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Het aankoopdossier kan nog niet worden opgeslagen: Supabase is nog niet gekoppeld." }, { status: 503 });
    let property: { id: string; address_label: string; postcode: string; city: string; area_m2: number | null; build_year: number | null } | null = null;
    const { data: existingProperty, error: propertyError } = await admin.from("properties").select("id,address_label,postcode,city,area_m2,build_year").eq("bag_vbo_id", body.bagVboId).maybeSingle();
    if (propertyError) return NextResponse.json({ error: "Open eerst de woninganalyse voordat je een dossier start." }, { status: 404 });
    property = existingProperty;
    if (!property) {
      // The visitor may start a case straight from search without ever having
      // opened the woningcheck. Resolve the BAG identity and create the
      // property row here instead of requiring a prior analysis run.
      try {
        const bagProperty = await getPropertyById(body.bagVboId);
        const { data: created, error: createError } = await admin.from("properties").upsert({
          bag_vbo_id: bagProperty.bagVboId,
          address_label: bagProperty.addressLabel,
          postcode: bagProperty.postcode,
          house_number: String(bagProperty.houseNumber),
          house_number_addition: [bagProperty.houseLetter, bagProperty.addition].filter(Boolean).join(" ") || null,
          city: bagProperty.city,
          lat: bagProperty.coordinates.lat,
          lng: bagProperty.coordinates.lng,
          area_m2: bagProperty.areaM2 ?? null,
          build_year: bagProperty.buildingYear ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "bag_vbo_id" }).select("id,address_label,postcode,city,area_m2,build_year").single();
        if (createError || !created) throw createError ?? new Error("Woning kon niet worden geregistreerd.");
        property = created;
      } catch {
        return NextResponse.json({ error: t("errors.caseAddressNotFound") }, { status: 404 });
      }
    }

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
    if (error || !purchaseCase) throw error ?? new Error(t("errors.caseCreateFailed"));

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
    return NextResponse.json({ error: error instanceof Error ? error.message : t("errors.caseCreateFailed") }, { status: 502 });
  }
}
