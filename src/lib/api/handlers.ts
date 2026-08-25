import { NextResponse } from "next/server";
import { z } from "zod";
import type { Database } from "@/src/lib/supabase/database.types";
import { toUserMessage } from "@/src/lib/errors";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator, type LibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { logWarn } from "@/src/lib/logger";

/** Cache-Control for endpoints that serve per-user data and must never be cached. */
export const PRIVATE_NO_STORE = "private, no-store" as const;

export function privateHeaders(): Record<string, string> {
  return { "Cache-Control": PRIVATE_NO_STORE };
}

/** Shared locale + translator preamble for every route handler. */
export function apiContext(request: Request): { locale: Locale; t: LibTranslator } {
  const locale = getLocaleFromRequest(request);
  return { locale, t: getLibTranslator(locale, "lib-api") };
}

export function jsonError(error: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ error }, { status, ...(headers ? { headers } : {}) });
}

/** Shared 400 guard response for route params failing isValidBagId. */
export function invalidBagIdResponse(message: string): NextResponse {
  return jsonError(message, 400);
}

/**
 * Converts a caught route error into a response: the error is redacted into
 * server logs and the user only ever sees the localized fallback (unless the
 * error is explicitly user-safe). Replaces the previous pattern of returning
 * raw `error.message`, which could leak upstream URLs or database details.
 */
export function routeError(error: unknown, fallbackMessage: string, status = 502) {
  logWarn("API route request failed", error);
  return jsonError(toUserMessage(error, fallbackMessage), status);
}

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type AuthUser = Awaited<ReturnType<ServerSupabase["auth"]["getUser"]>>["data"]["user"];

/** Resolves the authenticated user without duplicating auth plumbing per route. */
export async function currentUser(): Promise<{ supabase: ServerSupabase; user: AuthUser }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

export type OwnedCaseContext = {
  supabase: ServerSupabase;
  /** Null when unauthenticated — callers decide the localized 401 message. */
  user: AuthUser;
  /** Null when the case does not exist or belongs to another user. */
  purchaseCase: Database["public"]["Tables"]["purchase_cases"]["Row"] | null;
};

/**
 * Loads a purchase case scoped to the caller. Auth or query failures throw so
 * the handler's catch block produces a uniform redacted error response.
 * `select` defaults to all columns plus the joined property identity.
 */
export async function loadOwnedCase(caseId: string, select = "*, properties(bag_vbo_id, address_label, area_m2, build_year)"): Promise<OwnedCaseContext> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return { supabase, user: null, purchaseCase: null };
  const { data: purchaseCase, error } = await supabase
    .from("purchase_cases")
    .select(select)
    .eq("id", caseId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  // The select string is a runtime parameter, so the row type is widened to
  // the full table row; handlers only rely on columns they selected.
  return { supabase, user: auth.user, purchaseCase: purchaseCase as OwnedCaseContext["purchaseCase"] };
}

export type ParseBodyResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Parses and validates a JSON request body against a zod schema. */
export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>, invalidMessage: string): Promise<ParseBodyResult<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { ok: false, response: jsonError(invalidMessage, 400) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, response: jsonError(invalidMessage, 400) };
  return { ok: true, data: parsed.data };
}
