import { NextResponse } from "next/server";
import { apiContext, routeError } from "@/src/lib/api/handlers";
import { getSharedAnalysis } from "@/src/lib/analysis/service";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { locale, t } = apiContext(request);
  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    const analysis = await getSharedAnalysis(property, locale);
    return NextResponse.json(analysis, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800", Vary: "Cookie" },
    });
  } catch (error) {
    return routeError(error, t("errors.analysis"));
  }
}
