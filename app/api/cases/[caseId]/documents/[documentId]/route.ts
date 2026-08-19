import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export async function DELETE(_request: Request, context: { params: Promise<{ caseId: string; documentId: string }> }) {
  try {
    const { caseId, documentId } = await context.params;
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Log in om documenten te beheren." }, { status: 401 });
    const { data: document } = await supabase.from("case_documents").select("storage_path").eq("id", documentId).eq("case_id", caseId).eq("user_id", auth.user.id).maybeSingle();
    if (!document) return NextResponse.json({ error: "Document niet gevonden." }, { status: 404 });
    const { error: storageError } = await supabase.storage.from("purchase-documents").remove([document.storage_path]);
    if (storageError) return NextResponse.json({ error: "Het bestand kon niet worden verwijderd." }, { status: 502 });
    const { error } = await supabase.from("case_documents").delete().eq("id", documentId).eq("case_id", caseId).eq("user_id", auth.user.id);
    if (error) return NextResponse.json({ error: "De documentregistratie kon niet worden verwijderd." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Documenten beheren is nog niet beschikbaar, omdat de aankoopomgeving niet met Supabase is gekoppeld." }, { status: 503 });
  }
}
