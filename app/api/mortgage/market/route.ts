import { NextResponse } from "next/server";
import { apiContext, routeError } from "@/src/lib/api/handlers";
import { loadMortgageMarket } from "@/src/lib/mortgage/market";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { locale, t } = apiContext(request);
  try {
    const market = await loadMortgageMarket(locale);
    return NextResponse.json(market);
  } catch (error) {
    return routeError(error, t("errors.mortgageMarketFailed"));
  }
}
