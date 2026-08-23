import { NextResponse } from "next/server";
import { getSharedAnalysis } from "@/src/lib/analysis/service";
import { redactError, toUserMessage } from "@/src/lib/errors";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    const analysis = await getSharedAnalysis(property);
    return NextResponse.json(analysis, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (error) {
    console.error("Property analysis failed", redactError(error));
    return NextResponse.json({ error: toUserMessage(error, "De woningcheck kon niet worden gemaakt. Probeer het later opnieuw.") }, { status: 502 });
  }
}
