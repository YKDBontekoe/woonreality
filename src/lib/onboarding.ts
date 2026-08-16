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

export const ONBOARDING_STEP_META: Record<OnboardingStepId, { number: string; title: string; lead: string }> = {
  mortgage: {
    number: "01",
    title: "Koopkracht",
    lead: "Bereken wat je kunt lenen. Budget en maandlast vullen we daarna automatisch in je woonprofiel.",
  },
  wishes: {
    number: "02",
    title: "Woonwensen",
    lead: "Zoekgebied, huishouden en must-haves — de harde grenzen voor je woningcheck.",
  },
  priorities: {
    number: "03",
    title: "Prioriteiten",
    lead: "Wat weegt het zwaarst mee in je persoonlijke fit-score?",
  },
  done: {
    number: "04",
    title: "Klaar",
    lead: "Je aankoopomgeving staat klaar. Zoek een adres of open je dashboard.",
  },
};
