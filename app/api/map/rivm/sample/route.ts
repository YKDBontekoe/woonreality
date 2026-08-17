import { NextResponse } from "next/server";
import { redactError } from "@/src/lib/errors";
import { parseRivmOverlay, RIVM_LAYERS } from "@/src/lib/map/tiles";
import { getFeatureValue } from "@/src/lib/sources/rivm";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const overlay = parseRivmOverlay(url.searchParams.get("layer") ?? "");
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!overlay || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Ongeldige RIVM-steekproef." }, { status: 400 });
  }
  try {
    const spec = RIVM_LAYERS[overlay];
    const value = await getFeatureValue(spec.wms, spec.layer, { lat, lng });
    return NextResponse.json(
      { layer: overlay, value, unit: spec.unit },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (error) {
    console.error("RIVM sample failed", redactError(error));
    return NextResponse.json({ error: "RIVM-waarde is nu niet beschikbaar." }, { status: 502 });
  }
}
