import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import type { WorkspaceData } from "@/src/lib/workspace";

export const ONBOARDING_STEPS = ["mortgage", "wishes", "priorities", "done"] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export type OnboardingGateInput = {
  mortgageConfigured: boolean;
  buyerProfileConfigured: boolean;
  onboardingDismissed: boolean;
};

/** Logged-in users without mortgage + woonprofiel land on /onboarding unless they dismissed. */
export function shouldRedirectToOnboarding(input: OnboardingGateInput): boolean {
  if (input.onboardingDismissed) return false;
  return !input.mortgageConfigured || !input.buyerProfileConfigured;
}

export function onboardingComplete(input: Pick<OnboardingGateInput, "mortgageConfigured" | "buyerProfileConfigured">): boolean {
  return input.mortgageConfigured && input.buyerProfileConfigured;
}

export function initialOnboardingStep(workspace: Pick<WorkspaceData, "mortgageConfigured" | "buyerProfileConfigured" | "preferencesConfigured">): OnboardingStepId {
  if (!workspace.mortgageConfigured) return "mortgage";
  if (!workspace.buyerProfileConfigured) return "wishes";
  if (!workspace.preferencesConfigured) return "priorities";
  return "done";
}

export function parseOnboardingDismissed(preferencesJson: unknown): boolean {
  if (!preferencesJson || typeof preferencesJson !== "object" || Array.isArray(preferencesJson)) return false;
  const onboarding = (preferencesJson as Record<string, unknown>).onboarding;
  if (!onboarding || typeof onboarding !== "object" || Array.isArray(onboarding)) return false;
  const dismissedAt = (onboarding as Record<string, unknown>).dismissedAt;
  return typeof dismissedAt === "string" && dismissedAt.length > 0;
}

export type OnboardingStepMeta = { number: string; title: string; lead: string };

export function onboardingStepMeta(step: OnboardingStepId, locale: Locale = "nl"): OnboardingStepMeta {
  const t = getLibTranslator(locale, "lib-domain");
  return {
    number: STEP_NUMBERS[step],
    title: t(`onboarding.steps.${step}.title`),
    lead: t(`onboarding.steps.${step}.lead`),
  };
}

const STEP_NUMBERS: Record<OnboardingStepId, string> = {
  mortgage: "01",
  wishes: "02",
  priorities: "03",
  done: "04",
};

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer onboardingStepMeta(step, locale). */
export const ONBOARDING_STEP_META: Record<OnboardingStepId, OnboardingStepMeta> = Object.fromEntries(
  ONBOARDING_STEPS.map((step) => [step, onboardingStepMeta(step)]),
) as Record<OnboardingStepId, OnboardingStepMeta>;
