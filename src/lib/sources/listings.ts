import type { Property, PropertyListing } from "@/src/lib/types";
import { fetchJson, SourceFetchError } from "@/src/lib/http/fetch-json";

export type { PropertyListing } from "@/src/lib/types";

/**
 * Normalized market data returned by a provider that is licensed to supply it.
 *
 * This deliberately does not model descriptions, photos, floor plans, or
 * other portal content. Those fields need separate retention/display rights.
 */
export type ListingProvider = {
  name: string;
  lookup(property: Property): Promise<PropertyListing | null>;
};

type ListingProviderOptions = {
  endpoint: string;
  apiKey?: string;
  name?: string;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function firstValue(record: UnknownRecord, ...keys: string[]) {
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const normalized = asString(value)?.toLowerCase();
  if (["true", "yes", "ja", "1"].includes(normalized ?? "")) return true;
  if (["false", "no", "nee", "0"].includes(normalized ?? "")) return false;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/[^\d,.-]/g, "");
  const dotCount = (compact.match(/\./g) ?? []).length;
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : dotCount === 1 && /\.\d{3}$/.test(compact)
      ? compact.replace(".", "")
      : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asDate(value: unknown): string | undefined {
  const stringValue = asString(value);
  if (!stringValue) return undefined;
  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function asHttpUrl(value: unknown): string | undefined {
  const stringValue = asString(value);
  if (!stringValue) return undefined;
  try {
    const url = new URL(stringValue);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function asStatus(value: unknown): PropertyListing["status"] {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === "active" || normalized === "available" || normalized === "te koop") return "active";
  if (normalized === "sold" || normalized === "verkocht") return "sold";
  if (normalized === "withdrawn" || normalized === "withdrawn_from_market" || normalized === "ingetrokken") return "withdrawn";
  return "unknown";
}

/** Normalize the small, provider-neutral response contract used by the app. */
export function normalizeListing(payload: unknown, provider: string, fetchedAt = new Date().toISOString()): PropertyListing | null {
  const root = asRecord(payload);
  const record = asRecord(root?.listing) ?? root;
  if (!record) return null;

  const externalId = asString(firstValue(record, "externalId", "external_id", "listingId", "listing_id", "id"));
  const sourceUrl = asHttpUrl(firstValue(record, "sourceUrl", "source_url", "url"));
  if (!externalId || !sourceUrl) return null;

  const optionalFields = {
    askingPrice: asNumber(firstValue(record, "askingPrice", "asking_price", "price")),
    originalAskingPrice: asNumber(firstValue(record, "originalAskingPrice", "original_asking_price", "initialPrice", "initial_price")),
    priceChangeAmount: asNumber(firstValue(record, "priceChangeAmount", "price_change_amount")),
    priceChangePct: asNumber(firstValue(record, "priceChangePct", "price_change_pct", "priceChangePercentage")),
    pricePerM2: asNumber(firstValue(record, "pricePerM2", "price_per_m2")),
    firstPublishedAt: asDate(firstValue(record, "firstPublishedAt", "first_published_at", "publishedAt", "published_at")),
    lastUpdatedAt: asDate(firstValue(record, "lastUpdatedAt", "last_updated_at", "updatedAt", "updated_at")),
    offerDeadline: asDate(firstValue(record, "offerDeadline", "offer_deadline")),
    livingAreaM2: asNumber(firstValue(record, "livingAreaM2", "living_area_m2", "areaM2", "area_m2")),
    plotAreaM2: asNumber(firstValue(record, "plotAreaM2", "plot_area_m2")),
    volumeM3: asNumber(firstValue(record, "volumeM3", "volume_m3", "volume")),
    roomCount: asNumber(firstValue(record, "roomCount", "room_count", "rooms")),
    bedroomCount: asNumber(firstValue(record, "bedroomCount", "bedroom_count", "bedrooms")),
    bathroomCount: asNumber(firstValue(record, "bathroomCount", "bathroom_count", "bathrooms")),
    propertyType: asString(firstValue(record, "propertyType", "property_type", "type")),
    constructionYear: asNumber(firstValue(record, "constructionYear", "construction_year", "buildYear", "build_year")),
    energyLabel: asString(firstValue(record, "energyLabel", "energy_label")),
    energyIndex: asNumber(firstValue(record, "energyIndex", "energy_index")),
    insulation: asString(firstValue(record, "insulation")),
    heating: asString(firstValue(record, "heating", "heatingSource", "heating_source")),
    glazing: asString(firstValue(record, "glazing", "windowGlazing", "window_glazing")),
    solarPanelCount: asNumber(firstValue(record, "solarPanelCount", "solar_panel_count", "solarPanels", "solar_panels")),
    vveContribution: asNumber(firstValue(record, "vveContribution", "vve_contribution")),
    vveReserveFund: asNumber(firstValue(record, "vveReserveFund", "vve_reserve_fund")),
    outdoorSpaceM2: asNumber(firstValue(record, "outdoorSpaceM2", "outdoor_space_m2", "gardenAreaM2", "garden_area_m2")),
    gardenOrientation: asString(firstValue(record, "gardenOrientation", "garden_orientation")),
    balcony: asBoolean(firstValue(record, "balcony")),
    terrace: asBoolean(firstValue(record, "terrace")),
    parking: asString(firstValue(record, "parking", "parkingType", "parking_type")),
    storage: asString(firstValue(record, "storage", "storageType", "storage_type")),
    addressLabel: asString(firstValue(record, "addressLabel", "address_label")),
    municipality: asString(firstValue(record, "municipality")),
    province: asString(firstValue(record, "province")),
    description: asString(firstValue(record, "description", "descriptionText", "description_text", "remarks", "details")),
  };

  return {
    provider,
    externalId,
    sourceUrl,
    fetchedAt,
    status: asStatus(firstValue(record, "status", "listingStatus", "listing_status")),
    ...Object.fromEntries(Object.entries(optionalFields).filter(([, value]) => value !== undefined)),
  } as PropertyListing;
}

function providerUrl(endpoint: string, property: Property) {
  const url = new URL(endpoint);
  url.searchParams.set("bagVboId", property.bagVboId);
  url.searchParams.set("postcode", property.postcode);
  url.searchParams.set("houseNumber", String(property.houseNumber));
  return url;
}

export function createLicensedListingProvider(options: ListingProviderOptions): ListingProvider {
  const endpoint = new URL(options.endpoint).toString();
  const name = options.name?.trim() || "Licensed listing feed";

  return {
    name,
    async lookup(property) {
      try {
        const payload = await fetchJson<unknown>(providerUrl(endpoint, property), name, {
          cache: "no-store",
          timeoutMs: 8_000,
          accept: "application/json",
          ...(options.apiKey ? { headers: { authorization: `Bearer ${options.apiKey}` } } : {}),
        });
        const listing = normalizeListing(payload, name);
        if (!listing) throw new Error(`${name} returned an invalid listing payload`);
        return listing;
      } catch (error) {
        // A licensed feed that simply has no record for this address is not
        // an error — only real transport/status failures propagate.
        if (error instanceof SourceFetchError && (error.status === 404 || error.status === 204)) return null;
        throw error;
      }
    },
  };
}

export function getListingProvider(): ListingProvider | null {
  const endpoint = process.env.LISTING_PROVIDER_URL?.trim();
  if (!endpoint) return null;
  try {
    return createLicensedListingProvider({
      endpoint,
      apiKey: process.env.LISTING_PROVIDER_API_KEY?.trim() || undefined,
      name: process.env.LISTING_PROVIDER_NAME,
    });
  } catch {
    return null;
  }
}

export async function getListingForProperty(property: Property): Promise<PropertyListing | null> {
  return getListingProvider()?.lookup(property) ?? null;
}
