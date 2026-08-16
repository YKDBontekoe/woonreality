import { NextResponse } from "next/server";
import { createExtensionToken, hashExtensionToken } from "@/src/lib/extension-auth";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

const PRIVATE = { "Cache-Control": "private, no-store" };

function tokenLabel(request: Request, bodyLabel?: string) {
  const provided = bodyLabel?.trim().slice(0, 80);
  if (provided) return provided;
  const ua = request.headers.get("user-agent") ?? "";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome|chromium/i.test(ua)) return "Chrome";
  return "Browser-extensie";
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Account is hier niet geconfigureerd." }, { status: 503, headers: PRIVATE });
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Log in om de extensie te koppelen." }, { status: 401, headers: PRIVATE });
    const { data, error } = await supabase
      .from("listing_extension_tokens")
      .select("id, label, created_at, last_used_at, revoked_at")
      .eq("user_id", auth.user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ tokens: data ?? [] }, { headers: PRIVATE });
  } catch {
    return NextResponse.json({ error: "Koppelcodes konden niet worden geladen." }, { status: 502, headers: PRIVATE });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Account is hier niet geconfigureerd." }, { status: 503, headers: PRIVATE });
  }
  let label: string | undefined;
  try {
    const raw = await request.json() as { label?: string };
    if (typeof raw.label === "string") label = raw.label;
  } catch {
    /* empty body is fine */
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Log in om de extensie te koppelen." }, { status: 401, headers: PRIVATE });
    const token = createExtensionToken();
    const { data, error } = await supabase.from("listing_extension_tokens").insert({
      user_id: auth.user.id,
      token_hash: hashExtensionToken(token),
      label: tokenLabel(request, label),
    }).select("id, label, created_at").single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({
      tokenId: data.id,
      token,
      label: data.label,
      createdAt: data.created_at,
    }, { headers: PRIVATE });
  } catch {
    return NextResponse.json({ error: "Koppelcode kon niet worden aangemaakt." }, { status: 502, headers: PRIVATE });
  }
}
