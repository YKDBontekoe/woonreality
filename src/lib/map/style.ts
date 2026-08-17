export const MAPBOX_STANDARD_STYLE = "mapbox://styles/mapbox/standard";

export const MAP_CAMERA = {
  zoom: 17.35,
  pitch: 58,
  bearing: -22,
  flatPitch: 0,
  introZoom: 15.2,
  introPitch: 18,
} as const;

export const BAG_EXTRUSION_HEIGHT_M = 10;

export const MAP_COLORS = {
  accent: "#0a84ff",
  accentDeep: "#2770ca",
  attention: "#ff9f0a",
  paper: "#f7f5f0",
  greenspace: "#cfe8d4",
  water: "#c5ddf5",
  buildings: "#efeae2",
  labels: "#5c5c60",
  greenFill: "#1c7358",
  waterFill: "#3d7ec9",
  walkFill: "#0a84ff",
} as const;

export type LightPreset = "dawn" | "day" | "dusk" | "night";

export const LIGHT_PRESETS: { id: LightPreset; key: string; label: string; sunLabel: string }[] = [
  { id: "dawn", key: "dawn", label: "Ochtend", sunLabel: "zon uit het oosten" },
  { id: "day", key: "day", label: "Middag", sunLabel: "zon uit het zuiden" },
  { id: "dusk", key: "dusk", label: "Avond", sunLabel: "zon uit het westen" },
  { id: "dusk", key: "winter", label: "Winter", sunLabel: "lage winterzon uit het zuiden" },
  { id: "night", key: "night", label: "Nacht", sunLabel: "geen zonlicht" },
];

export function sunLabelForPreset(key: string) {
  return LIGHT_PRESETS.find((item) => item.key === key)?.sunLabel ?? "zon uit het zuiden";
}

export function isMapboxStandardStyle(styleUrl: string) {
  return styleUrl === MAPBOX_STANDARD_STYLE || styleUrl.endsWith("/standard");
}

export function mapStyleUrl() {
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || MAPBOX_STANDARD_STYLE;
}

export function woonrealityBasemapConfig() {
  return {
    lightPreset: "day" as LightPreset,
    theme: "default",
    show3dObjects: true,
    show3dBuildings: true,
    show3dTrees: true,
    show3dFacades: true,
    showPointOfInterestLabels: true,
    showTransitLabels: true,
    showPlaceLabels: true,
    showRoadLabels: true,
    densityPointOfInterestLabels: 2,
    colorLand: MAP_COLORS.paper,
    colorGreenspace: MAP_COLORS.greenspace,
    colorWater: MAP_COLORS.water,
    colorBuildings: MAP_COLORS.buildings,
    colorPlaceLabels: MAP_COLORS.labels,
    colorRoadLabels: MAP_COLORS.labels,
    colorBuildingSelect: MAP_COLORS.accent,
    colorBuildingHighlight: MAP_COLORS.accent,
  };
}
