"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";

export function SignOutButton() {
  const t = useTranslations("common");
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
      setMessage(t("signOutFailed"));
      setBusy(false);
    }
  }

  return <div className="sign-out-wrap"><button className="secondary-button" type="button" onClick={() => { void signOut(); }} disabled={busy}>{busy ? t("signingOut") : t("signOut")}</button>{message && <p className="form-message" role="alert">{message}</p>}</div>;
}
