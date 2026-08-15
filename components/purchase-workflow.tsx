"use client";

import { AlertTriangle, CalendarClock, Check, ClipboardCheck, PiggyBank, Send, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { estimateBidRange, formatEuro } from "@/src/lib/purchase";

const workflowSteps = [
  ["profile", "Woonprofiel"], ["shortlist", "Vergelijken"], ["documents", "Documenten"], ["viewing", "Bezichtiging"], ["offer", "Bod"], ["contract", "Koopakte"], ["transfer", "Overdracht"],
] as const;

export function PurchaseWorkflow({ caseId, initialStage }: { caseId: string; initialStage: string }) {
  const [askingPrice, setAskingPrice] = useState(0);
  const [offerAmount, setOfferAmount] = useState(0);
  const [financingAmount, setFinancingAmount] = useState(0);
  const [contractAmount, setContractAmount] = useState(0);
  const [transferDate, setTransferDate] = useState("");
  const [financingCondition, setFinancingCondition] = useState(true);
  const [inspectionCondition, setInspectionCondition] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<"cautious" | "balanced" | "strong">("balanced");
  const [currentStage, setCurrentStage] = useState(initialStage);
  const [saved, setSaved] = useState(false);
  const [workflowError, setWorkflowError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setCurrentStage(initialStage);
    fetch(`/api/cases/${encodeURIComponent(caseId)}/workflow`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { finance?: { financing_amount: number | null; transfer_preference: string | null }; valuation?: { midpoint_value: number | null; methodology: { askingPrice?: number } }; bid?: { amount: number; transfer_date: string | null; conditions: { contractAmount?: number | null; financingCondition?: boolean; inspectionCondition?: boolean } }; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Workflow kon niet worden geladen.");
        if (!active) return;
        setAskingPrice(body.valuation?.methodology?.askingPrice ?? body.valuation?.midpoint_value ?? 0);
        setOfferAmount(body.bid?.amount ?? 0); setContractAmount(body.bid?.conditions?.contractAmount ?? 0); setFinancingAmount(body.finance?.financing_amount ?? 0); setTransferDate(body.finance?.transfer_preference ?? body.bid?.transfer_date ?? ""); setFinancingCondition(body.bid?.conditions?.financingCondition ?? true); setInspectionCondition(body.bid?.conditions?.inspectionCondition ?? true);
      })
      .catch((error) => { if (active && !(error instanceof DOMException && error.name === "AbortError")) setWorkflowError(error instanceof Error ? error.message : "Workflow kon niet worden geladen."); });
    return () => { active = false; controller.abort(); };
  }, [caseId, initialStage]);

  const range = useMemo(() => estimateBidRange(askingPrice), [askingPrice]);
  const currentIndex = Math.max(0, workflowSteps.findIndex(([key]) => key === currentStage));
  const daysUntil = transferDate ? Math.ceil((new Date(`${transferDate}T12:00:00`).getTime() - Date.now()) / 86400000) : null;

  async function save(stage?: string) {
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/workflow`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ askingPrice: askingPrice > 0 ? askingPrice : null, offerAmount: offerAmount > 0 ? offerAmount : null, financingAmount: financingAmount > 0 ? financingAmount : null, contractAmount: contractAmount > 0 ? contractAmount : null, transferDate: transferDate || null, financingCondition, inspectionCondition, ...(stage ? { stage } : {}) }) });
    const body = await response.json() as { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Workflow kon niet worden opgeslagen.");
    setWorkflowError(""); if (stage) setCurrentStage(stage); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
  }

  async function markOfferReady() {
    try { await save("offer"); } catch (error) { setWorkflowError(error instanceof Error ? error.message : "Workflow kon niet worden opgeslagen."); }
  }

  return <section className="workflow-section"><div className="section-inline-heading"><div><div className="eyebrow"><ClipboardCheck size={13} /> aankoopworkflow</div><h2>Van dossier naar besluit</h2><p>Werk je bod en belangrijke afspraken uit. WoonReality verstuurt niets zonder jouw expliciete bevestiging.</p>{workflowError && <p className="form-message" role="alert">{workflowError}</p>}</div><span className="coverage-pill"><ShieldCheck size={12} /> gebruiker houdt controle</span></div><div className="workflow-steps">{workflowSteps.map(([key, label], index) => <div className={`workflow-step ${index < currentIndex ? "done" : ""} ${index === currentIndex ? "current" : ""}`} key={key}><span>{index < currentIndex ? <Check size={12} /> : index + 1}</span><strong>{label}</strong></div>)}</div><div className="workflow-grid"><div className="workflow-panel"><div className="section-kicker">Waarde & bod</div><h3>Maak een bodconcept</h3><p className="workflow-muted">Vul de vraagprijs in of neem het bedrag uit je advertentie over.</p><div className="workflow-form-grid"><label>Vraagprijs<input type="number" min="0" step="500" value={askingPrice || ""} onChange={(event) => setAskingPrice(Number(event.target.value) || 0)} placeholder="525000" /></label><label>Jouw bod<input type="number" min="0" step="500" value={offerAmount || ""} onChange={(event) => { setOfferAmount(Number(event.target.value) || 0); setSelectedScenario("balanced"); }} placeholder={range ? String(range.balanced) : "527500"} /></label></div>{range && <div className="workflow-scenarios">{(["cautious", "balanced", "strong"] as const).map((key) => <button type="button" className={key === selectedScenario ? "active" : ""} key={key} onClick={() => { setSelectedScenario(key); setOfferAmount(range[key]); }}><span>{key === "cautious" ? "Voorzichtig" : key === "balanced" ? "Gebalanceerd" : "Sterk"}</span><strong>{formatEuro(range[key])}</strong></button>)}</div>}<div className="workflow-checks"><label><input type="checkbox" checked={financingCondition} onChange={(event) => setFinancingCondition(event.target.checked)} /> Financieringsvoorbehoud</label><label><input type="checkbox" checked={inspectionCondition} onChange={(event) => setInspectionCondition(event.target.checked)} /> Bouwkundige keuring</label></div><button className="primary-button" type="button" onClick={() => { void markOfferReady(); }}><Send size={14} /> {saved ? "Concept opgeslagen" : "Bodconcept bewaren"}</button><small className="workflow-note">Dit is een concept. Definitief bieden doe je pas na controle.</small></div><div className="workflow-panel"><div className="section-kicker">Koopaktecontrole</div><h3>Vergelijk bod en contract</h3><p className="workflow-muted">Leg de bedragen naast elkaar nadat je de koopakte hebt ontvangen.</p><div className="workflow-form-grid"><label>Geaccepteerd bod<input type="number" min="0" step="500" value={offerAmount || ""} onChange={(event) => { setOfferAmount(Number(event.target.value) || 0); setSelectedScenario("balanced"); }} /></label><label>Koopprijs contract<input type="number" min="0" step="500" value={contractAmount || ""} onChange={(event) => setContractAmount(Number(event.target.value) || 0)} /></label></div><div className="contract-check-row"><span>Koopsom</span><strong>{offerAmount && contractAmount ? offerAmount === contractAmount ? <><Check size={13} /> Komt overeen</> : <><AlertTriangle size={13} /> Verschil {formatEuro(contractAmount - offerAmount)}</> : "Nog niet ingevuld"}</strong></div><div className="contract-check-row"><span>Financiering</span><label className="inline-money"><input type="number" min="0" step="500" value={financingAmount || ""} onChange={(event) => setFinancingAmount(Number(event.target.value) || 0)} placeholder="475000" /> nodig</label></div><div className="workflow-date"><label><CalendarClock size={14} /> Gewenste overdracht<input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} /></label>{daysUntil != null && <span className={daysUntil < 30 ? "date-warning" : ""}>{daysUntil >= 0 ? `Nog ${daysUntil} dagen` : "Datum is verstreken"}</span>}</div><button className="secondary-button" type="button" onClick={() => { void save().catch((error) => setWorkflowError(error instanceof Error ? error.message : "Workflow kon niet worden opgeslagen.")); }}><CalendarClock size={14} /> Bewaar dossiergegevens</button></div></div><div className="workflow-disclaimer"><PiggyBank size={14} /> Financiële berekeningen zijn indicatief. Hypotheekadvies, taxatie, bouwkundige keuring en juridische controle blijven bij bevoegde professionals.</div></section>;
}
