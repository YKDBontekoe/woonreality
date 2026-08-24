import { NextResponse } from "next/server";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { getLocaleFromRequest } from "@/src/lib/i18n/request-locale";
import { loadMortgageMarket } from "@/src/lib/mortgage/market";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const locale: Locale = getLocaleFromRequest(request);
  const t = getLibTranslator(locale, "lib-api");
  try {
    const market = await loadMortgageMarket(locale);
    return NextResponse.json(market);
  } catch {
    return NextResponse.json({ error: t("errors.mortgageMarketFailed") }, { status: 502 });
  }
}
