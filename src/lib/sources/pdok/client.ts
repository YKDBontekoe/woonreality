import type { GeoJsonFeature, GeoJsonFeatureCollection } from "@/src/lib/types";
import { bboxString, type LatLng } from "@/src/lib/geo/bbox";
import { fetchJson } from "@/src/lib/http/fetch-json";

const PDOK_LOCATION_BASE = "https://api.pdok.nl/kadaster/location-api/v1";
export const PDOK_BAG_BASE = "https://api.pdok.nl/kadaster/bag/ogc/v2";
const PDOK_BGT_BASE = "https://api.pdok.nl/lv/bgt/ogc/v1";

/** PDOK tolerates a week of staleness; analyses are regenerated daily at most. */
const PDOK_REVALIDATE_SECONDS = 604_800;

const PDOK_LOCATION_COLLECTIONS = ["adres", "woonplaats", "gemeentegebied", "plaats"] as const;

export function pdokLocationSearchUrl(query: string, limit = 6, collections: readonly string[] = PDOK_LOCATION_COLLECTIONS) {
  const params = new URLSearchParams({ f: "json", q: query, limit: String(limit) });
  for (const collection of collections) {
    params.set(`${collection}[version]`, "1");
    params.set(`${collection}[relevance]`, "1");
  }
  return `${PDOK_LOCATION_BASE}/search?${params.toString()}`;
}

export function pdokAddressSearchUrl(query: string, limit = 6) {
  return pdokLocationSearchUrl(query, limit, ["adres"]);
}

export function pdokBagAddressUrl(id: string) {
  return `${PDOK_BAG_BASE}/collections/adres/items/${encodeURIComponent(id)}?f=json`;
}

export function pdokBagVboSearchUrl(bagVboId: string) {
  const params = new URLSearchParams({ f: "json", identificatie: bagVboId, limit: "1" });
  return `${PDOK_BAG_BASE}/collections/verblijfsobject/items?${params.toString()}`;
}

export function pdokBagNearbyVboUrl(coordinates: LatLng, radiusM = 150, limit = 100) {
  const params = new URLSearchParams({ f: "json", bbox: bboxString(coordinates, radiusM), limit: String(Math.min(limit, 100)) });
  return `${PDOK_BAG_BASE}/collections/verblijfsobject/items?${params.toString()}`;
}

export function pdokBagFeatureUrl(collection: "verblijfsobject" | "pand", id: string) {
  return `${PDOK_BAG_BASE}/collections/${collection}/items/${encodeURIComponent(id)}?f=json`;
}

function pdokBgtItemsUrl(collection: string, coordinates: LatLng, radiusM = 250, limit = 100) {
  const params = new URLSearchParams({ f: "json", bbox: bboxString(coordinates, radiusM), limit: String(limit) });
  return `${PDOK_BGT_BASE}/collections/${collection}/items?${params.toString()}`;
}

export async function getJson<T>(url: string, label = "PDOK", revalidate: number = PDOK_REVALIDATE_SECONDS): Promise<T> {
  return fetchJson<T>(url, label, {
    revalidate,
    accept: "application/json, application/geo+json",
  });
}

export async function getBgtFeatures(
  collection: string,
  coordinates: LatLng,
  radiusM = 250,
  limit = 100,
) {
  const result = await getJson<GeoJsonFeatureCollection>(pdokBgtItemsUrl(collection, coordinates, radiusM, limit), `PDOK BGT ${collection}`);
  return result.features;
}

export function getFeatureId(feature: GeoJsonFeature) {
  return typeof feature.id === "string" ? feature.id : undefined;
}

export const pdokUrls = {
  location: "https://api.pdok.nl/kadaster/location-api/v1?f=html",
  bag: "https://api.pdok.nl/kadaster/bag/ogc/v2?f=html",
  bgt: "https://api.pdok.nl/lv/bgt/ogc/v1_0/",
};
