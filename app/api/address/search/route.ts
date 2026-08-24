import { NextResponse } from "next/server";
import { redactError, toUserMessage } from "@/src/lib/errors";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { filterSearchResults, searchLocations } from "@/src/lib/sources/pdok/location";
import { requireSearchLogin } from "@/src/lib/search-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) return NextResponse.json({ results: [] });

  const denied = await requireSearchLogin();
  if (denied) return denied;

  const addressesOnly = ["1", "true"].includes(new URL(request.url).searchParams.get("addressesOnly")?.trim().toLowerCase() ?? "");

  try {
    const results = filterSearchResults(await searchLocations(query), addressesOnly);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Address search failed", redactError(error));
    return NextResponse.json({ error: toUserMessage(error, t("errors.addressSearch")) }, { status: 502 });
  }
}
