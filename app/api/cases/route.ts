import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user };
}

export async function GET() {
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: "Log in om je aankoopdossiers te bekijken." }, { status: 401 });
    const { data, error } = await supabase.from("purchase_cases").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ cases: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dossiers konden niet worden geladen." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ error: "Log in om een aankoopdossier te bewaren." }, { status: 401 });
    const body = await request.json() as { bagVboId?: string; title?: string };
    if (!body.bagVboId || !/^\d{16}$/.test(body.bagVboId)) return NextResponse.json({ error: "Kies eerst een geldig woningadres." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Het aankoopdossier kan nog niet worden opgeslagen: Supabase is nog niet gekoppeld." }, { status: 503 });
    const { data: property, error: propertyError } = await admin.from("properties").select("id,address_label").eq("bag_vbo_id", body.bagVboId).maybeSingle();
    if (propertyError || !property) return NextResponse.json({ error: "Open eerst de woninganalyse voordat je een dossier start." }, { status: 404 });

    const { data: existingCase } = await supabase.from("purchase_cases").select("*").eq("user_id", user.id).eq("property_id", property.id).eq("status", "active").maybeSingle();
    if (existingCase) return NextResponse.json({ case: existingCase });

    const { data: purchaseCase, error } = await supabase.from("purchase_cases").insert({
      user_id: user.id,
      property_id: property.id,
      title: body.title?.trim() || property.address_label,
      stage: "profile",
      status: "active",
    }).select("*").single();
    if (error || !purchaseCase) throw error ?? new Error("Dossier kon niet worden aangemaakt.");
    await supabase.from("case_tasks").insert([
      { case_id: purchaseCase.id, user_id: user.id, title: "Vul je woonprofiel in", description: "Geef aan wat voor jou het zwaarst weegt.", priority: "normal", source: "onboarding" },
      { case_id: purchaseCase.id, user_id: user.id, title: "Plan een bezichtiging", description: "Noteer een moment waarop je geluid, licht en de staat van de woning kunt controleren.", priority: "normal", source: "onboarding" },
    ]);
    return NextResponse.json({ case: purchaseCase }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dossier kon niet worden aangemaakt." }, { status: 502 });
  }
}
