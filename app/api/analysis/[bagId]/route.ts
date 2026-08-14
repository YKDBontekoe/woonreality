import { NextResponse } from "next/server";
import { analyzeProperty } from "@/src/lib/analysis/analyze";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { persistAnalysis } from "@/src/lib/db/repository";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    const analysis = await analyzeProperty(property);
    try {
      analysis.persistence = await persistAnalysis(analysis);
    } catch (persistenceError) {
      console.error("WoonReality persistence failed; serving cached analysis", persistenceError);
      analysis.persistence = "cache-only";
    }
    return NextResponse.json(analysis, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analysis failed" }, { status: 502 });
  }
}
