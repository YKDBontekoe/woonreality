"use client";

import { FormEvent, useState } from "react";
import { KeyRound, MailCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";
import { authErrorMessage } from "@/src/lib/supabase/auth-message";

export function AuthForm({ initialMessage = "" }: { initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding&setup=passkey`,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setMessage("We hebben een veilige link gestuurd. Bevestig je e-mailadres via die link om verder te gaan.");
    } catch (error) {
      setMessage(authErrorMessage(error, "De inloglink kon niet worden verstuurd."));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPasskey() {
    if (!window.PublicKeyCredential) {
      setMessage("Deze browser ondersteunt nog geen passkeys. Ga verder met e-mail.");
      return;
    }
    setPasskeyBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      if (!data.session) throw new Error("Er kon geen sessie met je passkey worden gestart.");
      window.location.assign("/onboarding");
    } catch (error) {
      setMessage(authErrorMessage(error, "Inloggen met passkey lukt nu niet. Probeer e-mail."));
    } finally {
      setPasskeyBusy(false);
    }
  }

  return <div className="auth-methods">
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="email">E-mailadres</label>
      <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jij@email.nl" />
      <button className="primary-button" type="submit" disabled={busy}><MailCheck size={15} />{busy ? "Link wordt verstuurd…" : "Ga verder met e-mail"}</button>
    </form>
    <div className="auth-divider"><span>of</span></div>
    <button className="secondary-button passkey-login" type="button" onClick={signInWithPasskey} disabled={passkeyBusy}><KeyRound size={15} />{passkeyBusy ? "Passkey wordt gecontroleerd…" : "Log in met passkey"}</button>
    {message && <p className="form-message" role="status">{message}</p>}
    <p className="auth-helper">Nieuw hier? Je eerste e-maillink bevestigt je adres. Daarna kun je vrijblijvend een passkey toevoegen.</p>
  </div>;
}
