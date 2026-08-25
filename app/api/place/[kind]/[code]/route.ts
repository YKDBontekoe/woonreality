import { NextResponse } from "next/server";
import { apiContext, jsonError, routeError } from "@/src/lib/api/handlers";
import { getSharedPlaceAnalysis } from "@/src/lib/analysis/service";
import { requireSearchLogin } from "@/src/lib/search-auth";
import type { PlaceKind } from "@/src/lib/types";

export const runtime = "nodejs";

const PLACE_KINDS = new Set<PlaceKind>(["buurt", "gemeente", "woonplaats"]);

export async function GET(request: Request, context: { params: Promise<{ kind: string; code: string }> }) {
  const denied = await requireSearchLogin();
  if (denied) return denied;

  const { locale, t } = apiContext(request);
  const { kind, code } = await context.params;
  if (!PLACE_KINDS.has(kind as PlaceKind)) {
    return jsonError(t("errors.unknownPlaceKind"), 400);
  }

  try {
    const place = await getSharedPlaceAnalysis(kind as PlaceKind, decodeURIComponent(code), locale);
    if (!place) {
      return jsonError(t("errors.placeNotFound"), 404);
    }
    // Same public cache window as /api/analysis; the underlying CBS/PDOK
    // data is slow-moving and the shared source_cache dedupes upstream calls.
    // Vary on cookie so locales are served per visitor.
    return NextResponse.json(
      { place },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800", Vary: "Cookie" } },
    );
  } catch (error) {
    return routeError(error, t("errors.place"));
  }
}
