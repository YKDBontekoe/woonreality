"use client";

import { ArrowLeft, CircleHelp, ClipboardCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { checklistForAnalysis, mergeChecklistWithDefaults } from "@/src/lib/checklist";
import type { Analysis, ChecklistItem } from "@/src/lib/types";

export function ViewingCompanion({ bagId }: { bagId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistError, setChecklistError] = useState("");
  const [debrief, setDebrief] = useState("");
  const [busy, setBusy] = useState(false);
  const { toggleSaved, workspace } = usePropertyWorkspace();
  const writeQueue = useRef(Promise.resolve());
  const noteTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analysis/${encodeURIComponent(bagId)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Analysis & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Analyse kon niet worden geladen.");
        setAnalysis(body);
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Er ging iets mis");
      });
    return () => controller.abort();
  }, [bagId]);

  useEffect(() => {
    if (!analysis) return;
    const controller = new AbortController();
    fetch(`/api/checklists/${encodeURIComponent(bagId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { items?: ChecklistItem[] | null; error?: string };
        const defaults = checklistForAnalysis(analysis);
        if (response.status === 401) {
          setChecklist(defaults);
          setChecklistError("Log in om notities te bewaren.");
          return;
        }
        if (!response.ok) throw new Error(body.error ?? "Checklist kon niet worden geladen.");
        setChecklist(Array.isArray(body.items) ? mergeChecklistWithDefaults(defaults, body.items) : defaults);
        setChecklistError("");
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setChecklist(checklistForAnalysis(analysis));
          setChecklistError(caught instanceof Error ? caught.message : "Checklist kon niet worden geladen.");
        }
      });
    return () => controller.abort();
  }, [analysis, bagId]);

  useEffect(() => () => {
    Object.values(noteTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);

  async function persistChecklist(next: ChecklistItem[]) {
    const write = writeQueue.current.catch(() => undefined).then(async () => {
      const response = await fetch(`/api/checklists/${encodeURIComponent(bagId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: next }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Checklist kon niet worden opgeslagen.");
      setChecklistError("");
    });
    writeQueue.current = write.catch(() => undefined);
    try { await write; } catch (caught) { setChecklistError(caught instanceof Error ? caught.message : "Checklist kon niet worden opgeslagen."); }
  }

  async function saveChecklist(next: ChecklistItem[]) {
    setChecklist(next);
    await persistChecklist(next);
  }

  function updateNote(itemId: string, note: string) {
    setChecklist((current) => {
      const next = current.map((candidate) => candidate.id === itemId ? { ...candidate, note } : candidate);
      window.clearTimeout(noteTimers.current[itemId]);
      noteTimers.current[itemId] = window.setTimeout(() => { void persistChecklist(next); }, 500);
      return next;
    });
  }

  async function finish(decision: "continue" | "doubt" | "drop") {
    setBusy(true);
    setDebrief("");
    try {
      const saved = workspace.saved.some((item) => item.bagVboId === bagId);
      if (!saved && analysis) await toggleSaved(analysis.property);
      const response = await fetch(`/api/property/${encodeURIComponent(bagId)}/debrief`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      const body = await response.json() as { caseId?: string | null; error?: string };
      if (response.status === 401) { window.location.href = "/login"; return; }
      if (!response.ok) { setDebrief(body.error ?? "Debrief kon niet worden opgeslagen."); return; }
      if (decision === "continue" && body.caseId) { window.location.href = `/mijn-aankoop/${body.caseId}#waarde-bod`; return; }
      if (decision === "continue") { setDebrief("De bezichtiging is afgerond, maar er is nog geen dossier om het bod in te zetten. Start of open eerst een aankoopdossier."); return; }
      if (decision === "drop") { window.location.href = "/mijn-aankoop"; return; }
      setDebrief("Twijfel is oké. Werk je notities bij en kom later terug.");
    } catch (caught) {
      setDebrief(caught instanceof Error ? caught.message : "Debrief kon niet worden opgeslagen.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return (
    <PageShell current="woning">
      <div className="loading-shell">
        <Link className="back-link" href="/"><ArrowLeft size={14} /> Terug naar zoeken</Link>
        <h1>Deze bezichtiging lukt nu niet.</h1>
        <p className="hero-copy">{error}</p>
        <Link className="primary-button" href="/">Nieuw adres zoeken</Link>
      </div>
    </PageShell>
  );
  if (!analysis) return (
    <PageShell current="woning">
      <div className="loading-shell"><div className="loading-block" /><div className="loading-block big" /></div>
    </PageShell>
  );

  const checked = checklist.filter((item) => item.checked).length;

  return <PageShell current="woning" className="viewing-companion">
    <Link className="back-link" href={`/woning/${bagId}`}><ArrowLeft size={14} /> Terug naar de woningcheck</Link>
    <div className="eyebrow"><ClipboardCheck size={13} /> bezichtigingsmodus</div>
    <h1>{analysis.property.street} {analysis.property.houseNumber}</h1>
    <p className="hero-copy">Grote vakjes, ruimte voor notities. Dit is je gezelschap in huis — geen printwerk.</p>
    <p className="companion-progress">{checked} / {checklist.length} afgevinkt</p>
    {checklistError && <p className="form-message" role="status">{checklistError} <Link href="/login">Inloggen</Link></p>}
    <div className="companion-list">{checklist.map((item) => {
      const checkboxId = `companion-${item.id}`;
      const noteId = `${checkboxId}-note`;
      return <div className={`companion-item ${item.checked ? "checked" : ""}`} key={item.id}>
        <label htmlFor={checkboxId}><input id={checkboxId} type="checkbox" checked={item.checked} onChange={(event) => { void saveChecklist(checklist.map((candidate) => candidate.id === item.id ? { ...candidate, checked: event.target.checked } : candidate)); }} /><span><strong>{item.label}</strong>{item.reason && <small>{item.reason}</small>}</span></label>
        <label className="sr-only" htmlFor={noteId}>Notitie voor {item.label}</label>
        <textarea id={noteId} value={item.note ?? ""} placeholder="Wat zie, ruik of hoor je?" rows={2} onChange={(event) => { updateNote(item.id, event.target.value); }} />
      </div>;
    })}</div>
    <section className="companion-debrief">
      <h2>Na de rondleiding</h2>
      <p>Dit zet de zaakfase bij. Er gaat geen mail naar de verkopende makelaar.</p>
      {debrief && <p className="form-message" role="status">{debrief}</p>}
      <div className="debrief-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={() => { void finish("continue"); }}><ThumbsUp size={16} /> Doorgaan naar bod</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => { void finish("doubt"); }}><CircleHelp size={16} /> Nog twijfel</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => { void finish("drop"); }}><ThumbsDown size={16} /> Laten vallen</button>
      </div>
    </section>
  </PageShell>;
}
