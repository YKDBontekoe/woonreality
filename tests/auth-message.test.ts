import assert from "node:assert/strict";
import test from "node:test";
import { authErrorMessage } from "@/src/lib/supabase/auth-message";

test("auth errors have safe Dutch messages", () => {
  assert.equal(authErrorMessage({ code: "email_not_confirmed" }, "fallback"), "Bevestig eerst je e-mailadres via de link in je inbox.");
  assert.equal(authErrorMessage({ code: "user_banned" }, "fallback"), "Dit account kan momenteel niet inloggen.");
  assert.equal(authErrorMessage({ code: "webauthn_verification_failed" }, "fallback"), "Je passkey kon niet worden geverifieerd. Probeer het opnieuw of gebruik e-mail.");
  assert.equal(authErrorMessage({ code: "unknown" }, "fallback"), "fallback");
});
