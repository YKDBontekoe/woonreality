"use client";

import { Link } from "@/src/lib/i18n/navigation";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Home, Landmark, Settings2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { MortgageCalculator } from "@/components/mortgage-calculator";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import {
  initialOnboardingStep,
  ONBOARDING_STEP_META,
  ONBOARDING_STEPS,
  onboardingComplete,
  type OnboardingStepId,
} from "@/src/lib/onboarding";
import { DEFAULT_PREFERENCES, preferenceLabel } from "@/src/lib/personalization";
import {
  HOUSEHOLD_LABELS,
  PROPERTY_TYPE_LABELS,
  formatEuro,
  type BuyerProfile,
  type HouseholdType,
  type SoughtPropertyType,
} from "@/src/lib/purchase";
import type { PersonalPreferences } from "@/src/lib/types";
import { loginHref } from "@/src/lib/login-href";

const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof PersonalPreferences)[];

export function OnboardingWizard({ suggestPasskey = false }: { suggestPasskey?: boolean }) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const {
    workspace,
    workspaceReady,
    workspaceError,
    authStatus,
    setBuyerProfile,
    setPreferences,
    dismissOnboarding,
    refresh,
  } = usePropertyWorkspace();
  const [step, setStep] = useState<OnboardingStepId>("mortgage");
  const [stepReady, setStepReady] = useState(false);
  const [formSyncedFor, setFormSyncedFor] = useState<OnboardingStepId | null>(null);
  const [mortgageReady, setMortgageReady] = useState(false);
  const [profile, setProfile] = useState<BuyerProfile>(workspace.buyerProfile);
  const [preferences, setLocalPreferences] = useState<PersonalPreferences>(workspace.preferences);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!workspaceReady) return;
    if (workspace.mortgageConfigured) setMortgageReady(true);
    if (!stepReady) {
      setStep(initialOnboardingStep(workspace));
      setStepReady(true);
    }
  }, [workspace, workspaceReady, stepReady]);

  useEffect(() => {
    if (!workspaceReady || !stepReady || formSyncedFor === step) return;
    if (step === "wishes") setProfile(workspace.buyerProfile);
    if (step === "priorities") setLocalPreferences(workspace.preferences);
    setFormSyncedFor(step);
  }, [formSyncedFor, step, stepReady, workspace, workspaceReady]);

  useEffect(() => {
    if (workspaceReady && authStatus === "anonymous") window.location.assign(loginHref());
  }, [authStatus, workspaceReady]);

  async function goLater() {
    setBusy(true);
    setMessage("");
    const result = await dismissOnboarding();
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    router.push(suggestPasskey ? "/mijn-aankoop?setup=passkey" : "/mijn-aankoop");
  }

  async function finishToCockpit() {
    setBusy(true);
    setMessage("");
    const result = await dismissOnboarding();
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    router.push(suggestPasskey ? "/mijn-aankoop?setup=passkey" : "/mijn-aankoop");
  }

  async function continueFromMortgage() {
    setBusy(true);
    setMessage("");
    await refresh();
    setBusy(false);
    if (mortgageReady) {
      setFormSyncedFor(null);
      setStep("wishes");
      return;
    }
    setMessage(t("incomeNeededMessage"));
  }

  async function saveWishes() {
    setBusy(true);
    setMessage("");
    const base = workspace.buyerProfile;
    const next: BuyerProfile = {
      ...base,
      ...profile,
      budget: base.budget || profile.budget,
      monthlyPayment: base.monthlyPayment || profile.monthlyPayment,
      ownFunds: workspace.mortgageConfigured ? base.ownFunds : profile.ownFunds,
      nhg: workspace.mortgageConfigured ? base.nhg : profile.nhg,
      householdSpecified: true,
      searchArea: profile.searchArea.trim(),
    };
    const result = await setBuyerProfile(next);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setFormSyncedFor(null);
    setStep("priorities");
  }

  async function savePriorities() {
    setBusy(true);
    setMessage("");
    const result = await setPreferences(preferences);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setFormSyncedFor(null);
    setStep("done");
  }

  function updateNumber(key: "bedrooms" | "maxCommuteMinutes" | "buyerAge", value: string) {
    setProfile((current) => ({ ...current, [key]: Number(value) || 0 }));
  }

  const meta = ONBOARDING_STEP_META[step];
  const snapshot = workspace.mortgageSnapshot;

  if (!workspaceReady) {
    return (
      <div className="onboarding-shell">
        <p className="onboarding-loading">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-progress" role="navigation" aria-label={t("stepsAria")}>
        {ONBOARDING_STEPS.map((id) => {
          const active = id === step;
          const done =
            (id === "mortgage" && (workspace.mortgageConfigured || mortgageReady)) ||
            (id === "wishes" && workspace.buyerProfileConfigured) ||
            (id === "priorities" && workspace.preferencesConfigured) ||
            (id === "done" && step === "done");
          const reachable =
            id === "mortgage" ||
            (id === "wishes" && (workspace.mortgageConfigured || mortgageReady)) ||
            (id === "priorities" && workspace.buyerProfileConfigured) ||
            (id === "done" && (onboardingComplete(workspace) || workspace.preferencesConfigured));
          return (
            <button
              key={id}
              type="button"
              disabled={!reachable}
              className={`onboarding-step-pill${active ? " is-active" : ""}${done ? " is-done" : ""}`}
              aria-current={active ? "step" : undefined}
              onClick={() => {
                if (!reachable) return;
                setFormSyncedFor(null);
                setStep(id);
              }}
            >
              <span>{ONBOARDING_STEP_META[id].number}</span>
              {ONBOARDING_STEP_META[id].title}
              {done && !active && <span className="sr-only">{t("stepDoneSr")}</span>}
            </button>
          );
        })}
      </div>

      <header className="onboarding-heading">
        <div className="eyebrow"><span className="eyebrow-dot" /> {t("stepLabel")} {meta.number} · {meta.title.toLowerCase()}</div>
        <h1>{step === "mortgage" ? t("titleMortgage") : step === "wishes" ? t("titleWishes") : step === "priorities" ? t("titlePriorities") : t("titleDone")}</h1>
        <p className="hero-copy">{meta.lead}</p>
      </header>

      {workspaceError && <p className="form-message" role="alert">{workspaceError}</p>}
      {message && <p className="form-message" role="alert">{message}</p>}

      {step === "mortgage" && (
        <section className="onboarding-panel onboarding-mortgage">
          <MortgageCalculator variant="onboarding" onCapacityChange={setMortgageReady} />
          <div className="onboarding-actions">
            <button className="text-link" type="button" disabled={busy} onClick={() => void goLater()}>{t("laterToDashboard")}</button>
            <button className="primary-button" type="button" disabled={busy || !mortgageReady} onClick={() => void continueFromMortgage()}>
              {t("continueToWishes")} <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {step === "wishes" && (
        <section className="onboarding-panel">
          {(workspace.mortgageConfigured || mortgageReady) && snapshot && (
            <div className="onboarding-koopkracht">
              <div><small>{t("maxPurchasePrice")}</small><strong>{formatEuro(snapshot.maxPurchasePrice)}</strong></div>
              <div><small>{t("maxMortgage")}</small><strong>{formatEuro(snapshot.maxLoanForPurchase)}</strong></div>
              <div><small>{t("ownFunds")}</small><strong>{formatEuro(snapshot.ownFunds)}</strong></div>
              <div><small>{t("monthlyPayment")}</small><strong>{formatEuro(snapshot.monthlyPayment)}</strong></div>
            </div>
          )}
          <div className="profile-form onboarding-profile-form">
            <div className="form-grid">
              <label>{t("searchAreaLabel")}<input value={profile.searchArea} onChange={(event) => setProfile((current) => ({ ...current, searchArea: event.target.value }))} placeholder="Utrecht + 20 km" /></label>
              <label>{t("minBedroomsLabel")}<input type="number" inputMode="numeric" min="1" max="20" value={profile.bedrooms || ""} onChange={(event) => updateNumber("bedrooms", event.target.value)} /></label>
              <label>{t("maxCommuteLabel")}<input type="number" inputMode="numeric" min="0" max="240" value={profile.maxCommuteMinutes || ""} onChange={(event) => updateNumber("maxCommuteMinutes", event.target.value)} /></label>
              <label>{t("buyerAgeLabel")}<input type="number" inputMode="numeric" min="0" max="120" value={profile.buyerAge || ""} onChange={(event) => updateNumber("buyerAge", event.target.value)} /></label>
              <label>{t("householdLabel")}<select value={profile.household} onChange={(event) => setProfile((current) => ({ ...current, household: event.target.value as HouseholdType, householdSpecified: true }))}>{Object.entries(HOUSEHOLD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label>{t("propertyTypeLabel")}<select value={profile.propertyType} onChange={(event) => setProfile((current) => ({ ...current, propertyType: event.target.value as SoughtPropertyType }))}>{Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            </div>
            <div className="toggle-grid">
              <label><input type="checkbox" checked={profile.garden} onChange={(event) => setProfile((current) => ({ ...current, garden: event.target.checked }))} /> {t("toggleGarden")}</label>
              <label><input type="checkbox" checked={profile.parking} onChange={(event) => setProfile((current) => ({ ...current, parking: event.target.checked }))} /> {t("toggleParking")}</label>
              <label><input type="checkbox" checked={profile.remoteWork} onChange={(event) => setProfile((current) => ({ ...current, remoteWork: event.target.checked }))} /> {t("toggleRemoteWork")}</label>
              <label><input type="checkbox" checked={profile.firstTimeBuyer} onChange={(event) => setProfile((current) => ({ ...current, firstTimeBuyer: event.target.checked }))} /> {t("toggleStarter")}</label>
              <label><input type="checkbox" checked={profile.selfOccupied} onChange={(event) => setProfile((current) => ({ ...current, selfOccupied: event.target.checked }))} /> {t("toggleSelfOccupied")}</label>
              <label><input type="checkbox" checked={profile.acceptVve} onChange={(event) => setProfile((current) => ({ ...current, acceptVve: event.target.checked }))} /> {t("toggleVve")}</label>
            </div>
          </div>
          <div className="onboarding-actions">
            <button className="secondary-button" type="button" onClick={() => setStep("mortgage")}>{t("back")}</button>
            <button className="text-link" type="button" disabled={busy} onClick={() => void goLater()}>{t("later")}</button>
            <button className="primary-button" type="button" disabled={busy || !profile.searchArea.trim() || profile.bedrooms <= 0 || profile.maxCommuteMinutes <= 0} onClick={() => void saveWishes()}>
              {t("saveWishes")} <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {step === "priorities" && (
        <section className="onboarding-panel">
          <div className="preference-controls onboarding-preferences">
            {PREFERENCE_KEYS.map((key) => {
              const inputId = `onboarding-preference-${key}`;
              return (
                <div className="preference-control" key={key}>
                  <label htmlFor={inputId}>{preferenceLabel(key)}</label>
                  <input
                    id={inputId}
                    type="range"
                    min="1"
                    max="5"
                    value={preferences[key]}
                    onChange={(event) => setLocalPreferences({ ...preferences, [key]: Number(event.target.value) })}
                  />
                  <output htmlFor={inputId}>{preferences[key]}</output>
                </div>
              );
            })}
          </div>
          <div className="onboarding-actions">
            <button className="secondary-button" type="button" onClick={() => setStep("wishes")}>{t("back")}</button>
            <button className="text-link" type="button" disabled={busy} onClick={() => setStep("done")}>{t("skip")}</button>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void savePriorities()}>
              {t("savePriorities")} <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {step === "done" && (
        <section className="onboarding-panel onboarding-done">
          <div className="onboarding-done-grid">
            <div><Landmark size={18} /><h3>{t("doneBuyingPowerTitle")}</h3><p>{workspace.mortgageConfigured && snapshot ? t("doneBuyingPowerSet", { amount: formatEuro(snapshot.maxPurchasePrice) }) : mortgageReady ? t("doneBuyingPowerReady") : t("doneBuyingPowerTodo")}</p></div>
            <div><Home size={18} /><h3>{t("doneWishesTitle")}</h3><p>{workspace.buyerProfileConfigured ? t("doneWishesSet", { area: workspace.buyerProfile.searchArea, household: HOUSEHOLD_LABELS[workspace.buyerProfile.household] }) : t("doneWishesTodo")}</p></div>
            <div><Settings2 size={18} /><h3>{t("donePrioritiesTitle")}</h3><p>{workspace.preferencesConfigured ? t("donePrioritiesSet") : t("donePrioritiesDefault")}</p></div>
          </div>
          <div className="onboarding-actions">
            {!onboardingComplete(workspace) && (
              <button className="text-link" type="button" disabled={busy} onClick={() => void goLater()}>{t("finishLaterAnyway")}</button>
            )}
            <Link className="secondary-button" href="/#zoek-adres"><Sparkles size={15} /> {t("searchAddress")}</Link>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void finishToCockpit()}>
              <Check size={15} /> {t("goToMyPurchase")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
