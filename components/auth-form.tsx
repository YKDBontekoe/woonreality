"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/mijn-aankoop` },
      });
      if (error) throw error;
      setMessage("Check je inbox. Klik op de link om verder te gaan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "De inloglink kon niet worden verstuurd.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="auth-form" onSubmit={submit}>
    <label htmlFor="email">E-mailadres</label>
    <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jij@email.nl" />
    <button className="primary-button" type="submit" disabled={busy}>{busy ? "Link wordt verstuurd…" : "Stuur mij een inloglink"}</button>
    {message && <p className="form-message" role="status">{message}</p>}
  </form>;
}
