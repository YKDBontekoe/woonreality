# Account, e-mail and passkey setup

WoonReality uses Supabase Auth for passwordless accounts. A user first proves ownership of an e-mail address with a magic link, then may add a passkey for future sign-in.

Production currently runs at `https://woonreality.vercel.app`. WebAuthn relying-party settings must use that hostname (or a future custom domain), not a different apex domain.

## Hosted Supabase project

In **Authentication → Sign In / Providers → Email**:

1. Enable e-mail sign-in and new user sign-ups.
2. Enable **Confirm email**. This ensures a passkey can only be registered after the account e-mail address is verified.
3. Set the site URL to `https://woonreality.vercel.app`.
4. Add both `https://woonreality.vercel.app/auth/callback` and any permitted preview callback URLs to the redirect allow list.

In **Authentication → Passkeys**:

1. Enable passkey authentication.
2. Set the relying-party display name to `WoonReality`.
3. Set the relying-party ID to `woonreality.vercel.app` (must match the production host; `vercel.app` alone is a public suffix and is rejected).
4. Add the matching HTTPS origin: `https://woonreality.vercel.app`.

Or enable the same settings with a personal access token:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/enable-hosted-passkeys.mjs
```

Do not change the relying-party ID after users enrol; existing passkeys will no longer work. Passkeys are currently an experimental Supabase Auth feature, so keep the deployed `@supabase/supabase-js` version pinned and review Supabase release notes before upgrading.

If passkeys stay disabled on the hosted project, the app shows that state instead of a generic "kon niet worden toegevoegd" error. Confirm `passkeys_enabled` via:

```bash
curl -s "https://rpldytzigzhzkivajepe.supabase.co/auth/v1/settings" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  | jq .passkeys_enabled
```

## Local development

`supabase/config.toml` enables e-mail confirmation and passkeys for `localhost` on ports 3000 and 3017. Restart the local Supabase stack after changing that file:

```bash
supabase stop
supabase start
```

When running the Next.js app, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in `.env.local`. The secret key is server-only and must never be exposed through a `NEXT_PUBLIC_` variable.

## User journey

1. The user enters an e-mail address and receives a confirmation link.
2. The callback exchanges the PKCE code for a cookie-backed session and redirects to the purchase dossier.
3. A confirmed user can add a passkey using the browser or password manager ceremony.
4. On future visits, the user can choose **Log in with passkey** without entering their e-mail address.
