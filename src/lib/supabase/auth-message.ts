import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

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

export function authErrorMessage(error: unknown, fallback: string, locale: Locale = "nl") {
  const t = getLibTranslator(locale, "lib-domain");
  switch (errorCode(error)) {
    case "email_not_confirmed":
      return t("auth.emailNotConfirmed");
    case "user_banned":
      return t("auth.userBanned");
    case "passkey_disabled":
      return t("auth.passkeysDisabled");
    case "too_many_passkeys":
      return t("auth.tooManyPasskeys");
    case "webauthn_credential_exists":
      return t("auth.passkeyAlreadyLinked");
    case "webauthn_credential_not_found":
      return t("auth.passkeyNotLinked");
    case "webauthn_challenge_not_found":
    case "webauthn_challenge_expired":
      return t("auth.challengeExpired");
    case "webauthn_verification_failed":
      return t("auth.verificationFailed");
    case "ERROR_CEREMONY_ABORTED":
      return t("auth.ceremonyAborted");
    case "ERROR_INVALID_DOMAIN":
    case "ERROR_INVALID_RP_ID":
      return t("auth.invalidDomain");
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return t("auth.passkeyAlreadyLinked");
    case "ERROR_AUTHENTICATOR_GENERAL_ERROR":
    case "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT":
    case "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT":
    case "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG":
    case "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE":
      return t("auth.deviceFailed");
    default:
      break;
  }

  const message = errorMessage(error).toLowerCase();
  if (message.includes("passkeys are disabled") || (message.includes("passkey") && message.includes("disabled"))) {
    return t("auth.passkeysDisabled");
  }

  return fallback;
}
