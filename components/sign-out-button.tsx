"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function signOut() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      window.location.href = "/";
    } catch {
      setMessage("Uitloggen lukt nu niet. Probeer het opnieuw.");
      setBusy(false);
    }
  }

  return <div className="sign-out-wrap"><button className="secondary-button" type="button" onClick={() => { void signOut(); }} disabled={busy}>{busy ? "Uitloggen…" : "Uitloggen"}</button>{message && <p className="form-message" role="alert">{message}</p>}</div>;
}
