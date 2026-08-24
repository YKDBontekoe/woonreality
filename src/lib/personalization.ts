import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
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
  // green/climate are resolved from distinct signals below (see scoreForPreference):
  // both used to point at the aggregated "klimaat" domain, so moving one slider
  // silently moved the other's outcome too. They kept these domain fallbacks
  // for the (rare) case a signal-level score is unavailable.
  green: "klimaat",
  energy: "woning",
  mobility: "mobiliteit",
  climate: "klimaat",
  future: "toekomst",
};

/** Signal-level overrides for preferences whose domain would otherwise collide with another preference. */
const preferenceToSignal: Partial<Record<keyof PersonalPreferences, string>> = {
  green: "green",
  climate: "heat",
};

function scoreForPreference(analysis: Analysis, key: keyof PersonalPreferences): number | null {
  const signalKey = preferenceToSignal[key];
  if (signalKey) {
    const signal = (analysis.signals ?? []).find((item) => item.key === signalKey && item.availability !== "unavailable");
    if (typeof signal?.score === "number") return signal.score;
  }
  const domain = (analysis.domains ?? []).find((item) => item.key === preferenceToDomain[key]);
  return domain?.score ?? null;
}

export function calculatePersonalFit(analysis: Analysis, preferences: PersonalPreferences) {
  const weighted = Object.entries(preferences).reduce((sum, [key, weight]) => {
    const score = scoreForPreference(analysis, key as keyof PersonalPreferences);
    return score == null ? sum : sum + score * weight;
  }, 0);
  const weight = Object.entries(preferences).reduce((sum, [key, value]) => {
    const score = scoreForPreference(analysis, key as keyof PersonalPreferences);
    return score == null ? sum : sum + value;
  }, 0);
  return weight ? Math.round((weighted / weight) * 10) / 10 : null;
}

export function preferenceLabel(key: keyof PersonalPreferences, locale: Locale = "nl") {
  return getLibTranslator(locale, "lib-domain")(`personalization.preferences.${key}`);
}
