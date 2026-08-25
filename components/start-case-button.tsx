"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, redirectToLogin } from "@/components/hooks/use-api";

export function StartCaseButton({ bagVboId }: { bagVboId: string }) {
  const t = useTranslations("mijn-aankoop");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function start() {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiFetch<{ case?: { id: string }; error?: string }>("/api/cases", { method: "POST", json: { bagVboId } });
      if (result.status === 401) { redirectToLogin(); return; }
      if (!result.ok || !result.data?.case) throw new Error(result.data?.error ?? t("startCaseError"));
      window.location.href = `/mijn-aankoop/${encodeURIComponent(result.data.case.id)}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("startCaseError"));
      setBusy(false);
    }
  }

  return <div className="start-case-wrap"><button className="primary-button" type="button" onClick={start} disabled={busy}>{busy ? t("startingCase") : t("startCaseCta")}</button>{message && <small className="form-message" role="alert">{message}</small>}</div>;
}
