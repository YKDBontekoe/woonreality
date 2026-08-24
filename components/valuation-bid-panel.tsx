"use client";

import { AlertTriangle, Check, Calculator, FileText, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import { Link } from "@/src/lib/i18n/navigation";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { buildBidStrategy, negotiationGuidance, type BidScenarioKey } from "@/src/lib/bid-strategy";
import { estimateBuyerCosts } from "@/src/lib/costs";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { formatEuro } from "@/src/lib/purchase";
import type { Analysis, PropertyListing } from "@/src/lib/types";
import { formatScore } from "@/src/lib/math";

export function ValuationBidPanel({ bagId, analysis, listing, caseId }: { bagId: string; analysis: Analysis; listing: PropertyListing | null; caseId?: string | null }) {
  const t = useTranslations("woning");
  const { authStatus, workspace, refresh } = usePropertyWorkspace();
  const [askingPrice, setAskingPrice] = useState(listing?.askingPrice ?? 0);
  const [selected, setSelected] = useState<BidScenarioKey>("balanced");
  const [userEditedAskingPrice, setUserEditedAskingPrice] = useState(false);
  const userEditedAskingPriceRef = useRef(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setAskingPrice(0);
    setUserEditedAskingPrice(false);
    userEditedAskingPriceRef.current = false;
    let cancelled = false;
    async function load() {
      try {
        // Only the bid draft needs fetching here; the captured listing facts
        // arrive via props so this panel doesn't refetch /api/listing/user.
        const [draftResponse] = await Promise.all([
          fetch(`/api/property/${encodeURIComponent(bagId)}/bid-draft`, { cache: "no-store" }),
        ]);
        let draftAsking: number | null = null;
        let draftScenario: BidScenarioKey | undefined;
        let sessionAsking: number | undefined;
        if (draftResponse.status !== 401) {
          const body = await draftResponse.json() as { draft?: { asking_price: number | null; selected_scenario: BidScenarioKey }; error?: string };
          if (!draftResponse.ok) throw new Error(body.error ?? t("bid.loadFailed"));
          if (body.draft?.asking_price != null) draftAsking = body.draft.asking_price;
          if (body.draft?.selected_scenario) draftScenario = body.draft.selected_scenario;
        }
        if (!userEditedAskingPriceRef.current) {
          try {
            const raw = sessionStorage.getItem(listingStorageKey(bagId));
            const sessionDraft = raw ? JSON.parse(raw) as UserListingDraft : null;
            sessionAsking = sessionDraft?.askingPrice;
          } catch { /* ignore */ }
        }
        if (!cancelled) {
          const resolved = draftAsking ?? sessionAsking;
          if (resolved != null) setAskingPrice(resolved);
          if (draftScenario) setSelected(draftScenario);
        }
      } catch (error) {
        if (!cancelled) setSaveError(error instanceof Error ? error.message : t("bid.loadFailed"));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [bagId, t]);

  useEffect(() => {
    if (!userEditedAskingPrice && listing?.askingPrice != null && !askingPrice) setAskingPrice(listing.askingPrice);
  }, [askingPrice, listing?.askingPrice, userEditedAskingPrice]);

  const strategy = useMemo(() => buildBidStrategy(askingPrice, analysis, workspace.buyerProfileConfigured ? workspace.buyerProfile : null), [askingPrice, analysis, workspace.buyerProfile, workspace.buyerProfileConfigured]);
  // Zonder een expliciete financiering neemt estimateBuyerCosts standaard een
  // hypotheek gelijk aan de volledige koopsom. Klopt dat niet met wat het
  // profiel aankan, dan onderschat dat hoeveel eigen geld iemand nodig heeft.
  const financingAmount = useMemo(() => {
    const purchasePrice = strategy?.scenarios[selected].amount ?? askingPrice;
    if (!workspace.buyerProfileConfigured || purchasePrice <= 0) return undefined;
    const { budget, ownFunds } = workspace.buyerProfile;
    if (ownFunds >= purchasePrice) return 0;
    if (budget <= 0) return undefined;
    const estimatedMaxLoan = Math.max(0, budget - ownFunds);
    return Math.min(purchasePrice, estimatedMaxLoan);
  }, [askingPrice, selected, strategy, workspace.buyerProfile, workspace.buyerProfileConfigured]);
  const purchasePriceForCosts = strategy?.scenarios[selected].amount ?? askingPrice;
  const costs = useMemo(() => estimateBuyerCosts(purchasePriceForCosts, workspace.buyerProfile, financingAmount), [purchasePriceForCosts, workspace.buyerProfile, financingAmount]);
  const negotiation = useMemo(() => negotiationGuidance(strategy, selected, workspace.buyerProfileConfigured ? workspace.buyerProfile.budget : undefined), [strategy, selected, workspace.buyerProfile.budget, workspace.buyerProfileConfigured]);
  const bid = strategy?.scenarios[selected].amount ?? 0;
  const overMaximum = workspace.buyerProfileConfigured && workspace.buyerProfile.budget > 0 && bid > workspace.buyerProfile.budget;

  async function saveDraft() {
    if (saving) return;
    setSaving(true);
    try {
      // One write: the bid-draft API derives and syncs the dossier workflow
      // server-side, so the two can never drift apart.
      const response = await fetch(`/api/property/${encodeURIComponent(bagId)}/bid-draft`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ askingPrice, selected }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? t("bid.saveFailed"));
      // The server derived the dossier workflow (and possibly a stage change);
      // pull that into the shared workspace store so other panels follow.
      await refresh();
      setSaveError(""); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("bid.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return <section className="valuation-section" id="bodconcept"><div className="section-inline-heading"><div><div className="eyebrow"><Calculator size={13} /> {t("bid.eyebrow")}</div><h2>{t("bid.heading")}</h2><p>{t("bid.intro")}</p></div><span className="coverage-pill"><ShieldCheck size={12} /> {t("bid.noAppraisal")}</span></div><div className="valuation-grid"><div className="valuation-card"><div className="valuation-card-head"><span className="section-kicker">{t("bid.whatWeKnow")}</span><Scale size={17} /></div><div className="valuation-range">{askingPrice ? formatEuro(askingPrice) : t("bid.enterAskingPrice")}</div><p>{strategy?.valuationNote ?? t("bid.noAskingPriceNote")}</p><div className="valuation-facts"><span>{t("bid.openDataScore")} <strong>{formatScore(analysis.overallScore)} / 10</strong></span><span>{t("bid.profileMax")} <strong>{workspace.buyerProfileConfigured ? formatEuro(workspace.buyerProfile.budget) : t("bid.setProfile")}</strong></span>{costs && <span>{t("bid.buyerCostsIndication")} <strong>{formatEuro(costs.total)}</strong></span>}{costs && <span>{t("bid.ownFundsIndication")} <strong>{formatEuro(costs.ownFundsNeeded)}</strong></span>}<span>{t("bid.risk")} <strong>{strategy?.riskSummary ?? t("bid.unknown")}</strong></span></div>{costs && costs.financingGap != null && costs.financingGap > 0 && <p className="warning-note"><AlertTriangle size={13} /> {t("bid.financingGapWarning", { gap: formatEuro(costs.financingGap!) })}</p>}</div><div className="bid-card"><div className="section-kicker">{t("bid.prepareBid")}</div><label className="price-input-label">{t("bid.askingPriceLabel")}<input type="number" inputMode="numeric" min="0" step="500" value={askingPrice || ""} onChange={(event) => { userEditedAskingPriceRef.current = true; setUserEditedAskingPrice(true); setAskingPrice(Number(event.target.value) || 0); }} placeholder={t("bid.askingPricePlaceholder")} /></label>{strategy ? <div className="bid-options">{(["cautious", "balanced", "strong"] as const).map((key) => <button type="button" className={selected === key ? "bid-option selected" : "bid-option"} key={key} onClick={() => setSelected(key)}><span>{strategy.scenarios[key].label}{strategy.recommended === key ? t("bid.recommendedSuffix") : ""}</span><strong>{formatEuro(strategy.scenarios[key].amount)}</strong><small>{strategy.scenarios[key].financingCondition && strategy.scenarios[key].inspectionCondition ? t("bid.bothConditions") : strategy.scenarios[key].financingCondition ? t("bid.financingOnly") : t("bid.littleProtection")}</small></button>)}</div> : <p className="muted-copy">{t("bid.enterPriceForScenarios")}</p>}{strategy && <ul className="bid-reasons">{strategy.scenarios[selected].reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}{strategy && <details className="negotiation-details"><summary>{t("bid.counterOfferSummary")}</summary><div className="negotiation-guidance"><ul>{negotiation.counterOfferSteps.map((step) => <li key={step}>{step}</li>)}</ul><div className="escalation-clause"><strong>{negotiation.escalationClause.title}</strong><p>{negotiation.escalationClause.summary}</p><p><em>{t("bid.when")}</em> {negotiation.escalationClause.whenToUse}</p><p><em>{t("bid.caution")}</em> {negotiation.escalationClause.caution}</p></div><p className="workflow-muted">{negotiation.walkAwayReminder}</p></div></details>}{strategy && <div className={`bid-result ${overMaximum ? "warning" : ""}`}><div><span>{t("bid.selectedBid")}</span><strong>{formatEuro(bid)}</strong></div>{overMaximum ? <p><AlertTriangle size={14} /> {t("bid.aboveMax", { max: formatEuro(workspace.buyerProfile.budget) })}</p> : <p><LockKeyhole size={14} /> {t("bid.limitLeading")}</p>}</div>}<button className="secondary-button bid-save" type="button" disabled={saving} onClick={() => { void saveDraft(); }}>{saving ? t("bid.saving") : saved ? <><Check size={14} /> {t("bid.saved")}</> : <><LockKeyhole size={14} /> {t("bid.saveDraft")}</>}</button>{strategy && bid > 0 && <Link className="ghost-button bid-memo-link" href={`/woning/${bagId}/bodmemo?price=${Math.round(bid)}&scenario=${selected}${strategy.scenarios[selected].financingCondition ? "" : "&financing=uit"}${strategy.scenarios[selected].inspectionCondition ? "" : "&inspection=uit"}` as Route}><FileText size={14} /> {t("bid.printMemo")}</Link>}{caseId && <p className="muted-copy">{t("bid.dossierPrefix")} <Link href={`/mijn-aankoop/${caseId}#waarde-bod`}>{t("bid.dossierLink")}</Link> {t("bid.dossierSuffix")}</p>}{saveError && <small className="form-message" role="alert">{saveError}{authStatus === "anonymous" && <> <Link href="/login">{t("logIn")}</Link></>}</small>}</div></div></section>;
}
