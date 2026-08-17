import { gunzipSync } from "node:zlib";
import type { Coordinates } from "@/src/lib/types";
import { rdToWgs84 } from "@/src/lib/geo/rd";

export const ndovHaltesUrl = "https://data.ndovloket.nl/haltes/";

export type NdovContext = {
  stopCount: number;
  nearestDistanceM?: number;
  catalogDate?: string;
  fetchedAt: string;
};

function distanceM(a: Coordinates, b: Coordinates) {
  const earth = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

export function latestNdovCatalogFile(index: string) {
  // The directory also contains PassengerStopAssignmentExportCHB files. Those
  // describe assignments, not stop locations, and must never be selected.
  const files = [...index.matchAll(/href=["'](ExportCHB_(\d{4}-\d{2}-\d{2})\.xml\.gz)["']/gi)]
    .map((match) => ({ file: match[1], date: match[2] }));
  return files.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

export function ndovStopCoordinates(xml: string): Coordinates[] {
  const stops: Coordinates[] = [];
  for (const match of xml.matchAll(/<[^>]*quaylocationdata[^>]*>([\s\S]*?)<\/[^>]*quaylocationdata>/gi)) {
    const block = match[1];
    const x = Number(block.match(/<[^>]*rd-x[^>]*>([^<]+)/i)?.[1]);
    const y = Number(block.match(/<[^>]*rd-y[^>]*>([^<]+)/i)?.[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) stops.push(rdToWgs84(x, y));
  }
  return stops;
}

export type NearbyStop = {
  lat: number;
  lng: number;
  distanceM: number;
};

function nearbyStopsFromCatalog(coordinates: Coordinates, stops: Coordinates[]): NearbyStop[] {
  return stops
    .map((stop) => ({ ...stop, distanceM: Math.round(distanceM(coordinates, stop)) }))
    .filter((stop) => stop.distanceM <= 1000)
    .sort((a, b) => a.distanceM - b.distanceM);
}

async function loadNdovStops() {
  const indexResponse = await fetch(ndovHaltesUrl, { next: { revalidate: 86400 } });
  if (!indexResponse.ok) throw new Error(`NDOV index ${indexResponse.status}`);
  const index = await indexResponse.text();
  const latest = latestNdovCatalogFile(index);
  if (!latest) return null;
  const fileResponse = await fetch(new URL(latest.file, ndovHaltesUrl), { next: { revalidate: 86400 } });
  if (!fileResponse.ok) throw new Error(`NDOV haltebestand ${fileResponse.status}`);
  const xml = gunzipSync(Buffer.from(await fileResponse.arrayBuffer())).toString("utf8");
  const stops = ndovStopCoordinates(xml);
  if (!stops.length) throw new Error("NDOV haltebestand bevat geen leesbare haltecoördinaten");
  return { stops, catalogDate: latest.date };
}

export async function getNearbyNdovStops(coordinates: Coordinates, limit = 12): Promise<NearbyStop[]> {
  const catalog = await loadNdovStops();
  if (!catalog) return [];
  return nearbyStopsFromCatalog(coordinates, catalog.stops).slice(0, limit);
}

export async function getNdovContext(coordinates: Coordinates): Promise<NdovContext | null> {
  const catalog = await loadNdovStops();
  if (!catalog) return null;
  const nearby = nearbyStopsFromCatalog(coordinates, catalog.stops);
  return {
    stopCount: nearby.length,
    nearestDistanceM: nearby[0]?.distanceM,
    catalogDate: catalog.catalogDate,
    fetchedAt: new Date().toISOString(),
  };
}
