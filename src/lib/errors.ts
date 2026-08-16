/**
 * Converts a caught error into a message that is safe to show end users.
 *
 * Upstream client errors (`src/lib/sources/pdok/client.ts` and friends) throw
 * messages that include the full request URL (and sometimes an HTTP status
 * code) for developer debugging. Surfacing that verbatim in the UI leaks
 * internal architecture (which government API we call, how it's shaped) and
 * looks unpolished. Only explicitly typed user-safe errors may return their
 * own message; everything else falls back to a generic Dutch string.
 */

export class UserSafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserSafeError";
  }
}

/** Redacts an unknown error for server logs — never dump raw Error objects that may contain URLs or secrets. */
export function redactError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const message = error.message || error.name || "Error";
  if (/https?:\/\//i.test(message)) return `${error.name}: [redacted URL]`;
  if (/_API_KEY|_SECRET|process\.env/i.test(message)) return `${error.name}: [redacted secret]`;
  return `${error.name}: ${message}`;
}

export function toUserMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  if (error instanceof UserSafeError) return error.message;
  return fallback;
}
