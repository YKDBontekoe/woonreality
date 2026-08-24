"use client";

import { KeyRound, MailCheck, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";
import { authErrorMessage } from "@/src/lib/supabase/auth-message";
import { fetchPasskeyAvailability } from "@/src/lib/supabase/passkey-availability";

type PasskeySettingsProps = {
  email: string;
  emailConfirmed: boolean;
  suggestEnrollment?: boolean;
};

type PasskeyState =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "ready"; count: number }
  | { kind: "error"; message: string };

export function PasskeySettings({ email, emailConfirmed, suggestEnrollment = false }: PasskeySettingsProps) {
  const t = useTranslations("mijn-aankoop");
  const [state, setState] = useState<PasskeyState>({ kind: "loading" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const availability = await fetchPasskeyAvailability();
      if (!active) return;

      if (availability.status === "disabled") {
        setState({ kind: "disabled" });
        return;
      }

      try {
        const { data, error } = await createSupabaseBrowserClient().auth.passkey.list();
        if (error) throw error;
        if (active) setState({ kind: "ready", count: data.length });
      } catch (error) {
        if (!active) return;
        const code = typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : "";
        if (code === "passkey_disabled") {
          setState({ kind: "disabled" });
          return;
        }
        setState({
          kind: "error",
          message: authErrorMessage(error, t("passkeysLoadFailed")),
        });
      }
    }
    void load();
    return () => { active = false; };
  }, [t]);

  async function addPasskey() {
    if (!emailConfirmed) {
      setMessage(t("confirmEmailFirst"));
      return;
    }
    if (state.kind === "disabled") {
      setMessage(authErrorMessage({ code: "passkey_disabled" }, t("passkeysDisabledProject")));
      return;
    }
    if (!window.PublicKeyCredential) {
      setMessage(t("browserNoPasskeys"));
      return;
    }
    if (!window.isSecureContext) {
      setMessage(t("passkeysNeedSecureContext"));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().auth.registerPasskey();
      if (error) throw error;
      const { data, error: listError } = await createSupabaseBrowserClient().auth.passkey.list();
      if (listError) throw listError;
      setState({ kind: "ready", count: data?.length ?? 0 });
      setMessage(t("passkeyAdded"));
    } catch (error) {
      setMessage(authErrorMessage(error, t("passkeyAddFailed")));
    } finally {
      setBusy(false);
    }
  }

  const helperText = state.kind === "disabled"
    ? t("passkeysDisabledAdmin")
    : state.kind === "error"
      ? state.message
      : state.kind === "ready"
        ? state.count === 0
          ? t("noPasskeysYet")
          : t("passkeyCount", { count: state.count })
        : t("passkeyHelper");

  const canAdd = emailConfirmed && state.kind !== "disabled" && state.kind !== "loading" && state.kind !== "error";

  return <section className={`passkey-panel ${suggestEnrollment ? "suggested" : ""}`} aria-labelledby="passkey-heading">
    <span className="passkey-icon"><KeyRound size={18} /></span>
    <div className="passkey-copy">
      <div className="section-kicker">{t("securityKicker")}</div>
      <h2 id="passkey-heading">{t("passkeyTitle")}</h2>
      <p><MailCheck size={14} /> {emailConfirmed ? t("emailConfirmed", { email }) : t("emailUnconfirmed")}</p>
      <small>{helperText}</small>
    </div>
    <button className="secondary-button" type="button" onClick={addPasskey} disabled={busy || !canAdd}>
      <Plus size={15} />
      {busy ? t("addingPasskey") : state.kind === "ready" && state.count > 0 ? t("addAnotherPasskey") : t("addPasskey")}
    </button>
    {message && <p className="passkey-message" role="status">{message}</p>}
  </section>;
}
