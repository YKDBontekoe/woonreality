import type { Geometry } from "geojson";

export type Confidence = "high" | "medium" | "low";
export type Severity = "good" | "neutral" | "attention";
export type SignalCategory = "woning" | "gezondheid" | "klimaat" | "mobiliteit" | "toekomst";

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
  category?: SignalCategory;
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
  measuredAt?: string;
  spatialScale?: string;
  availability?: "available" | "unavailable";
  evidence: Evidence[];
};

export type DomainSummary = {
  key: SignalCategory;
  label: string;
  score: number | null;
  signalKeys: string[];
  available: boolean;
  summary: string;
};

export type SourceStatus = {
  source: string;
  status: "ok" | "partial" | "unavailable";
  message?: string;
};

export type DataCoverage = {
  available: number;
  total: number;
  label: string;
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

export type NearbyProperty = {
  bagVboId: string;
  addressLabel: string;
  areaM2?: number;
  distanceM: number;
  coordinates: Coordinates;
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
  domains: DomainSummary[];
  highlights: { type: "positive" | "attention"; signalKey: string; text: string }[];
  dataCoverage: DataCoverage;
  sourceStatuses: SourceStatus[];
  nearbyProperties: NearbyProperty[];
  persistence?: "database" | "cache-only";
};

export type PersonalPreferences = {
  quiet: number;
  green: number;
  energy: number;
  mobility: number;
  climate: number;
  future: number;
};

export type SavedProperty = Pick<Property, "bagVboId" | "addressLabel" | "city" | "postcode"> & {
  savedAt: string;
};

export type ChecklistItem = {
  id: string;
  label: string;
  reason?: string;
  signalKey?: string;
  checked: boolean;
  note?: string;
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
