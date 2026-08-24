import { NextResponse } from "next/server";
import { getSharedPlaceAnalysis } from "@/src/lib/analysis/service";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { redactError, toUserMessage } from "@/src/lib/errors";
import { requireSearchLogin } from "@/src/lib/search-auth";
import type { PlaceKind } from "@/src/lib/types";

export const runtime = "nodejs";

const PLACE_KINDS = new Set<PlaceKind>(["buurt", "gemeente", "woonplaats"]);

export async function GET(request: Request, context: { params: Promise<{ kind: string; code: string }> }) {
  const denied = await requireSearchLogin();
  if (denied) return denied;

  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  const { kind, code } = await context.params;
  if (!PLACE_KINDS.has(kind as PlaceKind)) {
    return NextResponse.json({ error: t("errors.unknownPlaceKind") }, { status: 400 });
  }

  try {
    const place = await getSharedPlaceAnalysis(kind as PlaceKind, decodeURIComponent(code), locale);
    if (!place) {
      return NextResponse.json({ error: t("errors.placeNotFound") }, { status: 404 });
    }
    // Same public cache window as /api/analysis; the underlying CBS/PDOK
    // data is slow-moving and the shared source_cache dedupes upstream calls.
    // Vary on cookie so locales are served per visitor.
    return NextResponse.json(
      { place },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800", Vary: "Cookie" } },
    );
  } catch (error) {
    console.error("Place analysis failed", redactError(error));
    return NextResponse.json({ error: toUserMessage(error, t("errors.place")) }, { status: 502 });
  }
}
