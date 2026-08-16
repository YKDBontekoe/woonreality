"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Puzzle, RefreshCw, Unplug } from "lucide-react";

type TokenRow = { id: string; label: string; created_at: string; last_used_at: string | null };

export function ExtensionSetup() {
  const [detected, setDetected] = useState(false);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [message, setMessage] = useState("");
  const [oneTimeToken, setOneTimeToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data as { type?: string; ok?: boolean; error?: string; version?: string } | null;
      if (data?.type === "woonreality-extension-hello") setDetected(true);
      if (data?.type === "woonreality-extension-paired") {
        setMessage(data.ok ? "Deze browser is gekoppeld. Open een Funda-advertentie om kenmerken te bewaren." : (data.error ?? "Koppelen is niet gelukt."));
        void loadTokens();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function loadTokens() {
    const response = await fetch("/api/listing/extension/token", { cache: "no-store" });
    if (response.status === 401) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    if (!response.ok) return;
    const body = await response.json() as { tokens?: TokenRow[] };
    setTokens(body.tokens ?? []);
  }

  useEffect(() => {
    void loadTokens();
  }, []);

  async function pair() {
    setBusy(true);
    setMessage("");
    setOneTimeToken("");
    try {
      const response = await fetch("/api/listing/extension/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: navigator.userAgent }),
      });
      const body = await response.json() as { token?: string; error?: string };
      if (response.status === 401) {
        setAuthed(false);
        setMessage("Log in om de extensie te koppelen.");
        return;
      }
      if (!response.ok || !body.token) {
        setMessage(body.error ?? "Koppelcode kon niet worden aangemaakt.");
        return;
      }
      setOneTimeToken(body.token);
      window.postMessage({ type: "woonreality-extension-pair", token: body.token }, "*");
      await loadTokens();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/listing/extension/token/${id}`, { method: "DELETE" });
      await loadTokens();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="listing-intake-card">
      <p>
        {detected
          ? "De WoonReality-extensie is in deze browser gevonden."
          : "Installeer eerst de extensie. Daarna kun je deze browser koppelen aan je account."}
      </p>
      {authed === false && (
        <p>
          <Link href="/login">Log in</Link> om kenmerken in je dossier te bewaren.
        </p>
      )}
      {authed && (
        <>
          <button className="primary-button" type="button" disabled={busy} onClick={() => { void pair(); }}>
            {busy ? <RefreshCw size={14} className="spin" /> : <Puzzle size={14} />}
            Koppel deze browser
          </button>
          {oneTimeToken && (
            <p className="form-message" role="status">
              Koppelcode (eenmalig): <code>{oneTimeToken}</code>. Als de extensie niet automatisch koppelt, plak je deze code in de popup.
            </p>
          )}
          {tokens.length > 0 && (
            <ul className="extension-token-list">
              {tokens.map((token) => (
                <li key={token.id}>
                  <span>
                    <strong>{token.label || "Browser-extensie"}</strong>
                    <small> sinds {new Date(token.created_at).toLocaleString("nl-NL")}{token.last_used_at ? ` · laatst ${new Date(token.last_used_at).toLocaleString("nl-NL")}` : ""}</small>
                  </span>
                  <button className="text-link" type="button" onClick={() => { void revoke(token.id); }}>
                    <Unplug size={14} /> Intrekken
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {message && <p className="form-message" role="status">{message}</p>}
    </div>
  );
}
