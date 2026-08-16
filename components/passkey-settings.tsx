"use client";

import { KeyRound, MailCheck, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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
          message: authErrorMessage(error, "Passkeys konden niet worden geladen."),
        });
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function addPasskey() {
    if (!emailConfirmed) {
      setMessage("Bevestig eerst je e-mailadres via de link in je inbox.");
      return;
    }
    if (state.kind === "disabled") {
      setMessage(authErrorMessage({ code: "passkey_disabled" }, "Passkeys staan nog uit in dit project."));
      return;
    }
    if (!window.PublicKeyCredential) {
      setMessage("Deze browser ondersteunt geen passkeys. Gebruik een recente browser of je wachtwoordmanager.");
      return;
    }
    if (!window.isSecureContext) {
      setMessage("Passkeys werken alleen via HTTPS of localhost.");
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
      setMessage("Je passkey is toegevoegd. Volgende keer kun je hiermee direct inloggen.");
    } catch (error) {
      setMessage(authErrorMessage(error, "Je passkey kon niet worden toegevoegd."));
    } finally {
      setBusy(false);
    }
  }

  const helperText = state.kind === "disabled"
    ? "Passkeys staan nog uit in Supabase. Schakel ze in via Authentication → Passkeys met RP ID woonreality.vercel.app."
    : state.kind === "error"
      ? state.message
      : state.kind === "ready"
        ? state.count === 0
          ? "Nog geen passkey toegevoegd."
          : `${state.count} passkey${state.count === 1 ? "" : "s"} actief op je account.`
        : "Voeg een passkey toe voor inloggen met Face ID, Touch ID of je wachtwoordmanager.";

  const canAdd = emailConfirmed && state.kind !== "disabled" && state.kind !== "loading" && state.kind !== "error";

  return <section className={`passkey-panel ${suggestEnrollment ? "suggested" : ""}`} aria-labelledby="passkey-heading">
    <span className="passkey-icon"><KeyRound size={18} /></span>
    <div className="passkey-copy">
      <div className="section-kicker">Accountbeveiliging</div>
      <h2 id="passkey-heading">Inloggen met passkey</h2>
      <p><MailCheck size={14} /> {emailConfirmed ? `${email} is bevestigd.` : "Je e-mailadres is nog niet bevestigd."}</p>
      <small>{helperText}</small>
    </div>
    <button className="secondary-button" type="button" onClick={addPasskey} disabled={busy || !canAdd}>
      <Plus size={15} />
      {busy ? "Passkey wordt toegevoegd…" : state.kind === "ready" && state.count > 0 ? "Nog een passkey" : "Passkey toevoegen"}
    </button>
    {message && <p className="passkey-message" role="status">{message}</p>}
  </section>;
}
