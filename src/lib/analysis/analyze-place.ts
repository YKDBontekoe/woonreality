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
  coordinatesFromFeature,
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

async function getWoonplaatsByCode(code: string) {
  const params = new URLSearchParams({ f: "json", identificatie: code, limit: "1" });
  const payload = await getJson<{ features?: WoonplaatsFeature[] }>(
    `${PDOK_BAG_BASE}/collections/woonplaats/items?${params}`,
    "PDOK BAG woonplaats",
  );
  const feature = payload.features?.[0];
  if (!feature?.properties?.woonplaats) return null;
  const coordinates = coordinatesFromFeature(feature);
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
  let buurtenTruncated = false;
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
    const buurtList = await listBuurtenByGemeente(gemeentecode);
    buurten = buurtList.items;
    buurtenTruncated = buurtList.truncated;
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
    const buurtList = await listBuurtenByGemeente(gemeentecode);
    buurten = buurtList.items;
    buurtenTruncated = buurtList.truncated;
  }

  if (!coordinates || !cbs) return null;

  const spatialScale = spatialScaleForKind(kind);
  const cbsSourceUrl = kind === "gemeente" || kind === "woonplaats" ? cbsGemeentenUrl : cbsBuurtenUrl;

  const [sesResult, crimeResult] = await Promise.allSettled([
    getSesContext(cbs),
    getCrimeContext(cbs),
  ]);
  const ses = sesResult.status === "fulfilled" ? sesResult.value : null;
  const crime = crimeResult.status === "fulfilled" ? crimeResult.value : null;
  if (sesResult.status === "rejected") console.warn("CBS SES-WOA unavailable", sesResult.reason);
  if (crimeResult.status === "rejected") console.warn("Politie misdrijven unavailable", crimeResult.reason);

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
    buurtenTruncated,
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
