import { NextResponse } from "next/server";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Ongeldige koppelcode." }, { status: 400, headers: PRIVATE });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Account is hier niet geconfigureerd." }, { status: 503, headers: PRIVATE });
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Log in om de koppeling te verbreken." }, { status: 401, headers: PRIVATE });
    const { error } = await supabase
      .from("listing_extension_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .is("revoked_at", null);
    if (error) throw error;
    return NextResponse.json({ revoked: true }, { headers: PRIVATE });
  } catch {
    return NextResponse.json({ error: "Koppeling kon niet worden verbroken." }, { status: 502, headers: PRIVATE });
  }
}
