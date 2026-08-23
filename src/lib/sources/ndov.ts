import { gunzipSync } from "node:zlib";
import type { Coordinates } from "@/src/lib/types";
import { rdToWgs84 } from "@/src/lib/geo/rd";
import { fetchBuffer, fetchText } from "@/src/lib/http/fetch-json";

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

/**
 * The index is cached for a day while upstream removes yesterday's file when
 * today's appears — so the newest entry in a stale cache can 404. Candidates
 * are returned newest-first so callers can walk back to a file that exists.
 */
export function ndovCatalogFileCandidates(index: string) {
  const files = [...index.matchAll(/href=["'](ExportCHB_(\d{4}-\d{2}-\d{2})\.xml\.gz)["']/gi)]
    .map((match) => ({ file: match[1], date: match[2] }));
  return files.sort((a, b) => b.date.localeCompare(a.date)).slice(0, NDOV_FILE_FALLBACKS);
}

const NDOV_FILE_FALLBACKS = 3;

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

type NdovCatalog = {
  stops: Coordinates[];
  catalogDate: string;
};

// The daily catalogue is a sizeable compressed download. Next's data cache cannot
// persist it because the response is over its cache-item limit, so retain the
// parsed coordinates in this server process instead. The shared promise also
// stops concurrent property checks from downloading the same file repeatedly.
const NDOV_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
let ndovCatalogCache: { value: NdovCatalog; expiresAt: number } | null = null;
let ndovCatalogLoading: Promise<NdovCatalog | null> | null = null;

function nearbyStopsFromCatalog(coordinates: Coordinates, stops: Coordinates[]): NearbyStop[] {
  return stops
    .map((stop) => ({ ...stop, distanceM: Math.round(distanceM(coordinates, stop)) }))
    .filter((stop) => stop.distanceM <= 1000)
    .sort((a, b) => a.distanceM - b.distanceM);
}

async function fetchNdovStops(): Promise<NdovCatalog | null> {
  const index = await fetchText(ndovHaltesUrl, "NDOV halteindex", { revalidate: 86400 });
  const candidates = ndovCatalogFileCandidates(index);
  if (!candidates.length) return null;
  let lastError: unknown = new Error("NDOV haltebestand niet gevonden");
  for (const candidate of candidates) {
    try {
      // Keep the large response out of Next's data cache; the parsed version
      // below is smaller and is retained by this module for its bounded TTL.
      const xml = gunzipSync(await fetchBuffer(new URL(candidate.file, ndovHaltesUrl), "NDOV haltebestand", { timeoutMs: 30_000 }))
        .toString("utf8");
      const stops = ndovStopCoordinates(xml);
      if (!stops.length) throw new Error("NDOV haltebestand bevat geen leesbare haltecoördinaten");
      return { stops, catalogDate: candidate.date };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function loadNdovStops() {
  if (ndovCatalogCache && ndovCatalogCache.expiresAt > Date.now()) return ndovCatalogCache.value;
  if (!ndovCatalogLoading) {
    ndovCatalogLoading = fetchNdovStops()
      .then((catalog) => {
        if (catalog) ndovCatalogCache = { value: catalog, expiresAt: Date.now() + NDOV_CATALOG_TTL_MS };
        return catalog;
      })
      .finally(() => { ndovCatalogLoading = null; });
  }
  return ndovCatalogLoading;
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
