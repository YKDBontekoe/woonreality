"use client";

import { ChangeEvent, useState } from "react";
import type { CaseDocument, CaseTask } from "@/src/lib/supabase/database.types";

export function CaseTools({ caseId, initialDocuments, initialTasks }: { caseId: string; initialDocuments: CaseDocument[]; initialTasks: CaseTask[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [tasks, setTasks] = useState(initialTasks);
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
      const body = await response.json() as { document?: CaseDocument; error?: string };
      if (!response.ok || !body.document) throw new Error(body.error ?? "Uploaden is niet gelukt.");
      setDocuments((current) => [body.document!, ...current]);
      setMessage("Document opgeslagen en gecontroleerd.");
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

  return <div className="case-tools">
    <section className="case-panel"><div className="section-inline-heading"><div><span className="section-kicker">Documenten</span><h2>Upload wat je al hebt</h2><p>Begin met de brochure, vragenlijst of het energielabel. PDF, maximaal 20 MB.</p></div><label className="secondary-button upload-button">{uploading ? "Lezen…" : "PDF kiezen"}<input type="file" accept="application/pdf,.pdf" onChange={upload} disabled={uploading} /></label></div>{message && <p className="form-message" role="status">{message}</p>}{documents.length ? <div className="document-list">{documents.map((document) => <div className="document-row" key={document.id}><span className="document-icon">PDF</span><span><strong>{document.filename}</strong><small>{document.document_type} · {document.status === "ready" ? "gelezen" : document.status}</small></span></div>)}</div> : <p className="muted-copy">Nog geen documenten. Je kunt ook later verdergaan.</p>}</section>
    <section className="case-panel"><span className="section-kicker">Je eerstvolgende acties</span><h2>Rustig stap voor stap</h2><div className="task-list">{tasks.length ? tasks.map((task) => <label className={`task-row ${task.status === "done" ? "done" : ""}`} key={task.id}><input type="checkbox" checked={task.status === "done"} onChange={() => toggleTask(task)} /><span><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}</span></label>) : <p className="muted-copy">Geen open acties. Je loopt voor op schema.</p>}</div></section>
  </div>;
}
