import { NextResponse } from "next/server";
import { redactError } from "@/src/lib/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Isochroon vereist een Mapbox-token en coördinaten." }, { status: 400 });
  }
  try {
    const endpoint = new URL(`https://api.mapbox.com/isochrone/v1/mapbox/walking/${lng},${lat}`);
    endpoint.searchParams.set("contours_minutes", "5,10");
    endpoint.searchParams.set("polygons", "true");
    endpoint.searchParams.set("access_token", token);
    const response = await fetch(endpoint, { next: { revalidate: 86400 } });
    if (!response.ok) {
      return NextResponse.json({ error: "Loopafstand kon niet worden berekend." }, { status: 502 });
    }
    return NextResponse.json(await response.json(), {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("Isochrone lookup failed", redactError(error));
    return NextResponse.json({ error: "Loopafstand kon niet worden berekend." }, { status: 502 });
  }
}
