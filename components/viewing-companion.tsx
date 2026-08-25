"use client";

import { ArrowLeft, CircleHelp, ClipboardCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link } from "@/src/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { useChecklist } from "@/components/hooks/use-checklist";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import type { Analysis, ChecklistItem } from "@/src/lib/types";
import { apiFetch, redirectToLogin } from "@/components/hooks/use-api";

export function ViewingCompanion({ bagId }: { bagId: string }) {
  const t = useTranslations("woning");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [debrief, setDebrief] = useState("");
  const [busy, setBusy] = useState(false);
  const { authStatus, toggleSaved, workspace, refresh } = usePropertyWorkspace();
  const checklistState = useChecklist(bagId, analysis, Boolean(analysis), {
    loginToSaveNotes: t("viewing.loginToSaveNotes"),
    checklistLoadFailed: t("viewing.checklistLoadFailed"),
    checklistSaveFailed: t("viewing.checklistSaveFailed"),
    browserSaveFailed: t("viewing.browserSaveFailed"),
  });

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Analysis>(`/api/analysis/${encodeURIComponent(bagId)}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok || !result.data) throw new Error(result.error ?? t("viewing.analysisLoadFailed"));
        setAnalysis(result.data);
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : t("somethingWentWrong"));
      });
    return () => controller.abort();
  }, [bagId, t]);

  async function finish(decision: "continue" | "doubt" | "drop") {
    setBusy(true);
    setDebrief("");
    try {
      const saved = workspace.saved.some((item) => item.bagVboId === bagId);
      if (!saved && analysis) await toggleSaved(analysis.property);
      const result = await apiFetch<{ caseId?: string | null; error?: string }>(
        `/api/property/${encodeURIComponent(bagId)}/debrief`,
        { method: "POST", json: { decision } },
      );
      if (result.status === 401) { redirectToLogin(); return; }
      if (!result.ok) { setDebrief(result.data?.error ?? result.error ?? t("viewing.debriefSaveFailed")); return; }
      if (decision === "continue" && result.data?.caseId) { window.location.href = `/mijn-aankoop/${result.data.caseId}#waarde-bod`; return; }
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

  const checklist = checklistState.checklist;
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
              checklistState.save(checklist.map((candidate) => candidate.id === item.id ? { ...candidate, checked: event.target.checked } : candidate));
            }}
          />
          <span><strong>{item.label}</strong></span>
        </label>
        {item.reason && <p className="companion-reason" id={reasonId}>{item.reason}</p>}
        <label className="sr-only" htmlFor={noteId}>{t("viewing.noteAria", { label: item.label })}</label>
        <textarea id={noteId} value={item.note ?? ""} placeholder={t("viewing.notePlaceholder")} rows={2} onChange={(event) => { checklistState.updateNote(item.id, event.target.value); }} />
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
    {checklistState.error && <p className="form-message" role="status">{checklistState.error}{authStatus === "anonymous" && <> <Link href="/login">{t("logIn")}</Link></>}</p>}
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
