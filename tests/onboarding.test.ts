import assert from "node:assert/strict";
import test from "node:test";
import {
  initialOnboardingStep,
  onboardingComplete,
  parseOnboardingDismissed,
  shouldRedirectToOnboarding,
} from "../src/lib/onboarding";
import { workspaceBodySchema } from "../src/lib/validation/workspace";

test("onboarding redirect requires incomplete mortgage or woonprofiel and no dismiss", () => {
  assert.equal(shouldRedirectToOnboarding({ mortgageConfigured: false, buyerProfileConfigured: false, onboardingDismissed: false }), true);
  assert.equal(shouldRedirectToOnboarding({ mortgageConfigured: true, buyerProfileConfigured: false, onboardingDismissed: false }), true);
  assert.equal(shouldRedirectToOnboarding({ mortgageConfigured: false, buyerProfileConfigured: true, onboardingDismissed: false }), true);
  assert.equal(shouldRedirectToOnboarding({ mortgageConfigured: true, buyerProfileConfigured: true, onboardingDismissed: false }), false);
  assert.equal(shouldRedirectToOnboarding({ mortgageConfigured: false, buyerProfileConfigured: false, onboardingDismissed: true }), false);
});

test("onboarding is complete only with mortgage and woonprofiel", () => {
  assert.equal(onboardingComplete({ mortgageConfigured: true, buyerProfileConfigured: true }), true);
  assert.equal(onboardingComplete({ mortgageConfigured: true, buyerProfileConfigured: false }), false);
  assert.equal(onboardingComplete({ mortgageConfigured: false, buyerProfileConfigured: true }), false);
});

test("initial onboarding step follows remaining gaps", () => {
  assert.equal(initialOnboardingStep({ mortgageConfigured: false, buyerProfileConfigured: false, preferencesConfigured: false }), "mortgage");
  assert.equal(initialOnboardingStep({ mortgageConfigured: true, buyerProfileConfigured: false, preferencesConfigured: false }), "wishes");
  assert.equal(initialOnboardingStep({ mortgageConfigured: true, buyerProfileConfigured: true, preferencesConfigured: false }), "priorities");
  assert.equal(initialOnboardingStep({ mortgageConfigured: true, buyerProfileConfigured: true, preferencesConfigured: true }), "done");
});

test("onboarding dismiss flag is read from preferences_json.onboarding", () => {
  assert.equal(parseOnboardingDismissed(null), false);
  assert.equal(parseOnboardingDismissed({}), false);
  assert.equal(parseOnboardingDismissed({ onboarding: { dismissedAt: "" } }), false);
  assert.equal(parseOnboardingDismissed({ onboarding: { dismissedAt: "2026-08-16T10:00:00.000Z" } }), true);
});

test("workspace validator accepts onboarding dismiss action", () => {
  assert.equal(workspaceBodySchema.safeParse({ action: "onboarding", dismissOnboarding: true }).success, true);
  // The discriminated union requires the flag up front; the old loose schema
  // let this through and the route rejected it afterwards — same 400 outcome.
  assert.equal(workspaceBodySchema.safeParse({ action: "onboarding" }).success, false);
  assert.equal(workspaceBodySchema.safeParse({ action: "onboarding", dismissOnboarding: "yes" }).success, false);
});
