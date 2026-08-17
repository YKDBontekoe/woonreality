import { NextResponse } from "next/server";
import { redactError, toUserMessage } from "@/src/lib/errors";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { getBgtContext } from "@/src/lib/sources/pdok/bgt";
import { getNearbyNdovStops } from "@/src/lib/sources/ndov";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    const [bgt, stops] = await Promise.all([
      getBgtContext(property.coordinates),
      getNearbyNdovStops(property.coordinates).catch(() => []),
    ]);
    return NextResponse.json(
      {
        green: { type: "FeatureCollection", features: bgt.greenAreas },
        water: { type: "FeatureCollection", features: bgt.water },
        roads: { type: "FeatureCollection", features: bgt.roads },
        stops: {
          type: "FeatureCollection",
          features: stops.map((stop) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
            properties: { distance: stop.distanceM, label: `${stop.distanceM} m` },
          })),
        },
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
