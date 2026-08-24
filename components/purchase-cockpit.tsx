"use client";

import { ArrowRight, Check, CircleAlert, FileText, Hammer, Home, Landmark, MapPin, Pencil, PiggyBank, Plus, Puzzle, Search, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { Link } from "@/src/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { ListingHistory } from "@/components/listing-history";
import { PasskeySettings } from "@/components/passkey-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page-shell";
import { computePropertyAffordability, energyLabelFromAnalysis, fitLabel, fitSortRank } from "@/src/lib/affordability";
import { calculatePersonalFit } from "@/src/lib/personalization";
import { CASE_STAGE_LABELS, nextPurchaseAction, normalizeCaseStage } from "@/src/lib/journey";
import { EMPTY_BUYER_PROFILE, HOUSEHOLD_LABELS, PROPERTY_STAGE_LABELS, PROPERTY_STAGE_ORDER, PROPERTY_TYPE_LABELS, formatEuro, profileCompletion, type BuyerProfile, type HouseholdType, type PropertyStage, type SoughtPropertyType } from "@/src/lib/purchase";
import type { Analysis } from "@/src/lib/types";
import { formatScore } from "@/src/lib/math";

type CaseSummary = { id: string; title: string; stage: string; status: string; updated_at: string; bagVboId?: string | null };
type AccountInfo = { email: string; emailConfirmed: boolean; suggestPasskey?: boolean };

const PIPELINE_GROUPS: { key: string; stages: PropertyStage[] }[] = [
  { key: "saved", stages: ["saved", "research"] },
  { key: "viewing", stages: ["viewing", "visited"] },
  { key: "offer", stages: ["offer", "offered", "negotiation", "accepted"] },
  { key: "bought", stages: ["bought"] },
];

function caseStageLabel(stage: string) {
  return CASE_STAGE_LABELS[normalizeCaseStage(stage)];
}

export function PurchaseCockpit({
  initialCases = [],
  focusCase,
  account = null,
}: {
  initialCases?: CaseSummary[];
  focusCase?: string;
  account?: AccountInfo | null;
}) {
  const t = useTranslations("mijn-aankoop");
  const { workspace, workspaceReady, workspaceError, authStatus, setBuyerProfile, setPropertyStage, setListingPrice, toggleCompare, saveHistoryItem, removeListingHistory } = usePropertyWorkspace();
  const [profile, setProfile] = useState<BuyerProfile>(EMPTY_BUYER_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);

  useEffect(() => {
    if (!editingProfile) setProfile(workspace.buyerProfileConfigured ? workspace.buyerProfile : EMPTY_BUYER_PROFILE);
  }, [editingProfile, workspace.buyerProfile, workspace.buyerProfileConfigured]);

  // Keep a stable identity for the saved list while only the id-set matters,
  // so the analysis fetch effect below does not re-run after unrelated
  // workspace updates (e.g. preference changes) that rebuild the array.
  const savedKey = workspace.saved.map((saved) => saved.bagVboId).join("|");
  const [savedHomes, setSavedHomes] = useState(workspace.saved);
  useEffect(() => {
    setSavedHomes((current) => (
      current.map((item) => item.bagVboId).join("|") === savedKey ? current : workspace.saved
    ));
  }, [savedKey, workspace.saved]);
  useEffect(() => {
    if (!savedHomes.length) {
      setAnalyses({});
      return;
    }
    let active = true;
    setLoadingAnalyses(true);
    Promise.all(savedHomes.slice(0, 8).map(async (saved) => {
      try {
        const response = await fetch(`/api/analysis/${encodeURIComponent(saved.bagVboId)}`);
        return response.ok ? [saved.bagVboId, await response.json() as Analysis] as const : null;
      } catch { return null; }
    })).then((items) => {
      if (!active) return;
      setAnalyses(Object.fromEntries(items.filter((item): item is readonly [string, Analysis] => Boolean(item))));
    }).finally(() => { if (active) setLoadingAnalyses(false); });
    return () => { active = false; };
  }, [savedHomes]);

  const profileConfigured = workspaceReady && workspace.buyerProfileConfigured;
  const mortgageConfigured = workspaceReady && workspace.mortgageConfigured;
  const actionableWorkspaceError = workspaceError.startsWith("Je vergelijking") ? workspaceError : "";
  const snapshot = workspace.mortgageSnapshot;
  const completion = profileConfigured ? profileCompletion(profile) : 0;
  const activeHomes = useMemo(() => savedHomes.filter((item) => workspace.propertyStages[item.bagVboId] !== "dropped"), [savedHomes, workspace.propertyStages]);
  const activeCase = initialCases.find((item) => item.status === "active") ?? initialCases[0];

  const affordabilityByHome = useMemo(() => {
    const map: Record<string, ReturnType<typeof computePropertyAffordability>> = {};
    for (const home of activeHomes) {
      const askingPrice = workspace.askingPrices[home.bagVboId] ?? home.askingPrice ?? null;
      map[home.bagVboId] = computePropertyAffordability({
        state: workspace.mortgageState,
        askingPrice,
        energyLabel: energyLabelFromAnalysis(analyses[home.bagVboId]),
        nhg: workspace.mortgageState?.nhg ?? profile.nhg,
      });
    }
    return map;
  }, [activeHomes, analyses, profile.nhg, workspace.askingPrices, workspace.mortgageState]);

  const sortedHomes = useMemo(() => {
    return [...activeHomes].sort((a, b) => {
      const left = affordabilityByHome[a.bagVboId];
      const right = affordabilityByHome[b.bagVboId];
      const rank = fitSortRank(left?.fit ?? "unknown") - fitSortRank(right?.fit ?? "unknown");
      if (rank !== 0) return rank;
      return (b.askingPrice ?? 0) - (a.askingPrice ?? 0);
    });
  }, [activeHomes, affordabilityByHome]);

  const pipelineCounts = useMemo(() => {
    return PIPELINE_GROUPS.map((group) => ({
      ...group,
      count: activeHomes.filter((home) => group.stages.includes(workspace.propertyStages[home.bagVboId] ?? "saved")).length,
    }));
  }, [activeHomes, workspace.propertyStages]);

  const nextAction = useMemo(() => {
    if (!workspaceReady) return { title: t("loadingActionTitle"), text: t("loadingActionText"), href: "#woonprofiel", urgency: "normal" as const };
    if (!mortgageConfigured) {
      return { title: t("budgetActionTitle"), text: t("budgetActionText"), href: "/hypotheek", urgency: "high" as const };
    }
    const missingPrice = activeHomes.find((home) => !(workspace.askingPrices[home.bagVboId] ?? home.askingPrice));
    if (missingPrice && activeHomes.length > 0) {
      return { title: t("priceActionTitle"), text: t("priceActionText", { home: missingPrice.addressLabel.split(",")[0] }), href: "#mijn-woningen", urgency: "normal" as const };
    }
    const focus = activeHomes.find((home) => home.bagVboId === activeCase?.bagVboId) ?? activeHomes[0];
    return nextPurchaseAction({
      profileConfigured,
      workspaceError: actionableWorkspaceError || undefined,
      savedCount: activeHomes.length,
      propertyStage: focus ? workspace.propertyStages[focus.bagVboId] : undefined,
      bagVboId: focus?.bagVboId ?? activeCase?.bagVboId ?? undefined,
      caseId: activeCase?.id,
      caseStage: activeCase ? normalizeCaseStage(activeCase.stage) : undefined,
    });
  }, [actionableWorkspaceError, activeCase, activeHomes, mortgageConfigured, profileConfigured, t, workspace.askingPrices, workspace.propertyStages, workspaceReady]);

  async function saveProfile() {
    const result = await setBuyerProfile(profile);
    if (result.ok) setEditingProfile(false);
  }

  function updateNumber(key: "budget" | "monthlyPayment" | "ownFunds" | "bedrooms" | "maxCommuteMinutes" | "buyerAge", value: string) {
    setProfile((current) => ({ ...current, [key]: Number(value) || 0 }));
  }

  const hasHomes = workspace.saved.length > 0;
  const hasHistory = workspace.listingHistory.length > 0;
  const firstRun = !hasHomes && !hasHistory && initialCases.length === 0 && !mortgageConfigured;

  return <PageShell current="aankoop" containerClassName="purchase-cockpit">
    <div className="cockpit-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {t("eyebrow")}</div><h1>{firstRun ? t("firstRunTitle") : t("dashboardTitle")}</h1><p className="hero-copy">{firstRun ? t("firstRunCopy") : t("dashboardCopy")}</p></div>{!firstRun && <Link className="primary-button" href="/#zoek-adres"><Plus size={15} /> {t("addHome")}</Link>}</div>

    {focusCase && <Notice><Check size={15} /> {t("caseStartedNotice")}</Notice>}
    {actionableWorkspaceError && <Notice tone="warning" role="alert"><CircleAlert size={15} /> {actionableWorkspaceError} {authStatus === "anonymous" && <Link href="/login">{t("signInLink")}</Link>}</Notice>}

    {firstRun ? (
      <section className="cockpit-first-run" aria-label={t("addFirstHomeAria")}>
        <EmptyState
          icon={<Home size={20} />}
          title={t("noHomesYetTitle")}
          text={t("noHomesYetText")}
          action={<span className="listing-history-empty-actions"><Link className="secondary-button" href="/hypotheek"><Landmark size={14} /> {t("calculateMortgage")}</Link><Link className="secondary-button" href="/extensie"><Puzzle size={14} /> {t("fundaExtension")}</Link></span>}
        />
        <AddressSearch submitLabel={t("checkAddress")} />
      </section>
    ) : (
      <>
        <section className="buying-power-hero" aria-label={t("buyingPowerAria")}>
          <div className="buying-power-copy">
            <div className="section-kicker">{t("buyingPowerKicker")}</div>
            <h2>{mortgageConfigured ? t("whatCanYouPay") : t("noMortgageSketch")}</h2>
            <p>{mortgageConfigured
              ? t("buyingPowerCopyConfigured")
              : t("buyingPowerCopyEmpty")}</p>
            <Link className="secondary-button" href="/hypotheek"><Landmark size={14} /> {mortgageConfigured ? t("updateMortgage") : t("calculateMortgage")}</Link>
          </div>
          <div className="buying-power-stats">
            <div><span><WalletCards size={14} /> {t("maxPurchasePrice")}</span><strong>{mortgageConfigured && snapshot ? formatEuro(snapshot.maxPurchasePrice) : profileConfigured ? formatEuro(profile.budget) : "—"}</strong><small>{mortgageConfigured ? t("maxPurchaseSourceMortgage") : t("maxPurchaseSourceProfile")}</small></div>
            <div><span><Landmark size={14} /> {t("maxMortgage")}</span><strong>{mortgageConfigured && snapshot ? formatEuro(snapshot.maxLoanForPurchase) : "—"}</strong><small>{mortgageConfigured ? t("maxMortgageForPurchase") : t("maxMortgageAfterCalculator")}</small></div>
            <div><span><PiggyBank size={14} /> {t("ownFunds")}</span><strong>{mortgageConfigured && snapshot ? formatEuro(snapshot.ownFunds) : profileConfigured ? formatEuro(profile.ownFunds) : "—"}</strong><small>{t("ownFundsDetail")}</small></div>
            <div><span><Home size={14} /> {t("monthlyPayment")}</span><strong>{mortgageConfigured && snapshot ? formatEuro(snapshot.monthlyPayment) : profileConfigured ? formatEuro(profile.monthlyPayment) : "—"}</strong><small>{snapshot?.nhg ? t("withNhg") : t("grossIndication")}</small></div>
          </div>
        </section>

        {activeHomes.length > 0 && (
          <section className="pipeline-strip" aria-label={t("pipelineAria")}>
            {pipelineCounts.map((group) => (
              <div key={group.key} className="pipeline-item">
                <strong>{group.count}</strong>
                <span>{t(`pipeline.${group.key}`)}</span>
              </div>
            ))}
            <div className="pipeline-item pipeline-next">
              <strong className="stat-action">{nextAction.title}</strong>
              <span>{t("nextStepLabel")}</span>
            </div>
          </section>
        )}

        <div className="cockpit-grid">
          <section className="cockpit-card profile-card" id="woonprofiel">
            <div className="card-heading"><div><div className="section-kicker">{t("profileCardKicker")}</div><h2>{t("profileCardTitle")}</h2><p>{mortgageConfigured ? t("profileCardCopyConfigured") : t("profileCardCopyEmpty")}</p></div><button className="icon-button" type="button" onClick={() => setEditingProfile((value) => !value)} aria-label={t("editProfileAria")}><Pencil size={15} /></button></div>
            {editingProfile ? <ProfileForm profile={profile} setProfile={setProfile} updateNumber={updateNumber} onSave={saveProfile} mortgageLocked={mortgageConfigured} /> : <ProfileSummary profile={profile} completion={completion} configured={profileConfigured} mortgageConfigured={mortgageConfigured} onEdit={() => setEditingProfile(true)} />}
          </section>
          <section className="cockpit-card next-action-card"><div className="section-kicker">{t("nextStepKicker")}</div><h2>{nextAction.title}</h2><p>{nextAction.text}</p><Link className="primary-button" href={nextAction.href as never}>{t("openStep")} <ArrowRight size={15} /></Link><div className="action-note"><ShieldCheck size={14} /> {t("disclaimerShort")}</div></section>
        </div>

        <section className="cockpit-section" id="funda-geschiedenis">
          <ListingHistory
            workspace={workspace}
            workspaceReady={workspaceReady}
            authStatus={authStatus}
            toggleCompare={toggleCompare}
            saveHistoryItem={saveHistoryItem}
            removeListingHistory={removeListingHistory}
          />
        </section>

        <section className="cockpit-section" id="mijn-woningen"><div className="section-inline-heading"><div><div className="eyebrow"><Home size={13} /> {t("homesEyebrow")}</div><h2>{t("homeBoardTitle")}</h2><p>{t("homeBoardCopy")}</p></div><Link className="secondary-button" href="/#zoek-adres"><Search size={14} /> {t("searchAddress")}</Link></div>
          {!hasHomes ? (
            <EmptyState
              icon={<Home size={20} />}
              title={t("noSavedHomesTitle")}
              text={t("noSavedHomesText")}
              action={<Link className="primary-button" href="/#zoek-adres">{t("checkFirstAddress")} <ArrowRight size={14} /></Link>}
            />
          ) : (
            <div className="home-board">{sortedHomes.map((saved) => {
              const linkedCase = initialCases.find((item) => item.bagVboId === saved.bagVboId);
              return <HomeBoardCard
                key={saved.bagVboId}
                saved={saved}
                analysis={analyses[saved.bagVboId]}
                preferences={workspace.preferences}
                stage={workspace.propertyStages[saved.bagVboId] ?? "saved"}
                caseId={linkedCase?.id}
                askingPrice={workspace.askingPrices[saved.bagVboId] ?? saved.askingPrice ?? null}
                affordability={affordabilityByHome[saved.bagVboId]}
                mortgageConfigured={mortgageConfigured}
                onStageChange={(stage) => setPropertyStage(saved.bagVboId, stage)}
                onAskingPrice={(price) => setListingPrice(saved.bagVboId, price)}
                loading={loadingAnalyses && !analyses[saved.bagVboId]}
              />;
            })}</div>
          )}
        </section>

        {initialCases.length > 0 && <section className="cockpit-section"><div className="section-inline-heading"><div><div className="eyebrow"><FileText size={13} /> {t("dossierEyebrow")}</div><h2>{t("activeDossiersTitle")}</h2><p>{t("activeDossiersCopy")}</p></div></div><div className="case-mini-grid">{initialCases.map((purchaseCase) => <Link className="case-mini-card" href={`/mijn-aankoop/${purchaseCase.id}`} key={purchaseCase.id}><span className="case-card-step">{caseStageLabel(purchaseCase.stage)}</span><strong>{purchaseCase.title}</strong><span>{t("openDossier")} <ArrowRight size={13} /></span></Link>)}</div></section>}

        <section className="cockpit-section modules-section"><div className="section-inline-heading"><div><div className="eyebrow"><Sparkles size={13} /> {t("modulesEyebrow")}</div><h2>{t("modulesTitle")}</h2></div></div><div className="module-grid"><Module icon={<Search size={17} />} number="01" title={t("moduleCheckTitle")} text={t("moduleCheckText")} href={activeHomes[0] ? `/woning/${activeHomes[0].bagVboId}` : "/#zoek-adres"} /><Module icon={<FileText size={17} />} number="02" title={t("moduleDocumentsTitle")} text={activeCase ? t("moduleDocumentsTextActive") : activeHomes[0] ? t("moduleDocumentsTextCase") : t("moduleDocumentsTextEmpty")} href={activeCase ? `/mijn-aankoop/${activeCase.id}#documenten` : activeHomes[0] ? `/woning/${activeHomes[0].bagVboId}` : "/#zoek-adres"} linkLabel={activeCase ? t("openDossier") : activeHomes[0] ? t("openPropertyCheck") : t("findAddressModule")} /><Module icon={<WalletCards size={17} />} number="03" title={t("moduleValueTitle")} text={t("moduleValueText")} href={activeCase ? `/mijn-aankoop/${activeCase.id}#waarde-bod` : activeHomes[0] ? `/woning/${activeHomes[0].bagVboId}#bodconcept` : "/#zoek-adres"} /><Module icon={<Landmark size={17} />} number="04" title={t("moduleMortgageTitle")} text={t("moduleMortgageText")} href="/hypotheek" /><Module icon={<Puzzle size={17} />} number="05" title={t("moduleExtensionTitle")} text={t("moduleExtensionText")} href="/extensie" /></div></section>
      </>
    )}

    {account && (
      <section className="cockpit-section account-section" id="account" aria-label={t("accountAria")}>
        <div className="section-inline-heading"><div><div className="eyebrow"><ShieldCheck size={13} /> {t("accountEyebrow")}</div><h2>{t("accountTitle")}</h2><p>{t("accountCopy")}</p></div><SignOutButton /></div>
        <div className="account-panel">
          <div className="account-email"><small>{t("emailLabel")}</small><strong>{account.email}</strong></div>
          <PasskeySettings email={account.email} emailConfirmed={account.emailConfirmed} suggestEnrollment={account.suggestPasskey} />
        </div>
      </section>
    )}
  </PageShell>;
}

function ProfileSummary({ profile, completion, configured, mortgageConfigured, onEdit }: { profile: BuyerProfile; completion: number; configured: boolean; mortgageConfigured: boolean; onEdit: () => void }) {
  const t = useTranslations("mijn-aankoop");
  return <div className="profile-summary"><div className="completion-row"><span>{configured ? t("profileComplete", { percent: completion }) : t("profileIncomplete")}</span><button className="text-link" type="button" onClick={onEdit}>{configured ? t("edit") : t("fillIn")}</button></div><div className="completion-track"><i style={{ width: `${completion}%` }} /></div><div className="profile-summary-grid"><div><small>{t("searchAreaLabel")}</small><strong>{configured ? profile.searchArea || t("toBeFilled") : t("toBeFilled")}</strong></div><div><small>{t("maxMonthlyLabel")}</small><strong>{configured ? formatEuro(profile.monthlyPayment) : t("toBeFilled")}</strong></div><div><small>{t("householdLabel")}</small><strong>{configured ? HOUSEHOLD_LABELS[profile.household] : t("toBeFilled")}</strong></div><div><small>{t("mustHavesLabel")}</small><strong>{configured ? [profile.garden && t("mustGarden"), profile.parking && t("mustParking"), profile.firstTimeBuyer && t("mustFirstTimeBuyer"), profile.nhg && t("mustNhg")].filter(Boolean).join(" · ") || t("toBeChosen") : t("toBeChosen")}</strong></div></div>{mortgageConfigured && <p className="profile-mortgage-note">{t("profileMortgageNote")} <Link href="/hypotheek">{t("profileMortgageNoteLink")}</Link>.</p>}</div>;
}

function ProfileForm({ profile, setProfile, updateNumber, onSave, mortgageLocked }: { profile: BuyerProfile; setProfile: React.Dispatch<React.SetStateAction<BuyerProfile>>; updateNumber: (key: "budget" | "monthlyPayment" | "ownFunds" | "bedrooms" | "maxCommuteMinutes" | "buyerAge", value: string) => void; onSave: () => void; mortgageLocked: boolean }) {
  const t = useTranslations("mijn-aankoop");
  return <div className="profile-form"><div className="form-grid"><label>{t("budgetLabel")}{mortgageLocked ? <input inputMode="numeric" type="number" value={profile.budget || ""} disabled readOnly /> : <input type="number" min="0" step="5000" value={profile.budget || ""} onChange={(event) => updateNumber("budget", event.target.value)} />}</label><label>{t("maxMonthlyFieldLabel")}{mortgageLocked ? <input inputMode="numeric" type="number" value={profile.monthlyPayment || ""} disabled readOnly /> : <input type="number" min="0" step="50" value={profile.monthlyPayment || ""} onChange={(event) => updateNumber("monthlyPayment", event.target.value)} />}</label><label>{t("ownFundsLabel")}{mortgageLocked ? <input inputMode="numeric" type="number" value={profile.ownFunds || ""} disabled readOnly /> : <input type="number" min="0" step="5000" value={profile.ownFunds || ""} onChange={(event) => updateNumber("ownFunds", event.target.value)} />}</label><label>{t("searchAreaLabel")}<input value={profile.searchArea} onChange={(event) => setProfile((current) => ({ ...current, searchArea: event.target.value }))} placeholder="Utrecht + 20 km" /></label><label>{t("minBedroomsLabel")}<input type="number" inputMode="numeric" min="1" max="20" value={profile.bedrooms || ""} onChange={(event) => updateNumber("bedrooms", event.target.value)} /></label><label>{t("maxCommuteLabel")}<input type="number" inputMode="numeric" min="0" max="240" value={profile.maxCommuteMinutes || ""} onChange={(event) => updateNumber("maxCommuteMinutes", event.target.value)} /></label><label>{t("buyerAgeLabel")}<input type="number" inputMode="numeric" min="0" max="120" value={profile.buyerAge || ""} onChange={(event) => updateNumber("buyerAge", event.target.value)} /></label><label>{t("householdLabel")}<select value={profile.household} onChange={(event) => setProfile((current) => ({ ...current, household: event.target.value as HouseholdType, householdSpecified: true }))}>{Object.entries(HOUSEHOLD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>{t("propertyTypeLabel")}<select value={profile.propertyType} onChange={(event) => setProfile((current) => ({ ...current, propertyType: event.target.value as SoughtPropertyType }))}>{Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>{mortgageLocked && <p className="profile-mortgage-note">{t("budgetLocked")} <Link href="/hypotheek">{t("budgetLockedLink")}</Link>.</p>}<div className="toggle-grid"><label><input type="checkbox" checked={profile.garden} onChange={(event) => setProfile((current) => ({ ...current, garden: event.target.checked }))} /> {t("toggleGarden")}</label><label><input type="checkbox" checked={profile.parking} onChange={(event) => setProfile((current) => ({ ...current, parking: event.target.checked }))} /> {t("toggleParking")}</label><label><input type="checkbox" checked={profile.remoteWork} onChange={(event) => setProfile((current) => ({ ...current, remoteWork: event.target.checked }))} /> {t("toggleRemoteWork")}</label><label><input type="checkbox" checked={profile.firstTimeBuyer} onChange={(event) => setProfile((current) => ({ ...current, firstTimeBuyer: event.target.checked }))} /> {t("toggleStarter")}</label><label><input type="checkbox" checked={profile.selfOccupied} onChange={(event) => setProfile((current) => ({ ...current, selfOccupied: event.target.checked }))} /> {t("toggleSelfOccupied")}</label><label><input type="checkbox" checked={profile.priorExemptionUsed} onChange={(event) => setProfile((current) => ({ ...current, priorExemptionUsed: event.target.checked }))} /> {t("togglePriorExemption")}</label><label><input type="checkbox" checked={profile.nhg} onChange={(event) => setProfile((current) => ({ ...current, nhg: event.target.checked }))} disabled={mortgageLocked} /> {t("toggleNhg")}</label><label><input type="checkbox" checked={profile.acceptVve} onChange={(event) => setProfile((current) => ({ ...current, acceptVve: event.target.checked }))} /> {t("toggleVve")}</label></div><div className="form-actions"><button className="secondary-button" type="button" onClick={onSave}>{t("saveProfile")}</button></div></div>;
}

function HomeBoardCard({
  saved,
  analysis,
  preferences,
  stage,
  caseId,
  askingPrice,
  affordability,
  mortgageConfigured,
  onStageChange,
  onAskingPrice,
  loading,
}: {
  saved: { bagVboId: string; addressLabel: string; city: string; postcode: string };
  analysis?: Analysis;
  preferences: Parameters<typeof calculatePersonalFit>[1];
  stage: PropertyStage;
  caseId?: string;
  askingPrice: number | null;
  affordability?: ReturnType<typeof computePropertyAffordability>;
  mortgageConfigured: boolean;
  onStageChange: (stage: PropertyStage) => void;
  onAskingPrice: (price: number) => void;
  loading: boolean;
}) {
  const t = useTranslations("mijn-aankoop");
  const personalFit = analysis ? calculatePersonalFit(analysis, preferences) : null;
  const attention = analysis?.highlights?.find((item) => item.type === "attention")?.text;
  const [priceDraft, setPriceDraft] = useState(askingPrice ? String(askingPrice) : "");
  useEffect(() => { setPriceDraft(askingPrice ? String(askingPrice) : ""); }, [askingPrice]);
  const fit = affordability?.fit ?? "unknown";

  return <article className={`home-board-card fit-${fit}`}>
    <div className="home-card-top">
      <div className="home-card-address"><span className="home-card-icon"><MapPin size={15} /></span><div><h3>{saved.addressLabel.split(",")[0]}</h3><span>{saved.postcode} {saved.city}</span></div></div>
      <span className="match-pill">{loading ? "…" : personalFit != null ? t("matchPill", { score: formatScore(personalFit) }) : analysis ? t("scorePill", { score: formatScore(analysis.overallScore) }) : t("researchPill")}</span>
    </div>
    <div className="home-card-money">
      <label>
        {t("askingPriceLabel")}
        <input
          type="number" inputMode="numeric"
          min="0"
          step="1000"
          value={priceDraft}
          placeholder={t("toBeFilled")}
          onChange={(event) => setPriceDraft(event.target.value)}
          onBlur={() => {
            const value = Number(priceDraft);
            if (Number.isFinite(value) && value >= 0 && value !== (askingPrice ?? 0)) void onAskingPrice(value);
          }}
        />
      </label>
      {mortgageConfigured && affordability?.available ? (
        <div className={`fit-badge fit-${fit}`}>{fitLabel(fit)}</div>
      ) : (
        <div className="fit-badge fit-unknown">{mortgageConfigured ? t("badgePriceMissing") : t("badgeMortgageMissing")}</div>
      )}
    </div>
    {mortgageConfigured && affordability?.available && (
      <div className="home-card-afford">
        <p>{affordability.summary}</p>
        {affordability.renovationBuffer > 0 && (
          <div className="renovation-chip"><Hammer size={13} /> {t("renovationLeft", { amount: formatEuro(affordability.renovationBuffer) })}</div>
        )}
        {affordability.energyMeasureExtra > 0 && affordability.fit !== "over" && (
          <div className="renovation-chip muted">{t("sustainabilityExtra", { amount: formatEuro(affordability.energyMeasureExtra) })}</div>
        )}
      </div>
    )}
    <div className="home-card-meta">{analysis?.property.areaM2 ? <span>{analysis.property.areaM2} m²</span> : <span>{t("loadingArea")}</span>}{analysis?.property.buildingYear ? <span>{t("buildingYear", { year: analysis.property.buildingYear })}</span> : null}{askingPrice ? <span>{formatEuro(askingPrice)}</span> : null}</div>
    {attention && <div className="home-card-alert"><CircleAlert size={13} /> {attention}</div>}
    <div className="home-card-footer"><select aria-label={t("stageStatusAria", { address: saved.addressLabel })} value={stage} onChange={(event) => onStageChange(event.target.value as PropertyStage)}>{PROPERTY_STAGE_ORDER.map((option) => <option value={option} key={option}>{PROPERTY_STAGE_LABELS[option]}</option>)}</select><Link className="text-link" href={caseId ? `/mijn-aankoop/${caseId}` : `/woning/${saved.bagVboId}`}>{caseId ? t("openDossier") : t("openPropertyCheck")} <ArrowRight size={13} /></Link></div>
  </article>;
}

function Module({ icon, number, title, text, href, linkLabel }: { icon: React.ReactNode; number: string; title: string; text: string; href: string; linkLabel?: string }) {
  const t = useTranslations("mijn-aankoop");
  return <Link className="module-card" href={href as never}><span className="module-number">{number}</span><span className="module-icon">{icon}</span><h3>{title}</h3><p>{text}</p><span className="module-link">{linkLabel ?? t("defaultModuleLink")} <ArrowRight size={13} /></span></Link>;
}
