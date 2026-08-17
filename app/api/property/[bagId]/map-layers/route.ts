import { NextResponse } from "next/server";
import { redactError, toUserMessage } from "@/src/lib/errors";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { getBgtContext } from "@/src/lib/sources/pdok/bgt";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    const bgt = await getBgtContext(property.coordinates);
    return NextResponse.json(
      {
        green: { type: "FeatureCollection", features: bgt.greenAreas },
        water: { type: "FeatureCollection", features: bgt.water },
        roads: { type: "FeatureCollection", features: bgt.roads },
      },
      { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    console.error("Map layers lookup failed", redactError(error));
    return NextResponse.json(
      { error: toUserMessage(error, "Kaartlagen konden niet worden opgehaald. Probeer het later opnieuw.") },
      { status: 502 },
    );
  }
}
