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

export type BuyerProfile = {
  budget: number;
  monthlyPayment: number;
  ownFunds: number;
  searchArea: string;
  bedrooms: number;
  garden: boolean;
  parking: boolean;
  remoteWork: boolean;
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

export const PROFILE_REQUIREMENTS = [
  { key: "garden", label: "Tuin", group: "must" },
  { key: "bedrooms", label: "Minimaal 4 slaapkamers", group: "must" },
  { key: "parking", label: "Eigen oprit", group: "preference" },
  { key: "remoteWork", label: "Werkkamer", group: "nice" },
] as const;

export function formatEuro(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export function estimateBidRange(askingPrice: number) {
  if (!askingPrice || askingPrice < 1) return null;
  return {
    cautious: Math.round((askingPrice * 0.99) / 500) * 500,
    balanced: Math.round((askingPrice * 1.005) / 500) * 500,
    strong: Math.round((askingPrice * 1.02) / 500) * 500,
  };
}

export function profileCompletion(profile: BuyerProfile) {
  const checks = [profile.budget > 0, profile.monthlyPayment > 0, profile.ownFunds >= 0, Boolean(profile.searchArea.trim()), profile.bedrooms > 0];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
