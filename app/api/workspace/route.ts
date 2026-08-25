import { NextResponse } from "next/server";
import { apiContext, currentUser, parseJsonBody } from "@/src/lib/api/handlers";
import { calculateMortgageCapacity } from "@/src/lib/mortgage/capacity";
import { caseStageFromProperty, normalizeCaseStage } from "@/src/lib/journey";
import { loadTaskEngineInput, syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { logWarn } from "@/src/lib/logger";
import type { Locale } from "@/src/lib/i18n/config";
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
import { listingHistoryFromRows, type ListingHistoryRow } from "@/src/lib/listing-history";
import type { PersonalPreferences, SavedProperty } from "@/src/lib/types";
import { preferencesJsonWithinLimit, workspaceBodySchema, type WorkspaceRequest, isValidBagId } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isStage(value: unknown): value is PropertyStage {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PROPERTY_STAGE_LABELS, value);
}

function isBagId(value: unknown): value is string {
  return typeof value === "string" && isValidBagId(value);
}

async function readWorkspace(locale: Locale = "nl") {
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
    }, undefined, locale);
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

export async function GET(request: Request) {
  const { locale, t } = apiContext(request);
  try {
    const result = await readWorkspace(locale);
    if (!result.user || !result.workspace) return NextResponse.json({ error: t("errors.loginToSaveWorkspace") }, { status: 401 });
    return NextResponse.json({ workspace: result.workspace });
  } catch {
    return NextResponse.json({ error: t("errors.workspaceNotConfigured") }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { locale, t } = apiContext(request);
  try {
    const result = await readWorkspace(locale);
    if (!result.user || !result.workspace) return NextResponse.json({ error: t("errors.loginToSaveChanges") }, { status: 401 });
    const parsed = await parseJsonBody(request, workspaceBodySchema, t("errors.workspaceInvalidData"));
    if (!parsed.ok) return parsed.response;
    const body: WorkspaceRequest = parsed.data;
    const now = new Date().toISOString();

    if (body.action === "save") {
      const savedPayload: { user_id: string; bag_vbo_id: string; address_label: string; city: string; postcode: string; stage?: PropertyStage; updated_at: string } = { user_id: result.user.id, bag_vbo_id: body.bagVboId, address_label: body.addressLabel, city: body.city, postcode: body.postcode, updated_at: now };
      if (body.stage !== undefined) savedPayload.stage = body.stage;
      const { error } = await result.supabase.from("saved_properties").upsert(savedPayload, { onConflict: "user_id,bag_vbo_id" });
      if (error) throw error;
      if (body.askingPrice != null) {
        const { error: listingError } = await result.supabase.from("user_listings").upsert({
          user_id: result.user.id,
          bag_vbo_id: body.bagVboId,
          asking_price: body.askingPrice,
          updated_at: now,
        }, { onConflict: "user_id,bag_vbo_id" });
        if (listingError) throw listingError;
      }
    } else if (body.action === "unsave") {
      const { error } = await result.supabase.from("saved_properties").delete().eq("user_id", result.user.id).eq("bag_vbo_id", body.bagVboId);
      if (error) throw error;
    } else if (body.action === "stage") {
      const { error } = await result.supabase.from("saved_properties").update({ stage: body.stage, updated_at: now }).eq("user_id", result.user.id).eq("bag_vbo_id", body.bagVboId);
      if (error) throw error;
      // Keep the dossier in step with the cockpit card: an active case for
      // this address follows the property stage so both views agree.
      try {
        const { data: propertyRow } = await result.supabase.from("properties").select("id").eq("bag_vbo_id", body.bagVboId).maybeSingle();
        if (propertyRow) {
          const { data: purchaseCase } = await result.supabase.from("purchase_cases").select("id,stage").eq("user_id", result.user.id).eq("property_id", propertyRow.id).eq("status", "active").maybeSingle();
          if (purchaseCase) {
            const caseStage = caseStageFromProperty(body.stage);
            if (caseStage !== normalizeCaseStage(purchaseCase.stage)) {
              const { error: caseError } = await result.supabase.from("purchase_cases").update({ stage: caseStage, updated_at: now }).eq("id", purchaseCase.id);
              if (caseError) throw caseError;
              await syncEngineTasks(result.supabase, result.user.id, await loadTaskEngineInput(result.supabase, result.user.id, { caseId: purchaseCase.id, stage: caseStage, bagVboId: body.bagVboId }));
            }
          }
        }
      } catch (syncError) {
        logWarn("Property stage saved but case stage sync failed", syncError);
      }
    } else if (body.action === "compare") {
      const compare = body.compare.slice(0, 4);
      const { error } = await result.supabase.rpc("merge_profile_preferences", { p_preferences: null, p_buyer_profile: null, p_compare_ids: compare, p_mortgage: null });
      if (error) throw error;
    } else if (body.action === "profile") {
      if (!preferencesJsonWithinLimit({ personalPreferences: body.preferences, buyerProfile: body.buyerProfile })) return NextResponse.json({ error: t("errors.profileTooLarge") }, { status: 413 });
      const { error } = await result.supabase.rpc("merge_profile_preferences", { p_preferences: body.preferences ?? null, p_buyer_profile: body.buyerProfile ?? null, p_compare_ids: null, p_mortgage: null });
      if (error) throw error;
    } else if (body.action === "mortgage") {
      const state = restoreCalculatorState(body.mortgageState) as CalculatorState;
      const capacity = calculateMortgageCapacity(calculatorStateToFinance(state), {
        nhg: state.nhg,
        energyLabel: state.energyLabel || undefined,
        askingPrice: state.askingPrice || undefined,
      }, undefined, locale);
      const snapshot = capacity.available ? buildMortgageSnapshot(capacity, state.nhg) : null;
      const nextProfile = capacity.available
        ? buyerProfileFromMortgageCapacity(result.workspace.buyerProfile, capacity, state)
        : result.workspace.buyerProfile;
      const mortgagePayload = { ...state, snapshot };
      if (!preferencesJsonWithinLimit({ mortgageState: mortgagePayload, buyerProfile: nextProfile })) {
        return NextResponse.json({ error: t("errors.mortgageTooLarge") }, { status: 413 });
      }
      const { error } = await result.supabase.rpc("merge_profile_preferences", {
        p_preferences: null,
        p_buyer_profile: nextProfile,
        p_compare_ids: null,
        p_mortgage: mortgagePayload,
      });
      if (error) throw error;
    } else if (body.action === "listingPrice") {
      const { error } = await result.supabase.from("user_listings").upsert({
        user_id: result.user.id,
        bag_vbo_id: body.bagVboId,
        asking_price: body.askingPrice > 0 ? body.askingPrice : null,
        updated_at: now,
      }, { onConflict: "user_id,bag_vbo_id" });
      if (error) throw error;
    } else if (body.action === "onboarding") {
      const onboardingPatch = { dismissedAt: now };
      if (!preferencesJsonWithinLimit({ onboarding: onboardingPatch })) {
        return NextResponse.json({ error: t("errors.profileTooLarge") }, { status: 413 });
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
      // Discriminated union makes this branch unreachable at the type level;
      // kept as a runtime guard for unexpected payloads.
      return NextResponse.json({ error: "Onbekende workspaceactie." }, { status: 400 });
    }

    const updated = await readWorkspace(locale);
    return NextResponse.json({ workspace: updated.workspace });
  } catch {
    return NextResponse.json({ error: t("errors.workspaceSaveFailed") }, { status: 502 });
  }
}
