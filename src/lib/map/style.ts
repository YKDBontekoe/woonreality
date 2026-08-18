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

export const DEFAULT_MAP_HOUR = 14;

export const LIGHT_PRESETS: { id: LightPreset; label: string; sunLabel: string }[] = [
  { id: "dawn", label: "Ochtend", sunLabel: "zon uit het oosten" },
  { id: "day", label: "Middag", sunLabel: "zon uit het zuiden" },
  { id: "dusk", label: "Avond", sunLabel: "zon uit het westen" },
  { id: "night", label: "Nacht", sunLabel: "geen zonlicht" },
];

export function wrapHour(hour: number) {
  return ((Math.round(hour) % 24) + 24) % 24;
}

export function lightPresetForHour(hour: number): LightPreset {
  const h = wrapHour(hour);
  if (h >= 21 || h < 5) return "night";
  if (h < 8) return "dawn";
  if (h < 17) return "day";
  return "dusk";
}

export function formatMapHour(hour: number) {
  return `${String(wrapHour(hour)).padStart(2, "0")}:00`;
}

export function lightPeriodLabel(hour: number) {
  const preset = lightPresetForHour(hour);
  return LIGHT_PRESETS.find((item) => item.id === preset)?.label ?? "Middag";
}

export function sunLabelForHour(hour: number) {
  const preset = lightPresetForHour(hour);
  return LIGHT_PRESETS.find((item) => item.id === preset)?.sunLabel ?? "zon uit het zuiden";
}

export function sunLabelForPreset(id: LightPreset | string) {
  return LIGHT_PRESETS.find((item) => item.id === id)?.sunLabel ?? "zon uit het zuiden";
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
