import type { AddressSearchResult, LocationSearchResult, PlaceSearchResult } from "@/src/lib/types";
import { getCbsContext } from "@/src/lib/sources/cbs";
import { getJson, pdokAddressSearchUrl, pdokLocationSearchUrl } from "@/src/lib/sources/pdok/client";

type SearchFeature = {
  id?: string;
  geometry?: { coordinates?: [number, number] };
  properties?: {
    collection_id?: string;
    display_name?: string;
    href?: string[];
    score?: number;
  };
};

type AddressFeature = {
  properties?: { adresseerbaar_object_identificatie?: string };
};

type LocationSearchResponse = { features?: SearchFeature[] };

function queryPrefersAddresses(query: string) {
  return /\d/.test(query);
}

function placeRank(kind: PlaceSearchResult["kind"]) {
  if (kind === "woonplaats") return 0;
  if (kind === "gemeente") return 1;
  return 2;
}

function rankLocationResults(results: LocationSearchResult[], query: string) {
  const preferAddresses = queryPrefersAddresses(query);
  return [...results].sort((left, right) => {
    const leftIsAddress = left.kind === "adres";
    const rightIsAddress = right.kind === "adres";
    if (preferAddresses) {
      if (leftIsAddress !== rightIsAddress) return leftIsAddress ? -1 : 1;
    } else if (leftIsAddress !== rightIsAddress) {
      return leftIsAddress ? 1 : -1;
    }
    if (left.kind !== "adres" && right.kind !== "adres" && left.kind !== right.kind) {
      return placeRank(left.kind) - placeRank(right.kind);
    }
    return right.score - left.score;
  });
}

function normalizeDisplayName(displayName: string) {
  return displayName.split(",").slice(0, 2).join(",").trim() || displayName;
}

function placeSubtitle(displayName: string) {
  const match = displayName.match(/\(([^)]+)\)\s*$/);
  return match?.[1];
}

function featurePointAndHref(feature: SearchFeature) {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const href = feature.properties?.href?.[0];
  const displayName = feature.properties?.display_name;
  if (!feature.id || !displayName || typeof lng !== "number" || typeof lat !== "number") return undefined;
  return { id: feature.id, lng, lat, href, displayName };
}

async function mapAddressFeature(feature: SearchFeature): Promise<AddressSearchResult | undefined> {
  const point = featurePointAndHref(feature);
  if (!point?.href) return undefined;

  let bagVboId = point.id;
  try {
    const address = await getJson<AddressFeature>(point.href, "PDOK BAG adres");
    bagVboId = address.properties?.adresseerbaar_object_identificatie ?? bagVboId;
  } catch {
    // Keep the location feature ID as a fallback. The property route can still resolve it later.
  }

  return {
    kind: "adres",
    id: point.id,
    bagVboId,
    displayName: normalizeDisplayName(point.displayName),
    coordinates: { lat: point.lat, lng: point.lng },
    href: point.href,
    score: feature.properties?.score ?? 0,
  };
}

type BagPlaceDetail = {
  properties?: {
    identificatie?: string;
    woonplaats?: string;
    naam?: string;
    provincie_naam?: string;
    ligt_in_provincie_naam?: string;
  };
};

const BAG_PLACE_CONFIG = {
  woonplaats: { label: "PDOK BAG woonplaats", nameField: "woonplaats", provinceField: "provincie_naam" },
  gemeente: { label: "PDOK BAG gemeente", nameField: "naam", provinceField: "ligt_in_provincie_naam" },
} as const;

async function mapBagPlaceFeature(
  feature: SearchFeature,
  kind: "woonplaats" | "gemeente",
): Promise<PlaceSearchResult | undefined> {
  const config = BAG_PLACE_CONFIG[kind];
  const point = featurePointAndHref(feature);
  if (!point?.href) return undefined;

  try {
    const detail = await getJson<BagPlaceDetail>(point.href, config.label);
    const code = detail.properties?.identificatie?.trim();
    if (!code) return undefined;
    return {
      kind,
      id: point.id,
      code,
      displayName: detail.properties?.[config.nameField]?.trim() || normalizeDisplayName(point.displayName),
      coordinates: { lat: point.lat, lng: point.lng },
      score: feature.properties?.score ?? 0,
      subtitle: detail.properties?.[config.provinceField],
    };
  } catch {
    return undefined;
  }
}

function mapWoonplaatsFeature(feature: SearchFeature) {
  return mapBagPlaceFeature(feature, "woonplaats");
}

function mapGemeenteFeature(feature: SearchFeature) {
  return mapBagPlaceFeature(feature, "gemeente");
}

async function mapPlaatsFeature(feature: SearchFeature): Promise<PlaceSearchResult | undefined> {
  const point = featurePointAndHref(feature);
  if (!point) return undefined;

  const cbs = await getCbsContext({ lat: point.lat, lng: point.lng }).catch(() => null);
  if (!cbs?.buurtcode) return undefined;

  return {
    kind: "buurt",
    id: point.id,
    code: cbs.buurtcode,
    displayName: cbs.buurtName || point.displayName.replace(/\s*\([^)]+\)\s*$/, "").trim(),
    coordinates: { lat: point.lat, lng: point.lng },
    score: feature.properties?.score ?? 0,
    subtitle: cbs.municipalityName || placeSubtitle(point.displayName),
  };
}

async function mapFeature(feature: SearchFeature): Promise<LocationSearchResult | undefined> {
  const collectionId = feature.properties?.collection_id;
  if (collectionId === "adres") return mapAddressFeature(feature);
  if (collectionId === "woonplaats") return mapWoonplaatsFeature(feature);
  if (collectionId === "gemeentegebied") return mapGemeenteFeature(feature);
  if (collectionId === "plaats") return mapPlaatsFeature(feature);
  return undefined;
}

export function filterSearchResults(results: LocationSearchResult[], addressesOnly: boolean) {
  if (!addressesOnly) return results;
  return results.filter((result) => result.kind === "adres");
}

export async function searchLocations(query: string, limit = 10): Promise<LocationSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const collection = await getJson<LocationSearchResponse>(
    pdokLocationSearchUrl(trimmed, limit),
    "PDOK Location zoekopdracht",
  );

  const mapped = (await Promise.all((collection.features ?? []).map((feature) => mapFeature(feature))))
    .filter((result): result is LocationSearchResult => Boolean(result));

  const deduped = new Map<string, LocationSearchResult>();
  for (const result of rankLocationResults(mapped, trimmed)) {
    const key = result.kind === "adres" ? `adres:${result.bagVboId}` : `${result.kind}:${result.code}`;
    if (!deduped.has(key)) deduped.set(key, result);
  }

  return [...deduped.values()].slice(0, limit);
}

export async function searchAddresses(query: string, limit = 6): Promise<AddressSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const collection = await getJson<LocationSearchResponse>(
    pdokAddressSearchUrl(trimmed, limit),
    "PDOK adreszoekopdracht",
  );

  return (await Promise.all((collection.features ?? []).map(async (feature) => {
    if (feature.properties?.collection_id && feature.properties.collection_id !== "adres") return undefined;
    return mapAddressFeature(feature);
  }))).filter((result): result is AddressSearchResult => Boolean(result));
}
