"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, KeyRound, MailCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";
import { authErrorMessage } from "@/src/lib/supabase/auth-message";
import { fetchPasskeyAvailability } from "@/src/lib/supabase/passkey-availability";

const RESEND_COOLDOWN_SECONDS = 60;

export function AuthForm({ initialMessage = "", nextPath = "" }: { initialMessage?: string; nextPath?: string }) {
  const t = useTranslations("login");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">(initialMessage ? "error" : "info");
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeysEnabled, setPasskeysEnabled] = useState<boolean | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [supabaseReady, setSupabaseReady] = useState(true);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSupabaseReady(Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
    emailRef.current?.focus();
  }, []);

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

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function showSuccess(text: string) {
    setMessage(text);
    setMessageTone("success");
  }

  function showError(text: string) {
    setMessage(text);
    setMessageTone("error");
  }

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
      showSuccess(t("magicLinkSent", { email }));
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      showError(authErrorMessage(error, t("magicLinkFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPasskey() {
    if (passkeysEnabled === false) {
      showError(authErrorMessage({ code: "passkey_disabled" }, t("passkeysDisabledProject")));
      return;
    }
    if (!window.PublicKeyCredential) {
      showError(t("browserNoPasskeys"));
      return;
    }
    setPasskeyBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      if (!data.session) throw new Error(t("passkeySessionFailed"));
      window.location.assign(nextPath || "/onboarding");
    } catch (error) {
      showError(authErrorMessage(error, t("passkeySignInFailed")));
    } finally {
      setPasskeyBusy(false);
    }
  }

  if (!supabaseReady) {
    return <div className="auth-methods">
      <p className="form-message form-message--error" role="status"><AlertCircle size={15} /> {t("signInUnavailable")}</p>
      <p className="auth-helper">{t("continueWithoutAccount")}</p>
    </div>;
  }

  return <div className="auth-methods">
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="email">{t("emailLabel")}</label>
      <input ref={emailRef} id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jij@email.nl" />
      <button className="primary-button" type="submit" disabled={busy || cooldown > 0}>
        <MailCheck size={15} />{busy ? t("sendingLink") : cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("continueWithEmail")}
      </button>
    </form>
    {passkeysEnabled !== false && <>
      <div className="auth-divider"><span>{t("orDivider")}</span></div>
      <button className="secondary-button passkey-login" type="button" onClick={signInWithPasskey} disabled={passkeyBusy || passkeysEnabled === null || busy}><KeyRound size={15} />{passkeyBusy ? t("checkingPasskey") : t("signInWithPasskey")}</button>
    </>}
    {message && (
      messageTone === "error"
        ? <p className="form-message form-message--error" role="alert"><AlertCircle size={15} />{message}</p>
        : <p className="form-message form-message--success" role="status"><CheckCircle2 size={15} />{message}</p>
    )}
    <p className="auth-helper">{t("newHereHelper")}</p>
  </div>;
}
