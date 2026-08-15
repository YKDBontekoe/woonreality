import { NextResponse } from "next/server";
import { getDocumentProxy, extractText } from "unpdf";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 20 * 1024 * 1024;

function documentType(filename: string) {
  const name = filename.toLowerCase();
  if (name.includes("brochure") || name.includes("verkoop")) return "brochure";
  if (name.includes("vragenlijst")) return "vragenlijst";
  if (name.includes("vve") || name.includes("mjop") || name.includes("notulen")) return "vve";
  if (name.includes("label") || name.includes("energie")) return "energielabel";
  if (name.includes("keuring") || name.includes("bouwkund")) return "keuring";
  if (name.includes("koopcontract") || name.includes("koopakte")) return "koopcontract";
  return "overig";
}

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Log in om documenten te bewaren." }, { status: 401 });
  const { data: purchaseCase } = await supabase.from("purchase_cases").select("id").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle();
  if (!purchaseCase) return NextResponse.json({ error: "Dossier niet gevonden." }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Kies eerst een PDF-bestand." }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Voor nu kun je alleen PDF-bestanden uploaden." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Dit bestand is groter dan 20 MB." }, { status: 400 });

  const documentId = crypto.randomUUID();
  const storagePath = `${auth.user.id}/${caseId}/${documentId}.pdf`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pageCount = 0;
  let preview = "";
  try {
    const pdf = await getDocumentProxy(bytes);
    pageCount = pdf.numPages;
    if (pageCount > 100) return NextResponse.json({ error: "Dit document heeft meer dan 100 pagina’s." }, { status: 400 });
    const text = await extractText(pdf, { mergePages: true });
    preview = String(text.text).replace(/\s+/g, " ").trim().slice(0, 500);
  } catch {
    return NextResponse.json({ error: "Dit PDF-bestand kon niet worden gelezen. Probeer een andere versie." }, { status: 400 });
  }

  const { error: uploadError } = await supabase.storage.from("purchase-documents").upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) return NextResponse.json({ error: "Het document kon niet veilig worden opgeslagen." }, { status: 502 });
  const { data: document, error } = await supabase.from("case_documents").insert({
    id: documentId,
    case_id: caseId,
    user_id: auth.user.id,
    storage_path: storagePath,
    filename: file.name,
    mime_type: "application/pdf",
    byte_size: file.size,
    document_type: documentType(file.name),
    status: "ready",
    extracted_json: { pageCount, preview },
  }).select("*").single();
  if (error || !document) {
    await supabase.storage.from("purchase-documents").remove([storagePath]);
    return NextResponse.json({ error: "De documentgegevens konden niet worden opgeslagen." }, { status: 502 });
  }
  return NextResponse.json({ document }, { status: 201 });
}
