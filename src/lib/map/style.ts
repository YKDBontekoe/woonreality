export const MAPBOX_STANDARD_STYLE = "mapbox://styles/mapbox/standard";

export const MAP_CAMERA = {
  zoom: 17.4,
  pitch: 55,
  bearing: -18,
  flatPitch: 0,
} as const;

export const BAG_EXTRUSION_HEIGHT_M = 10;

export const MAP_COLORS = {
  accent: "#0a84ff",
  accentDeep: "#2770ca",
  attention: "#ff9f0a",
  paper: "#fbfbfd",
  greenspace: "#eaf4eb",
  water: "#edf5ff",
  buildings: "#e8e8ed",
  labels: "#6e6e73",
  greenFill: "#1c7358",
  waterFill: "#2770ca",
} as const;

export type LightPreset = "dawn" | "day" | "dusk" | "night";

export const LIGHT_PRESETS: { id: LightPreset; label: string; sunLabel: string }[] = [
  { id: "dawn", label: "Ochtend", sunLabel: "zon uit het oosten" },
  { id: "day", label: "Middag", sunLabel: "zon uit het zuiden" },
  { id: "dusk", label: "Avond", sunLabel: "zon uit het westen" },
  { id: "night", label: "Nacht", sunLabel: "geen zonlicht" },
];

export function sunLabelForPreset(preset: LightPreset) {
  return LIGHT_PRESETS.find((item) => item.id === preset)?.sunLabel ?? "zon uit het zuiden";
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
    theme: "faded",
    show3dObjects: true,
    show3dBuildings: true,
    show3dTrees: true,
    showPointOfInterestLabels: false,
    showTransitLabels: false,
    showPlaceLabels: true,
    showRoadLabels: true,
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
