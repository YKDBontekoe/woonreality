import type { Coordinates } from "@/src/lib/types";
import { wgs84ToRd } from "@/src/lib/geo/rd";

export const dsoOnderwerpenUrl = "https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8/onderwerpen/_zoek";

export type DsoContext = { topicCount: number; topicNames: string[]; fetchedAt: string };

export async function getDsoContext(coordinates: Coordinates): Promise<DsoContext | null> {
  const apiKey = process.env.DSO_API_KEY;
  if (!apiKey) return null;
  const point = wgs84ToRd(coordinates.lat, coordinates.lng);
  const response = await fetch(dsoOnderwerpenUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/hal+json", "x-api-key": apiKey, "Content-Crs": "http://www.opengis.net/def/crs/EPSG/0/28992" },
    body: JSON.stringify({ geometrie: { type: "Point", coordinates: [point.x, point.y] } }),
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`DSO onderwerpen ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const embedded = payload._embedded as Record<string, unknown> | undefined;
  const collection = embedded?.onderwerpen ?? payload.onderwerpen ?? payload.regelingen;
  const items = Array.isArray(collection) ? collection : [];
  const topicNames = items.map((item) => {
    if (!item || typeof item !== "object") return undefined;
    const record = item as Record<string, unknown>;
    return typeof record.naam === "string" ? record.naam : typeof record.titel === "string" ? record.titel : typeof record.identificatie === "string" ? record.identificatie : undefined;
  }).filter((name): name is string => Boolean(name)).slice(0, 5);
  return { topicCount: items.length, topicNames, fetchedAt: new Date().toISOString() };
}
