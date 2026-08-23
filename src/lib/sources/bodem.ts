import type { Coordinates } from "@/src/lib/types";
import { fetchJson } from "@/src/lib/http/fetch-json";

type WfsProvider = "Gemeente Nijmegen" | "Provincie Zuid-Holland";

export type BodemProviderLayerMatch = {
  layerKey: string;
  matchedCount: number;
  exampleRecordId?: string;
  exampleDisplayName?: string;
};

export type BodemProviderResult = {
  provider: WfsProvider;
  status: "ok" | "partial" | "unavailable";
  sourceUrl: string;
  matchedCount: number;
  layers: BodemProviderLayerMatch[];
};

export type BodemContext = {
  fetchedAt: string;
  overallStatus: "ok" | "partial";
  queriedProvinces: string[];
  queryBboxEpsg4326: string;
  totalMatches: number;
  providers: BodemProviderResult[];
  caveat: string;
};

const NIJMEGEN_WFS_URL = "https://services.nijmegen.nl/geoservices/extern_MIL_Bodem/ows?service=WFS&version=2.0.0";
const ZUIDHOLLAND_WFS_URL = "https://geodata.zuid-holland.nl/geoserver/bodem/wfs?service=WFS&version=2.0.0";

const soilCaveat =
  "Dit is een screeningindicatie op basis van regionale, openbare WFS-datasets rond het adres (bbox). Afwezigheid van hits betekent niet dat er geen bodemverontreiniging is; check voor zekerheid het provinciaal/gemeentelijk bodemloket.";

function toProvinceSet(input?: string | null): string[] {
  if (!input) return [];
  return [input];
}

function normalizeProvince(province?: string | null) {
  return province?.trim().toLowerCase() ?? "";
}

function shouldQueryNijmegen(province?: string | null) {
  const p = normalizeProvince(province);
  return !p || p.includes("gelderland");
}

function shouldQueryZuidHolland(province?: string | null) {
  const p = normalizeProvince(province);
  return !p || p.includes("zuid-holland") || p.includes("zuid holland");
}

function bboxEpsg4326(coordinates: Coordinates, epsDeg = 0.002) {
  const { lat, lng } = coordinates;
  const minLng = lng - epsDeg;
  const maxLng = lng + epsDeg;
  const minLat = lat - epsDeg;
  const maxLat = lat + epsDeg;
  return `${minLng},${minLat},${maxLng},${maxLat},EPSG:4326`;
}

function firstStringProperty(properties: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
    const maybeNumber = typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
    if (maybeNumber && maybeNumber.trim().length > 0) return maybeNumber;
  }
  return undefined;
}

async function getWfsGeoJsonFeatureCollection(url: string) {
  const json = await fetchJson<unknown>(url, "Lokaal bodemregister WFS", { revalidate: 86_400 });
  if (typeof json !== "object" || json == null) throw new Error("WFS response is not an object");
  // We only need a subset for feasibility.
  return json as {
    type?: string;
    features?: Array<{ id?: string; properties?: Record<string, unknown> }>;
    numberMatched?: number;
    numberReturned?: number;
    totalFeatures?: number;
  };
}

function wfsGetFeatureUrl(opts: {
  wfsBaseUrl: string; // either ends with /ows or already includes params
  typeNames: string; // e.g. "extern_MIL_Bodem:MIL_BOD_VERONT"
  bboxEpsg4326: string;
}) {
  // Nijmegen endpoint uses /ows?service=WFS&version=2.0.0
  // Zuid-Holland endpoint uses /geoserver/bodem/wfs?service=WFS&version=2.0.0
  const typeNames = opts.typeNames;
  // Note: we rely on WFS to accept bbox with EPSG:4326 as last param (Geoserver supports this).
  const params = new URLSearchParams({
    request: "GetFeature",
    typeNames,
    outputFormat: "application/json",
    bbox: opts.bboxEpsg4326,
    count: "1",
  });
  // wfsBaseUrl already contains some query params for Zuid-Holland.
  const separator = opts.wfsBaseUrl.includes("?") ? "&" : "?";
  return `${opts.wfsBaseUrl}${separator}${params.toString()}`;
}

type SoilLayerConfig = {
  layerKey: string;
  typeNamesByProvider: Partial<Record<WfsProvider, string>>;
  exampleRecordIdKeys: string[];
  exampleDisplayNameKeys: string[];
};

