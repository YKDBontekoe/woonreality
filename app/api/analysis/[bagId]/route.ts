import { NextResponse } from "next/server";
import { getSharedAnalysis } from "@/src/lib/analysis/service";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { redactError, toUserMessage } from "@/src/lib/errors";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    const analysis = await getSharedAnalysis(property, locale);
    return NextResponse.json(analysis, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800", Vary: "Cookie" },
    });
  } catch (error) {
    console.error("Property analysis failed", redactError(error));
    return NextResponse.json({ error: toUserMessage(error, t("errors.analysis")) }, { status: 502 });
  }
}
