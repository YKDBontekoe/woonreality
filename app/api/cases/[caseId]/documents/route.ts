import { NextResponse } from "next/server";
import { apiContext, jsonError, loadOwnedCase, routeError } from "@/src/lib/api/handlers";
import { getDocumentProxy, extractText } from "unpdf";
import { analyzeDocumentText } from "@/src/lib/documents/analyze";
import { syncEngineTasks } from "@/src/lib/cases/sync-tasks";
import { extractListingFacts } from "@/src/lib/listing-intake";
import { normalizeCaseStage } from "@/src/lib/journey";
import { buyerProfileIsConfigured, normalizeBuyerProfile } from "@/src/lib/purchase";

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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { locale, t } = apiContext(request);
  const { caseId } = await context.params;
  try {
    const { supabase, user, purchaseCase } = await loadOwnedCase(caseId, "id,stage,property_id");
    if (!user) return jsonError(t("errors.loginToSaveDocuments"), 401);
    if (!purchaseCase) return jsonError(t("errors.caseNotFound"), 404);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return jsonError(t("errors.choosePdf"), 400);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return jsonError(t("errors.pdfOnly"), 400);
    if (file.size > MAX_BYTES) return jsonError(t("errors.documentTooLarge"), 400);

    const documentId = crypto.randomUUID();
    const storagePath = `${user.id}/${caseId}/${documentId}.pdf`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let pageCount = 0;
    let text = "";
    try {
      const pdf = await getDocumentProxy(bytes);
      pageCount = pdf.numPages;
      if (pageCount > 100) return jsonError("Dit document heeft meer dan 100 pagina’s.", 400);
      const extracted = await extractText(pdf, { mergePages: true });
      text = String(extracted.text).replace(/\s+/g, " ").trim();
    } catch {
      return jsonError(t("errors.pdfUnreadable"), 400);
    }

    const type = documentType(file.name);
    const preview = text.slice(0, 800);
    const facts = extractListingFacts(text);

    const { data: property } = purchaseCase.property_id
      ? await supabase.from("properties").select("bag_vbo_id,area_m2,build_year").eq("id", purchaseCase.property_id).maybeSingle()
      : { data: null };
    const { data: bid } = await supabase.from("bid_drafts").select("amount,conditions").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: valuation } = await supabase.from("valuation_snapshots").select("midpoint_value,methodology").eq("case_id", caseId).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const askingPrice = Number(record(valuation?.methodology).askingPrice ?? valuation?.midpoint_value ?? facts.askingPrice ?? 0) || null;

    const findings = analyzeDocumentText({
      documentType: type,
      filename: file.name,
      text: text.slice(0, 40_000),
      bagAreaM2: property?.area_m2,
      askingPrice,
      offerAmount: bid?.amount,
      buildingYear: property?.build_year,
    }, locale);

    const { error: uploadError } = await supabase.storage.from("purchase-documents").upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) return jsonError(t("errors.documentStoreFailed"), 502);
    const { data: document, error } = await supabase.from("case_documents").insert({
      id: documentId,
      case_id: caseId,
      user_id: user.id,
      storage_path: storagePath,
      filename: file.name,
      mime_type: "application/pdf",
      byte_size: file.size,
      document_type: type,
      status: "ready",
      extracted_json: { pageCount, preview, textLength: text.length, facts },
    }).select("*").single();
    if (error || !document) {
      await supabase.storage.from("purchase-documents").remove([storagePath]);
      return jsonError(t("errors.documentPersistFailed"), 502);
    }

    if (findings.length) {
      const { error: findingsError } = await supabase.from("document_findings").insert(findings.map((finding) => ({
        document_id: documentId,
        case_id: caseId,
        user_id: user.id,
        title: finding.title,
        summary: finding.summary,
        severity: finding.severity,
        action: finding.action,
        status: "open",
      })));
      if (findingsError) throw findingsError;
    }

    const { error: eventError } = await supabase.from("case_events").insert({
      case_id: caseId,
      user_id: user.id,
      event_type: "document_uploaded",
      payload: { filename: file.name, documentType: type, findingCount: findings.length },
    });
    if (eventError) throw eventError;

    const [{ data: documents, error: documentsError }, { data: openFindings, error: openFindingsError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.from("case_documents").select("document_type").eq("case_id", caseId),
      supabase.from("document_findings").select("title,severity,action,status").eq("case_id", caseId).eq("status", "open"),
      supabase.from("profiles").select("preferences_json").eq("id", user.id).maybeSingle(),
    ]);
    if (documentsError) throw documentsError;
    if (openFindingsError) throw openFindingsError;
    if (profileError) throw profileError;
    const buyerProfile = normalizeBuyerProfile(record(profile?.preferences_json).buyerProfile);
    await syncEngineTasks(supabase, user.id, {
      profile: buyerProfile,
      profileConfigured: buyerProfileIsConfigured(buyerProfile, record(profile?.preferences_json).buyerProfile),
      stage: normalizeCaseStage(purchaseCase.stage),
      bagVboId: property?.bag_vbo_id,
      caseId,
      documentTypes: (documents ?? []).map((item) => item.document_type),
      openFindings: openFindings ?? [],
      hasAskingPrice: Boolean(askingPrice),
      hasOffer: Boolean(bid?.amount),
      hasContractAmount: Boolean(record(bid?.conditions).contractAmount),
    });

    const { data: storedFindings, error: storedError } = await supabase.from("document_findings").select("*").eq("document_id", documentId).eq("user_id", user.id);
    if (storedError) throw storedError;
    return NextResponse.json({ document, findings: storedFindings ?? [] }, { status: 201 });
  } catch (error) {
    return routeError(error, "Het document kon niet worden verwerkt.", 502);
  }
}
