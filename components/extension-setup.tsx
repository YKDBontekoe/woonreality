"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/src/lib/i18n/navigation";
import { Puzzle, RefreshCw, Unplug } from "lucide-react";
import { formatRelativeTime } from "@/src/lib/format-relative";

type TokenRow = { id: string; label: string; created_at: string; last_used_at: string | null };

export function ExtensionSetup() {
  const t = useTranslations("extensie");
  const [detected, setDetected] = useState(false);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [message, setMessage] = useState("");
  const [oneTimeToken, setOneTimeToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data as { type?: string; ok?: boolean; error?: string; version?: string } | null;
      if (data?.type === "woonreality-extension-hello") setDetected(true);
      if (data?.type === "woonreality-extension-paired") {
        setMessage(data.ok ? t("setup.pairedOk") : (data.error ?? t("setup.pairFailed")));
        void loadTokens();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [t]);

  async function loadTokens() {
    const response = await fetch("/api/listing/extension/token", { cache: "no-store" });
    if (response.status === 401) {
      setAuthed(false);
      setServiceAvailable(true);
      return;
    }
    if (!response.ok) {
      setAuthed(null);
      setServiceAvailable(false);
      return;
    }
    setAuthed(true);
    setServiceAvailable(true);
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
        setMessage(t("setup.loginToPair"));
        return;
      }
      if (!response.ok || !body.token) {
        setMessage(body.error ?? t("setup.codeFailed"));
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
    setMessage("");
    try {
      const response = await fetch(`/api/listing/extension/token/${id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? t("setup.revokeFailed"));
        return;
      }
      await loadTokens();
      setMessage(t("setup.revoked"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="listing-intake-card">
      <p>
        {detected
          ? t("setup.detected")
          : t("setup.notDetected")}
      </p>
      {serviceAvailable === false && (
        <p className="extension-setup-note" role="status">
          {t("setup.serviceInactive")}
        </p>
      )}
      {serviceAvailable !== false && authed === false && (
        <p>
          <Link href="/login">{t("setup.loginLink")}</Link> {t("setup.loginPurpose")}
        </p>
      )}
      {serviceAvailable !== false && authed && (
        <>
          <button className="primary-button" type="button" disabled={busy} onClick={() => { void pair(); }}>
            {busy ? <RefreshCw size={14} className="spin" /> : <Puzzle size={14} />}
            {t("setup.pairBrowser")}
          </button>
          {oneTimeToken && (
            <p className="form-message" role="status">
              {t("setup.oneTimeCodePrefix")} <code>{oneTimeToken}</code>{t("setup.oneTimeCodeSuffix")}
            </p>
          )}
          {tokens.length > 0 && (
            <ul className="extension-token-list">
              {tokens.map((token) => (
                <li key={token.id}>
                  <span>
                    <strong>{token.label || t("setup.defaultTokenLabel")}</strong>
                    <small title={new Date(token.created_at).toLocaleString("nl-NL")}> {t("setup.since", { time: formatRelativeTime(token.created_at) })}{token.last_used_at ? t("setup.lastUsed", { time: formatRelativeTime(token.last_used_at) }) : ""}</small>
                  </span>
                  <button className="text-link" type="button" disabled={busy} aria-label={t("setup.revokeAria", { label: token.label || t("setup.defaultBrowserRef") })} onClick={() => { if (window.confirm(t("setup.revokeConfirm", { label: token.label || t("setup.defaultBrowserRef") }))) void revoke(token.id); }}>
                    <Unplug size={14} /> {t("setup.revoke")}
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
