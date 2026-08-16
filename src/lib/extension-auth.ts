import { createHash, randomBytes } from "node:crypto";

export const EXTENSION_TOKEN_PREFIX = "wr_ext_";
export const EXTENSION_INGEST_LIMIT_PER_HOUR = 60;

export function hashExtensionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createExtensionToken() {
  return `${EXTENSION_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
}

export function publicSiteOrigin() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production") return "https://woonreality.vercel.app";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
