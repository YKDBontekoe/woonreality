import { NextResponse } from "next/server";
import { loadMortgageMarket } from "@/src/lib/mortgage/market";

export const runtime = "nodejs";

export async function GET() {
  try {
    const market = await loadMortgageMarket();
    return NextResponse.json(market);
  } catch {
    return NextResponse.json({ error: "Marktdata kon niet worden geladen." }, { status: 502 });
  }
}
