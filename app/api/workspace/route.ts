import { NextResponse } from "next/server";
import { calculateMortgageCapacity } from "@/src/lib/mortgage/capacity";
import {
  buyerProfileFromMortgageCapacity,
  buildMortgageSnapshot,
  calculatorStateToFinance,
  mortgageStateHasCapacity,
  normalizeMortgageSnapshot,
  restoreCalculatorState,
  type CalculatorState,
} from "@/src/lib/mortgage/calculator-state";
import { parseOnboardingDismissed } from "@/src/lib/onboarding";
import { DEFAULT_PREFERENCES } from "@/src/lib/personalization";
import { buyerProfileIsConfigured, EMPTY_BUYER_PROFILE, PROPERTY_STAGE_LABELS, normalizeBuyerProfile, type PropertyStage } from "@/src/lib/purchase";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { listingHistoryFromRows, type ListingHistoryRow } from "@/src/lib/listing-history";
import type { PersonalPreferences, SavedProperty } from "@/src/lib/types";
import { preferencesJsonWithinLimit, workspaceBodySchema, type WorkspaceRequest } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isStage(value: unknown): value is PropertyStage {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PROPERTY_STAGE_LABELS, value);
}

function isBagId(value: unknown): value is string {
  return typeof value === "string" && /^\d{16}$/.test(value);
}

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return { supabase, user: data.user };
}

