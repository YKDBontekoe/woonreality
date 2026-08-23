"use client";

import { ArrowLeft, CircleHelp, ClipboardCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { checklistForAnalysis, mergeChecklistWithDefaults } from "@/src/lib/checklist";
import { checklistSessionNotice, loadSessionChecklist, saveSessionChecklist, supportsSessionChecklistFallback } from "@/src/lib/checklist-storage";
import type { Analysis, ChecklistItem } from "@/src/lib/types";
import { loginHref } from "@/src/lib/login-href";

export function ViewingCompanion({ bagId }: { bagId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistError, setChecklistError] = useState("");
  const [debrief, setDebrief] = useState("");
  const [busy, setBusy] = useState(false);
  const { authStatus, toggleSaved, workspace, refresh } = usePropertyWorkspace();
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
        if (supportsSessionChecklistFallback(response.status)) {
          const cached = loadSessionChecklist(bagId);
          setChecklist(cached ? mergeChecklistWithDefaults(defaults, cached) : defaults);
          setChecklistError(response.status === 401 ? "Log in om notities te bewaren." : checklistSessionNotice);
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
      if (supportsSessionChecklistFallback(response.status)) {
        if (!saveSessionChecklist(bagId, next)) throw new Error("Je checklist kon niet in deze browser worden bewaard.");
        setChecklistError(response.status === 401 ? "Log in om notities te bewaren." : checklistSessionNotice);
        return;
      }
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
      if (response.status === 401) { window.location.href = loginHref(); return; }
      if (!response.ok) { setDebrief(body.error ?? "Debrief kon niet worden opgeslagen."); return; }
      if (decision === "continue" && body.caseId) { window.location.href = `/mijn-aankoop/${body.caseId}#waarde-bod`; return; }
      if (decision === "continue") { setDebrief("De bezichtiging is afgerond, maar er is nog geen dossier om het bod in te zetten. Start of open eerst een aankoopdossier."); return; }
      if (decision === "drop") { window.location.href = "/mijn-aankoop"; return; }
      // The debrief changed the property stage server-side; sync the store.
      await refresh();
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
  const attentionItems = checklist.filter((item) => item.signalKey || item.id.startsWith("signal-"));
  const standardItems = checklist.filter((item) => !item.signalKey && !item.id.startsWith("signal-"));

  function checklistItems(items: ChecklistItem[]) {
    return items.map((item) => {
      const checkboxId = `companion-${item.id}`;
      const noteId = `${checkboxId}-note`;
      const reasonId = `${checkboxId}-reason`;
      return <div className={`companion-item ${item.checked ? "checked" : ""}`} key={item.id}>
        <label htmlFor={checkboxId}>
          <input
            id={checkboxId}
            type="checkbox"
            checked={item.checked}
            aria-describedby={item.reason ? reasonId : undefined}
            onChange={(event) => {
              void saveChecklist(checklist.map((candidate) => candidate.id === item.id ? { ...candidate, checked: event.target.checked } : candidate));
            }}
          />
          <span><strong>{item.label}</strong></span>
        </label>
        {item.reason && <p className="companion-reason" id={reasonId}>{item.reason}</p>}
        <label className="sr-only" htmlFor={noteId}>Notitie voor {item.label}</label>
        <textarea id={noteId} value={item.note ?? ""} placeholder="Wat zie, ruik of hoor je?" rows={2} onChange={(event) => { updateNote(item.id, event.target.value); }} />
      </div>;
    });
  }

  return <PageShell current="woning" className="viewing-companion">
    <Link className="back-link" href={`/woning/${bagId}`}><ArrowLeft size={14} /> Terug naar de woningcheck</Link>
    <div className="eyebrow"><ClipboardCheck size={13} /> bezichtigingsmodus</div>
    <h1>{analysis.property.street} {analysis.property.houseNumber}</h1>
    <p className="hero-copy">Grote vakjes, ruimte voor notities. Dit is je gezelschap in huis — geen printwerk.</p>
    <div className="companion-progress-card" aria-label="Voortgang bezichtiging">
      <div>
        <span>Bezichtiging</span>
        <strong>{checked} / {checklist.length} afgevinkt</strong>
      </div>
      <progress value={checked} max={Math.max(checklist.length, 1)} aria-label={`${checked} van ${checklist.length} punten afgevinkt`} />
      <a className="secondary-button" href="#afronden">Afronden</a>
    </div>
    {checklistError && <p className="form-message" role="status">{checklistError}{authStatus === "anonymous" && <> <Link href="/login">Inloggen</Link></>}</p>}
    <div className="companion-list">
      {attentionItems.length > 0 && <section className="companion-group" aria-labelledby="attention-checklist-title">
        <div className="companion-group-head">
          <span className="section-kicker">Specifiek voor deze woning</span>
          <h2 id="attention-checklist-title">Eerst hierop letten</h2>
          <p>Deze punten komen rechtstreeks uit de woningcheck.</p>
        </div>
        <div className="companion-group-items">{checklistItems(attentionItems)}</div>
      </section>}
      {standardItems.length > 0 && <section className="companion-group" aria-labelledby="standard-checklist-title">
        <div className="companion-group-head">
          <span className="section-kicker">Basisrondje</span>
          <h2 id="standard-checklist-title">Niet vergeten</h2>
        </div>
        <div className="companion-group-items">{checklistItems(standardItems)}</div>
      </section>}
    </div>
    <section className="companion-debrief" id="afronden">
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
