import { NextResponse } from "next/server";
import { isHttpUrl } from "@/src/lib/listing-intake";
import { extractImportedListingPaste } from "@/src/lib/listing-extract-html";
import { factsFromUnknown, mergeListingFacts } from "@/src/lib/listing-import";
import { apiContext, currentUser, invalidBagIdResponse, jsonError, routeError } from "@/src/lib/api/handlers";
import { userListingBodySchema, isValidBagId } from "@/src/lib/validation/workspace";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { t } = apiContext(request);
  const { bagId } = await context.params;
  if (!isValidBagId(bagId)) return invalidBagIdResponse(t("errors.invalidBagAddress"));
  try {
    const { supabase, user } = await currentUser();
    if (!user) return NextResponse.json({ listing: null }, { status: 401 });
    const { data, error } = await supabase.from("user_listings").select("*").eq("user_id", user.id).eq("bag_vbo_id", bagId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ listing: data });
  } catch (error) {
    return routeError(error, t("errors.listingLoadFailed"));
  }
}

export async function PUT(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { t } = apiContext(request);
  const { bagId } = await context.params;
  if (!isValidBagId(bagId)) return invalidBagIdResponse(t("errors.invalidBagAddress"));
  try {
    const { supabase, user } = await currentUser();
    if (!user) return jsonError(t("errors.loginToSaveListing"), 401);
    const raw = await request.json() as unknown;
    const parsed = userListingBodySchema.safeParse(raw);
    if (!parsed.success) return jsonError(t("errors.listingDataInvalid"), 400);
    if (parsed.data.sourceUrl && !isHttpUrl(parsed.data.sourceUrl)) return jsonError(t("errors.sourceUrlInvalid"), 400);
    const keys = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const pastedFacts = Object.prototype.hasOwnProperty.call(keys, "pastedText")
      ? extractImportedListingPaste(parsed.data.pastedText ?? "")
      : undefined;
    const { data: existing } = await supabase.from("user_listings").select("extracted_json, asking_price").eq("user_id", user.id).eq("bag_vbo_id", bagId).maybeSingle();
    // pastedFacts as imported: explicit pasted text wins over stored extracted_json.
    const mergedFacts = pastedFacts
      ? mergeListingFacts(factsFromUnknown(existing?.extracted_json), pastedFacts)
      : undefined;
    const payload: Record<string, unknown> = {
      user_id: user.id,
      bag_vbo_id: bagId,
      updated_at: new Date().toISOString(),
    };
    if (Object.prototype.hasOwnProperty.call(keys, "askingPrice")) {
      payload.asking_price = parsed.data.askingPrice ?? null;
    } else if (mergedFacts?.askingPrice != null) {
      payload.asking_price = mergedFacts.askingPrice;
    }
    if (Object.prototype.hasOwnProperty.call(keys, "sourceUrl")) {
      payload.source_url = parsed.data.sourceUrl ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(keys, "pastedText")) {
      payload.pasted_text = parsed.data.pastedText ?? null;
      payload.extracted_json = mergedFacts ?? {};
    }
    const { data, error } = await supabase.from("user_listings").upsert(payload, { onConflict: "user_id,bag_vbo_id" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ listing: data, facts: mergedFacts ?? data.extracted_json });
  } catch (error) {
    return routeError(error, t("errors.listingSaveFailed"));
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { t } = apiContext(request);
  const { bagId } = await context.params;
  if (!isValidBagId(bagId)) return invalidBagIdResponse(t("errors.invalidBagAddress"));
  try {
    const { supabase, user } = await currentUser();
    if (!user) return jsonError(t("errors.loginToDeleteListing"), 401);
    const { error } = await supabase.from("user_listings").delete().eq("user_id", user.id).eq("bag_vbo_id", bagId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error, t("errors.listingDeleteFailed"));
  }
}
