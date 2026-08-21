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

export const NATIONAL_LAYERS: Record<NationalLayerId, NationalLayerSpec> = {
  ses: {
    id: "ses",
    label: "SES-WOA",
    hint: "Welvaart, opleiding en werk in de buurt",
    unit: "score",
    source: "CBS SES-WOA",
    sourceUrl: "https://opendata.cbs.nl/#/CBS/nl/dataset/86296NED",
    caveat: "Buurtgemiddelde; geen oordeel over huishoudens of de woning.",
    direction: "neutral",
    group: "buurt",
  },
  education: {
    id: "education",
    label: "Opleidingsniveau",
    hint: "Aandeel hoogopgeleid (SES-WOA)",
    unit: "%",
    source: "CBS SES-WOA",
    sourceUrl: "https://opendata.cbs.nl/#/CBS/nl/dataset/86296NED",
    caveat: "Geen schoolkwaliteit of Cito-scores; alleen opleidingsmix in de buurt.",
    direction: "higher-is-better",
    group: "scholen",
  },
  schools: {
    id: "schools",
    label: "Scholen dichtbij",
    hint: "Gemiddelde afstand basisonderwijs",
    unit: "km",
    source: "CBS Wijk- en Buurtkaart 2024",
    sourceUrl: "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1",
    caveat: "Afstand, geen inspectieresultaten. Kwaliteit: scholenopdekaart.nl.",
    direction: "lower-is-better",
    group: "scholen",
  },
  crime: {
    id: "crime",
    label: "Misdrijven",
    hint: "Geregistreerde misdrijven per 1.000 inwoners",
    unit: "per 1.000",
    source: "Politie/CBS",
    sourceUrl: "https://data.politie.nl/#/Politie/nl/dataset/47018NED/table",
    caveat: "Registratiecijfers; niet alle incidenten worden gemeld.",
    direction: "lower-is-better",
    group: "buurt",
  },
  woz: {
    id: "woz",
    label: "Gem. WOZ-waarde",
    hint: "CBS gemiddelde woningwaarde",
    unit: "€",
    source: "CBS Wijk- en Buurtkaart 2024",
    sourceUrl: "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1",
    caveat: "WOZ-gemiddelde in de buurt, geen vraagprijs of €/m² uit advertenties.",
    direction: "neutral",
    group: "wonen",
  },
  children: {
    id: "children",
    label: "Kinderen",
    hint: "Aandeel 0–15 jaar",
    unit: "%",
    source: "CBS Wijk- en Buurtkaart 2024",
    sourceUrl: "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1",
    direction: "neutral",
    group: "buurt",
  },
  density: {
    id: "density",
    label: "Bevolkingsdichtheid",
    hint: "Inwoners per km²",
    unit: "per km²",
    source: "CBS Wijk- en Buurtkaart 2024",
    sourceUrl: "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1",
    direction: "neutral",
    group: "buurt",
  },
};

export const NATIONAL_RASTERS: Record<NationalRasterId, { label: string; hint: string }> = {
  noise: { label: "Wegverkeersgeluid", hint: "RIVM Lden wegverkeer" },
  no2: { label: "NO₂", hint: "RIVM luchtkwaliteit" },
  pm25: { label: "PM2.5", hint: "RIVM luchtkwaliteit" },
};

export type NationalSceneId = "buurt" | "scholen" | "wonen" | "verkeer";

export const NATIONAL_SCENES: { id: NationalSceneId; label: string; hint: string; layer: NationalLayerId; rasters: NationalRasterId[] }[] = [
  { id: "buurt", label: "Buurt", hint: "SES, misdaad en demografie", layer: "ses", rasters: [] },
  { id: "scholen", label: "Scholen", hint: "Opleiding en schoolafstand", layer: "education", rasters: [] },
  { id: "wonen", label: "Wonen", hint: "Gemiddelde WOZ-waarde", layer: "woz", rasters: [] },
  { id: "verkeer", label: "Verkeer", hint: "Geluid en lucht", layer: "density", rasters: ["noise"] },
];

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
  return value && value in NATIONAL_LAYERS ? value as NationalLayerId : null;
}

export function parseNationalRaster(value: string | null | undefined): NationalRasterId | null {
  return value && value in NATIONAL_RASTERS ? value as NationalRasterId : null;
}

export function regionScaleFromZoom(zoom: number): RegionScale {
  if (zoom >= 11) return "buurt";
  if (zoom >= 8.5) return "wijk";
  return "gemeente";
}

export const NL_MAP_BOUNDS: [[number, number], [number, number]] = [[3.2, 50.7], [7.3, 53.7]];

export const NL_MAP_CENTER = { lng: 5.3, lat: 52.2, zoom: 7.2 } as const;
