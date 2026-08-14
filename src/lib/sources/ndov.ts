import { gunzipSync } from "node:zlib";
import type { Coordinates } from "@/src/lib/types";
import { rdToWgs84 } from "@/src/lib/geo/rd";

export const ndovHaltesUrl = "https://data.ndovloket.nl/haltes/";

export type NdovContext = { stopCount: number; nearestDistanceM?: number; fetchedAt: string };

function distanceM(a: Coordinates, b: Coordinates) {
  const earth = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

export async function getNdovContext(coordinates: Coordinates): Promise<NdovContext | null> {
  const indexResponse = await fetch(ndovHaltesUrl, { next: { revalidate: 86400 } });
  if (!indexResponse.ok) throw new Error(`NDOV index ${indexResponse.status}`);
  const index = await indexResponse.text();
  const files = [...index.matchAll(/href=["']([^"']*ExportCHB_[0-9-]+\.xml\.gz)["']/gi)].map((match) => match[1]);
  const latest = files.at(-1);
  if (!latest) return null;
  const fileResponse = await fetch(new URL(latest, ndovHaltesUrl), { next: { revalidate: 86400 } });
  if (!fileResponse.ok) throw new Error(`NDOV haltebestand ${fileResponse.status}`);
  const xml = gunzipSync(Buffer.from(await fileResponse.arrayBuffer())).toString("utf8");
  const stops: Coordinates[] = [];
  for (const match of xml.matchAll(/<[^>]*quaylocationdata[^>]*>([\s\S]*?)<\/[^>]*quaylocationdata>/gi)) {
    const block = match[1];
    const x = Number(block.match(/<[^>]*rd-x[^>]*>([^<]+)/i)?.[1]);
    const y = Number(block.match(/<[^>]*rd-y[^>]*>([^<]+)/i)?.[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) stops.push(rdToWgs84(x, y));
  }
  const nearby = stops.map((stop) => distanceM(coordinates, stop)).filter((distance) => distance <= 1000);
  return { stopCount: nearby.length, nearestDistanceM: nearby.length ? Math.min(...nearby) : undefined, fetchedAt: new Date().toISOString() };
}
