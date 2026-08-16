import * as cheerio from "cheerio";
import {
  extractListingFacts,
  parseDutchNumber,
  type ExtractedListingFacts,
} from "@/src/lib/listing-intake";
import type { PropertyListing } from "@/src/lib/types";

export const FUNDA_USER_PROVIDER = "Funda (door jou toegevoegd)";
export const USER_PROVIDER = "Door jou toegevoegd";

export type ImportedListingFacts = ExtractedListingFacts & {
  roomCount?: number;
  bathroomCount?: number;
  volumeM3?: number;
  propertyType?: string;
  insulation?: string;
  heating?: string;
  glazing?: string;
  solarPanelCount?: number;
  outdoorSpaceM2?: number;
  gardenOrientation?: string;
  balcony?: boolean;
  terrace?: boolean;
  parking?: string;
  storage?: string;
  vveReserveFund?: number;
  status?: PropertyListing["status"];
  firstPublishedAt?: string;
};

export class ListingImportError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_url" | "blocked" | "fetch_failed",
  ) {
    super(message);
    this.name = "ListingImportError";
  }
}

const FETCH_TIMEOUT_MS = 6_000;
const MAX_BYTES = 8_000_000;
const USER_AGENT = "WoonReality/0.1 (user-initiated listing import)";

export function isFundaHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "") === "funda.nl";
}

export function isFundaListingUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (!isFundaHost(url.hostname)) return false;
    const path = url.pathname.toLowerCase();
    if (path.includes("/zoeken")) return false;
    const match = path.match(/^\/(?:detail\/)?(koop|huur)\/([^/]+)\/(.+)$/);
    if (!match) return false;
    return /\d{4,}/.test(match[3]);
  } catch {
    return false;
  }
}

export function fundaListingId(url: string) {
  const matches = [...url.matchAll(/(\d{5,})/g)].map((match) => match[1]);
  return matches.at(-1) ?? "funda";
}

