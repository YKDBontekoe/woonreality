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

type WoonplaatsFeature = {
  properties?: {
    identificatie?: string;
    woonplaats?: string;
    bronhouder_identificatie?: string;
    provincie_naam?: string;
  };
};

type GemeenteFeature = {
  properties?: {
    identificatie?: string;
    naam?: string;
    ligt_in_provincie_naam?: string;
  };
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

async function mapAddressFeature(feature: SearchFeature): Promise<AddressSearchResult | undefined> {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const href = feature.properties?.href?.[0];
  const displayName = feature.properties?.display_name;
  if (!feature.id || !href || !displayName || typeof lng !== "number" || typeof lat !== "number") return undefined;

  let bagVboId = feature.id;
  try {
    const address = await getJson<AddressFeature>(href, 604_800);
    bagVboId = address.properties?.adresseerbaar_object_identificatie ?? bagVboId;
  } catch {
    // Keep the location feature ID as a fallback. The property route can still resolve it later.
  }

  return {
    kind: "adres",
    id: feature.id,
    bagVboId,
    displayName: normalizeDisplayName(displayName),
    coordinates: { lat, lng },
    href,
    score: feature.properties?.score ?? 0,
  };
}

async function mapWoonplaatsFeature(feature: SearchFeature): Promise<PlaceSearchResult | undefined> {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const href = feature.properties?.href?.[0];
  const displayName = feature.properties?.display_name;
  if (!feature.id || !href || !displayName || typeof lng !== "number" || typeof lat !== "number") return undefined;

  try {
    const woonplaats = await getJson<WoonplaatsFeature>(href, 604_800);
    const code = woonplaats.properties?.identificatie?.trim();
    if (!code) return undefined;
    return {
      kind: "woonplaats",
      id: feature.id,
      code,
      displayName: woonplaats.properties?.woonplaats?.trim() || normalizeDisplayName(displayName),
      coordinates: { lat, lng },
      score: feature.properties?.score ?? 0,
      subtitle: woonplaats.properties?.provincie_naam,
    };
  } catch {
    return undefined;
  }
}

async function mapGemeenteFeature(feature: SearchFeature): Promise<PlaceSearchResult | undefined> {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const href = feature.properties?.href?.[0];
  const displayName = feature.properties?.display_name;
  if (!feature.id || !href || !displayName || typeof lng !== "number" || typeof lat !== "number") return undefined;

  try {
    const gemeente = await getJson<GemeenteFeature>(href, 604_800);
    const code = gemeente.properties?.identificatie?.trim();
    if (!code) return undefined;
    return {
      kind: "gemeente",
      id: feature.id,
      code,
      displayName: gemeente.properties?.naam?.trim() || normalizeDisplayName(displayName),
      coordinates: { lat, lng },
      score: feature.properties?.score ?? 0,
      subtitle: gemeente.properties?.ligt_in_provincie_naam,
    };
  } catch {
    return undefined;
  }
}

async function mapPlaatsFeature(feature: SearchFeature): Promise<PlaceSearchResult | undefined> {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const displayName = feature.properties?.display_name;
  if (!feature.id || !displayName || typeof lng !== "number" || typeof lat !== "number") return undefined;

  const cbs = await getCbsContext({ lat, lng }).catch(() => null);
  if (!cbs?.buurtcode) return undefined;

  return {
    kind: "buurt",
    id: feature.id,
    code: cbs.buurtcode,
    displayName: cbs.buurtName || displayName.replace(/\s*\([^)]+\)\s*$/, "").trim(),
    coordinates: { lat, lng },
    score: feature.properties?.score ?? 0,
    subtitle: cbs.municipalityName || placeSubtitle(displayName),
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
    604_800,
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
    604_800,
  );

  return (await Promise.all((collection.features ?? []).map(async (feature) => {
    if (feature.properties?.collection_id && feature.properties.collection_id !== "adres") return undefined;
    return mapAddressFeature(feature);
  }))).filter((result): result is AddressSearchResult => Boolean(result));
}
