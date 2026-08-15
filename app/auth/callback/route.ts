import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const setup = url.searchParams.get("setup");

  if (!code && url.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/login?error=invalid-link", url.origin));
  }

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } catch {
      return NextResponse.redirect(new URL("/login?error=invalid-link", url.origin));
    }
  }
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/mijn-aankoop";
  const destination = new URL(safeNext, url.origin);
  if (setup === "passkey" && destination.pathname === "/mijn-aankoop") destination.searchParams.set("setup", "passkey");
  return NextResponse.redirect(destination);
}