function uniqueNotes(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

export function mergeListingFacts(
  existing: ImportedListingFacts | undefined,
  imported: ImportedListingFacts,
): ImportedListingFacts {
  const existingNotes = existing?.notes ?? [];
  const importedNotes = imported.notes ?? [];
  const merged: ImportedListingFacts = { ...imported, notes: uniqueNotes([...existingNotes, ...importedNotes]) };
  if (!existing) return merged;
  for (const [key, value] of Object.entries(existing) as Array<[keyof ImportedListingFacts, ImportedListingFacts[keyof ImportedListingFacts]]>) {
    if (key === "notes") continue;
    if (hasValue(value)) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

export function listingFromImportedFacts(
  sourceUrl: string,
  facts: ImportedListingFacts,
  fetchedAt = new Date().toISOString(),
): PropertyListing {
  const livingAreaM2 = facts.livingAreaM2;
  const askingPrice = facts.askingPrice;
  const pricePerM2 = askingPrice && livingAreaM2 ? Math.round(askingPrice / livingAreaM2) : undefined;
  const optional: Partial<PropertyListing> = {
    askingPrice,
    livingAreaM2,
    plotAreaM2: facts.plotAreaM2,
    volumeM3: facts.volumeM3,
    roomCount: facts.roomCount,
    bedroomCount: facts.bedroomCount,
    bathroomCount: facts.bathroomCount,
    propertyType: facts.propertyType,
    constructionYear: facts.constructionYear,
    energyLabel: facts.energyLabel,
    insulation: facts.insulation,
    heating: facts.heating,
    glazing: facts.glazing,
    solarPanelCount: facts.solarPanelCount,
    vveContribution: facts.vveContribution,
    vveReserveFund: facts.vveReserveFund,
    outdoorSpaceM2: facts.outdoorSpaceM2,
    gardenOrientation: facts.gardenOrientation,
    balcony: facts.balcony,
    terrace: facts.terrace,
    parking: facts.parking,
    storage: facts.storage,
    firstPublishedAt: facts.firstPublishedAt,
    pricePerM2,
  };
  return {
    provider: isFundaListingUrl(sourceUrl) ? FUNDA_USER_PROVIDER : USER_PROVIDER,
    externalId: isFundaListingUrl(sourceUrl) ? fundaListingId(sourceUrl) : "user",
    sourceUrl,
    fetchedAt,
    status: facts.status ?? "unknown",
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
  };
}

export function factsFromUnknown(value: unknown): ImportedListingFacts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { notes: [] };
  const record = value as Record<string, unknown>;
  const notes = Array.isArray(record.notes) ? record.notes.filter((item): item is string => typeof item === "string") : [];
  const facts: ImportedListingFacts = { notes };
  const numbers = [
    "askingPrice", "livingAreaM2", "plotAreaM2", "bedroomCount", "constructionYear", "vveContribution",
    "roomCount", "bathroomCount", "volumeM3", "solarPanelCount", "outdoorSpaceM2", "vveReserveFund",
  ] as const;
  for (const key of numbers) {
    const parsed = typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] : undefined;
    if (parsed != null) (facts as Record<string, unknown>)[key] = parsed;
  }
  const strings = [
    "energyLabel", "propertyType", "insulation", "heating", "glazing", "gardenOrientation", "parking", "storage", "firstPublishedAt",
  ] as const;
  for (const key of strings) {
    if (typeof record[key] === "string" && record[key].trim()) facts[key] = record[key].trim();
  }
  if (typeof record.balcony === "boolean") facts.balcony = record.balcony;
  if (typeof record.terrace === "boolean") facts.terrace = record.terrace;
  if (record.status === "active" || record.status === "sold" || record.status === "withdrawn" || record.status === "unknown") {
    facts.status = record.status;
  }
  return facts;
}

export function listingFromUserRecord(row: {
  source_url?: string | null;
  asking_price?: number | null;
  extracted_json?: unknown;
  updated_at?: string | null;
}): PropertyListing | null {
  const facts = factsFromUnknown(row.extracted_json);
  if (row.asking_price != null && Number.isFinite(row.asking_price)) facts.askingPrice = row.asking_price;
  const sourceUrl = row.source_url?.trim() || "";
  if (!sourceUrl && !hasValue(facts.askingPrice) && !hasValue(facts.livingAreaM2) && !hasValue(facts.bedroomCount)) {
    return null;
  }
  return listingFromImportedFacts(
    sourceUrl || "https://www.funda.nl/",
    facts,
    row.updated_at ?? new Date().toISOString(),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function jsonLdNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes);
  const record = asRecord(value);
  if (!record) return [];
  const nested = record["@graph"];
  return nested ? [record, ...jsonLdNodes(nested)] : [record];
}

function jsonLdNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parseDutchNumber(value.replace(/[^\d,.-]/g, "")) ?? parseDutchNumber(value);
  const record = asRecord(value);
  if (!record) return undefined;
  return jsonLdNumber(record.value ?? record.price ?? record.amount);
}

function jsonLdString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  const record = asRecord(value);
  return record ? jsonLdString(record.name ?? record.value) : undefined;
}

function parseEnergyLabel(value: string) {
  const match = value.toUpperCase().match(/\b([A-G](?:\+{1,4}|-)?)\b/);
  return match?.[1];
}

function parseArea(value: string) {
  const match = value.match(/(\d{1,4}(?:[.,]\d)?)\s*m/i);
  if (match) return parseDutchNumber(match[1]);
  const parsed = parseDutchNumber(value.replace(/[^\d,.]/g, ""));
  return parsed != null && parsed >= 8 && parsed <= 8_000 ? parsed : undefined;
}

function parseCount(value: string, max: number) {
  const match = value.match(/(\d{1,3})/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : undefined;
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["ja", "yes", "true", "aanwezig", "1"].includes(normalized)) return true;
  if (["nee", "no", "false", "niet aanwezig", "0"].includes(normalized)) return false;
  return undefined;
}

function parseStatus(value: string): PropertyListing["status"] | undefined {
  const normalized = value.toLowerCase();
  if (normalized.includes("verkocht")) return "sold";
  if (normalized.includes("ingetrokken")) return "withdrawn";
  if (normalized.includes("te koop") || normalized.includes("beschikbaar") || normalized.includes("te huur")) return "active";
  return undefined;
}

