import {
  NATIONAL_LAYERS,
  regionScaleFromZoom,
} from "@/src/lib/map/national-layers";
import type { LayerLegend, NationalLayerId, RegionScale } from "@/src/lib/map/national-layers";
import {
  CBS_REGION_LIMIT,
  fetchCbsRegionsInBbox,
  regionCodeFromProperties,
  slimCbsFeature,
} from "@/src/lib/sources/cbs";
import { crimeRatePer1000, getCrimeLookupForEntries, lookupCrimeEntry } from "@/src/lib/sources/politie";
import { getSesLookupForCodes, lookupSesEntry } from "@/src/lib/sources/ses";
import type { GeoJsonFeature, GeoJsonFeatureCollection } from "@/src/lib/types";

export type RegionBBox = [number, number, number, number];

export type RegionFeatureProperties = {
  regionCode?: string;
  regionName?: string;
  municipalityName?: string;
  scale: RegionScale;
  value: number | null;
  valueLabel: string;
  inhabitants?: number;
  populationDensity?: number;
  averageWoz?: number;
  shareAge0to15Pct?: number;
  shareHouseholdsWithChildrenPct?: number;
  primarySchoolDistanceKm?: number;
  primarySchoolsWithin1km?: number;
  secondarySchoolDistanceKm?: number;
  sesScore?: number;
  educationHighPct?: number;
  educationScore?: number;
  crimePer1000?: number;
  crimeTotal?: number;
  periodYear?: string;
};

export type RegionsPayload = GeoJsonFeatureCollection & {
  meta: {
    layer: NationalLayerId;
    scale: RegionScale;
    legend: LayerLegend;
    periodYear?: string;
    featureCount: number;
    truncated: boolean;
  };
};

const CHOROPLETH_COLORS = {
  low: "#d5ead6",
  mid: "#f6e7b8",
  high: "#f2c6b4",
  accent: "#0a84ff",
  muted: "#d8dee8",
} as const;

const SCALE_RANK: Record<RegionScale, number> = { gemeente: 0, wijk: 1, buurt: 2 };

/** Max SES/crime OData lookups per map regions request. */
export const MAP_LOOKUP_BUDGET = 150;

export function parseRegionBBox(raw: string | null | undefined): RegionBBox | null {
  if (!raw?.trim()) return null;
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [west, south, east, north] = parts as RegionBBox;
  if (west >= east || south >= north) return null;
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  if (east - west > 25 || north - south > 18) return null;
  return [west, south, east, north];
}

export function parseRegionZoom(raw: string | null | undefined) {
  const zoom = Number(raw);
  if (!Number.isFinite(zoom)) return null;
  if (zoom < 5 || zoom > 18) return null;
  return zoom;
}

export function regionScaleForRequest(zoom: number | null, scaleParam: string | null | undefined): RegionScale {
  const zoomScale = regionScaleFromZoom(zoom ?? 7);
  if (scaleParam === "gemeente" || scaleParam === "wijk" || scaleParam === "buurt") {
    return SCALE_RANK[scaleParam] > SCALE_RANK[zoomScale] ? zoomScale : scaleParam;
  }
  return zoomScale;
}

function formatNumber(value: number, precision = 1) {
  return value.toLocaleString("nl-NL", { maximumFractionDigits: precision, minimumFractionDigits: 0 });
}

