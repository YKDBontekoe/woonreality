import { NextResponse } from "next/server";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export async function DELETE(request: Request, context: { params: Promise<{ caseId: string; documentId: string }> }) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  try {
    const { caseId, documentId } = await context.params;
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: t("errors.loginToManageDocuments") }, { status: 401 });
    const { data: document } = await supabase.from("case_documents").select("storage_path").eq("id", documentId).eq("case_id", caseId).eq("user_id", auth.user.id).maybeSingle();
    if (!document) return NextResponse.json({ error: "Document niet gevonden." }, { status: 404 });
    const { error: storageError } = await supabase.storage.from("purchase-documents").remove([document.storage_path]);
    if (storageError) return NextResponse.json({ error: "Het bestand kon niet worden verwijderd." }, { status: 502 });
    const { error } = await supabase.from("case_documents").delete().eq("id", documentId).eq("case_id", caseId).eq("user_id", auth.user.id);
    if (error) return NextResponse.json({ error: t("errors.documentDeleteFailed") }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Documenten beheren is nog niet beschikbaar, omdat de aankoopomgeving niet met Supabase is gekoppeld." }, { status: 503 });
  }
}
