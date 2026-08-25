import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { formatLocaleTag } from "@/src/lib/format-locale";

export type PropertyStage =
  | "saved"
  | "research"
  | "viewing"
  | "visited"
  | "offer"
  | "offered"
  | "negotiation"
  | "accepted"
  | "dropped"
  | "bought";

export type HouseholdType = "single" | "couple" | "family";
export type SoughtPropertyType = "any" | "house" | "apartment";

export type BuyerProfile = {
  budget: number;
  monthlyPayment: number;
  ownFunds: number;
  searchArea: string;
  bedrooms: number;
  garden: boolean;
  parking: boolean;
  remoteWork: boolean;
  household: HouseholdType;
  householdSpecified: boolean;
  propertyType: SoughtPropertyType;
  firstTimeBuyer: boolean;
  buyerAge: number;
  selfOccupied: boolean;
  priorExemptionUsed: boolean;
  nhg: boolean;
  acceptVve: boolean;
  maxCommuteMinutes: number;
};

export const DEFAULT_BUYER_PROFILE: BuyerProfile = {
  budget: 575000,
  monthlyPayment: 2350,
  ownFunds: 70000,
  searchArea: "Utrecht + 20 km",
  bedrooms: 4,
  garden: true,
  parking: false,
  remoteWork: true,
  household: "family",
  householdSpecified: true,
  propertyType: "any",
  firstTimeBuyer: false,
  buyerAge: 32,
  selfOccupied: true,
  priorExemptionUsed: false,
  nhg: false,
  acceptVve: true,
  maxCommuteMinutes: 45,
};

export const EMPTY_BUYER_PROFILE: BuyerProfile = {
  budget: 0,
  monthlyPayment: 0,
  ownFunds: 0,
  searchArea: "",
  bedrooms: 0,
  garden: false,
  parking: false,
  remoteWork: false,
  household: "couple",
  householdSpecified: false,
  propertyType: "any",
  firstTimeBuyer: false,
  buyerAge: 0,
  selfOccupied: false,
  priorExemptionUsed: false,
  nhg: false,
  acceptVve: true,
  maxCommuteMinutes: 0,
};

const ALL_PROPERTY_STAGES: PropertyStage[] = ["saved", "research", "viewing", "visited", "offer", "offered", "negotiation", "accepted", "dropped", "bought"];

export function propertyStageLabel(stage: PropertyStage, locale: Locale = "nl"): string {
  return getLibTranslator(locale, "lib-domain")(`purchase.propertyStages.${stage}`);
}

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer propertyStageLabel(stage, locale). */
export const PROPERTY_STAGE_LABELS: Record<PropertyStage, string> = Object.fromEntries(
  ALL_PROPERTY_STAGES.map((stage) => [stage, propertyStageLabel(stage)]),
) as Record<PropertyStage, string>;

export const PROPERTY_STAGE_ORDER: PropertyStage[] = ["saved", "research", "viewing", "visited", "offer", "offered", "negotiation", "accepted", "bought"];

const HOUSEHOLD_TYPES: HouseholdType[] = ["single", "couple", "family"];

export function householdLabel(household: HouseholdType, locale: Locale = "nl"): string {
  return getLibTranslator(locale, "lib-domain")(`purchase.households.${household}`);
}

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer householdLabel(household, locale). */
export const HOUSEHOLD_LABELS: Record<HouseholdType, string> = Object.fromEntries(
  HOUSEHOLD_TYPES.map((key) => [key, householdLabel(key)]),
) as Record<HouseholdType, string>;

const SOUGHT_PROPERTY_TYPES: SoughtPropertyType[] = ["any", "house", "apartment"];

export function propertyTypeLabel(type: SoughtPropertyType, locale: Locale = "nl"): string {
  return getLibTranslator(locale, "lib-domain")(`purchase.propertyTypes.${type}`);
}

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer propertyTypeLabel(type, locale). */
export const PROPERTY_TYPE_LABELS: Record<SoughtPropertyType, string> = Object.fromEntries(
  SOUGHT_PROPERTY_TYPES.map((key) => [key, propertyTypeLabel(key)]),
) as Record<SoughtPropertyType, string>;

export function formatEuro(value: number | null | undefined, locale: Locale = "nl") {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(formatLocaleTag(locale), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function asHousehold(value: unknown): HouseholdType | null {
  return value === "single" || value === "couple" || value === "family" ? value : null;
}

function asPropertyType(value: unknown): SoughtPropertyType {
  return value === "any" || value === "house" || value === "apartment" ? value : "any";
}

export function normalizeBuyerProfile(value: unknown): BuyerProfile {
  const record = asRecord(value);
  const household = asHousehold(record.household);
  return {
    budget: asNumber(record.budget, 0),
    monthlyPayment: asNumber(record.monthlyPayment, 0),
    ownFunds: asNumber(record.ownFunds, 0),
    searchArea: asString(record.searchArea, ""),
    bedrooms: asNumber(record.bedrooms, 0),
    garden: asBoolean(record.garden, false),
    parking: asBoolean(record.parking, false),
    remoteWork: asBoolean(record.remoteWork, false),
    household: household ?? DEFAULT_BUYER_PROFILE.household,
    householdSpecified: household != null,
    propertyType: asPropertyType(record.propertyType),
    firstTimeBuyer: asBoolean(record.firstTimeBuyer, false),
    buyerAge: asNumber(record.buyerAge, 0),
    selfOccupied: asBoolean(record.selfOccupied, false),
    priorExemptionUsed: asBoolean(record.priorExemptionUsed, false),
    nhg: asBoolean(record.nhg, false),
    acceptVve: asBoolean(record.acceptVve, true),
    maxCommuteMinutes: asNumber(record.maxCommuteMinutes, 0),
  };
}

export function profileCompletion(profile: BuyerProfile) {
  const checks = [
    profile.budget > 0,
    profile.monthlyPayment > 0,
    profile.ownFunds >= 0,
    Boolean(profile.searchArea.trim()),
    profile.bedrooms > 0,
    profile.householdSpecified,
    profile.maxCommuteMinutes > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function buyerProfileIsConfigured(profile: BuyerProfile, stored?: unknown) {
  if (stored !== undefined && (stored == null || typeof stored !== "object" || Array.isArray(stored))) return false;
  return profileCompletion(profile) >= 80 && profile.maxCommuteMinutes > 0;
}
