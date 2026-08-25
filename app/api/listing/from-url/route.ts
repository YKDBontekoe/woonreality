import { NextResponse } from "next/server";
import { isHttpUrl } from "@/src/lib/listing-intake";
import {
  addressQueryFromFacts,
  inspectFundaListing,
  listingFromImportedFacts,
  ListingImportError,
  normalizeFundaListingUrl,
  persistImportedListingFacts,
} from "@/src/lib/listing-import";
import { searchAddresses } from "@/src/lib/sources/pdok/location";
import { requireSearchLogin } from "@/src/lib/search-auth";
import { apiContext, currentUser, privateHeaders } from "@/src/lib/api/handlers";
import { isSupabaseConfigured } from "@/src/lib/supabase/server";
import { userListingImportBodySchema } from "@/src/lib/validation/workspace";
import { logWarn } from "@/src/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { t } = apiContext(request);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.pasteFundaLink") }, { status: 400 });
  }
  const parsed = userListingImportBodySchema.safeParse(raw);
  const sourceUrl = parsed.success ? normalizeFundaListingUrl(parsed.data.sourceUrl) : null;
  if (!parsed.success || !isHttpUrl(parsed.data.sourceUrl) || !sourceUrl) {
    return NextResponse.json({ error: t("errors.notFundaListing") }, { status: 400 });
  }

  const denied = await requireSearchLogin();
  if (denied) return denied;

  let inspected;
  try {
    inspected = inspectFundaListing(sourceUrl);
  } catch (error) {
    if (!(error instanceof ListingImportError)) {
      return NextResponse.json({ error: t("errors.fundaLinkUnrecognized") }, { status: 502 });
    }
    const status = error.code === "invalid_url" ? 400 : 502;
    return NextResponse.json({ error: error.message }, { status });
  }

  const query = addressQueryFromFacts(inspected.facts, inspected.sourceUrl)?.trim();
  if (!query) {
    return NextResponse.json({ error: t("errors.noAddressInLink") }, { status: 422 });
  }

  let results;
  try {
    results = await searchAddresses(query, 6);
  } catch {
    return NextResponse.json({ error: t("errors.addressLookupFailed") }, { status: 502 });
  }
  const address = results[0];
  if (!address) {
    return NextResponse.json({
      error: `We herkenden het adres niet (${query}). Zoek het adres handmatig.`,
      query,
      facts: inspected.facts,
      blocked: inspected.blocked,
    }, { status: 404 });
  }

  const fetchedAt = new Date().toISOString();
  let facts = inspected.facts;
  let persisted = false;
  try {
    if (isSupabaseConfigured()) {
      const { supabase, user } = await currentUser();
      if (user) {
        const result = await persistImportedListingFacts(supabase, user.id, address.bagVboId, inspected, fetchedAt);
        facts = result.facts;
        persisted = result.persisted;
      }
    }
  } catch (error) {
    logWarn("user_listings persistence unavailable after from-url import", error);
    persisted = false;
  }

  return NextResponse.json({
    address,
    listing: listingFromImportedFacts(inspected.sourceUrl, facts, fetchedAt),
    facts,
    blocked: inspected.blocked,
    persisted,
  }, { headers: privateHeaders() });
}
