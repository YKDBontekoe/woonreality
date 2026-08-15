"use client";

import { ChangeEvent, useState } from "react";
import type { CaseDocument, CaseTask, DocumentFinding } from "@/src/lib/supabase/database.types";

export function CaseTools({ caseId, initialDocuments, initialTasks, initialFindings = [] }: { caseId: string; initialDocuments: CaseDocument[]; initialTasks: CaseTask[]; initialFindings?: DocumentFinding[] }) {
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
      if (!response.ok || !body.document) throw new Error(body.error ?? "Uploaden is niet gelukt.");
      setDocuments((current) => [body.document!, ...current]);
      if (body.findings?.length) setFindings((current) => [...body.findings!, ...current]);
      setMessage(body.findings?.length ? `Gelezen: ${body.findings.length} aandachtspunt${body.findings.length === 1 ? "" : "en"} gevonden.` : "Document opgeslagen. Geen automatische aandachtspunten in de tekst.");
      await fetch(`/api/cases/${encodeURIComponent(caseId)}/tasks`, { method: "POST" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Uploaden is niet gelukt.");
    } finally {
      event.target.value = "";
      setUploading(false);
    }
  }

  async function toggleTask(task: CaseTask) {
    const status = task.status === "done" ? "open" : "done";
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) return;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item));
  }

  async function removeDocument(documentId: string) {
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
    if (!response.ok) return;
    setDocuments((current) => current.filter((item) => item.id !== documentId));
    setFindings((current) => current.filter((item) => item.document_id !== documentId));
  }

  async function resolveFinding(finding: DocumentFinding) {
    const status = finding.status === "open" ? "resolved" : "open";
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/findings/${encodeURIComponent(finding.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) return;
    setFindings((current) => current.map((item) => item.id === finding.id ? { ...item, status } : item));
  }

  const openFindings = findings.filter((item) => item.status === "open");

  return <div className="case-tools">
    <section className="case-panel" id="documenten"><div className="section-inline-heading"><div><span className="section-kicker">Documenten</span><h2>Upload wat je al hebt</h2><p>Brochure, vragenlijst, VvE of koopakte. PDF, maximaal 20 MB. We lezen de tekst en markeren tegenstrijdigheden.</p></div><label className="secondary-button upload-button">{uploading ? "Lezen…" : "PDF kiezen"}<input type="file" accept="application/pdf,.pdf" onChange={upload} disabled={uploading} /></label></div>{message && <p className="form-message" role="status">{message}</p>}{documents.length ? <div className="document-list">{documents.map((document) => <div className="document-row" key={document.id}><span className="document-icon">PDF</span><span><strong>{document.filename}</strong><small>{document.document_type} · {document.status === "ready" ? "gelezen" : document.status}</small></span><button className="text-link" type="button" onClick={() => { void removeDocument(document.id); }}>Verwijder</button></div>)}</div> : <p className="muted-copy">Nog geen documenten. Je kunt ook later verdergaan.</p>}</section>
    <section className="case-panel" id="bevindingen"><span className="section-kicker">Tegenstrijdigheden</span><h2>{openFindings.length ? "Dit moet je nog checken" : "Nog geen open aandachtspunten"}</h2>{findings.length ? <div className="finding-list">{findings.map((finding) => <article className={`finding-card ${finding.severity} ${finding.status !== "open" ? "resolved" : ""}`} key={finding.id}><div><strong>{finding.title}</strong><p>{finding.summary}</p>{finding.action && <small>{finding.action}</small>}</div><button className="text-link" type="button" onClick={() => { void resolveFinding(finding); }}>{finding.status === "open" ? "Afvinken" : "Heropen"}</button></article>)}</div> : <p className="muted-copy">Upload een PDF om automatische aandachtspunten te zien. Dit vervangt geen notaris of keurder.</p>}</section>
    <section className="case-panel"><span className="section-kicker">Je eerstvolgende acties</span><h2>Rustig stap voor stap</h2><div className="task-list">{tasks.length ? tasks.map((task) => <label className={`task-row ${task.status === "done" ? "done" : ""}`} key={task.id}><input type="checkbox" checked={task.status === "done"} onChange={() => toggleTask(task)} /><span><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}</span></label>) : <p className="muted-copy">Geen open acties. Je loopt voor op schema.</p>}</div></section>
  </div>;
}
