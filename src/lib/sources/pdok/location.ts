import type { AddressSearchResult } from "@/src/lib/types";
import { getJson, pdokLocationSearchUrl } from "@/src/lib/sources/pdok/client";

type SearchFeature = {
  id?: string;
  geometry?: { coordinates?: [number, number] };
  properties?: {
    display_name?: string;
    href?: string[];
    score?: number;
  };
};

type AddressFeature = {
  properties?: { adresseerbaar_object_identificatie?: string };
};

type LocationSearchResponse = { features?: SearchFeature[] };

export async function searchAddresses(query: string, limit = 6): Promise<AddressSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const collection = await getJson<LocationSearchResponse>(
    pdokLocationSearchUrl(trimmed, limit),
    604_800,
  );

  return (await Promise.all((collection.features ?? []).map(async (feature) => {
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    const href = feature.properties?.href?.[0];
    const displayName = feature.properties?.display_name;
    if (!feature.id || !href || !displayName || typeof lng !== "number" || typeof lat !== "number") return undefined;

    const normalized = displayName.split(",").slice(0, 2).join(",").trim() || displayName;
    let bagVboId = feature.id;
    try {
      const address = await getJson<AddressFeature>(href, 604_800);
      bagVboId = address.properties?.adresseerbaar_object_identificatie ?? bagVboId;
    } catch {
      // Keep the location feature ID as a fallback. The property route can still resolve it later.
    }
    return {
      id: feature.id,
      bagVboId,
      displayName: normalized,
      coordinates: { lat, lng },
      href,
      score: feature.properties?.score ?? 0,
    };
  }))).filter((result): result is AddressSearchResult => Boolean(result));
}
