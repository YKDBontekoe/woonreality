import { redactError } from "@/src/lib/errors";

/**
 * Single place for server-side logging so every logged error passes through
 * redactError(). Raw console.warn(error) calls used to leak upstream URLs and
 * env-var names into logs; this keeps the redaction policy from errors.ts
 * enforced at every call site.
 */
export function logWarn(message: string, error?: unknown) {
  if (error === undefined) {
    console.warn(message);
    return;
  }
  console.warn(message, redactError(error));
}

export function logError(message: string, error?: unknown) {
  if (error === undefined) {
    console.error(message);
    return;
  }
  console.error(message, redactError(error));
}
