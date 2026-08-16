"use client";

import { AlertTriangle, CalendarClock, Check, ClipboardCheck, PiggyBank, Send, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildBidStrategy, negotiationGuidance, type BidScenarioKey } from "@/src/lib/bid-strategy";
import { estimateBuyerCosts } from "@/src/lib/costs";
import { computePurchaseDeadlines } from "@/src/lib/deadlines";
import { CASE_STAGE_LABELS, CASE_STAGES, normalizeCaseStage, type CaseStage } from "@/src/lib/journey";
import { formatEuro } from "@/src/lib/purchase";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import type { Analysis } from "@/src/lib/types";

export function PurchaseWorkflow({ caseId, initialStage, analysis, bagVboId }: { caseId: string; initialStage: string; analysis?: Analysis | null; bagVboId?: string | null }) {
  const { workspace } = usePropertyWorkspace();
  const [loadedAnalysis, setLoadedAnalysis] = useState<Analysis | null>(analysis ?? null);
  const [askingPrice, setAskingPrice] = useState(0);
  const [offerAmount, setOfferAmount] = useState(0);
  const [financingAmount, setFinancingAmount] = useState<number | null>(null);
  const [contractAmount, setContractAmount] = useState(0);
  const [transferDate, setTransferDate] = useState("");
  const [financingCondition, setFinancingCondition] = useState(true);
  const [inspectionCondition, setInspectionCondition] = useState(true);
  const [contractSignedAt, setContractSignedAt] = useState("");
  const [contractReceivedAt, setContractReceivedAt] = useState("");
  const [financingWeeks, setFinancingWeeks] = useState(6);
  const [inspectionWeeks, setInspectionWeeks] = useState(2);
  const [selectedScenario, setSelectedScenario] = useState<BidScenarioKey>("balanced");
  const [currentStage, setCurrentStage] = useState<CaseStage>(normalizeCaseStage(initialStage));
  const [saved, setSaved] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const [stageSaving, setStageSaving] = useState(false);
  const pendingStageRef = useRef<CaseStage | null>(null);
  const stageSavingRef = useRef(false);

  useEffect(() => {
    if (analysis || !bagVboId) return;
    const controller = new AbortController();
    fetch(`/api/analysis/${encodeURIComponent(bagVboId)}`, { signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as Analysis : null)
      .then((body) => { if (body) setLoadedAnalysis(body); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [analysis, bagVboId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setCurrentStage(normalizeCaseStage(initialStage));
    fetch(`/api/cases/${encodeURIComponent(caseId)}/workflow`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { finance?: { financing_amount: number | null; transfer_preference: string | null }; valuation?: { midpoint_value: number | null; methodology: { askingPrice?: number } }; bid?: { amount: number; transfer_date: string | null; conditions: { contractAmount?: number | null; financingCondition?: boolean; inspectionCondition?: boolean; scenario?: BidScenarioKey; contractSignedAt?: string | null; contractReceivedAt?: string | null; financingWeeks?: number | null; inspectionWeeks?: number | null } }; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Workflow kon niet worden geladen.");
        if (!active) return;
        setAskingPrice(body.valuation?.methodology?.askingPrice ?? body.valuation?.midpoint_value ?? 0);
        setOfferAmount(body.bid?.amount ?? 0);
        setContractAmount(body.bid?.conditions?.contractAmount ?? 0);
        setFinancingAmount(body.finance?.financing_amount ?? null);
        setTransferDate(body.finance?.transfer_preference ?? body.bid?.transfer_date ?? "");
        setFinancingCondition(body.bid?.conditions?.financingCondition ?? true);
        setInspectionCondition(body.bid?.conditions?.inspectionCondition ?? true);
        if (body.bid?.conditions?.scenario) setSelectedScenario(body.bid.conditions.scenario);
        setContractSignedAt(body.bid?.conditions?.contractSignedAt ?? "");
        setContractReceivedAt(body.bid?.conditions?.contractReceivedAt ?? "");
        setFinancingWeeks(body.bid?.conditions?.financingWeeks ?? 6);
        setInspectionWeeks(body.bid?.conditions?.inspectionWeeks ?? 2);
      })
      .catch((error) => { if (active && !(error instanceof DOMException && error.name === "AbortError")) setWorkflowError(error instanceof Error ? error.message : "Workflow kon niet worden geladen."); });
    return () => { active = false; controller.abort(); };
  }, [caseId, initialStage]);

  const strategy = useMemo(() => buildBidStrategy(askingPrice, loadedAnalysis, workspace.buyerProfileConfigured ? workspace.buyerProfile : null), [askingPrice, loadedAnalysis, workspace.buyerProfile, workspace.buyerProfileConfigured]);
  const negotiation = useMemo(() => negotiationGuidance(strategy, selectedScenario, workspace.buyerProfileConfigured ? workspace.buyerProfile.budget : undefined), [strategy, selectedScenario, workspace.buyerProfile.budget, workspace.buyerProfileConfigured]);
  const costs = useMemo(() => estimateBuyerCosts(offerAmount || askingPrice, workspace.buyerProfile, financingAmount), [askingPrice, financingAmount, offerAmount, workspace.buyerProfile]);
  const currentIndex = Math.max(0, CASE_STAGES.indexOf(currentStage));
  const daysUntil = transferDate ? Math.ceil((new Date(`${transferDate}T12:00:00`).getTime() - Date.now()) / 86400000) : null;
  const purchaseDeadlines = useMemo(() => {
    const signed = contractSignedAt ? new Date(`${contractSignedAt}T00:00:00`) : null;
    const received = contractReceivedAt ? new Date(`${contractReceivedAt}T00:00:00`) : signed;
    if (signed && Number.isNaN(signed.getTime())) return [];
    if (received && Number.isNaN(received.getTime())) return [];
    if (!signed && !received) return [];
    return computePurchaseDeadlines({
      contractReceivedAt: received,
      contractSignedAt: signed,
      financingWeeks: financingCondition ? financingWeeks : null,
      inspectionWeeks: inspectionCondition ? inspectionWeeks : null,
    });
  }, [contractReceivedAt, contractSignedAt, financingCondition, financingWeeks, inspectionCondition, inspectionWeeks]);

  async function save(stage?: CaseStage) {
    const scenario = strategy?.scenarios[selectedScenario];
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/workflow`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ askingPrice: askingPrice > 0 ? askingPrice : null, offerAmount: offerAmount > 0 ? offerAmount : null, financingAmount, contractAmount: contractAmount > 0 ? contractAmount : null, transferDate: transferDate || null, financingCondition, inspectionCondition, scenario: selectedScenario, reasons: scenario?.reasons ?? [], contractSignedAt: contractSignedAt || null, contractReceivedAt: contractReceivedAt || null, financingWeeks, inspectionWeeks, ...(stage ? { stage } : {}) }) });
    const body = await response.json() as { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Workflow kon niet worden opgeslagen.");
    setWorkflowError(""); if (stage) setCurrentStage(stage); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
  }

  async function markOfferReady() {
    try { await save("offer"); } catch (error) { setWorkflowError(error instanceof Error ? error.message : "Workflow kon niet worden opgeslagen."); }
  }

  async function setStage(stage: CaseStage) {
    pendingStageRef.current = stage;
    if (stageSavingRef.current) return;
    stageSavingRef.current = true;
    setStageSaving(true);
    try {
      while (pendingStageRef.current) {
        const next = pendingStageRef.current;
        pendingStageRef.current = null;
        try {
          await save(next);
        } catch (error) {
          setWorkflowError(error instanceof Error ? error.message : "Stap kon niet worden gezet.");
          break;
        }
      }
    } finally {
      stageSavingRef.current = false;
      setStageSaving(false);
    }
  }

  return <section className="workflow-section" id="waarde-bod"><div className="section-inline-heading"><div><div className="eyebrow"><ClipboardCheck size={13} /> aankoopworkflow</div><h2>Van dossier naar besluit</h2><p>Werk je bod en voorwaarden uit. Dit is geen taxatie en geen winkans. WoonReality verstuurt niets.</p>{workflowError && <p className="form-message" role="alert">{workflowError}</p>}</div><span className="coverage-pill"><ShieldCheck size={12} /> gebruiker houdt controle</span></div><div className="workflow-steps">{CASE_STAGES.map((key, index) => <button type="button" className={`workflow-step ${index < currentIndex ? "done" : ""} ${index === currentIndex ? "current" : ""}`} key={key} disabled={stageSaving} onClick={() => { void setStage(key); }}><span>{index < currentIndex ? <Check size={12} /> : index + 1}</span><strong>{CASE_STAGE_LABELS[key]}</strong></button>)}</div><div className="workflow-grid"><div className="workflow-panel"><div className="section-kicker">Waarde & bod</div><h3>Maak een bodconcept</h3><p className="workflow-muted">{strategy?.valuationNote ?? "Vul de vraagprijs in. Zonder Kadaster-referenties schatten we geen marktwaarde."}</p><div className="workflow-form-grid"><label>Vraagprijs<input type="number" min="0" step="500" value={askingPrice || ""} onChange={(event) => setAskingPrice(Number(event.target.value) || 0)} placeholder="525000" /></label><label>Jouw bod<input type="number" min="0" step="500" value={offerAmount || ""} onChange={(event) => { setOfferAmount(Number(event.target.value) || 0); }} placeholder={strategy ? String(strategy.scenarios[strategy.recommended].amount) : "527500"} /></label></div>{strategy && <div className="workflow-scenarios">{(["cautious", "balanced", "strong"] as const).map((key) => <button type="button" className={key === selectedScenario ? "active" : ""} key={key} onClick={() => { setSelectedScenario(key); setOfferAmount(strategy.scenarios[key].amount); setFinancingCondition(strategy.scenarios[key].financingCondition); setInspectionCondition(strategy.scenarios[key].inspectionCondition); }}><span>{strategy.scenarios[key].label}{strategy.recommended === key ? " · advies" : ""}</span><strong>{formatEuro(strategy.scenarios[key].amount)}</strong></button>)}</div>}{strategy && <ul className="bid-reasons">{strategy.scenarios[selectedScenario].reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}{currentStage === "negotiation" && <div className="negotiation-guidance"><div className="section-kicker">Onderhandelen</div><ul>{negotiation.counterOfferSteps.map((step) => <li key={step}>{step}</li>)}</ul><div className="escalation-clause"><strong>{negotiation.escalationClause.title}</strong><p>{negotiation.escalationClause.summary}</p><p><em>Wanneer:</em> {negotiation.escalationClause.whenToUse}</p><p><em>Let op:</em> {negotiation.escalationClause.caution}</p></div><p className="workflow-muted">{negotiation.walkAwayReminder}</p></div>}<p className="workflow-muted">{strategy?.riskSummary}</p><div className="workflow-checks"><label><input type="checkbox" checked={financingCondition} onChange={(event) => setFinancingCondition(event.target.checked)} /> Financieringsvoorbehoud</label><label><input type="checkbox" checked={inspectionCondition} onChange={(event) => setInspectionCondition(event.target.checked)} /> Bouwkundige keuring</label></div><button className="primary-button" type="button" onClick={() => { void markOfferReady(); }}><Send size={14} /> {saved ? "Concept opgeslagen" : "Bodconcept bewaren"}</button><small className="workflow-note">Dit is een concept. Definitief bieden doe je zelf, na controle.</small></div><div className="workflow-panel" id="koopakte"><div className="section-kicker">Koopakte & kosten</div><h3>Vergelijk bod, contract en eigen geld</h3><p className="workflow-muted">Leg de bedragen naast elkaar nadat je de koopakte hebt ontvangen.</p><div className="workflow-form-grid"><label>Geaccepteerd bod<input type="number" min="0" step="500" value={offerAmount || ""} onChange={(event) => setOfferAmount(Number(event.target.value) || 0)} /></label><label>Koopprijs contract<input type="number" min="0" step="500" value={contractAmount || ""} onChange={(event) => setContractAmount(Number(event.target.value) || 0)} /></label></div><div className="contract-check-row"><span>Koopsom</span><strong>{offerAmount && contractAmount ? offerAmount === contractAmount ? <><Check size={13} /> Komt overeen</> : <><AlertTriangle size={13} /> Verschil {formatEuro(contractAmount - offerAmount)}</> : "Nog niet ingevuld"}</strong></div><div className="contract-check-row"><span>Financiering</span><label className="inline-money"><input type="number" min="0" step="500" value={financingAmount ?? ""} onChange={(event) => { const raw = event.target.value; setFinancingAmount(raw === "" ? null : Number(event.target.value)); }} placeholder="475000" /> nodig</label></div>{costs && <div className="cost-stack"><span>Kosten koper (indicatie)</span><strong>{formatEuro(costs.total)}</strong><small>Eigen geld nodig circa {formatEuro(costs.ownFundsNeeded)}{costs.financingGap != null && costs.financingGap > 0 ? ` · gat ${formatEuro(costs.financingGap)}` : ""}</small></div>}<div className="workflow-form-grid"><label>Koopovereenkomst ontvangen op<input type="date" value={contractReceivedAt} onChange={(event) => setContractReceivedAt(event.target.value)} /></label><label>Koopovereenkomst getekend op<input type="date" value={contractSignedAt} onChange={(event) => setContractSignedAt(event.target.value)} /></label><label>Weken financieringsvoorbehoud<input type="number" min="0" max="52" value={financingWeeks} onChange={(event) => setFinancingWeeks(Number(event.target.value) || 0)} disabled={!financingCondition} /></label><label>Weken bouwkundige keuring<input type="number" min="0" max="52" value={inspectionWeeks} onChange={(event) => setInspectionWeeks(Number(event.target.value) || 0)} disabled={!inspectionCondition} /></label></div>{purchaseDeadlines.length > 0 && <ul className="deadline-list">{purchaseDeadlines.map((deadline) => { const remaining = Math.ceil((deadline.dueAt.getTime() - Date.now()) / 86400000); return <li key={deadline.key} className={remaining < 3 ? "date-warning" : ""}><CalendarClock size={13} /> {deadline.label}: <strong>{deadline.dueAt.toLocaleDateString("nl-NL", { dateStyle: "long" })}</strong> {remaining >= 0 ? `(nog ${remaining} dagen)` : "(verstreken)"}</li>; })}</ul>}<div className="workflow-date"><label><CalendarClock size={14} /> Gewenste overdracht<input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} /></label>{daysUntil != null && <span className={daysUntil < 30 ? "date-warning" : ""}>{daysUntil >= 0 ? `Nog ${daysUntil} dagen` : "Datum is verstreken"}</span>}</div><button className="secondary-button" type="button" onClick={() => { void save().catch((error) => setWorkflowError(error instanceof Error ? error.message : "Workflow kon niet worden opgeslagen.")); }}><CalendarClock size={14} /> Bewaar dossiergegevens</button></div></div><div className="workflow-disclaimer"><PiggyBank size={14} /> Financiële berekeningen zijn indicatief. Hypotheekadvies, taxatie, bouwkundige keuring en juridische controle blijven bij bevoegde professionals.</div></section>;
}