function applyKenmerk(label: string, value: string, facts: ImportedListingFacts) {
  const key = label.toLowerCase().replace(/\s+/g, " ").trim();
  const text = value.replace(/\s+/g, " ").trim();
  if (!key || !text) return;
  if (/woonoppervlakte|gebruiksoppervlakte wonen/.test(key)) facts.livingAreaM2 ??= parseArea(text);
  else if (/perceel/.test(key)) facts.plotAreaM2 ??= parseArea(text);
  else if (/^inhoud$|inhoud m/.test(key)) {
    const match = text.match(/(\d{2,5}(?:[.,]\d)?)/);
    const parsed = match ? parseDutchNumber(match[1]) : undefined;
    if (parsed != null && parsed >= 50 && parsed <= 20_000) facts.volumeM3 ??= parsed;
  } else if (/slaapkamer/.test(key)) facts.bedroomCount ??= parseCount(text, 20);
  else if (/badkamer/.test(key)) facts.bathroomCount ??= parseCount(text, 20);
  else if (/aantal kamers|^kamers$/.test(key)) facts.roomCount ??= parseCount(text, 30);
  else if (/energielabel/.test(key)) facts.energyLabel ??= parseEnergyLabel(text);
  else if (/bouwjaar/.test(key)) {
    const yearMatch = text.match(/\b(1[6-9]\d{2}|20[0-2]\d)\b/);
    const year = yearMatch ? Number(yearMatch[1]) : undefined;
    if (year && year >= 1600) facts.constructionYear ??= year;
  } else if (/soort woonhuis|soort appartement|woningtype|type woning/.test(key)) facts.propertyType ??= text;
  else if (/^isolatie$/.test(key)) facts.insulation ??= text;
  else if (/verwarming/.test(key)) facts.heating ??= text;
  else if (/beglazing|isolatieglas/.test(key)) facts.glazing ??= text;
  else if (/zonnepanelen/.test(key)) {
    const count = parseCount(text, 200);
    if (count && !/^ja|nee$/i.test(text.trim())) facts.solarPanelCount ??= count;
  } else if (/tuinligging/.test(key)) facts.gardenOrientation ??= text;
  else if (/buitenruimte|tuin/.test(key) && /m/.test(text)) facts.outdoorSpaceM2 ??= parseArea(text);
  else if (/^balkon$/.test(key)) facts.balcony ??= parseBoolean(text) ?? (parseArea(text) != null ? true : undefined);
  else if (/^terras$/.test(key)) facts.terrace ??= parseBoolean(text) ?? (parseArea(text) != null ? true : undefined);
  else if (/parkeer/.test(key)) facts.parking ??= text;
  else if (/berging|schuur/.test(key)) facts.storage ??= text;
  else if (/reservefonds/.test(key)) facts.vveReserveFund ??= parseDutchNumber(text.replace(/[^\d,.]/g, ""));
  else if (/vve|bijdrage/.test(key) && /€|\d/.test(text)) facts.vveContribution ??= parseDutchNumber(text.replace(/[^\d,.]/g, ""));
  else if (/vraagprijs|koopprijs|huurprijs/.test(key)) {
    const price = parseDutchNumber(text.replace(/[^\d,.]/g, ""));
    if (price != null && price >= 50_000 && price <= 5_000_000) facts.askingPrice ??= price;
  } else if (/^status$|aanbodstatus/.test(key)) facts.status ??= parseStatus(text);
}

function kenmerkPairs($: cheerio.CheerioAPI) {
  const pairs: Array<[string, string]> = [];
  $("dt").each((_, dt) => {
    const label = $(dt).text();
    const value = $(dt).nextAll("dd").first().text();
    if (label.trim() && value.trim()) pairs.push([label, value]);
  });
  $("tr").each((_, row) => {
    const cells = $(row).children("th,td");
    if (cells.length >= 2) pairs.push([$(cells[0]).text(), $(cells[1]).text()]);
  });
  return pairs;
}

