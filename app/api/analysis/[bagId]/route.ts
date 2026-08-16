import { NextResponse } from "next/server";
import { analyzeProperty } from "@/src/lib/analysis/analyze";
import { redactError, toUserMessage } from "@/src/lib/errors";
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
      console.error("WoonReality persistence failed; serving cached analysis", redactError(persistenceError));
      analysis.persistence = "cache-only";
    }
    return NextResponse.json(analysis, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (error) {
    console.error("Property analysis failed", redactError(error));
    return NextResponse.json({ error: toUserMessage(error, "De woningcheck kon niet worden gemaakt. Probeer het later opnieuw.") }, { status: 502 });
  }
}
