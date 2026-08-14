import type { Geometry } from "geojson";

export type Confidence = "high" | "medium" | "low";
export type Severity = "good" | "neutral" | "attention";

export type Evidence = {
  id: string;
  source: string;
  sourceUrl: string;
  sourceRecordId?: string;
  sourceUpdatedAt?: string;
  fetchedAt: string;
  spatialResolution?: string;
  confidence: Confidence;
  caveat?: string;
};

export type Signal = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  score?: number;
  severity: Severity;
  summary: string;
  action: string;
  raw?: {
    value: number | string;
    unit?: string;
    metric?: string;
  };
  confidence: Confidence;
  evidence: Evidence[];
};

export type ScoreComponent = {
  key: string;
  label: string;
  score: number;
  weight: number;
  confidence: number;
  explanation: string;
  evidenceIds: string[];
};

export type Coordinates = {
  lat: number;
  lng: number;
};

export type Property = {
  bagVboId: string;
  bagPandIds: string[];
  addressLabel: string;
  street: string;
  houseNumber: number;
  houseLetter?: string | null;
  addition?: string | null;
  postcode: string;
  city: string;
  municipality?: string;
  province?: string;
  coordinates: Coordinates;
  buildingYear?: number;
  areaM2?: number;
  buildingGeometry?: Geometry;
};

export type Analysis = {
  property: Property;
  overallScore: number;
  analysisVersion: string;
  scoringVersion: string;
  signals: Signal[];
  components: ScoreComponent[];
  evidence: Evidence[];
  generatedAt: string;
  sources: string[];
  persistence?: "database" | "cache-only";
};

export type AddressSearchResult = {
  id: string;
  bagVboId: string;
  displayName: string;
  coordinates: Coordinates;
  href: string;
  score: number;
};

export type GeoJsonFeature = {
  type: "Feature";
  id?: string;
  properties: Record<string, unknown>;
  geometry: Geometry;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
  numberReturned?: number;
  timeStamp?: string;
};
