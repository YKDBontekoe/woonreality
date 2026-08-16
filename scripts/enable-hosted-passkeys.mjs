#!/usr/bin/env node
/**
 * Enables Supabase Auth passkeys for the hosted WoonReality project.
 *
 * Requires a personal access token from:
 * https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/enable-hosted-passkeys.mjs
 */

const projectRef = process.env.SUPABASE_PROJECT_REF || "rpldytzigzhzkivajepe";
const token = process.env.SUPABASE_ACCESS_TOKEN;
const rpId = process.env.WEBAUTHN_RP_ID || "woonreality.vercel.app";
const rpOrigins = process.env.WEBAUTHN_RP_ORIGINS || "https://woonreality.vercel.app";
const rpDisplayName = process.env.WEBAUTHN_RP_DISPLAY_NAME || "WoonReality";

if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN first (Dashboard → Account → Access Tokens).");
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

const response = await fetch(endpoint, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    passkey_enabled: true,
    webauthn_rp_display_name: rpDisplayName,
    webauthn_rp_id: rpId,
    webauthn_rp_origins: rpOrigins,
  }),
});

const body = await response.text();
if (!response.ok) {
  console.error(`Failed to enable passkeys (${response.status}): ${body}`);
  process.exit(1);
}

console.log(`Passkeys enabled for ${projectRef}`);
console.log(`RP ID: ${rpId}`);
console.log(`Origins: ${rpOrigins}`);
