type AuthErrorLike = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
};

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "";
  }

  const { code } = error as AuthErrorLike;
  return typeof code === "string" ? code : "";
}

function errorMessage(error: unknown) {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return "";
  }

  const { message } = error as AuthErrorLike;
  return typeof message === "string" ? message : "";
}

export function authErrorMessage(error: unknown, fallback: string) {
  switch (errorCode(error)) {
    case "email_not_confirmed":
      return "Bevestig eerst je e-mailadres via de link in je inbox.";
    case "user_banned":
      return "Dit account kan momenteel niet inloggen.";
    case "passkey_disabled":
      return "Passkeys staan nog uit in dit project. Schakel ze in via Authentication → Passkeys in het Supabase Dashboard (RP ID: woonreality.vercel.app).";
    case "too_many_passkeys":
      return "Je hebt het maximale aantal passkeys bereikt. Verwijder er eerst één.";
    case "webauthn_credential_exists":
      return "Deze passkey staat al op je account.";
    case "webauthn_credential_not_found":
      return "Deze passkey is niet gekoppeld aan je account. Probeer e-mail.";
    case "webauthn_challenge_not_found":
    case "webauthn_challenge_expired":
      return "De passkey-controle is verlopen. Probeer het opnieuw.";
    case "webauthn_verification_failed":
      return "Je passkey kon niet worden geverifieerd. Probeer het opnieuw of gebruik e-mail.";
    case "ERROR_CEREMONY_ABORTED":
      return "Passkey-aanvraag geannuleerd. Probeer het opnieuw wanneer je klaar bent.";
    case "ERROR_INVALID_DOMAIN":
    case "ERROR_INVALID_RP_ID":
      return "Deze website mist de juiste passkey-domeininstelling. Controleer de Relying Party ID en origins in Supabase.";
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return "Deze passkey staat al op je account.";
    case "ERROR_AUTHENTICATOR_GENERAL_ERROR":
    case "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT":
    case "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT":
    case "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG":
    case "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE":
      return "Je apparaat of wachtwoordmanager kon de passkey niet afronden. Probeer een andere browser of manager.";
    default:
      break;
  }

  const message = errorMessage(error).toLowerCase();
  if (message.includes("passkeys are disabled") || (message.includes("passkey") && message.includes("disabled"))) {
    return "Passkeys staan nog uit in dit project. Schakel ze in via Authentication → Passkeys in het Supabase Dashboard (RP ID: woonreality.vercel.app).";
  }

  return fallback;
}
