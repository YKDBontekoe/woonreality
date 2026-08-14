import type { Analysis, PersonalPreferences } from "@/src/lib/types";

export const DEFAULT_PREFERENCES: PersonalPreferences = {
  quiet: 1,
  green: 1,
  energy: 1,
  mobility: 1,
  climate: 1,
  future: 1,
};

const preferenceToDomain: Record<keyof PersonalPreferences, string> = {
  quiet: "gezondheid",
  green: "klimaat",
  energy: "woning",
  mobility: "mobiliteit",
  climate: "klimaat",
  future: "toekomst",
};

export function calculatePersonalFit(analysis: Analysis, preferences: PersonalPreferences) {
  const domains = analysis.domains ?? [];
  const weighted = Object.entries(preferences).reduce((sum, [key, weight]) => {
    const domain = domains.find((item) => item.key === preferenceToDomain[key as keyof PersonalPreferences]);
    return domain?.score == null ? sum : sum + domain.score * weight;
  }, 0);
  const weight = Object.entries(preferences).reduce((sum, [key, value]) => {
    const domain = domains.find((item) => item.key === preferenceToDomain[key as keyof PersonalPreferences]);
    return domain?.score == null ? sum : sum + value;
  }, 0);
  return weight ? Math.round((weighted / weight) * 10) / 10 : null;
}

export function preferenceLabel(key: keyof PersonalPreferences) {
  return ({ quiet: "Rust", green: "Groen", energy: "Energie", mobility: "Mobiliteit", climate: "Klimaat", future: "Toekomst" })[key];
}
