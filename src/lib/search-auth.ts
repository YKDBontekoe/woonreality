import { NextResponse } from "next/server";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

/**
 * Returns a 401 NextResponse when search login is required and the user is not
 * authenticated, or `null` when the request may proceed.
 *
 * The guard is active when Supabase is configured **and**
 * `REQUIRE_LOGIN_FOR_SEARCH` is not explicitly set to `"false"`.
 */
export async function requireSearchLogin(): Promise<NextResponse | null> {
  if (process.env.REQUIRE_LOGIN_FOR_SEARCH === "false") return null;
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Log in om adressen te zoeken." },
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Log in om adressen te zoeken." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return null;
}
