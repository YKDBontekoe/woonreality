import type { Coordinates, PlaceAnalysis, PlaceKind } from "@/src/lib/types";
import {
  createCbsEvidence,
  createCrimeEvidence,
  createSesEvidence,
  placeNeighborhoodSignals,
} from "@/src/lib/analysis/neighborhood-signals";
import {
  cbsBuurtenUrl,
  cbsGemeentenUrl,
  getCbsByBuurtCode,
  getCbsByGemeenteCode,
  listBuurtenByGemeente,
  type CbsContext,
} from "@/src/lib/sources/cbs";
import { getJson } from "@/src/lib/sources/pdok/client";
import { getCrimeContext } from "@/src/lib/sources/politie";
import { getSesContext, sesStatLineTableUrl } from "@/src/lib/sources/ses";
import { politieMisdrijvenTableUrl } from "@/src/lib/sources/politie";

const PDOK_BAG_BASE = "https://api.pdok.nl/kadaster/bag/ogc/v2";

type WoonplaatsFeature = {
  properties?: {
    identificatie?: string;
    woonplaats?: string;
    bronhouder_identificatie?: string;
    provincie_naam?: string;
  };
  geometry?: { type?: string; coordinates?: unknown };
  bbox?: number[];
};

function gemeenteCodeFromBronhouder(code: string) {
  const digits = code.replace(/\D/g, "").padStart(4, "0");
  return `GM${digits}`;
}

function coordinatesFromWoonplaats(feature: WoonplaatsFeature): Coordinates | undefined {
  if (Array.isArray(feature.bbox) && feature.bbox.length >= 4) {
    return { lng: (feature.bbox[0] + feature.bbox[2]) / 2, lat: (feature.bbox[1] + feature.bbox[3]) / 2 };
  }
  const coords = feature.geometry?.coordinates;
  if (Array.isArray(coords) && Array.isArray(coords[0]?.[0]?.[0])) {
    const ring = coords[0][0] as number[][];
    const lng = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
    const lat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    return { lng, lat };
  }
  return undefined;
}

async function getWoonplaatsByCode(code: string) {
  const params = new URLSearchParams({ f: "json", identificatie: code, limit: "1" });
  const payload = await getJson<{ features?: WoonplaatsFeature[] }>(
    `${PDOK_BAG_BASE}/collections/woonplaats/items?${params}`,
    604_800,
  );
  const feature = payload.features?.[0];
  if (!feature?.properties?.woonplaats) return null;
  const coordinates = coordinatesFromWoonplaats(feature);
  if (!coordinates) return null;
  const gemeentecode = feature.properties.bronhouder_identificatie
    ? gemeenteCodeFromBronhouder(feature.properties.bronhouder_identificatie)
    : undefined;
  return {
    name: feature.properties.woonplaats.trim(),
    subtitle: feature.properties.provincie_naam,
    coordinates,
    gemeentecode,
  };
}

function placeNameFromCbs(kind: PlaceKind, cbs: CbsContext | null, fallback: string) {
  if (kind === "buurt") return cbs?.buurtName ?? fallback;
  if (kind === "gemeente") return cbs?.municipalityName ?? fallback;
  return fallback;
}

function spatialScaleForKind(kind: PlaceKind) {
  if (kind === "buurt") return "buurt";
  return "gemeente";
}

export async function analyzePlace(kind: PlaceKind, code: string): Promise<PlaceAnalysis | null> {
  let name = code;
  let subtitle: string | undefined;
  let coordinates: Coordinates | null = null;
  let cbs: CbsContext | null = null;
  let buurten: PlaceAnalysis["buurten"] = [];
  let gemeentecode: string | undefined;

  if (kind === "buurt") {
    const lookup = await getCbsByBuurtCode(code);
    if (!lookup) return null;
    cbs = lookup.context;
    coordinates = lookup.coordinates;
    name = placeNameFromCbs(kind, cbs, code);
    subtitle = cbs.municipalityName;
  } else if (kind === "gemeente") {
    const lookup = await getCbsByGemeenteCode(code);
    if (!lookup) return null;
    cbs = lookup.context;
    coordinates = lookup.coordinates;
    gemeentecode = cbs.gemeentecode ?? code;
    name = placeNameFromCbs(kind, cbs, code);
    buurten = await listBuurtenByGemeente(gemeentecode);
  } else {
    const woonplaats = await getWoonplaatsByCode(code);
    if (!woonplaats?.gemeentecode) return null;
    const lookup = await getCbsByGemeenteCode(woonplaats.gemeentecode);
    if (!lookup) return null;
    cbs = lookup.context;
    coordinates = woonplaats.coordinates;
    gemeentecode = woonplaats.gemeentecode;
    name = woonplaats.name;
    subtitle = woonplaats.subtitle ?? cbs.municipalityName;
    buurten = await listBuurtenByGemeente(gemeentecode);
  }

  if (!coordinates || !cbs) return null;

  const spatialScale = spatialScaleForKind(kind);
  const cbsSourceUrl = kind === "gemeente" || kind === "woonplaats" ? cbsGemeentenUrl : cbsBuurtenUrl;

  const [ses, crime] = await Promise.all([
    getSesContext(cbs),
    getCrimeContext(cbs),
  ]);

  const signals = placeNeighborhoodSignals({
    cbs,
    ses,
    crime,
    cbsEvidence: createCbsEvidence(cbs, cbsSourceUrl),
    sesEvidence: createSesEvidence(ses, sesStatLineTableUrl),
    crimeEvidence: createCrimeEvidence(crime, politieMisdrijvenTableUrl),
    spatialScale,
  });

  return {
    kind,
    code,
    name,
    subtitle,
    coordinates,
    cbs,
    signals,
    buurten,
    sources: [
      {
        source: "CBS Wijk- en Buurtkaart",
        status: cbs ? "ok" : "unavailable",
        sourceUrl: kind === "gemeente" || kind === "woonplaats" ? cbsGemeentenUrl : cbsBuurtenUrl,
      },
      {
        source: "CBS SES-WOA",
        status: ses ? "ok" : "unavailable",
        sourceUrl: sesStatLineTableUrl,
      },
      {
        source: "Politie / CBS misdrijven",
        status: crime ? "ok" : "unavailable",
        sourceUrl: politieMisdrijvenTableUrl,
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

export const placeKindLabels: Record<PlaceKind, string> = {
  woonplaats: "Woonplaats",
  gemeente: "Gemeente",
  buurt: "Buurt",
};
