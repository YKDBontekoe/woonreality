"use client";

import { AlertTriangle, Check, Calculator, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { buildBidStrategy, type BidScenarioKey } from "@/src/lib/bid-strategy";
import { estimateBuyerCosts } from "@/src/lib/costs";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { formatEuro } from "@/src/lib/purchase";
import type { Analysis, PropertyListing } from "@/src/lib/types";

export function ValuationBidPanel({ bagId, analysis, listing, caseId }: { bagId: string; analysis: Analysis; listing: PropertyListing | null; caseId?: string | null }) {
  const { workspace } = usePropertyWorkspace();
  const [askingPrice, setAskingPrice] = useState(listing?.askingPrice ?? 0);
  const [selected, setSelected] = useState<BidScenarioKey>("balanced");
  const [draftResolved, setDraftResolved] = useState(false);
  const [userEditedAskingPrice, setUserEditedAskingPrice] = useState(false);
  const userEditedAskingPriceRef = useRef(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDraftResolved(false);
    setUserEditedAskingPrice(false);
    userEditedAskingPriceRef.current = false;
    let cancelled = false;
    async function load() {
      try {
        const [draftResponse, userListingResponse] = await Promise.all([
          fetch(`/api/property/${encodeURIComponent(bagId)}/bid-draft`, { cache: "no-store" }),
          fetch(`/api/listing/user/${encodeURIComponent(bagId)}`, { cache: "no-store" }),
        ]);
        if (draftResponse.status !== 401) {
          const body = await draftResponse.json() as { draft?: { asking_price: number | null; selected_scenario: BidScenarioKey }; error?: string };
          if (!draftResponse.ok) throw new Error(body.error ?? "Bodconcept kon niet worden geladen.");
          if (body.draft?.asking_price != null) setAskingPrice(body.draft.asking_price);
          if (body.draft?.selected_scenario) setSelected(body.draft.selected_scenario);
        }
        if (userListingResponse.ok) {
          const listingBody = await userListingResponse.json() as { listing?: { asking_price: number | null } | null };
          if (!cancelled && listingBody.listing?.asking_price && !userEditedAskingPriceRef.current) setAskingPrice(listingBody.listing.asking_price);
        } else {
          try {
            const raw = sessionStorage.getItem(listingStorageKey(bagId));
            const draft = raw ? JSON.parse(raw) as UserListingDraft : null;
            if (!cancelled && draft?.askingPrice && !userEditedAskingPriceRef.current) setAskingPrice(draft.askingPrice);
          } catch { /* ignore */ }
        }
      } catch (error) {
        if (!cancelled) setSaveError(error instanceof Error ? error.message : "Bodconcept kon niet worden geladen.");
      } finally {
        if (!cancelled) setDraftResolved(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [bagId]);

  useEffect(() => {
    if (!draftResolved && !userEditedAskingPrice && listing?.askingPrice != null) setAskingPrice(listing.askingPrice);
  }, [draftResolved, listing?.askingPrice, userEditedAskingPrice]);

  const strategy = useMemo(() => buildBidStrategy(askingPrice, analysis, workspace.buyerProfileConfigured ? workspace.buyerProfile : null), [askingPrice, analysis, workspace.buyerProfile, workspace.buyerProfileConfigured]);
  const costs = useMemo(() => estimateBuyerCosts(askingPrice, workspace.buyerProfile), [askingPrice, workspace.buyerProfile]);
  const bid = strategy?.scenarios[selected].amount ?? 0;
  const overMaximum = workspace.buyerProfileConfigured && workspace.buyerProfile.budget > 0 && bid > workspace.buyerProfile.budget;

  async function saveDraft() {
    try {
      const response = await fetch(`/api/property/${encodeURIComponent(bagId)}/bid-draft`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ askingPrice, selected }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Bodconcept kon niet worden opgeslagen.");
      if (caseId) {
        await fetch(`/api/cases/${encodeURIComponent(caseId)}/workflow`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ askingPrice, offerAmount: bid, financingCondition: strategy?.scenarios[selected].financingCondition, inspectionCondition: strategy?.scenarios[selected].inspectionCondition, scenario: selected, reasons: strategy?.scenarios[selected].reasons ?? [], stage: "offer" }) });
      }
      setSaveError(""); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Bodconcept kon niet worden opgeslagen."); }
  }

  return <section className="valuation-section" id="waarde-bod"><div className="section-inline-heading"><div><div className="eyebrow"><Calculator size={13} /> stap 05 · waarde & bod</div><h2>Van vraagprijs naar jouw grens</h2><p>Geen marktwaarde tot er Kadaster-referenties of een taxateur zijn. Wel een bodconcept gekoppeld aan risico’s, budget en voorwaarden.</p></div><span className="coverage-pill"><ShieldCheck size={12} /> geen taxatie</span></div><div className="valuation-grid"><div className="valuation-card"><div className="valuation-card-head"><span className="section-kicker">Wat we wél weten</span><Scale size={17} /></div><div className="valuation-range">{askingPrice ? formatEuro(askingPrice) : "Vul de vraagprijs in"}</div><p>{strategy?.valuationNote ?? "Zonder vraagprijs kunnen we geen kosten koper of bodscenario schetsen."}</p><div className="valuation-facts"><span>Reality score <strong>{analysis.overallScore.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10</strong></span><span>Jouw profielmaximum <strong>{workspace.buyerProfileConfigured ? formatEuro(workspace.buyerProfile.budget) : "Stel je profiel in"}</strong></span>{costs && <span>Kosten koper (indicatie) <strong>{formatEuro(costs.total)}</strong></span>}<span>Risico <strong>{strategy?.riskSummary ?? "Onbekend"}</strong></span></div></div><div className="bid-card"><div className="section-kicker">Bod voorbereiden</div><label className="price-input-label">Vraagprijs<input type="number" min="0" step="500" value={askingPrice || ""} onChange={(event) => { userEditedAskingPriceRef.current = true; setUserEditedAskingPrice(true); setAskingPrice(Number(event.target.value) || 0); }} placeholder="€ 525.000" /></label>{strategy ? <div className="bid-options">{(["cautious", "balanced", "strong"] as const).map((key) => <button type="button" className={selected === key ? "bid-option selected" : "bid-option"} key={key} onClick={() => setSelected(key)}><span>{strategy.scenarios[key].label}{strategy.recommended === key ? " · advies" : ""}</span><strong>{formatEuro(strategy.scenarios[key].amount)}</strong><small>{strategy.scenarios[key].financingCondition && strategy.scenarios[key].inspectionCondition ? "beide voorbehouden" : strategy.scenarios[key].financingCondition ? "alleen financiering" : "weinig bescherming"}</small></button>)}</div> : <p className="muted-copy">Voer de vraagprijs in om scenario&apos;s te zien.</p>}{strategy && <ul className="bid-reasons">{strategy.scenarios[selected].reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}{strategy && <div className={`bid-result ${overMaximum ? "warning" : ""}`}><div><span>Geselecteerd bod</span><strong>{formatEuro(bid)}</strong></div>{overMaximum ? <p><AlertTriangle size={14} /> Dit ligt boven je ingestelde maximum van {formatEuro(workspace.buyerProfile.budget)}.</p> : <p><LockKeyhole size={14} /> Jouw absolute grens blijft leidend.</p>}</div>}<button className="secondary-button bid-save" type="button" onClick={() => { void saveDraft(); }}>{saved ? <Check size={14} /> : <LockKeyhole size={14} />}{saved ? "Concept opgeslagen" : "Bewaar bodconcept"}</button>{caseId && <p className="muted-copy">Dit concept wordt in je <Link href={`/mijn-aankoop/${caseId}#waarde-bod`}>aankoopdossier</Link> bijgewerkt.</p>}{saveError && <small className="form-message" role="alert">{saveError} <a href="/login">Inloggen</a></small>}</div></div></section>;
}
