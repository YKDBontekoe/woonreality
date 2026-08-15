type AuthError = {
  code?: unknown;
};

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "";
  }

  const { code } = error as AuthError;
  return typeof code === "string" ? code : "";
}

export function authErrorMessage(error: unknown, fallback: string) {
  switch (errorCode(error)) {
    case "email_not_confirmed":
      return "Bevestig eerst je e-mailadres via de link in je inbox.";
    case "user_banned":
      return "Dit account kan momenteel niet inloggen.";
    case "webauthn_verification_failed":
      return "Je passkey kon niet worden geverifieerd. Probeer het opnieuw of gebruik e-mail.";
    default:
      return fallback;
  }
}
