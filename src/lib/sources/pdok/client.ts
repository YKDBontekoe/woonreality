import type { GeoJsonFeature, GeoJsonFeatureCollection } from "@/src/lib/types";

const PDOK_LOCATION_BASE = "https://api.pdok.nl/kadaster/location-api/v1";
const PDOK_BAG_BASE = "https://api.pdok.nl/kadaster/bag/ogc/v2";
const PDOK_BGT_BASE = "https://api.pdok.nl/lv/bgt/ogc/v1";

async function pdokFetch<T>(url: string, revalidate = 604_800): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json, application/geo+json" },
    next: { revalidate },
  });

  if (!response.ok) {
    throw new Error(`PDOK request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
}

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

export function pdokBagNearbyVboUrl(coordinates: { lat: number; lng: number }, radiusM = 150, limit = 100) {
  const latitudeDelta = radiusM / 111_320;
  const longitudeDelta = radiusM / (111_320 * Math.cos((coordinates.lat * Math.PI) / 180));
  const bbox = [
    coordinates.lng - longitudeDelta,
    coordinates.lat - latitudeDelta,
    coordinates.lng + longitudeDelta,
    coordinates.lat + latitudeDelta,
  ].join(",");
  const params = new URLSearchParams({ f: "json", bbox, limit: String(Math.min(limit, 100)) });
  return `${PDOK_BAG_BASE}/collections/verblijfsobject/items?${params.toString()}`;
}

export function pdokBagFeatureUrl(collection: "verblijfsobject" | "pand", id: string) {
  return `${PDOK_BAG_BASE}/collections/${collection}/items/${encodeURIComponent(id)}?f=json`;
}

export function pdokBgtItemsUrl(collection: string, coordinates: { lat: number; lng: number }, radiusM = 250) {
  const latitudeDelta = radiusM / 111_320;
  const longitudeDelta = radiusM / (111_320 * Math.cos((coordinates.lat * Math.PI) / 180));
  const bbox = [
    coordinates.lng - longitudeDelta,
    coordinates.lat - latitudeDelta,
    coordinates.lng + longitudeDelta,
    coordinates.lat + latitudeDelta,
  ].join(",");
  const params = new URLSearchParams({ f: "json", bbox, limit: "100" });
  return `${PDOK_BGT_BASE}/collections/${collection}/items?${params.toString()}`;
}

export async function getJson<T>(url: string, revalidate?: number) {
  return pdokFetch<T>(url, revalidate);
}

export async function getBgtFeatures(
  collection: string,
  coordinates: { lat: number; lng: number },
  radiusM = 250,
) {
  const result = await pdokFetch<GeoJsonFeatureCollection>(pdokBgtItemsUrl(collection, coordinates, radiusM), 604_800);
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
