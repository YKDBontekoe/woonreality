# Account, e-mail and passkey setup

WoonReality uses Supabase Auth for passwordless accounts. A user first proves ownership of an e-mail address with a magic link, then may add a passkey for future sign-in.

## Hosted Supabase project

In **Authentication → Sign In / Providers → Email**:

1. Enable e-mail sign-in and new user sign-ups.
2. Enable **Confirm email**. This ensures a passkey can only be registered after the account e-mail address is verified.
3. Set the site URL to the production application URL.
4. Add both `https://your-domain/auth/callback` and any permitted preview callback URLs to the redirect allow list.

In **Authentication → Passkeys**:

1. Enable passkey authentication.
2. Set the relying-party display name to `WoonReality`.
3. Set the relying-party ID to the stable production domain only, for example `woonreality.nl`.
4. Add the matching HTTPS origin, for example `https://woonreality.nl`.

Do not change the relying-party ID after users enrol; existing passkeys will no longer work. Passkeys are currently an experimental Supabase Auth feature, so keep the deployed `@supabase/supabase-js` version pinned and review Supabase release notes before upgrading.

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
