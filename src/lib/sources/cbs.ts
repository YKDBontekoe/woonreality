import type { RegionScale } from "@/src/lib/map/national-layers";
import type { Coordinates, GeoJsonFeature, GeoJsonFeatureCollection } from "@/src/lib/types";

export const cbsOgcBase = "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections";
export const cbsBuurtenUrl = `${cbsOgcBase}/buurten/items`;
export const cbsWijkenUrl = `${cbsOgcBase}/wijken/items`;
export const cbsGemeentenUrl = `${cbsOgcBase}/gemeenten/items`;

export const CBS_REGION_LIMIT = 1000;

export function cbsCollectionUrl(scale: RegionScale) {
  if (scale === "gemeente") return cbsGemeentenUrl;
  if (scale === "wijk") return cbsWijkenUrl;
  return cbsBuurtenUrl;
}

export function regionNameFromProperties(properties: Record<string, unknown>, scale: RegionScale) {
  if (scale === "gemeente") return readString(properties, "gemeentenaam", "naam_gemeente");
  if (scale === "wijk") return readString(properties, "wijknaam", "naam_wijk");
  return readString(properties, "buurtnaam", "naam_buurt");
}

export function regionCodeFromProperties(properties: Record<string, unknown>, scale: RegionScale) {
  if (scale === "gemeente") return readString(properties, "gemeentecode");
  if (scale === "wijk") return readString(properties, "wijkcode");
  return readString(properties, "buurtcode");
}

/** CBS Wijk- en Buurtkaart uses large negative sentinels for suppressed / unknown cells. */
const CBS_SENTINEL_MAX = -99990;

export type CbsContext = {
  buurtName?: string;
  municipalityName?: string;
  buurtcode?: string;
  wijkcode?: string;
  gemeentecode?: string;
  inhabitants?: number;
  populationDensity?: number;
  averageWoz?: number;
  supermarketDistanceKm?: number;
  huisartsDistanceKm?: number;
  shareAge0to15Pct?: number;
  shareHouseholdsWithChildrenPct?: number;
  shareSinglePersonHouseholdsPct?: number;
  shareAge65PlusPct?: number;
  primarySchoolDistanceKm?: number;
  primarySchoolsWithin1km?: number;
  secondarySchoolDistanceKm?: number;
  childcareDistanceKm?: number;
  afterSchoolCareDistanceKm?: number;
  primaryPupils?: number;
  secondaryPupils?: number;
  mboStudents?: number;
  hboStudents?: number;
  woStudents?: number;
  fetchedAt: string;
};

export function isCbsNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > CBS_SENTINEL_MAX;
}

function readNumber(properties: Record<string, unknown>, ...keys: string[]) {
  const value = keys.map((key) => properties[key]).find(isCbsNumber);
  return isCbsNumber(value) ? value : undefined;
}

function readString(properties: Record<string, unknown>, ...keys: string[]) {
  const value = keys.map((key) => properties[key]).find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : undefined;
}

