"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof PersonalPreferences)[];

export function OnboardingWizard({ suggestPasskey = false }: { suggestPasskey?: boolean }) {
  const router = useRouter();
  const {
    workspace,
    workspaceReady,
    workspaceError,
    authenticated,
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
    if (workspaceReady && !authenticated) window.location.assign("/login");
  }, [authenticated, workspaceReady]);

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
    await dismissOnboarding();
    setBusy(false);
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
    setMessage("Vul je inkomen in tot er een maximale hypotheek verschijnt.");
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
        <p className="onboarding-loading">Je onboarding wordt geladen…</p>
      </div>
    );
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-progress" role="navigation" aria-label="Onboardingstappen">
        {ONBOARDING_STEPS.map((id) => {
          const active = id === step;
          const done =
            (id === "mortgage" && (workspace.mortgageConfigured || mortgageReady)) ||
            (id === "wishes" && workspace.buyerProfileConfigured) ||
            (id === "priorities" && workspace.preferencesConfigured) ||
            (id === "done" && step === "done");
          return (
            <button
              key={id}
              type="button"
              className={`onboarding-step-pill${active ? " is-active" : ""}${done ? " is-done" : ""}`}
              onClick={() => {
                if (id === "mortgage") { setFormSyncedFor(null); setStep("mortgage"); }
                else if (id === "wishes" && (workspace.mortgageConfigured || mortgageReady)) { setFormSyncedFor(null); setStep("wishes"); }
                else if (id === "priorities" && workspace.buyerProfileConfigured) { setFormSyncedFor(null); setStep("priorities"); }
                else if (id === "done" && (onboardingComplete(workspace) || workspace.preferencesConfigured)) { setFormSyncedFor(null); setStep("done"); }
              }}
            >
              <span>{ONBOARDING_STEP_META[id].number}</span>
              {ONBOARDING_STEP_META[id].title}
            </button>
          );
        })}
      </div>

      <header className="onboarding-heading">
        <div className="eyebrow"><span className="eyebrow-dot" /> stap {meta.number} · {meta.title.toLowerCase()}</div>
        <h1>{step === "mortgage" ? "Wat kun je lenen?" : step === "wishes" ? "Wat moet je huis kunnen?" : step === "priorities" ? "Wat weegt het zwaarst?" : "Je profiel staat."}</h1>
        <p className="hero-copy">{meta.lead}</p>
      </header>

      {workspaceError && <p className="form-message" role="alert">{workspaceError}</p>}
      {message && <p className="form-message" role="alert">{message}</p>}

      {step === "mortgage" && (
        <section className="onboarding-panel onboarding-mortgage">
          <MortgageCalculator variant="onboarding" onCapacityChange={setMortgageReady} />
          <div className="onboarding-actions">
            <button className="text-link" type="button" disabled={busy} onClick={() => void goLater()}>Later — naar dashboard</button>
            <button className="primary-button" type="button" disabled={busy || !mortgageReady} onClick={() => void continueFromMortgage()}>
              Verder naar woonwensen <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {step === "wishes" && (
        <section className="onboarding-panel">
          {(workspace.mortgageConfigured || mortgageReady) && snapshot && (
            <div className="onboarding-koopkracht">
              <div><small>Max. koopsom</small><strong>{formatEuro(snapshot.maxPurchasePrice)}</strong></div>
              <div><small>Max. hypotheek</small><strong>{formatEuro(snapshot.maxLoanForPurchase)}</strong></div>
              <div><small>Eigen geld</small><strong>{formatEuro(snapshot.ownFunds)}</strong></div>
              <div><small>Maandlast</small><strong>{formatEuro(snapshot.monthlyPayment)}</strong></div>
            </div>
          )}
          <div className="profile-form onboarding-profile-form">
            <div className="form-grid">
              <label>Zoekgebied<input value={profile.searchArea} onChange={(event) => setProfile((current) => ({ ...current, searchArea: event.target.value }))} placeholder="Utrecht + 20 km" /></label>
              <label>Min. slaapkamers<input type="number" min="1" max="20" value={profile.bedrooms || ""} onChange={(event) => updateNumber("bedrooms", event.target.value)} /></label>
              <label>Max. reistijd (min)<input type="number" min="0" max="240" value={profile.maxCommuteMinutes || ""} onChange={(event) => updateNumber("maxCommuteMinutes", event.target.value)} /></label>
              <label>Leeftijd koper<input type="number" min="0" max="120" value={profile.buyerAge || ""} onChange={(event) => updateNumber("buyerAge", event.target.value)} /></label>
              <label>Huishouden<select value={profile.household} onChange={(event) => setProfile((current) => ({ ...current, household: event.target.value as HouseholdType, householdSpecified: true }))}>{Object.entries(HOUSEHOLD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label>Woningtype<select value={profile.propertyType} onChange={(event) => setProfile((current) => ({ ...current, propertyType: event.target.value as SoughtPropertyType }))}>{Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            </div>
            <div className="toggle-grid">
              <label><input type="checkbox" checked={profile.garden} onChange={(event) => setProfile((current) => ({ ...current, garden: event.target.checked }))} /> Tuin verplicht</label>
              <label><input type="checkbox" checked={profile.parking} onChange={(event) => setProfile((current) => ({ ...current, parking: event.target.checked }))} /> Eigen oprit</label>
              <label><input type="checkbox" checked={profile.remoteWork} onChange={(event) => setProfile((current) => ({ ...current, remoteWork: event.target.checked }))} /> Werkkamer belangrijk</label>
              <label><input type="checkbox" checked={profile.firstTimeBuyer} onChange={(event) => setProfile((current) => ({ ...current, firstTimeBuyer: event.target.checked }))} /> Starter</label>
              <label><input type="checkbox" checked={profile.selfOccupied} onChange={(event) => setProfile((current) => ({ ...current, selfOccupied: event.target.checked }))} /> Zelf bewonen</label>
              <label><input type="checkbox" checked={profile.acceptVve} onChange={(event) => setProfile((current) => ({ ...current, acceptVve: event.target.checked }))} /> Appartement / VvE oké</label>
            </div>
          </div>
          <div className="onboarding-actions">
            <button className="secondary-button" type="button" onClick={() => setStep("mortgage")}>Terug</button>
            <button className="text-link" type="button" disabled={busy} onClick={() => void goLater()}>Later</button>
            <button className="primary-button" type="button" disabled={busy || !profile.searchArea.trim() || profile.bedrooms <= 0 || profile.maxCommuteMinutes <= 0} onClick={() => void saveWishes()}>
              Bewaar woonwensen <ArrowRight size={15} />
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
            <button className="secondary-button" type="button" onClick={() => setStep("wishes")}>Terug</button>
            <button className="text-link" type="button" disabled={busy} onClick={() => setStep("done")}>Overslaan</button>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void savePriorities()}>
              Bewaar prioriteiten <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {step === "done" && (
        <section className="onboarding-panel onboarding-done">
          <div className="onboarding-done-grid">
            <div><Landmark size={18} /><h3>Koopkracht</h3><p>{workspace.mortgageConfigured && snapshot ? `Tot ${formatEuro(snapshot.maxPurchasePrice)}` : mortgageReady ? "Schets klaar — wordt opgeslagen." : "Nog open — vul later bij in Hypotheek."}</p></div>
            <div><Home size={18} /><h3>Woonwensen</h3><p>{workspace.buyerProfileConfigured ? `${workspace.buyerProfile.searchArea} · ${HOUSEHOLD_LABELS[workspace.buyerProfile.household]}` : "Nog open — vul bij in Mijn aankoop."}</p></div>
            <div><Settings2 size={18} /><h3>Prioriteiten</h3><p>{workspace.preferencesConfigured ? "Persoonlijke fit actief" : "Standaardgewichten — pas later aan."}</p></div>
          </div>
          <div className="onboarding-actions">
            {!onboardingComplete(workspace) && (
              <button className="text-link" type="button" disabled={busy} onClick={() => void goLater()}>Toch later afronden</button>
            )}
            <Link className="secondary-button" href="/#zoek-adres"><Sparkles size={15} /> Zoek een adres</Link>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void finishToCockpit()}>
              <Check size={15} /> Naar mijn aankoop
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
