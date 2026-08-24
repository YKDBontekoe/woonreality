"use client";

import { ArrowLeft, CircleHelp, ClipboardCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link } from "@/src/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { checklistForAnalysis, mergeChecklistWithDefaults } from "@/src/lib/checklist";
import { checklistSessionNotice, loadSessionChecklist, saveSessionChecklist, supportsSessionChecklistFallback } from "@/src/lib/checklist-storage";
import type { Analysis, ChecklistItem } from "@/src/lib/types";
import { loginHref } from "@/src/lib/login-href";

export function ViewingCompanion({ bagId }: { bagId: string }) {
  const t = useTranslations("woning");
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
        if (!response.ok) throw new Error(body.error ?? t("viewing.analysisLoadFailed"));
        setAnalysis(body);
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : t("somethingWentWrong"));
      });
    return () => controller.abort();
  }, [bagId, t]);

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
          setChecklistError(response.status === 401 ? t("viewing.loginToSaveNotes") : checklistSessionNotice);
          return;
        }
        if (!response.ok) throw new Error(body.error ?? t("viewing.checklistLoadFailed"));
        setChecklist(Array.isArray(body.items) ? mergeChecklistWithDefaults(defaults, body.items) : defaults);
        setChecklistError("");
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setChecklist(checklistForAnalysis(analysis));
          setChecklistError(caught instanceof Error ? caught.message : t("viewing.checklistLoadFailed"));
        }
      });
    return () => controller.abort();
  }, [analysis, bagId, t]);

  useEffect(() => () => {
    Object.values(noteTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);

  async function persistChecklist(next: ChecklistItem[]) {
    const write = writeQueue.current.catch(() => undefined).then(async () => {
      const response = await fetch(`/api/checklists/${encodeURIComponent(bagId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: next }) });
      const body = await response.json() as { error?: string };
      if (supportsSessionChecklistFallback(response.status)) {
        if (!saveSessionChecklist(bagId, next)) throw new Error(t("viewing.browserSaveFailed"));
        setChecklistError(response.status === 401 ? t("viewing.loginToSaveNotes") : checklistSessionNotice);
        return;
      }
      if (!response.ok) throw new Error(body.error ?? t("viewing.checklistSaveFailed"));
      setChecklistError("");
    });
    writeQueue.current = write.catch(() => undefined);
    try { await write; } catch (caught) { setChecklistError(caught instanceof Error ? caught.message : t("viewing.checklistSaveFailed")); }
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
      if (!response.ok) { setDebrief(body.error ?? t("viewing.debriefSaveFailed")); return; }
      if (decision === "continue" && body.caseId) { window.location.href = `/mijn-aankoop/${body.caseId}#waarde-bod`; return; }
      if (decision === "continue") { setDebrief(t("viewing.debriefNoCase")); return; }
      if (decision === "drop") { window.location.href = "/mijn-aankoop"; return; }
      // The debrief changed the property stage server-side; sync the store.
      await refresh();
      setDebrief(t("viewing.debriefDoubt"));
    } catch (caught) {
      setDebrief(caught instanceof Error ? caught.message : t("viewing.debriefSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (error) return (
    <PageShell current="woning">
      <div className="loading-shell">
        <Link className="back-link" href="/"><ArrowLeft size={14} /> {t("backToSearch")}</Link>
        <h1>{t("viewing.errorTitle")}</h1>
        <p className="hero-copy">{error}</p>
        <Link className="primary-button" href="/">{t("searchNewAddress")}</Link>
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
        <label className="sr-only" htmlFor={noteId}>{t("viewing.noteAria", { label: item.label })}</label>
        <textarea id={noteId} value={item.note ?? ""} placeholder={t("viewing.notePlaceholder")} rows={2} onChange={(event) => { updateNote(item.id, event.target.value); }} />
      </div>;
    });
  }

  return <PageShell current="woning" className="viewing-companion">
    <Link className="back-link" href={`/woning/${bagId}`}><ArrowLeft size={14} /> {t("viewing.backToCheck")}</Link>
    <div className="eyebrow"><ClipboardCheck size={13} /> {t("viewing.modeEyebrow")}</div>
    <h1>{analysis.property.street} {analysis.property.houseNumber}</h1>
    <p className="hero-copy">{t("viewing.heroCopy")}</p>
    <div className="companion-progress-card" aria-label={t("viewing.progressAria")}>
      <div>
        <span>{t("viewing.viewingLabel")}</span>
        <strong>{t("viewing.checkedCount", { checked, total: checklist.length })}</strong>
      </div>
      <progress value={checked} max={Math.max(checklist.length, 1)} aria-label={t("viewing.progressMeterAria", { checked, total: checklist.length })} />
      <a className="secondary-button" href="#afronden">{t("viewing.finishLink")}</a>
    </div>
    {checklistError && <p className="form-message" role="status">{checklistError}{authStatus === "anonymous" && <> <Link href="/login">{t("logIn")}</Link></>}</p>}
    <div className="companion-list">
      {attentionItems.length > 0 && <section className="companion-group" aria-labelledby="attention-checklist-title">
        <div className="companion-group-head">
          <span className="section-kicker">{t("viewing.specificKicker")}</span>
          <h2 id="attention-checklist-title">{t("viewing.attentionFirst")}</h2>
          <p>{t("viewing.fromCheck")}</p>
        </div>
        <div className="companion-group-items">{checklistItems(attentionItems)}</div>
      </section>}
      {standardItems.length > 0 && <section className="companion-group" aria-labelledby="standard-checklist-title">
        <div className="companion-group-head">
          <span className="section-kicker">{t("viewing.basicsKicker")}</span>
          <h2 id="standard-checklist-title">{t("viewing.dontForget")}</h2>
        </div>
        <div className="companion-group-items">{checklistItems(standardItems)}</div>
      </section>}
    </div>
    <section className="companion-debrief" id="afronden">
      <h2>{t("viewing.afterTour")}</h2>
      <p>{t("viewing.debriefNote")}</p>
      {debrief && <p className="form-message" role="status">{debrief}</p>}
      <div className="debrief-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={() => { void finish("continue"); }}><ThumbsUp size={16} /> {t("viewing.continueToOffer")}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => { void finish("doubt"); }}><CircleHelp size={16} /> {t("viewing.stillDoubting")}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => { void finish("drop"); }}><ThumbsDown size={16} /> {t("viewing.dropIt")}</button>
      </div>
    </section>
  </PageShell>;
}
