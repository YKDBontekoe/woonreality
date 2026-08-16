import assert from "node:assert/strict";
import test from "node:test";
import { authErrorMessage } from "@/src/lib/supabase/auth-message";
import { fetchPasskeyAvailability } from "@/src/lib/supabase/passkey-availability";

test("auth errors have safe Dutch messages", () => {
  assert.equal(authErrorMessage({ code: "email_not_confirmed" }, "fallback"), "Bevestig eerst je e-mailadres via de link in je inbox.");
  assert.equal(authErrorMessage({ code: "user_banned" }, "fallback"), "Dit account kan momenteel niet inloggen.");
  assert.equal(authErrorMessage({ code: "webauthn_verification_failed" }, "fallback"), "Je passkey kon niet worden geverifieerd. Probeer het opnieuw of gebruik e-mail.");
  assert.match(authErrorMessage({ code: "passkey_disabled" }, "fallback"), /Passkeys staan nog uit/);
  assert.match(authErrorMessage({ code: "ERROR_INVALID_RP_ID" }, "fallback"), /domeininstelling/);
  assert.match(authErrorMessage({ message: "Passkeys are disabled" }, "fallback"), /Passkeys staan nog uit/);
  assert.equal(authErrorMessage({ code: "unknown" }, "fallback"), "fallback");
});

test("fetchPasskeyAvailability reads passkeys_enabled", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";

  const disabled = await fetchPasskeyAvailability(async () =>
    new Response(JSON.stringify({ passkeys_enabled: false }), { status: 200 })
  );
  assert.equal(disabled.status, "disabled");

  const enabled = await fetchPasskeyAvailability(async () =>
    new Response(JSON.stringify({ passkeys_enabled: true }), { status: 200 })
  );
  assert.equal(enabled.status, "enabled");
});
