import { gunzipSync } from "node:zlib";
import type { Coordinates } from "@/src/lib/types";
import type { SourceContextBase } from "@/src/lib/source-context";
import { haversineM } from "@/src/lib/geo/measure";
import { rdToWgs84 } from "@/src/lib/geo/rd";
import { fetchBuffer, fetchText } from "@/src/lib/http/fetch-json";
import { createInflightDeduper, createTtlCache } from "@/src/lib/cache/ttl";

export const ndovHaltesUrl = "https://data.ndovloket.nl/haltes/";

export type NdovContext = SourceContextBase & {
  stopCount: number;
  nearestDistanceM?: number;
  catalogDate?: string;
};

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
const ndovCatalogCache = createTtlCache<NdovCatalog>({ ttlMs: NDOV_CATALOG_TTL_MS });
const dedupeNdovCatalog = createInflightDeduper<NdovCatalog | null>();

function nearbyStopsFromCatalog(coordinates: Coordinates, stops: Coordinates[]): NearbyStop[] {
  return stops
    .map((stop) => ({ ...stop, distanceM: Math.round(haversineM(coordinates, stop)) }))
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
  const cached = ndovCatalogCache.get("catalog");
  if (cached) return cached;
  return dedupeNdovCatalog("catalog", async () => {
    const catalog = await fetchNdovStops();
    if (catalog) ndovCatalogCache.set("catalog", catalog);
    return catalog;
  });
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
