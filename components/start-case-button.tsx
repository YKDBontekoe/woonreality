"use client";

import { useState } from "react";

export function StartCaseButton({ bagVboId }: { bagVboId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function start() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bagVboId }) });
      const body = await response.json() as { case?: { id: string }; error?: string };
      if (response.status === 401) { window.location.href = "/login"; return; }
      if (!response.ok || !body.case) throw new Error(body.error ?? "Dossier kon niet worden gestart.");
      window.location.href = `/mijn-aankoop?case=${encodeURIComponent(body.case.id)}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dossier kon niet worden gestart.");
      setBusy(false);
    }
  }

  return <div className="start-case-wrap"><button className="primary-button" type="button" onClick={start} disabled={busy}>{busy ? "Dossier wordt gestart…" : "Start mijn aankoopdossier"}</button>{message && <small className="form-message" role="alert">{message}</small>}</div>;
}
