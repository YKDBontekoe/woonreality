import type { Geometry } from "geojson";

export type Confidence = "high" | "medium" | "low";
export type Severity = "good" | "neutral" | "attention";
export type SignalCategory = "woning" | "gezondheid" | "klimaat" | "mobiliteit" | "buurt" | "toekomst";

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

export type EverydayInsight = {
  title: string;
  summary: string;
  tone: "good" | "neutral" | "attention";
  signalKeys: string[];
};

export type SourceStatus = {
  source: string;
  status: "ok" | "partial" | "unavailable";
  message?: string;
  sourceUrl?: string;
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

export type PropertyListing = {
  provider: string;
  externalId: string;
  sourceUrl: string;
  fetchedAt: string;
  status: "active" | "sold" | "withdrawn" | "unknown";
  askingPrice?: number;
  originalAskingPrice?: number;
  priceChangeAmount?: number;
  priceChangePct?: number;
  pricePerM2?: number;
  firstPublishedAt?: string;
  lastUpdatedAt?: string;
  offerDeadline?: string;
  livingAreaM2?: number;
  plotAreaM2?: number;
  volumeM3?: number;
  roomCount?: number;
  bedroomCount?: number;
  bathroomCount?: number;
  propertyType?: string;
  constructionYear?: number;
  energyLabel?: string;
  energyIndex?: number;
  insulation?: string;
  heating?: string;
  glazing?: string;
  solarPanelCount?: number;
  vveContribution?: number;
  vveReserveFund?: number;
  outdoorSpaceM2?: number;
  gardenOrientation?: string;
  balcony?: boolean;
  terrace?: boolean;
  parking?: string;
  storage?: string;
  addressLabel?: string;
  municipality?: string;
  province?: string;
  description?: string;
};

export type ResearchSourceType = "official" | "municipality" | "planning" | "listing" | "web";

export type ResearchSource = {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  type: ResearchSourceType;
  publishedAt?: string;
  fetchedAt: string;
  spatialScale?: string;
  distanceM?: number;
  status?: string;
  excerpt?: string;
};

export type ResearchFinding = {
  id: string;
  category: "woning" | "omgeving" | "plannen" | "mobiliteit" | "klimaat" | "markt";
  title: string;
  summary: string;
  impact: "positive" | "neutral" | "attention";
  confidence: Confidence;
  temporalStatus?: string;
  spatialScale?: string;
  sourceIds: string[];
};

export type PropertyContradiction = {
  id: string;
  subject: string;
  summary: string;
  severity: "low" | "medium" | "high";
  sourceIds: string[];
};

export type AiPropertyReport = {
  reportVersion: string;
  promptVersion: string;
  generatedAt: string;
  expiresAt: string;
  researchModel: string;
  synthesisModel: string;
  verdict: {
    title: string;
    summary: string;
    confidence: Confidence;
  };
  findings: ResearchFinding[];
  contradictions: PropertyContradiction[];
  questions: string[];
  coverage: {
    searched: string[];
    missing: string[];
    sourceCount: number;
  };
  sources: ResearchSource[];
};

export type AiReportStatus = "missing" | "generating" | "ready" | "stale" | "failed" | "unavailable";

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
  everydayInsights: EverydayInsight[];
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
  askingPrice?: number | null;
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
