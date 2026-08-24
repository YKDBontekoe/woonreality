"use client";

import { ChangeEvent, useState } from "react";
import { useTranslations } from "next-intl";
import type { CaseDocument, CaseTask, DocumentFinding } from "@/src/lib/supabase/database.types";

export function CaseTools({ caseId, initialDocuments, initialTasks, initialFindings = [] }: { caseId: string; initialDocuments: CaseDocument[]; initialTasks: CaseTask[]; initialFindings?: DocumentFinding[] }) {
  const t = useTranslations("mijn-aankoop");
  const [documents, setDocuments] = useState(initialDocuments);
  const [tasks, setTasks] = useState(initialTasks);
  const [findings, setFindings] = useState(initialFindings);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage("");
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/documents`, { method: "POST", body: formData });
      const body = await response.json() as { document?: CaseDocument; findings?: DocumentFinding[]; error?: string };
      if (!response.ok || !body.document) throw new Error(body.error ?? t("uploadFailed"));
      setDocuments((current) => [body.document!, ...current]);
      if (body.findings?.length) setFindings((current) => [...body.findings!, ...current]);
      setMessage(body.findings?.length ? t("uploadFindings", { count: body.findings.length }) : t("uploadSavedNoFindings"));
      const tasksResponse = await fetch(`/api/cases/${encodeURIComponent(caseId)}/tasks`, { method: "POST" });
      if (tasksResponse.ok) {
        const tasksBody = await tasksResponse.json() as { tasks?: CaseTask[] };
        if (Array.isArray(tasksBody.tasks)) setTasks(tasksBody.tasks);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("uploadFailed"));
    } finally {
      event.target.value = "";
      setUploading(false);
    }
  }

  async function toggleTask(task: CaseTask) {
    const status = task.status === "done" ? "open" : "done";
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? t("taskUpdateFailed"));
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("taskUpdateFailed"));
    }
  }

  async function removeDocument(documentId: string) {
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? t("documentDeleteFailed"));
      setDocuments((current) => current.filter((item) => item.id !== documentId));
      setFindings((current) => current.filter((item) => item.document_id !== documentId));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("documentDeleteFailed"));
    }
  }

  async function resolveFinding(finding: DocumentFinding) {
    const status = finding.status === "open" ? "resolved" : "open";
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/findings/${encodeURIComponent(finding.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? t("findingUpdateFailed"));
      setFindings((current) => current.map((item) => item.id === finding.id ? { ...item, status } : item));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("findingUpdateFailed"));
    }
  }

  const openFindings = findings.filter((item) => item.status === "open");

  return <div className="case-tools">
    <section className="case-panel" id="documenten"><div className="section-inline-heading"><div><span className="section-kicker">{t("documentsKicker")}</span><h2>{t("documentsTitle")}</h2><p>{t("documentsCopy")}</p></div><label className="secondary-button upload-button">{uploading ? t("readingFile") : t("choosePdf")}<input type="file" accept="application/pdf,.pdf" onChange={upload} disabled={uploading} /></label></div>{message && <p className="form-message" role="status">{message}</p>}{documents.length ? <div className="document-list">{documents.map((document) => <div className="document-row" key={document.id}><span className="document-icon">PDF</span><span><strong>{document.filename}</strong><small>{document.document_type} · {document.status === "ready" ? t("statusRead") : document.status}</small></span><button className="text-link" type="button" aria-label={t("removeDocumentAria", { filename: document.filename })} onClick={() => { if (window.confirm(t("removeDocumentConfirm", { filename: document.filename }))) void removeDocument(document.id); }}>{t("remove")}</button></div>)}</div> : <p className="muted-copy">{t("noDocumentsYet")}</p>}</section>
    <section className="case-panel" id="bevindingen"><span className="section-kicker">{t("findingsKicker")}</span><h2>{openFindings.length ? t("findingsTitleOpen") : t("findingsTitleNone")}</h2>{findings.length ? <div className="finding-list">{findings.map((finding) => <article className={`finding-card ${finding.severity} ${finding.status !== "open" ? "resolved" : ""}`} key={finding.id}><div><strong>{finding.title}</strong><p>{finding.summary}</p>{finding.action && <small>{finding.action}</small>}</div><button className="text-link" type="button" onClick={() => { void resolveFinding(finding); }}>{finding.status === "open" ? t("resolveFinding") : t("reopenFinding")}</button></article>)}</div> : <p className="muted-copy">{t("findingsEmptyHint")}</p>}</section>
    <section className="case-panel"><span className="section-kicker">{t("nextActionsKicker")}</span><h2>{t("nextActionsTitle")}</h2><div className="task-list">{tasks.length ? tasks.map((task) => <label className={`task-row ${task.status === "done" ? "done" : ""}`} key={task.id}><input type="checkbox" checked={task.status === "done"} onChange={() => toggleTask(task)} /><span><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}</span></label>) : <p className="muted-copy">{t("noOpenTasks")}</p>}</div></section>
  </div>;
}
