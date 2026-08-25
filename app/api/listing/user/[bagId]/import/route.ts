import { NextResponse } from "next/server";
import { isHttpUrl } from "@/src/lib/listing-intake";
import {
  importFundaListing,
  listingFromImportedFacts,
  ListingImportError,
  normalizeFundaListingUrl,
  persistImportedListingFacts,
} from "@/src/lib/listing-import";
import { apiContext, currentUser, invalidBagIdResponse, privateHeaders } from "@/src/lib/api/handlers";
import { isSupabaseConfigured } from "@/src/lib/supabase/server";
import { userListingImportBodySchema, isValidBagId } from "@/src/lib/validation/workspace";
import { logWarn } from "@/src/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { t } = apiContext(request);
  const { bagId } = await context.params;
  if (!isValidBagId(bagId)) return invalidBagIdResponse(t("errors.invalidBagAddress"));
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.listingDataInvalid") }, { status: 400 });
  }
  const parsed = userListingImportBodySchema.safeParse(raw);
  if (!parsed.success || !isHttpUrl(parsed.data.sourceUrl)) {
    return NextResponse.json({ error: t("errors.pasteFundaLink") }, { status: 400 });
  }
  const sourceUrl = normalizeFundaListingUrl(parsed.data.sourceUrl);
  if (!sourceUrl) {
    return NextResponse.json({ error: t("errors.notFundaListing") }, { status: 400 });
  }

  let imported;
  try {
    imported = importFundaListing(sourceUrl);
  } catch (error) {
    if (!(error instanceof ListingImportError)) {
      return NextResponse.json({ error: t("errors.fundaLinkUnrecognized"), blocked: false }, { status: 422 });
    }
    const status = error.code === "invalid_url" ? 400 : 422;
    return NextResponse.json({
      error: error.message,
      blocked: error.code === "blocked",
    }, { status });
  }

  const fetchedAt = new Date().toISOString();
  let facts = imported.facts;
  let persisted = false;

  try {
    if (isSupabaseConfigured()) {
      const { supabase, user } = await currentUser();
      if (user) {
        const result = await persistImportedListingFacts(supabase, user.id, bagId, imported, fetchedAt);
        facts = result.facts;
        persisted = result.persisted;
      }
    }
  } catch (error) {
    logWarn("user_listings persistence unavailable after listing import", error);
    persisted = false;
  }

  return NextResponse.json({
    listing: listingFromImportedFacts(imported.sourceUrl, facts, fetchedAt),
    facts,
    blocked: imported.blocked,
    persisted,
  }, { headers: privateHeaders() });
}
