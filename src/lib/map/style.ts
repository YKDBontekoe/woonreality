import type { Map as MapboxMap } from "mapbox-gl";

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
  paper: "#f4efe6",
  greenspace: "#d5ead6",
  water: "#c9dcf0",
  buildings: "#ebe3d6",
  labels: "#5c5c60",
  greenFill: "#1c7358",
  waterFill: "#3d7ec9",
  walkFill: "#0a84ff",
  driveFill: "#ff9f0a",
  roadFill: "#f3eee6",
  roadCasing: "#c9bfb2",
  pathFill: "#f7f3ec",
  cycleFill: "#eadfd0",
  parkingFill: "#e6dfd3",
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

/** Mapbox directional light: `[azimuth, polar]` in degrees. Polar 0 is overhead. */
export function sunDirectionForHour(hour: number): [number, number] {
  const h = wrapHour(hour);
  const azimuth = (75 + ((h - 5) / 16) * 210 + 360) % 360;
  const daylight = h >= 5 && h < 21;
  const t = daylight ? (h - 5) / 16 : 0;
  const altitude = daylight ? Math.sin(t * Math.PI) * 58 : 4;
  const polar = Math.min(88, Math.max(12, 90 - altitude));
  return [Number(azimuth.toFixed(1)), Number(polar.toFixed(1))];
}

export function lightsForHour(hour: number, castShadows: boolean) {
  const preset = lightPresetForHour(hour);
  const direction = sunDirectionForHour(hour);
  const dusk = preset === "dawn" || preset === "dusk";
  const night = preset === "night";
  return [
    {
      id: "woonreality-sun",
      type: "directional" as const,
      properties: {
        direction,
        color: night ? "#9aadc8" : dusk ? "#ffb57a" : "#fff1d6",
        intensity: night ? 0.22 : dusk ? 0.62 : 0.82,
        "cast-shadows": castShadows && !night,
        "shadow-intensity": !castShadows || night ? 0 : dusk ? 0.72 : 0.42,
      },
    },
    {
      id: "woonreality-ambient",
      type: "ambient" as const,
      properties: {
        color: night ? "#1b2438" : dusk ? "#ffd7b0" : "#ffffff",
        intensity: night ? 0.38 : dusk ? 0.46 : 0.52,
      },
    },
  ];
}

export function applyBasemapTheme(map: MapboxMap) {
  if (!isMapboxStandardStyle(mapStyleUrl())) return;
  const config = woonrealityBasemapConfig();
  map.setConfigProperty("basemap", "colorLand", config.colorLand);
  map.setConfigProperty("basemap", "colorGreenspace", config.colorGreenspace);
  map.setConfigProperty("basemap", "colorWater", config.colorWater);
  map.setConfigProperty("basemap", "colorBuildings", config.colorBuildings);
  map.setConfigProperty("basemap", "colorRoads", config.colorRoads);
  map.setConfigProperty("basemap", "colorMotorways", config.colorMotorways);
  map.setConfigProperty("basemap", "colorTrunks", config.colorTrunks);
  map.setConfigProperty("basemap", "showPedestrianRoads", config.showPedestrianRoads);
}

export function applyMapLighting(map: MapboxMap, hour: number, castShadows: boolean) {
  const applyLightsAndPaint = () => {
    if (!map.isStyleLoaded()) {
      map.once("idle", applyLightsAndPaint);
      return;
    }
    try {
      map.setLights(lightsForHour(hour, castShadows) as never);
      if (isMapboxStandardStyle(mapStyleUrl())) applyBasemapTheme(map);
    } catch {
      map.once("idle", applyLightsAndPaint);
    }
  };

  if (isMapboxStandardStyle(mapStyleUrl())) {
    map.setConfigProperty("basemap", "lightPreset", lightPresetForHour(hour));
    map.setConfigProperty("basemap", "show3dObjects", castShadows);
    map.setConfigProperty("basemap", "show3dBuildings", castShadows);
    map.setConfigProperty("basemap", "show3dTrees", castShadows);
    map.setConfigProperty("basemap", "show3dFacades", castShadows);
  }

  if (map.isStyleLoaded()) applyLightsAndPaint();
  else map.once("idle", applyLightsAndPaint);
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
    showPedestrianRoads: true,
    showPointOfInterestLabels: true,
    showTransitLabels: true,
    showPlaceLabels: true,
    showRoadLabels: true,
    densityPointOfInterestLabels: 2,
    colorLand: MAP_COLORS.paper,
    colorGreenspace: MAP_COLORS.greenspace,
    colorWater: MAP_COLORS.water,
    colorBuildings: MAP_COLORS.buildings,
    colorRoads: MAP_COLORS.roadFill,
    colorMotorways: "#e4d8c8",
    colorTrunks: "#e8dfd2",
    colorPlaceLabels: MAP_COLORS.labels,
    colorRoadLabels: MAP_COLORS.labels,
    colorBuildingSelect: MAP_COLORS.accent,
    colorBuildingHighlight: MAP_COLORS.accent,
  };
}
