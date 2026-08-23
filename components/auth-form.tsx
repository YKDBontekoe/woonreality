"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound, MailCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";
import { authErrorMessage } from "@/src/lib/supabase/auth-message";
import { fetchPasskeyAvailability } from "@/src/lib/supabase/passkey-availability";

export function AuthForm({ initialMessage = "", nextPath = "" }: { initialMessage?: string; nextPath?: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeysEnabled, setPasskeysEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void fetchPasskeyAvailability().then((availability) => {
      if (!active) return;
      if (availability.status === "enabled") setPasskeysEnabled(true);
      else if (availability.status === "disabled") setPasskeysEnabled(false);
      else setPasskeysEnabled(null);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: nextPath
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
            : `${window.location.origin}/auth/callback?next=/onboarding&setup=passkey`,
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
    if (passkeysEnabled === false) {
      setMessage(authErrorMessage({ code: "passkey_disabled" }, "Passkeys staan nog uit in dit project."));
      return;
    }
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
      window.location.assign(nextPath || "/onboarding");
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
    {passkeysEnabled !== false && <>
      <div className="auth-divider"><span>of</span></div>
      <button className="secondary-button passkey-login" type="button" onClick={signInWithPasskey} disabled={passkeyBusy || passkeysEnabled === null}><KeyRound size={15} />{passkeyBusy ? "Passkey wordt gecontroleerd…" : "Log in met passkey"}</button>
    </>}
    {message && <p className="form-message" role="status">{message}</p>}
    <p className="auth-helper">Nieuw hier? Je eerste e-maillink bevestigt je adres. Daarna kun je vrijblijvend een passkey toevoegen.</p>
  </div>;
}
