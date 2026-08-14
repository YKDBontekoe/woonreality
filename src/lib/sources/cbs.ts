import type { Coordinates } from "@/src/lib/types";

export const cbsBuurtenUrl = "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items";

export type CbsContext = {
  buurtName?: string;
  municipalityName?: string;
  populationDensity?: number;
  averageWoz?: number;
  supermarketDistanceKm?: number;
  huisartsDistanceKm?: number;
  fetchedAt: string;
};

export async function getCbsContext(coordinates: Coordinates): Promise<CbsContext | null> {
  const delta = 0.00025;
  const params = new URLSearchParams({
    f: "json",
    bbox: `${coordinates.lng - delta},${coordinates.lat - delta},${coordinates.lng + delta},${coordinates.lat + delta}`,
    limit: "1",
  });
  const response = await fetch(`${cbsBuurtenUrl}?${params}`, { next: { revalidate: 86400 } });
  if (!response.ok) throw new Error(`CBS buurten ${response.status}`);
  const payload = await response.json() as { features?: { properties?: Record<string, unknown> }[] };
  const properties = payload.features?.[0]?.properties;
  if (!properties) return null;
  const getNumber = (...keys: string[]) => {
    const value = keys.map((key) => properties[key]).find((candidate) => typeof candidate === "number");
    return typeof value === "number" ? value : undefined;
  };
  return {
    buurtName: typeof properties.buurtnaam === "string" ? properties.buurtnaam : typeof properties.naam_buurt === "string" ? properties.naam_buurt : undefined,
    municipalityName: typeof properties.gemeentenaam === "string" ? properties.gemeentenaam : typeof properties.naam_gemeente === "string" ? properties.naam_gemeente : undefined,
    populationDensity: getNumber("bevolkingsdichtheid_inwoners_per_km2"),
    averageWoz: getNumber("gemiddelde_woz_waarde_van_woningen"),
    supermarketDistanceKm: getNumber("supermarkt_gemiddelde_afstand_in_km", "grote_supermarkt_gemiddelde_afstand_in_km"),
    huisartsDistanceKm: getNumber("huisarts_gemiddelde_afstand_in_km", "huisartsenpraktijk_gemiddelde_afstand_in_km"),
    fetchedAt: new Date().toISOString(),
  };
}
