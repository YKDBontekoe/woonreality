export type PasskeyAvailability =
  | { status: "enabled" }
  | { status: "disabled" }
  | { status: "unknown"; reason?: string };

/**
 * Reads the public Auth settings endpoint. Prefer this over guessing from
 * passkey.list() errors so the UI can explain a disabled project clearly.
 */
export async function fetchPasskeyAvailability(fetchImpl: typeof fetch = fetch): Promise<PasskeyAvailability> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return { status: "unknown", reason: "Supabase is nog niet geconfigureerd." };
  }

  try {
    const response = await fetchImpl(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return { status: "unknown", reason: `Auth-instellingen niet bereikbaar (${response.status}).` };
    }

    const payload = (await response.json()) as { passkeys_enabled?: unknown };
    return payload.passkeys_enabled === true ? { status: "enabled" } : { status: "disabled" };
  } catch (error) {
    return {
      status: "unknown",
      reason: error instanceof Error ? error.message : "Auth-instellingen niet bereikbaar.",
    };
  }
}
