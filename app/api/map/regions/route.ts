import { NextResponse } from "next/server";
import { redactError, toUserMessage } from "@/src/lib/errors";
import { parseNationalLayer } from "@/src/lib/map/national-layers";
import { clientKeyFromRequest, isRegionsRateLimited } from "@/src/lib/map/regions-rate-limit";
import { buildRegionsPayload, parseRegionBBox, parseRegionZoom, regionScaleForRequest } from "@/src/lib/map/regions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const clientKey = clientKeyFromRequest(request);
  if (isRegionsRateLimited(clientKey)) {
    return NextResponse.json({ error: "Te veel kaartverzoeken. Probeer het over een minuut opnieuw." }, { status: 429 });
  }

  const url = new URL(request.url);
  const bbox = parseRegionBBox(url.searchParams.get("bbox"));
  const layer = parseNationalLayer(url.searchParams.get("layer")) ?? "ses";
  const zoom = parseRegionZoom(url.searchParams.get("zoom"));
  const scale = regionScaleForRequest(zoom, url.searchParams.get("scale"));

  if (!bbox) {
    return NextResponse.json({ error: "Ongeldige bbox. Gebruik west,zuid,oost,noord." }, { status: 400 });
  }

  try {
    const payload = await buildRegionsPayload(bbox, layer, scale);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("Region map layers failed", redactError(error));
    return NextResponse.json(
      { error: toUserMessage(error, "De kaartlaag kon niet worden geladen. Probeer het later opnieuw.") },
      { status: 502 },
    );
  }
}