export function parseCbsProperties(properties: Record<string, unknown>, fetchedAt = new Date().toISOString()): CbsContext {
  return {
    buurtName: readString(properties, "buurtnaam", "naam_buurt"),
    municipalityName: readString(properties, "gemeentenaam", "naam_gemeente"),
    buurtcode: readString(properties, "buurtcode"),
    wijkcode: readString(properties, "wijkcode"),
    gemeentecode: readString(properties, "gemeentecode"),
    inhabitants: readNumber(properties, "aantal_inwoners"),
    populationDensity: readNumber(properties, "bevolkingsdichtheid_inwoners_per_km2"),
    averageWoz: readNumber(properties, "gemiddelde_woningwaarde", "gemiddelde_woz_waarde_van_woningen"),
    supermarketDistanceKm: readNumber(properties, "grote_supermarkt_gemiddelde_afstand_in_km", "supermarkt_gemiddelde_afstand_in_km"),
    huisartsDistanceKm: readNumber(properties, "huisartsenpraktijk_gemiddelde_afstand_in_km", "huisarts_gemiddelde_afstand_in_km"),
    shareAge0to15Pct: readNumber(properties, "percentage_personen_0_tot_15_jaar"),
    shareHouseholdsWithChildrenPct: readNumber(properties, "percentage_huishoudens_met_kinderen"),
    shareSinglePersonHouseholdsPct: readNumber(properties, "percentage_eenpersoonshuishoudens"),
    shareAge65PlusPct: readNumber(properties, "percentage_personen_65_jaar_en_ouder"),
    primarySchoolDistanceKm: readNumber(properties, "basisonderwijs_gemiddelde_afstand_in_km"),
    primarySchoolsWithin1km: readNumber(properties, "basisonderwijs_gemiddeld_aantal_binnen_1_km"),
    secondarySchoolDistanceKm: readNumber(properties, "voortgezet_onderwijs_gem_afstand_in_km"),
    childcareDistanceKm: readNumber(properties, "kinderdagverblijf_gemiddelde_afstand_in_km"),
    afterSchoolCareDistanceKm: readNumber(properties, "buitenschoolse_opvang_gem_afstand_in_km"),
    primaryPupils: readNumber(properties, "aantal_leerlingen_primair_onderwijs"),
    secondaryPupils: readNumber(properties, "aantal_leerlingen_voortgezet_onderwijs"),
    mboStudents: readNumber(properties, "aantal_studenten_mbo"),
    hboStudents: readNumber(properties, "aantal_studenten_hbo"),
    woStudents: readNumber(properties, "aantal_studenten_wo"),
    fetchedAt,
  };
}

export function schoolScoreFromCbs(cbs: Pick<CbsContext, "primarySchoolDistanceKm" | "childcareDistanceKm" | "primarySchoolsWithin1km">) {
  const distanceKm = cbs.primarySchoolDistanceKm ?? cbs.childcareDistanceKm;
  if (distanceKm == null) return undefined;
  let score = Math.min(10, Math.max(0, 9 - distanceKm * 2));
  if ((cbs.primarySchoolsWithin1km ?? 0) >= 2) score = Math.min(10, score + 0.4);
  return Math.round(score * 10) / 10;
}

export async function fetchCbsRegionsInBbox(
  bbox: [number, number, number, number],
  scale: RegionScale,
  limit = CBS_REGION_LIMIT,
): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams({
    f: "json",
    bbox: bbox.join(","),
    limit: String(limit),
  });
  const response = await fetch(`${cbsCollectionUrl(scale)}?${params}`, { next: { revalidate: 86400 } });
  if (!response.ok) throw new Error(`CBS ${scale} ${response.status}`);
  const payload = await response.json() as GeoJsonFeatureCollection;
  return {
    type: "FeatureCollection",
    features: payload.features ?? [],
  };
}

export function slimCbsFeature(feature: GeoJsonFeature, scale: RegionScale): GeoJsonFeature {
  const properties = feature.properties ?? {};
  const parsed = parseCbsProperties(properties);
  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      regionCode: regionCodeFromProperties(properties, scale),
      regionName: regionNameFromProperties(properties, scale),
      municipalityName: parsed.municipalityName,
      scale,
      inhabitants: parsed.inhabitants,
      populationDensity: parsed.populationDensity,
      averageWoz: parsed.averageWoz,
      shareAge0to15Pct: parsed.shareAge0to15Pct,
      shareHouseholdsWithChildrenPct: parsed.shareHouseholdsWithChildrenPct,
      primarySchoolDistanceKm: parsed.primarySchoolDistanceKm,
      primarySchoolsWithin1km: parsed.primarySchoolsWithin1km,
      secondarySchoolDistanceKm: parsed.secondarySchoolDistanceKm,
      buurtcode: parsed.buurtcode,
      wijkcode: parsed.wijkcode,
      gemeentecode: parsed.gemeentecode,
    },
  };
}

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
  return parseCbsProperties(properties);
}