function formatCurrency(value: number) {
  return value.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function wozEuros(thousands: number | undefined) {
  if (thousands == null) return undefined;
  return Math.round(thousands * 1000);
}

export function choroplethValue(
  layer: NationalLayerId,
  props: Record<string, unknown>,
  sesLookup: Map<string, import("@/src/lib/sources/ses").SesLookupEntry>,
  crimeLookup: Map<string, import("@/src/lib/sources/politie").CrimeLookupEntry>,
): { value: number | null; valueLabel: string; extras: Partial<RegionFeatureProperties> } {
  const regionCode = typeof props.regionCode === "string" ? props.regionCode : undefined;
  const inhabitants = typeof props.inhabitants === "number" ? props.inhabitants : undefined;
  const ses = lookupSesEntry(sesLookup, regionCode);
  const crime = lookupCrimeEntry(crimeLookup, regionCode, inhabitants);
  const crimePer1000 = crimeRatePer1000(crime?.total, inhabitants);
  const extras: Partial<RegionFeatureProperties> = {
    sesScore: ses?.sesScore,
    educationHighPct: ses?.educationHighPct,
    educationScore: ses?.educationScore,
    crimePer1000,
    crimeTotal: crime?.total,
    periodYear: ses?.periodYear ?? crime?.periodYear,
  };

  switch (layer) {
    case "ses":
      return ses?.sesScore == null
        ? { value: null, valueLabel: "Geen data", extras }
        : { value: ses.sesScore, valueLabel: ses.sesScore.toLocaleString("nl-NL", { signDisplay: "exceptZero", maximumFractionDigits: 3 }), extras };
    case "education":
      return ses?.educationHighPct == null
        ? { value: null, valueLabel: "Geen data", extras }
        : { value: ses.educationHighPct, valueLabel: `${formatNumber(ses.educationHighPct, 1)}%`, extras };
    case "crime":
      return crimePer1000 == null
        ? { value: null, valueLabel: "Geen data", extras }
        : { value: crimePer1000, valueLabel: `${formatNumber(crimePer1000, 1)} per 1.000`, extras };
    case "woz": {
      const averageWoz = typeof props.averageWoz === "number" ? props.averageWoz : undefined;
      const euros = wozEuros(averageWoz);
      return euros == null
        ? { value: null, valueLabel: "Geen data", extras }
        : { value: euros, valueLabel: formatCurrency(euros), extras };
    }
    case "schools": {
      const distance = typeof props.primarySchoolDistanceKm === "number"
        ? props.primarySchoolDistanceKm
        : undefined;
      return distance == null
        ? { value: null, valueLabel: "Geen data", extras }
        : { value: distance, valueLabel: `${formatNumber(distance, 1)} km`, extras };
    }
    case "children": {
      const share = typeof props.shareAge0to15Pct === "number" ? props.shareAge0to15Pct : undefined;
      return share == null
        ? { value: null, valueLabel: "Geen data", extras }
        : { value: share, valueLabel: `${formatNumber(share, 0)}%`, extras };
    }
    case "density": {
      const density = typeof props.populationDensity === "number" ? props.populationDensity : undefined;
      return density == null
        ? { value: null, valueLabel: "Geen data", extras }
        : { value: density, valueLabel: `${formatNumber(density, 0)} per km²`, extras };
    }
    default:
      return { value: null, valueLabel: "Geen data", extras };
  }
}

function legendForLayer(layer: NationalLayerId, values: number[]): LayerLegend {
  const spec = NATIONAL_LAYERS[layer];
  const finite = values.filter((value) => Number.isFinite(value));
  const defaults: Record<NationalLayerId, { min: number; max: number; stops: [number, string][] }> = {
    ses: { min: -0.5, max: 0.5, stops: [[-0.5, CHOROPLETH_COLORS.low], [0, CHOROPLETH_COLORS.mid], [0.5, CHOROPLETH_COLORS.high]] },
    education: { min: 15, max: 45, stops: [[15, CHOROPLETH_COLORS.low], [30, CHOROPLETH_COLORS.mid], [45, CHOROPLETH_COLORS.high]] },
    crime: { min: 10, max: 80, stops: [[10, CHOROPLETH_COLORS.low], [45, CHOROPLETH_COLORS.mid], [80, CHOROPLETH_COLORS.high]] },
    woz: { min: 200_000, max: 650_000, stops: [[200_000, CHOROPLETH_COLORS.low], [400_000, CHOROPLETH_COLORS.mid], [650_000, CHOROPLETH_COLORS.high]] },
    schools: { min: 0.2, max: 2.5, stops: [[0.2, CHOROPLETH_COLORS.high], [1.2, CHOROPLETH_COLORS.mid], [2.5, CHOROPLETH_COLORS.low]] },
    children: { min: 8, max: 28, stops: [[8, CHOROPLETH_COLORS.low], [18, CHOROPLETH_COLORS.mid], [28, CHOROPLETH_COLORS.high]] },
    density: { min: 500, max: 8000, stops: [[500, CHOROPLETH_COLORS.low], [3000, CHOROPLETH_COLORS.mid], [8000, CHOROPLETH_COLORS.high]] },
  };
  const fallback = defaults[layer];
  if (!finite.length) {
    return {
      layer,
      label: spec.label,
      unit: spec.unit,
      min: fallback.min,
      max: fallback.max,
      stops: fallback.stops,
      direction: spec.direction,
      source: spec.source,
      sourceUrl: spec.sourceUrl,
      caveat: spec.caveat,
      nullLabel: "Geen data",
    };
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const paddedMin = min === max ? min - 1 : min;
  const paddedMax = min === max ? max + 1 : max;
  return {
    layer,
    label: spec.label,
    unit: spec.unit,
    min: paddedMin,
    max: paddedMax,
    stops: fallback.stops,
    direction: spec.direction,
    source: spec.source,
    sourceUrl: spec.sourceUrl,
    caveat: spec.caveat,
    nullLabel: "Geen data",
  };
}

export async function buildRegionsPayload(
  bbox: RegionBBox,
  layer: NationalLayerId,
  scale: RegionScale,
  lookupBudget = MAP_LOOKUP_BUDGET,
): Promise<RegionsPayload> {
  const rawRegions = await fetchCbsRegionsInBbox(bbox, scale);
  const regionCodes = rawRegions.features
    .map((feature) => (regionCodeFromProperties(feature.properties ?? {}, scale) ?? undefined) as string | undefined)
    .filter(Boolean) as string[];
  const crimeEntries = rawRegions.features.map((feature) => {
    const props = feature.properties ?? {};
    const regionCode = (regionCodeFromProperties(props, scale) ?? undefined) as string | undefined;
    const inhabitants = typeof props.aantal_inwoners === "number" && props.aantal_inwoners > -99990
      ? props.aantal_inwoners
      : undefined;
    return { regionCode: regionCode ?? "", inhabitants };
  }).filter((entry) => entry.regionCode);

  const budget = Math.max(1, Math.min(lookupBudget, MAP_LOOKUP_BUDGET));
  const lookupCodes = regionCodes.slice(0, budget);
  const lookupCrimeEntries = crimeEntries.slice(0, budget);

  const [sesBundle, crimeBundle] = await Promise.all([
    getSesLookupForCodes(lookupCodes),
    getCrimeLookupForEntries(lookupCrimeEntries),
  ]);

  const values: number[] = [];
  const features: GeoJsonFeature[] = rawRegions.features.map((feature) => {
    const slim = slimCbsFeature(feature, scale);
    const props = slim.properties ?? {};
    const regionCode = (regionCodeFromProperties(feature.properties ?? {}, scale) ?? props.regionCode) as string | undefined;
    const enrichedProps = { ...props, regionCode };
    const { value, valueLabel, extras } = choroplethValue(layer, enrichedProps, sesBundle.lookup, crimeBundle.lookup);
    if (value != null) values.push(value);
    return {
      type: "Feature",
      geometry: slim.geometry,
      properties: {
        ...enrichedProps,
        ...extras,
        scale,
        value,
        valueLabel,
      } satisfies RegionFeatureProperties,
    };
  });

  const periodYear = sesBundle.periodYear ?? crimeBundle.periodYear;
  return {
    type: "FeatureCollection",
    features,
    meta: {
      layer,
      scale,
      legend: legendForLayer(layer, values),
      periodYear,
      featureCount: features.length,
      truncated: features.length >= CBS_REGION_LIMIT,
    },
  };
}

export function regionInspectSummary(props: RegionFeatureProperties) {
  const lines: { label: string; value: string }[] = [];
  if (props.regionName) lines.push({ label: "Gebied", value: props.regionName });
  if (props.municipalityName) lines.push({ label: "Gemeente", value: props.municipalityName });
  if (props.inhabitants != null) lines.push({ label: "Inwoners", value: formatNumber(props.inhabitants, 0) });
  if (props.sesScore != null) {
    lines.push({
      label: "SES-WOA",
      value: props.sesScore.toLocaleString("nl-NL", { signDisplay: "exceptZero", maximumFractionDigits: 3 }),
    });
  }
  if (props.educationHighPct != null) lines.push({ label: "Hoogopgeleid", value: `${formatNumber(props.educationHighPct, 1)}%` });
  if (props.crimePer1000 != null) lines.push({ label: "Misdrijven", value: `${formatNumber(props.crimePer1000, 1)} per 1.000` });
  if (props.averageWoz != null) {
    const euros = wozEuros(props.averageWoz);
    if (euros != null) lines.push({ label: "Gem. WOZ", value: formatCurrency(euros) });
  }
  if (props.primarySchoolDistanceKm != null) {
    lines.push({ label: "Basisschool", value: `${formatNumber(props.primarySchoolDistanceKm, 1)} km gemiddeld` });
  }
  if (props.shareAge0to15Pct != null) lines.push({ label: "0–15 jaar", value: `${formatNumber(props.shareAge0to15Pct, 0)}%` });
  if (props.populationDensity != null) lines.push({ label: "Dichtheid", value: `${formatNumber(props.populationDensity, 0)} per km²` });
  return lines;
}
