"use client";

import { KeyRound, MailCheck, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";

type PasskeySettingsProps = {
  email: string;
  emailConfirmed: boolean;
  suggestEnrollment?: boolean;
};

export function PasskeySettings({ email, emailConfirmed, suggestEnrollment = false }: PasskeySettingsProps) {
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await createSupabaseBrowserClient().auth.passkey.list();
        if (error) throw error;
        if (active) setPasskeyCount(data.length);
      } catch {
        // A hosted project may not have passkeys enabled yet. Keep the setup
        // guidance visible instead of exposing implementation detail to users.
        if (active) setPasskeyCount(null);
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
    if (!window.PublicKeyCredential) {
      setMessage("Deze browser ondersteunt geen passkeys. Gebruik een recente browser of je wachtwoordmanager.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().auth.registerPasskey();
      if (error) throw error;
      const { data } = await createSupabaseBrowserClient().auth.passkey.list();
      setPasskeyCount(data?.length ?? null);
      setMessage("Je passkey is toegevoegd. Volgende keer kun je hiermee direct inloggen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Je passkey kon niet worden toegevoegd.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={`passkey-panel ${suggestEnrollment ? "suggested" : ""}`} aria-labelledby="passkey-heading">
    <span className="passkey-icon"><KeyRound size={18} /></span>
    <div className="passkey-copy">
      <div className="section-kicker">Accountbeveiliging</div>
      <h2 id="passkey-heading">Inloggen met passkey</h2>
      <p><MailCheck size={14} /> {emailConfirmed ? `${email} is bevestigd.` : "Je e-mailadres is nog niet bevestigd."}</p>
      <small>{passkeyCount == null ? "Voeg een passkey toe voor inloggen met Face ID, Touch ID of je wachtwoordmanager." : passkeyCount === 0 ? "Nog geen passkey toegevoegd." : `${passkeyCount} passkey${passkeyCount === 1 ? "" : "s"} actief op je account.`}</small>
    </div>
    <button className="secondary-button" type="button" onClick={addPasskey} disabled={busy || !emailConfirmed}><Plus size={15} />{busy ? "Passkey wordt toegevoegd…" : passkeyCount && passkeyCount > 0 ? "Nog een passkey" : "Passkey toevoegen"}</button>
    {message && <p className="passkey-message" role="status">{message}</p>}
  </section>;
}
