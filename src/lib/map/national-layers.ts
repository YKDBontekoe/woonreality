import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

export type NationalLayerId =
  | "ses"
  | "education"
  | "crime"
  | "woz"
  | "schools"
  | "children"
  | "density";

export type NationalRasterId = "noise" | "no2" | "pm25";

export type RegionScale = "gemeente" | "wijk" | "buurt";

export type LayerDirection = "higher-is-better" | "lower-is-better" | "neutral";

export type NationalLayerSpec = {
  id: NationalLayerId;
  label: string;
  hint: string;
  unit: string;
  source: string;
  sourceUrl: string;
  caveat?: string;
  direction: LayerDirection;
  group: "buurt" | "scholen" | "wonen" | "verkeer";
};

const LAYER_IDS: NationalLayerId[] = ["ses", "education", "schools", "crime", "woz", "children", "density"];

const LAYERS_WITH_CAVEAT: NationalLayerId[] = ["ses", "education", "schools", "crime", "woz"];

type NationalLayerBase = Omit<NationalLayerSpec, "label" | "hint" | "caveat">;

const LAYER_BASE: Record<NationalLayerId, NationalLayerBase> = {
  ses: {
    id: "ses",
    unit: "score",
    source: "CBS SES-WOA",
    sourceUrl: "https://opendata.cbs.nl/#/CBS/nl/dataset/86296NED",
    direction: "neutral",
    group: "buurt",
  },
  education: {
    id: "education",
    unit: "%",
    source: "CBS SES-WOA",
    sourceUrl: "https://opendata.cbs.nl/#/CBS/nl/dataset/86296NED",
    direction: "higher-is-better",
    group: "scholen",
  },
  schools: {
    id: "schools",
    unit: "km",
    source: "CBS Wijk- en Buurtkaart 2024",
    sourceUrl: "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1",
    direction: "lower-is-better",
    group: "scholen",
  },
  crime: {
    id: "crime",
    unit: "per 1.000",
    source: "Politie/CBS",
    sourceUrl: "https://data.politie.nl/#/Politie/nl/dataset/47018NED/table",
    direction: "lower-is-better",
    group: "buurt",
  },
  woz: {
    id: "woz",
    unit: "€",
    source: "CBS Wijk- en Buurtkaart 2024",
    sourceUrl: "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1",
    direction: "neutral",
    group: "wonen",
  },
  children: {
    id: "children",
    unit: "%",
    source: "CBS Wijk- en Buurtkaart 2024",
    sourceUrl: "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1",
    direction: "neutral",
    group: "buurt",
  },
  density: {
    id: "density",
    unit: "per km²",
    source: "CBS Wijk- en Buurtkaart 2024",
    sourceUrl: "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1",
    direction: "neutral",
    group: "buurt",
  },
};

export function nationalLayerSpec(layer: NationalLayerId, locale: Locale = "nl"): NationalLayerSpec {
  const t = getLibTranslator(locale, "lib-domain");
  const base = LAYER_BASE[layer];
  return {
    ...base,
    label: t(`map.layers.${layer}.label`),
    hint: t(`map.layers.${layer}.hint`),
    ...(LAYERS_WITH_CAVEAT.includes(layer) ? { caveat: t(`map.layers.${layer}.caveat`) } : {}),
  };
}

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer nationalLayerSpec(layer, locale). */
export const NATIONAL_LAYERS: Record<NationalLayerId, NationalLayerSpec> = Object.fromEntries(
  LAYER_IDS.map((layer) => [layer, nationalLayerSpec(layer)]),
) as Record<NationalLayerId, NationalLayerSpec>;

const RASTER_IDS: NationalRasterId[] = ["noise", "no2", "pm25"];

export function nationalRasterSpec(raster: NationalRasterId, locale: Locale = "nl"): { label: string; hint: string } {
  const t = getLibTranslator(locale, "lib-domain");
  return { label: t(`map.rasters.${raster}.label`), hint: t(`map.rasters.${raster}.hint`) };
}

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer nationalRasterSpec(raster, locale). */
export const NATIONAL_RASTERS: Record<NationalRasterId, { label: string; hint: string }> = Object.fromEntries(
  RASTER_IDS.map((raster) => [raster, nationalRasterSpec(raster)]),
) as Record<NationalRasterId, { label: string; hint: string }>;

export type NationalSceneId = "buurt" | "scholen" | "wonen" | "verkeer";

const SCENE_IDS: NationalSceneId[] = ["buurt", "scholen", "wonen", "verkeer"];

const SCENE_DATA: Record<NationalSceneId, { layer: NationalLayerId; rasters: NationalRasterId[] }> = {
  buurt: { layer: "ses", rasters: [] },
  scholen: { layer: "education", rasters: [] },
  wonen: { layer: "woz", rasters: [] },
  verkeer: { layer: "density", rasters: ["noise"] },
};

export function nationalSceneSpec(scene: NationalSceneId, locale: Locale = "nl"): { id: NationalSceneId; label: string; hint: string; layer: NationalLayerId; rasters: NationalRasterId[] } {
  const t = getLibTranslator(locale, "lib-domain");
  return {
    id: scene,
    label: t(`map.scenes.${scene}.label`),
    hint: t(`map.scenes.${scene}.hint`),
    layer: SCENE_DATA[scene].layer,
    rasters: SCENE_DATA[scene].rasters,
  };
}

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer nationalSceneSpec(scene, locale). */
export const NATIONAL_SCENES: { id: NationalSceneId; label: string; hint: string; layer: NationalLayerId; rasters: NationalRasterId[] }[] = SCENE_IDS.map((scene) => nationalSceneSpec(scene));

export type LayerLegend = {
  layer: NationalLayerId;
  label: string;
  unit: string;
  min: number;
  max: number;
  stops: [number, string][];
  direction: LayerDirection;
  source: string;
  sourceUrl: string;
  caveat?: string;
  nullLabel: string;
};

export function parseNationalLayer(value: string | null | undefined): NationalLayerId | null {
  return value && Object.hasOwn(NATIONAL_LAYERS, value) ? value as NationalLayerId : null;
}

export function parseNationalRaster(value: string | null | undefined): NationalRasterId | null {
  return value && Object.hasOwn(NATIONAL_RASTERS, value) ? value as NationalRasterId : null;
}

export function regionScaleFromZoom(zoom: number): RegionScale {
  if (zoom >= 11) return "buurt";
  if (zoom >= 8.5) return "wijk";
  return "gemeente";
}

export const NL_MAP_BOUNDS: [[number, number], [number, number]] = [[3.2, 50.7], [7.3, 53.7]];

export const NL_MAP_CENTER = { lng: 5.3, lat: 52.2, zoom: 7.2 } as const;