const soilLayers: SoilLayerConfig[] = [
  {
    layerKey: "verontreinigd",
    typeNamesByProvider: { "Gemeente Nijmegen": "extern_MIL_Bodem:MIL_BOD_VERONT" },
    exampleRecordIdKeys: ["LOC_CODE"],
    exampleDisplayNameKeys: ["LOCATIE_NAAM", "Locatienaam"],
  },
  {
    layerKey: "verdacht",
    typeNamesByProvider: { "Gemeente Nijmegen": "extern_MIL_Bodem:MIL_BOD_VERDACHT" },
    exampleRecordIdKeys: ["CLUS_ID"],
    exampleDisplayNameKeys: ["LEGENDA"],
  },
  {
    layerKey: "olietanks",
    typeNamesByProvider: { "Gemeente Nijmegen": "extern_MIL_Bodem:MIL_BOD_OLIETANKS" },
    exampleRecordIdKeys: ["DOCUMENTNR"],
    exampleDisplayNameKeys: ["ADRES", "IMAPCONCL"],
  },
  {
    layerKey: "hbb",
    typeNamesByProvider: { "Provincie Zuid-Holland": "bodem:BS_HBB_PUNTEN_PZH" },
    exampleRecordIdKeys: ["BIO_ID", "CLUS_ID", "HUIDIGE_ID", "Locatiecode"],
    exampleDisplayNameKeys: ["STRAAT", "PLAATS", "PLAATSNAAM", "Locatienaam"],
  },
  {
    layerKey: "stortplaatsen_vv",
    typeNamesByProvider: { "Provincie Zuid-Holland": "bodem:STORTPLAATSEN_VOORMALIG_PUNT" },
    exampleRecordIdKeys: ["Locatiecode"],
    exampleDisplayNameKeys: ["Locatienaam", "Plaatsnaam", "Huidig_gebruik"],
  },
  {
    layerKey: "spoedlocaties",
    typeNamesByProvider: { "Provincie Zuid-Holland": "bodem:BS_SPOEDLOCATIES" },
    exampleRecordIdKeys: ["Locatiecode", "Locatienaam", "Locatienaam_2", "BIS_locatie"],
    exampleDisplayNameKeys: ["Locatienaam", "Plaatsnaam", "Straat"],
  },
];

async function queryProvider(opts: { provider: WfsProvider; bbox: string }) {
  const { provider, bbox } = opts;

  const sourceUrl = provider === "Gemeente Nijmegen" ? NIJMEGEN_WFS_URL : ZUIDHOLLAND_WFS_URL;
  const requestedLayers = soilLayers.filter((l) => l.typeNamesByProvider[provider] != null);

  const layers: BodemProviderLayerMatch[] = [];
  let matchedCount = 0;
  let okCount = 0;
  let unavailableCount = 0;

  await Promise.allSettled(
    requestedLayers.map(async (layerConfig) => {
      const typeNames = layerConfig.typeNamesByProvider[provider];
      if (!typeNames) return;
      const wfsUrl = wfsGetFeatureUrl({
        wfsBaseUrl: sourceUrl,
        typeNames,
        bboxEpsg4326: bbox,
      });
      try {
        const fc = await getWfsGeoJsonFeatureCollection(wfsUrl);
        const numberMatched = typeof fc.numberMatched === "number" ? fc.numberMatched : 0;
        matchedCount += numberMatched;
        okCount += 1;

        const firstFeature = fc.features?.[0];
        const props = firstFeature?.properties ?? {};

        layers.push({
          layerKey: layerConfig.layerKey,
          matchedCount: numberMatched,
          exampleRecordId: firstStringProperty(props, layerConfig.exampleRecordIdKeys),
          exampleDisplayName: firstStringProperty(props, layerConfig.exampleDisplayNameKeys),
        });
      } catch {
        unavailableCount += 1;
      }
    }),
  );

  const status: BodemProviderResult["status"] =
    unavailableCount > 0 && okCount > 0 ? "partial" : unavailableCount === requestedLayers.length ? "unavailable" : "ok";

  if (status === "unavailable") {
    return {
      provider,
      status,
      sourceUrl,
      matchedCount: 0,
      layers: [],
    } satisfies BodemProviderResult;
  }

  return {
    provider,
    status,
    sourceUrl,
    matchedCount,
    layers,
  } satisfies BodemProviderResult;
}

export async function getBodemContext(coordinates: Coordinates, province?: string | null): Promise<BodemContext | null> {
  const queriedProviders: WfsProvider[] = [];
  if (shouldQueryNijmegen(province)) queriedProviders.push("Gemeente Nijmegen");
  if (shouldQueryZuidHolland(province)) queriedProviders.push("Provincie Zuid-Holland");

  if (queriedProviders.length === 0) return null;

  const bbox = bboxEpsg4326(coordinates);
  const fetchedAt = new Date().toISOString();

  const results = await Promise.allSettled(
    queriedProviders.map(async (provider) => {
      return queryProvider({ provider, bbox });
    }),
  );

  const providers: BodemProviderResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") providers.push(r.value);
  }

  const totalMatches = providers.reduce((sum, p) => sum + p.matchedCount, 0);
  const hasAnyOkOrPartial = providers.some((p) => p.status === "ok" || p.status === "partial");
  if (!hasAnyOkOrPartial) return null;

  const overallStatus: BodemContext["overallStatus"] = providers.some((p) => p.status === "partial") ? "partial" : "ok";
  return {
    fetchedAt,
    overallStatus,
    queriedProvinces: toProvinceSet(province),
    queryBboxEpsg4326: bbox,
    totalMatches,
    providers,
    caveat: soilCaveat,
  };
}