async function readWorkspace() {
  const { supabase, user } = await currentUser();
  if (!user) return { supabase, user: null, workspace: null };
  const [{ data: profile, error: profileError }, { data: saved, error: savedError }, { data: listings, error: listingsError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("saved_properties").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("user_listings").select("bag_vbo_id, source_url, asking_price, extracted_json, created_at, updated_at").eq("user_id", user.id),
  ]);
  if (profileError) throw profileError;
  if (savedError) throw savedError;
  if (listingsError) throw listingsError;
  const profilePreferences = record(profile?.preferences_json);
  const savedProperties = (saved ?? []) as Array<{ bag_vbo_id: string; address_label: string; city: string; postcode: string; stage: string; saved_at: string }>;
  const buyerProfile = normalizeBuyerProfile(profilePreferences.buyerProfile ?? EMPTY_BUYER_PROFILE);
  const preferences = { ...DEFAULT_PREFERENCES, ...record(profilePreferences.personalPreferences) } as PersonalPreferences;
  const propertyStages = Object.fromEntries(savedProperties.map((item) => [item.bag_vbo_id, isStage(item.stage) ? item.stage : "saved"]));
  const listingRows = (listings ?? []) as ListingHistoryRow[];
  const askingPrices = Object.fromEntries(
    listingRows
      .filter((item) => typeof item.asking_price === "number" && Number.isFinite(item.asking_price) && item.asking_price > 0 && item.bag_vbo_id)
      .map((item) => [item.bag_vbo_id as string, item.asking_price as number]),
  );
  const listingHistory = listingHistoryFromRows(listingRows);
  const mortgageRaw = profilePreferences.mortgageState;
  const mortgageRecord = record(mortgageRaw);
  const mortgageState = mortgageRaw ? restoreCalculatorState(mortgageRaw) : null;
  const mortgageConfigured = mortgageStateHasCapacity(mortgageState);
  let mortgageSnapshot = normalizeMortgageSnapshot(mortgageRecord.snapshot) ?? normalizeMortgageSnapshot(profilePreferences.mortgageSnapshot);
  if (mortgageConfigured && mortgageState && !mortgageSnapshot) {
    const capacity = calculateMortgageCapacity(calculatorStateToFinance(mortgageState), {
      nhg: mortgageState.nhg,
      energyLabel: mortgageState.energyLabel || undefined,
      askingPrice: mortgageState.askingPrice || undefined,
    });
    if (capacity.available) mortgageSnapshot = buildMortgageSnapshot(capacity, mortgageState.nhg);
  }
  return {
    supabase,
    user,
    workspace: {
      preferences,
      preferencesConfigured: Boolean(profilePreferences.personalPreferences),
      buyerProfile,
      buyerProfileConfigured: buyerProfileIsConfigured(buyerProfile, profilePreferences.buyerProfile),
      mortgageState,
      mortgageSnapshot,
      mortgageConfigured,
      onboardingDismissed: parseOnboardingDismissed(profilePreferences),
      saved: savedProperties.map((item): SavedProperty => ({
        bagVboId: item.bag_vbo_id,
        addressLabel: item.address_label,
        city: item.city,
        postcode: item.postcode,
        savedAt: item.saved_at,
        askingPrice: askingPrices[item.bag_vbo_id] ?? null,
      })),
      listingHistory,
      compare: Array.isArray(profile?.compare_ids) ? profile.compare_ids.filter(isBagId).slice(0, 4) : [],
      propertyStages,
      askingPrices,
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
    const parsed = workspaceBodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige aankoopomgevinggegevens." }, { status: 400 });
    const body: WorkspaceRequest = parsed.data;
    const now = new Date().toISOString();

    if (body.action === "save") {
      if (!isBagId(body.bagVboId) || !body.addressLabel || !body.city || !body.postcode) return NextResponse.json({ error: "Onvolledige woninggegevens." }, { status: 400 });
      const savedPayload: { user_id: string; bag_vbo_id: string; address_label: string; city: string; postcode: string; stage?: PropertyStage; updated_at: string } = { user_id: result.user.id, bag_vbo_id: body.bagVboId, address_label: body.addressLabel, city: body.city, postcode: body.postcode, updated_at: now };
      if (body.stage !== undefined) savedPayload.stage = body.stage;
      const { error } = await result.supabase.from("saved_properties").upsert(savedPayload, { onConflict: "user_id,bag_vbo_id" });
      if (error) throw error;
      if (body.askingPrice != null && body.askingPrice > 0) {
        const { error: listingError } = await result.supabase.from("user_listings").upsert({
          user_id: result.user.id,
          bag_vbo_id: body.bagVboId,
          asking_price: body.askingPrice,
          updated_at: now,
        }, { onConflict: "user_id,bag_vbo_id" });
        if (listingError) throw listingError;
      }
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
      const { error } = await result.supabase.rpc("merge_profile_preferences", { p_preferences: null, p_buyer_profile: null, p_compare_ids: compare, p_mortgage: null });
      if (error) throw error;
    } else if (body.action === "profile") {
      if (!body.preferences && !body.buyerProfile) return NextResponse.json({ error: "Geef voorkeuren of een woonprofiel mee." }, { status: 400 });
      if (!preferencesJsonWithinLimit({ personalPreferences: body.preferences, buyerProfile: body.buyerProfile })) return NextResponse.json({ error: "Je profielgegevens zijn te groot." }, { status: 413 });
      const { error } = await result.supabase.rpc("merge_profile_preferences", { p_preferences: body.preferences ?? null, p_buyer_profile: body.buyerProfile ?? null, p_compare_ids: null, p_mortgage: null });
      if (error) throw error;
    } else if (body.action === "mortgage") {
      if (!body.mortgageState) return NextResponse.json({ error: "Geef hypotheekgegevens mee." }, { status: 400 });
      const state = restoreCalculatorState(body.mortgageState) as CalculatorState;
      const capacity = calculateMortgageCapacity(calculatorStateToFinance(state), {
        nhg: state.nhg,
        energyLabel: state.energyLabel || undefined,
        askingPrice: state.askingPrice || undefined,
      });
      const snapshot = capacity.available ? buildMortgageSnapshot(capacity, state.nhg) : null;
      const nextProfile = capacity.available
        ? buyerProfileFromMortgageCapacity(result.workspace.buyerProfile, capacity, state)
        : result.workspace.buyerProfile;
      const mortgagePayload = { ...state, snapshot };
      if (!preferencesJsonWithinLimit({ mortgageState: mortgagePayload, buyerProfile: nextProfile })) {
        return NextResponse.json({ error: "Je hypotheekgegevens zijn te groot." }, { status: 413 });
      }
      const { error } = await result.supabase.rpc("merge_profile_preferences", {
        p_preferences: null,
        p_buyer_profile: nextProfile,
        p_compare_ids: null,
        p_mortgage: mortgagePayload,
      });
      if (error) throw error;
    } else if (body.action === "listingPrice") {
      if (!isBagId(body.bagVboId)) return NextResponse.json({ error: "Ongeldig woningadres." }, { status: 400 });
      if (body.askingPrice == null || body.askingPrice < 0) return NextResponse.json({ error: "Ongeldige vraagprijs." }, { status: 400 });
      const { error } = await result.supabase.from("user_listings").upsert({
        user_id: result.user.id,
        bag_vbo_id: body.bagVboId,
        asking_price: body.askingPrice > 0 ? body.askingPrice : null,
        updated_at: now,
      }, { onConflict: "user_id,bag_vbo_id" });
      if (error) throw error;
    } else if (body.action === "onboarding") {
      if (!body.dismissOnboarding) return NextResponse.json({ error: "Geef dismissOnboarding mee." }, { status: 400 });
      const onboardingPatch = { dismissedAt: now };
      if (!preferencesJsonWithinLimit({ onboarding: onboardingPatch })) {
        return NextResponse.json({ error: "Je profielgegevens zijn te groot." }, { status: 413 });
      }
      const { error } = await result.supabase.rpc("merge_profile_preferences", {
        p_preferences: null,
        p_buyer_profile: null,
        p_compare_ids: null,
        p_mortgage: null,
        p_onboarding: onboardingPatch,
      });
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
