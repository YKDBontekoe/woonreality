/**
 * Converts a caught error into a message that is safe to show end users.
 *
 * Upstream client errors (`src/lib/sources/pdok/client.ts` and friends) throw
 * messages that include the full request URL (and sometimes an HTTP status
 * code) for developer debugging. Surfacing that verbatim in the UI leaks
 * internal architecture (which government API we call, how it's shaped) and
 * looks unpolished. This strips those internals and falls back to a generic,
 * friendly Dutch message instead.
 */
export function toUserMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const message = error.message;
  // Never leak raw upstream URLs, env var names, or stack-trace-like content.
  if (/https?:\/\//i.test(message)) return fallback;
  if (/_API_KEY|_SECRET|process\.env/i.test(message)) return fallback;
  if (/^(PDOK|RIVM|CBS|NDOV|EP-Online|DSO)\b.*request failed/i.test(message)) return fallback;
  return message;
}
