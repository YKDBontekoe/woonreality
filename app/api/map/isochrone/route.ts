import { NextResponse } from "next/server";
import { redactError } from "@/src/lib/errors";
import { mapboxIsochroneUrl, parseIsochroneMinutes, parseIsochroneProfile } from "@/src/lib/map/isochrone";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const url = new URL(request.url);
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  const lat = latRaw != null ? Number(latRaw) : NaN;
  const lng = lngRaw != null ? Number(lngRaw) : NaN;
  const profile = parseIsochroneProfile(url.searchParams.get("profile"));
  const minutes = parseIsochroneMinutes(url.searchParams.get("minutes"));
  if (latRaw == null || lngRaw == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Isochroon vereist een Mapbox-token en coördinaten." }, { status: 400 });
  }
  if (!profile || minutes == null) {
    return NextResponse.json(
      { error: "Isochroon vereist profile walking of driving en minutes 5–30 in stappen van 5." },
      { status: 400 },
    );
  }
  if (!token) {
    return NextResponse.json({ error: "Isochroon vereist een Mapbox-token en coördinaten." }, { status: 400 });
  }
  try {
    const endpoint = mapboxIsochroneUrl({ token, lng, lat, profile, minutes });
    const response = await fetch(endpoint, { next: { revalidate: 86400 } });
    if (!response.ok) {
      return NextResponse.json({ error: "Reistijd kon niet worden berekend." }, { status: 502 });
    }
    return NextResponse.json(await response.json(), {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("Isochrone lookup failed", redactError(error));
    return NextResponse.json({ error: "Reistijd kon niet worden berekend." }, { status: 502 });
  }
}