function applyJsonLd(node: Record<string, unknown>, facts: ImportedListingFacts) {
  const offers = asRecord(node.offers) ?? (Array.isArray(node.offers) ? asRecord(node.offers[0]) : null);
  const offerPrice = jsonLdNumber(offers?.price ?? node.price);
  if (offerPrice != null && offerPrice >= 50_000 && offerPrice <= 5_000_000) facts.askingPrice ??= offerPrice;
  const livingArea = jsonLdNumber(asRecord(node.floorSize)?.value ?? node.floorSize);
  if (livingArea != null && livingArea >= 20 && livingArea <= 600) facts.livingAreaM2 ??= livingArea;
  facts.roomCount ??= jsonLdNumber(node.numberOfRooms);
  facts.bedroomCount ??= jsonLdNumber(node.numberOfBedrooms);
  facts.bathroomCount ??= jsonLdNumber(node.numberOfBathroomsTotal ?? node.numberOfBathrooms);
  facts.constructionYear ??= jsonLdNumber(node.yearBuilt);
  const energy = jsonLdString(node.energyRating) ?? jsonLdString(asRecord(node.additionalProperty)?.value);
  if (energy) facts.energyLabel ??= parseEnergyLabel(energy);
  const datePosted = jsonLdString(node.datePosted);
  if (datePosted) {
    const date = new Date(datePosted);
    if (!Number.isNaN(date.getTime())) facts.firstPublishedAt ??= date.toISOString();
  }
  const additional = node.additionalProperty;
  const properties = Array.isArray(additional) ? additional : additional ? [additional] : [];
  for (const item of properties) {
    const record = asRecord(item);
    if (!record) continue;
    applyKenmerk(jsonLdString(record.name) ?? "", jsonLdString(record.value) ?? String(record.value ?? ""), facts);
  }
}

export function extractFundaListingFromHtml(html: string): ImportedListingFacts {
  const $ = cheerio.load(html);
  const facts: ImportedListingFacts = { notes: [] };
  $("script[type='application/ld+json']").each((_, script) => {
    try {
      const parsed = JSON.parse($(script).text()) as unknown;
      for (const node of jsonLdNodes(parsed)) applyJsonLd(node, facts);
    } catch {
      /* malformed JSON-LD is ignored */
    }
  });
  for (const [label, value] of kenmerkPairs($)) applyKenmerk(label, value, facts);
  $("script,style,noscript,svg,nav,footer").remove();
  const visible = ($("main").text() || $("body").text() || $.root().text()).replace(/\s+/g, " ").trim();
  const merged = mergeListingFacts(facts, extractListingFacts(visible.slice(0, 25_000)));
  if (merged.askingPrice) {
    merged.notes = uniqueNotes(merged.notes.filter((note) => !/geen overtuigende vraagprijs/i.test(note)));
  }
  return merged;
}

async function fetchFundaHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "user-agent": USER_AGENT,
      },
    });
    if (response.status === 403 || response.status === 429) {
      throw new ListingImportError("Funda gaf de pagina niet vrij. Plak de vraagprijs of een stuk advertentietekst.", "blocked");
    }
    if (!response.ok) {
      throw new ListingImportError("De Funda-pagina kon niet worden opgehaald. Probeer het later of plak de advertentietekst.", "fetch_failed");
    }
    const finalUrl = response.url || url;
    try {
      if (!isFundaHost(new URL(finalUrl).hostname)) {
        throw new ListingImportError("De link leidde niet naar een Funda-advertentie.", "invalid_url");
      }
    } catch (error) {
      if (error instanceof ListingImportError) throw error;
      throw new ListingImportError("Dit is geen geldige Funda-link.", "invalid_url");
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) {
      throw new ListingImportError("De Funda-pagina is te groot om in te lezen. Plak de advertentietekst.", "fetch_failed");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) {
      throw new ListingImportError("De Funda-pagina is te groot om in te lezen. Plak de advertentietekst.", "fetch_failed");
    }
    return new TextDecoder().decode(bytes);
  } catch (error) {
    if (error instanceof ListingImportError) throw error;
    throw new ListingImportError("Funda gaf de pagina niet vrij. Plak de vraagprijs of een stuk advertentietekst.", "blocked");
  } finally {
    clearTimeout(timeout);
  }
}

export async function importFundaListing(sourceUrl: string): Promise<ImportedListingFacts> {
  if (!isFundaListingUrl(sourceUrl)) {
    throw new ListingImportError("Dit is geen Funda-advertentielink. Plak de link van één woning, geen zoekresultaat.", "invalid_url");
  }
  const html = await fetchFundaHtml(sourceUrl);
  const facts = extractFundaListingFromHtml(html);
  if (!hasValue(facts.askingPrice) && !hasValue(facts.livingAreaM2) && !hasValue(facts.bedroomCount) && !hasValue(facts.roomCount)) {
    facts.notes = uniqueNotes([
      ...facts.notes,
      "We vonden weinig kenmerken op de pagina. Plak de advertentietekst als aanvulling.",
    ]);
  }
  return facts;
}
