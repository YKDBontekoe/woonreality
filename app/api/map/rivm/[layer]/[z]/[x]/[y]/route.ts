import { NextResponse } from "next/server";
import { redactError } from "@/src/lib/errors";
import { isValidTile, parseRivmOverlay, parseTileIndex, rivmGetMapUrl, xyzToMercatorBbox } from "@/src/lib/map/tiles";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ layer: string; z: string; x: string; y: string }> },
) {
  const { layer, z: zRaw, x: xRaw, y: yRaw } = await context.params;
  const overlay = parseRivmOverlay(layer);
  const z = parseTileIndex(zRaw);
  const x = parseTileIndex(xRaw);
  const y = parseTileIndex(yRaw);
  if (!overlay || z == null || x == null || y == null || !isValidTile(z, x, y)) {
    return NextResponse.json({ error: "Onbekende RIVM-laag of ongeldige tegel." }, { status: 400 });
  }

  try {
    const response = await fetch(rivmGetMapUrl(overlay, xyzToMercatorBbox(z, x, y)), {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "RIVM-kaartlaag is nu niet beschikbaar." }, { status: 502 });
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("image")) {
      return NextResponse.json({ error: "RIVM-kaartlaag is nu niet beschikbaar." }, { status: 502 });
    }
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("RIVM WMS proxy failed", redactError(error));
    return NextResponse.json({ error: "RIVM-kaartlaag is nu niet beschikbaar." }, { status: 502 });
  }
}
