import { NextResponse } from "next/server";
import { EXTENSION_INGEST_LIMIT_PER_HOUR, hashExtensionToken } from "@/src/lib/extension-auth";
import { parseListingCaptureEnvelope } from "@/src/lib/listing-facts-schema";
import { extractListingFacts } from "@/src/lib/listing-intake";
import {
  addressQueryFromFacts,
  factsFromUnknown,
  listingFromImportedFacts,
  mergeListingFacts,
} from "@/src/lib/listing-import";
import { searchAddresses } from "@/src/lib/sources/pdok/location";
import { createSupabaseAdminClient, isSupabaseConfigured } from "@/src/lib/supabase/server";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";

export const runtime = "nodejs";

const PRIVATE = { "Cache-Control": "private, no-store" };

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(wr_ext_[a-f0-9]+)$/i);
  return match?.[1] ?? null;
}

export async function POST(request: Request) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: t("errors.extensionAccountNotConfigured") }, { status: 503, headers: PRIVATE });
  }
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Koppel de extensie eerst via /extensie." }, { status: 401, headers: PRIVATE });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: t("errors.extensionAccountNotConfigured") }, { status: 503, headers: PRIVATE });
  }

  const { data: tokenRow, error: tokenError } = await admin
    .from("listing_extension_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hashExtensionToken(token))
    .maybeSingle();
  if (tokenError) {
    return NextResponse.json({ error: t("errors.extensionLinkCheckFailed") }, { status: 502, headers: PRIVATE });
  }
  if (!tokenRow || tokenRow.revoked_at) {
    return NextResponse.json({ error: "Deze koppeling is ongeldig of ingetrokken. Koppel de extensie opnieuw." }, { status: 401, headers: PRIVATE });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.listingDataInvalid") }, { status: 400, headers: PRIVATE });
  }
  const parsed = parseListingCaptureEnvelope(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: PRIVATE });
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("listing_extension_ingest_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", tokenRow.user_id)
    .gte("created_at", hourAgo);
  if (countError) {
    return NextResponse.json({ error: t("errors.extensionLimitCheckFailed") }, { status: 502, headers: PRIVATE });
  }
  if ((count ?? 0) >= EXTENSION_INGEST_LIMIT_PER_HOUR) {
    return NextResponse.json({ error: "Je hebt te veel advertenties in het afgelopen uur opgeslagen. Probeer het later." }, { status: 429, headers: PRIVATE });
  }

  const query = addressQueryFromFacts(parsed.data.facts, parsed.data.sourceUrl)?.trim();
  if (!query) {
    return NextResponse.json({ error: t("errors.noAddressInListing") }, { status: 422, headers: PRIVATE });
  }

  let results;
  try {
    results = await searchAddresses(query, 6);
  } catch {
    return NextResponse.json({ error: t("errors.addressLookupFailedShort") }, { status: 502, headers: PRIVATE });
  }
  const address = results[0];
  if (!address) {
    return NextResponse.json({ error: `We herkenden het adres niet (${query}).` }, { status: 404, headers: PRIVATE });
  }

  const fetchedAt = parsed.data.capturedAt && !Number.isNaN(Date.parse(parsed.data.capturedAt))
    ? new Date(parsed.data.capturedAt).toISOString()
    : new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from("user_listings")
    .select("asking_price, extracted_json, pasted_text")
    .eq("user_id", tokenRow.user_id)
    .eq("bag_vbo_id", address.bagVboId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: t("errors.extensionListingSaveFailed") }, { status: 502, headers: PRIVATE });
  }
  const existingFacts = mergeListingFacts(
    factsFromUnknown(existing?.extracted_json),
    extractListingFacts(existing?.pasted_text ?? ""),
    { prefer: "existing" },
  );
  if (existing?.asking_price != null) existingFacts.askingPrice = existing.asking_price;
  const facts = mergeListingFacts(existingFacts, parsed.data.facts);

  const { error: upsertError } = await admin.from("user_listings").upsert({
    user_id: tokenRow.user_id,
    bag_vbo_id: address.bagVboId,
    source_url: parsed.data.sourceUrl,
    asking_price: facts.askingPrice ?? existing?.asking_price ?? null,
    extracted_json: facts,
    updated_at: fetchedAt,
  }, { onConflict: "user_id,bag_vbo_id" });
  if (upsertError) {
    return NextResponse.json({ error: t("errors.extensionListingSaveFailed") }, { status: 502, headers: PRIVATE });
  }

  await admin.from("listing_extension_ingest_log").insert({ user_id: tokenRow.user_id });
  await admin.from("listing_extension_tokens").update({ last_used_at: fetchedAt }).eq("id", tokenRow.id);

  return NextResponse.json({
    bagVboId: address.bagVboId,
    listing: listingFromImportedFacts(parsed.data.sourceUrl, facts, fetchedAt),
    persisted: true,
  }, { headers: PRIVATE });
}
