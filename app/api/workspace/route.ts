import { NextResponse } from "next/server";
import { DEFAULT_PREFERENCES } from "@/src/lib/personalization";
import { DEFAULT_BUYER_PROFILE, PROPERTY_STAGE_LABELS, type BuyerProfile, type PropertyStage } from "@/src/lib/purchase";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { PersonalPreferences, SavedProperty } from "@/src/lib/types";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isStage(value: unknown): value is PropertyStage {
  return typeof value === "string" && value in PROPERTY_STAGE_LABELS;
}

function isBagId(value: unknown): value is string {
  return typeof value === "string" && /^\d{16}$/.test(value);
}

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

async function readWorkspace() {
  const { supabase, user } = await currentUser();
  if (!user) return { supabase, user: null, workspace: null };
  const [{ data: profile }, { data: saved }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("saved_properties").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
  ]);
  const profilePreferences = record(profile?.preferences_json);
  const savedProperties = (saved ?? []) as Array<{ bag_vbo_id: string; address_label: string; city: string; postcode: string; stage: string; saved_at: string }>;
  const buyerProfile = { ...DEFAULT_BUYER_PROFILE, ...record(profilePreferences.buyerProfile) } as BuyerProfile;
  const preferences = { ...DEFAULT_PREFERENCES, ...record(profilePreferences.personalPreferences) } as PersonalPreferences;
  const propertyStages = Object.fromEntries(savedProperties.map((item) => [item.bag_vbo_id, isStage(item.stage) ? item.stage : "saved"]));
  return {
    supabase,
    user,
    workspace: {
      preferences,
      preferencesConfigured: Boolean(profilePreferences.personalPreferences),
      buyerProfile,
      buyerProfileConfigured: Boolean(profilePreferences.buyerProfile),
      saved: savedProperties.map((item): SavedProperty => ({ bagVboId: item.bag_vbo_id, addressLabel: item.address_label, city: item.city, postcode: item.postcode, savedAt: item.saved_at })),
      compare: Array.isArray(profile?.compare_ids) ? profile.compare_ids.filter(isBagId).slice(0, 4) : [],
      propertyStages,
    },
  };
}

export async function GET() {
  try {
    const result = await readWorkspace();
    if (!result.user || !result.workspace) return NextResponse.json({ error: "Log in om je aankoopomgeving te bewaren." }, { status: 401 });
    return NextResponse.json({ workspace: result.workspace });
  } catch {
    return NextResponse.json({ error: "De veilige aankoopomgeving is nog niet gekoppeld aan Supabase." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const result = await readWorkspace();
    if (!result.user || !result.workspace) return NextResponse.json({ error: "Log in om wijzigingen te bewaren." }, { status: 401 });
    const body = await request.json() as { action?: string; bagVboId?: string; addressLabel?: string; city?: string; postcode?: string; stage?: string; preferences?: PersonalPreferences; buyerProfile?: BuyerProfile; compare?: string[] };
    const now = new Date().toISOString();

    if (body.action === "save") {
      if (!isBagId(body.bagVboId) || !body.addressLabel || !body.city || !body.postcode) return NextResponse.json({ error: "Onvolledige woninggegevens." }, { status: 400 });
      const { error } = await result.supabase.from("saved_properties").upsert({ user_id: result.user.id, bag_vbo_id: body.bagVboId, address_label: body.addressLabel, city: body.city, postcode: body.postcode, stage: isStage(body.stage) ? body.stage : "saved", updated_at: now }, { onConflict: "user_id,bag_vbo_id" });
      if (error) throw error;
    } else if (body.action === "unsave") {
      if (!isBagId(body.bagVboId)) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
      const { error } = await result.supabase.from("saved_properties").delete().eq("user_id", result.user.id).eq("bag_vbo_id", body.bagVboId);
      if (error) throw error;
    } else if (body.action === "stage") {
      if (!isBagId(body.bagVboId) || !isStage(body.stage)) return NextResponse.json({ error: "Ongeldige woningstatus." }, { status: 400 });
      const { error } = await result.supabase.from("saved_properties").update({ stage: body.stage, updated_at: now }).eq("user_id", result.user.id).eq("bag_vbo_id", body.bagVboId);
      if (error) throw error;
    } else if (body.action === "compare") {
      const compare = (body.compare ?? []).filter(isBagId).slice(0, 4);
      const { error } = await result.supabase.from("profiles").upsert({ id: result.user.id, compare_ids: compare, updated_at: now }, { onConflict: "id" });
      if (error) throw error;
    } else if (body.action === "profile") {
      const current = record((await result.supabase.from("profiles").select("preferences_json").eq("id", result.user.id).maybeSingle()).data?.preferences_json);
      const preferencesJson = {
        ...current,
        ...(body.preferences ? { personalPreferences: body.preferences } : {}),
        ...(body.buyerProfile ? { buyerProfile: body.buyerProfile } : {}),
      };
      const { error } = await result.supabase.from("profiles").upsert({ id: result.user.id, preferences_json: preferencesJson, updated_at: now }, { onConflict: "id" });
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Onbekende workspaceactie." }, { status: 400 });
    }

    const updated = await readWorkspace();
    return NextResponse.json({ workspace: updated.workspace });
  } catch {
    return NextResponse.json({ error: "Je wijziging kon niet worden opgeslagen. Controleer de Supabase-koppeling en probeer opnieuw." }, { status: 502 });
  }
}
