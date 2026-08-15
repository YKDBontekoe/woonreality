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
  propertyType: SoughtPropertyType;
  firstTimeBuyer: boolean;
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
  propertyType: "any",
  firstTimeBuyer: false,
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
  propertyType: "any",
  firstTimeBuyer: false,
  nhg: false,
  acceptVve: true,
  maxCommuteMinutes: 0,
};

export const PROPERTY_STAGE_LABELS: Record<PropertyStage, string> = {
  saved: "Opgeslagen",
  research: "Onderzoeken",
  viewing: "Bezichtiging gepland",
  visited: "Bezichtigd",
  offer: "Bod voorbereiden",
  offered: "Bod uitgebracht",
  negotiation: "Onderhandeling",
  accepted: "Geaccepteerd",
  dropped: "Afgevallen",
  bought: "Gekocht",
};

export const PROPERTY_STAGE_ORDER: PropertyStage[] = ["saved", "research", "viewing", "visited", "offer", "offered", "negotiation", "accepted", "bought"];

export const HOUSEHOLD_LABELS: Record<HouseholdType, string> = {
  single: "Alleen",
  couple: "Samen",
  family: "Gezin",
};

export const PROPERTY_TYPE_LABELS: Record<SoughtPropertyType, string> = {
  any: "Maakt niet uit",
  house: "Grondgebonden",
  apartment: "Appartement",
};

export function formatEuro(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
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

function asHousehold(value: unknown): HouseholdType {
  return value === "single" || value === "couple" || value === "family" ? value : DEFAULT_BUYER_PROFILE.household;
}

function asPropertyType(value: unknown): SoughtPropertyType {
  return value === "any" || value === "house" || value === "apartment" ? value : "any";
}

export function normalizeBuyerProfile(value: unknown): BuyerProfile {
  const record = asRecord(value);
  return {
    budget: asNumber(record.budget, 0),
    monthlyPayment: asNumber(record.monthlyPayment, 0),
    ownFunds: asNumber(record.ownFunds, 0),
    searchArea: asString(record.searchArea, ""),
    bedrooms: asNumber(record.bedrooms, 0),
    garden: asBoolean(record.garden, false),
    parking: asBoolean(record.parking, false),
    remoteWork: asBoolean(record.remoteWork, false),
    household: asHousehold(record.household),
    propertyType: asPropertyType(record.propertyType),
    firstTimeBuyer: asBoolean(record.firstTimeBuyer, false),
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
    Boolean(profile.household),
    profile.maxCommuteMinutes > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
