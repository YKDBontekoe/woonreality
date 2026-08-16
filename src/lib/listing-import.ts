import * as cheerio from "cheerio";
import {
  extractListingFacts,
  parseDutchNumber,
  type ExtractedListingFacts,
} from "@/src/lib/listing-intake";
import type { PropertyListing } from "@/src/lib/types";

export const FUNDA_USER_PROVIDER = "Funda (door jou toegevoegd)";
export const USER_PROVIDER = "Door jou toegevoegd";

export type ListingTextSection = {
  title: string;
  text: string;
};

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
  description?: string;
  addressLabel?: string;
  postcode?: string;
  city?: string;
  street?: string;
  houseNumber?: number;
  houseLetter?: string;
  ownership?: string;
  neighborhood?: string;
  extraKenmerken?: Record<string, string>;
  sections?: ListingTextSection[];
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

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 8_000_000;
const USER_AGENT = "WoonReality/0.1 (user-initiated listing import)";
const SMALL_STREET_WORDS = new Set(["de", "den", "der", "van", "het", "en", "'s"]);
const PAYWALLED = /log in om te bekijken/i;
const FUNDA_OBJECT_TYPES = "huis|appartement|penthouse|villa|bungalow|woonboerderij|herenhuis|studio|parkeergelegenheid|bouwgrond|ligplaats|woonboot|recreatiewoning|garage|kamer";

export function isFundaHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "") === "funda.nl";
}

export function isFundaListingUrl(value: string) {
  return Boolean(normalizeFundaListingUrl(value));
}

export function normalizeFundaListingUrl(value: string) {
  const trimmed = value.trim();
  const candidates = [trimmed];
  if (trimmed.startsWith("http://")) candidates.push(`https://${trimmed.slice(7)}`);
  else if (trimmed.startsWith("www.")) candidates.push(`https://${trimmed}`);
  else if (trimmed.startsWith("funda.nl/")) candidates.push(`https://www.${trimmed}`);
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:") continue;
      if (!isFundaHost(url.hostname)) continue;
      const path = url.pathname.toLowerCase();
      if (path.includes("/zoeken")) continue;
      const match = path.match(/^\/(?:detail\/)?(koop|huur)\/([^/]+)\/(.+)$/);
      if (!match || !/\d{4,}/.test(match[3])) continue;
      return url.toString();
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function titleCaseSlug(slug: string) {
  return slug.split("-").filter(Boolean).map((part, index) => {
    const lower = part.toLowerCase();
    if (index > 0 && SMALL_STREET_WORDS.has(lower)) return lower;
    if (lower.startsWith("'s")) return `'s${lower.slice(2)}`;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(" ");
}

function parseStreetFromSlug(streetSlug: string) {
  const streetMatch = streetSlug.match(/^(.+)-(\d+)(?:-([a-z0-9]))?$/i);
  if (!streetMatch) return null;
  const houseNumber = Number(streetMatch[2]);
  if (!Number.isFinite(houseNumber)) return null;
  return {
    street: titleCaseSlug(streetMatch[1]),
    houseNumber,
    houseLetter: streetMatch[3] ? streetMatch[3].toUpperCase() : undefined,
  };
}

export function parseFundaListingAddress(value: string) {
  const normalized = normalizeFundaListingUrl(value);
  if (!normalized) return null;
  const path = new URL(normalized).pathname.replace(/\/+$/, "");
  const match = path.match(/^\/(?:detail\/)?(?:koop|huur)\/([^/]+)\/([a-z0-9-]+)(?:\/\d+)?$/i);
  if (!match) return null;
  const city = titleCaseSlug(match[1]);
  const slug = match[2].toLowerCase().replace(/-bouwnr-\d+$/, "");
  const withListingId = slug.match(new RegExp(`^(?:${FUNDA_OBJECT_TYPES})-(\\d{4,})-(.+)$`));
  const withoutListingId = withListingId ? null : slug.match(new RegExp(`^(?:${FUNDA_OBJECT_TYPES})-(.+)$`));
  const streetSlug = withListingId?.[2] ?? withoutListingId?.[1];
  if (!streetSlug) return city ? { city, sourceUrl: normalized } : null;
  const parsedStreet = parseStreetFromSlug(streetSlug);
  if (!parsedStreet) return { city, sourceUrl: normalized };
  const addressLabel = `${parsedStreet.street} ${parsedStreet.houseNumber}${parsedStreet.houseLetter ?? ""}`.trim();
  return {
    city,
    street: parsedStreet.street,
    houseNumber: parsedStreet.houseNumber,
    houseLetter: parsedStreet.houseLetter,
    addressLabel,
    query: `${addressLabel}, ${city}`,
    sourceUrl: normalized,
  };
}

export function addressQueryFromFacts(facts: ImportedListingFacts, sourceUrl?: string) {
  if (facts.street && facts.houseNumber && facts.city) {
    const house = `${facts.street} ${facts.houseNumber}${facts.houseLetter ?? ""}`;
    return facts.postcode ? `${house}, ${facts.postcode} ${facts.city}` : `${house}, ${facts.city}`;
  }
  if (facts.addressLabel && /\d/.test(facts.addressLabel) && facts.city) return `${facts.addressLabel}, ${facts.city}`;
  if (facts.addressLabel && /\d/.test(facts.addressLabel)) return facts.addressLabel;
  const parsed = sourceUrl ? parseFundaListingAddress(sourceUrl) : undefined;
  if (parsed?.street && parsed.houseNumber) return parsed.query;
  return undefined;
}

export function isFundaChallengeHtml(html: string) {
  return /fundaCaptchaForm|grecaptcha|Je bent bijna op de pagina die je zoekt|__akam_recaptcha/i.test(html)
    && !/application\/ld\+json/i.test(html);
}

function factsFromFundaUrl(sourceUrl: string): ImportedListingFacts {
  const parsed = parseFundaListingAddress(sourceUrl);
  return {
    notes: [],
    ...(parsed?.city ? { city: parsed.city } : {}),
    ...(parsed?.street ? { street: parsed.street } : {}),
    ...(parsed?.houseNumber ? { houseNumber: parsed.houseNumber } : {}),
    ...(parsed?.houseLetter ? { houseLetter: parsed.houseLetter } : {}),
    ...(parsed?.addressLabel ? { addressLabel: parsed.addressLabel } : {}),
  };
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
    if (key === "notes" || key === "extraKenmerken" || key === "sections") continue;
    if (hasValue(value)) (merged as Record<string, unknown>)[key] = value;
  }
  merged.extraKenmerken = { ...(imported.extraKenmerken ?? {}), ...(existing.extraKenmerken ?? {}) };
  if (!Object.keys(merged.extraKenmerken).length) delete merged.extraKenmerken;
  const sections = [...(existing.sections ?? []), ...(imported.sections ?? [])].filter((section, index, all) => (
    all.findIndex((item) => item.title === section.title && item.text === section.text) === index
  ));
  if (sections.length) merged.sections = sections;
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
    description: facts.description,
    addressLabel: facts.addressLabel,
    extraKenmerken: facts.extraKenmerken && Object.keys(facts.extraKenmerken).length ? facts.extraKenmerken : undefined,
    textSections: facts.sections?.length ? facts.sections : undefined,
    notes: facts.notes.length ? facts.notes : undefined,
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
    "roomCount", "bathroomCount", "volumeM3", "solarPanelCount", "outdoorSpaceM2", "vveReserveFund", "houseNumber",
  ] as const;
  for (const key of numbers) {
    const parsed = typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] : undefined;
    if (parsed != null) (facts as Record<string, unknown>)[key] = parsed;
  }
  const strings = [
    "energyLabel", "propertyType", "insulation", "heating", "glazing", "gardenOrientation", "parking", "storage", "firstPublishedAt",
    "description", "addressLabel", "postcode", "city", "street", "houseLetter", "ownership", "neighborhood",
  ] as const;
  for (const key of strings) {
    if (typeof record[key] === "string" && record[key].trim()) facts[key] = record[key].trim();
  }
  if (typeof record.balcony === "boolean") facts.balcony = record.balcony;
  if (typeof record.terrace === "boolean") facts.terrace = record.terrace;
  if (record.status === "active" || record.status === "sold" || record.status === "withdrawn" || record.status === "unknown") {
    facts.status = record.status;
  }
  if (record.extraKenmerken && typeof record.extraKenmerken === "object" && !Array.isArray(record.extraKenmerken)) {
    facts.extraKenmerken = Object.fromEntries(
      Object.entries(record.extraKenmerken as Record<string, unknown>).flatMap(([key, value]) => typeof value === "string" && value.trim() ? [[key, value.trim()]] : []),
    );
  }
  if (Array.isArray(record.sections)) {
    facts.sections = record.sections.flatMap((item) => {
      const section = asRecord(item);
      const title = typeof section?.title === "string" ? section.title.trim() : "";
      const text = typeof section?.text === "string" ? section.text.trim() : "";
      return title && text ? [{ title, text }] : [];
    });
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

function labelledKenmerkArea(facts: ImportedListingFacts, labels: string[]) {
  const extra = facts.extraKenmerken ?? {};
  for (const label of labels) {
    const parsed = extra[label] ? parseArea(extra[label]) : undefined;
    if (parsed != null && parsed >= 8 && parsed <= 8_000) return parsed;
  }
  return undefined;
}

function preferLabelledAreas(facts: ImportedListingFacts) {
  const living = labelledKenmerkArea(facts, ["Wonen", "Woonoppervlakte", "Gebruiksoppervlakte wonen"]);
  if (living != null && living >= 20 && living <= 600) facts.livingAreaM2 = living;
  const plot = labelledKenmerkArea(facts, ["Perceel", "Perceeloppervlakte"]);
  if (plot != null && plot >= 40 && plot <= 8_000) facts.plotAreaM2 = plot;
}

function applyKenmerk(label: string, value: string, facts: ImportedListingFacts) {
  const key = label.toLowerCase().replace(/\s+/g, " ").trim();
  const text = value.replace(/\s+/g, " ").trim();
  if (!key || !text || PAYWALLED.test(text)) return;
  facts.extraKenmerken = { ...(facts.extraKenmerken ?? {}), [label.replace(/\s+/g, " ").trim()]: text };
  if (/woonoppervlakte|gebruiksoppervlakte wonen|^wonen$/.test(key)) facts.livingAreaM2 ??= parseArea(text);
  else if (/perceel/.test(key)) facts.plotAreaM2 ??= parseArea(text);
  else if (/^inhoud$|inhoud m/.test(key)) {
    const match = text.match(/(\d{2,5}(?:[.,]\d)?)/);
    const parsed = match ? parseDutchNumber(match[1]) : undefined;
    if (parsed != null && parsed >= 50 && parsed <= 20_000) facts.volumeM3 ??= parsed;
  } else if (/slaapkamer/.test(key) && !/aantal kamers/.test(key)) facts.bedroomCount ??= parseCount(text, 20);
  else if (/badkamer/.test(key)) facts.bathroomCount ??= parseCount(text, 20);
  else if (/aantal kamers|^kamers$/.test(key)) {
    const rooms = text.match(/(\d+)\s*kamers?/i);
    const beds = text.match(/(\d+)\s*slaapkamers?/i);
    if (rooms) facts.roomCount ??= Number(rooms[1]);
    if (beds) facts.bedroomCount ??= Number(beds[1]);
    if (!rooms) facts.roomCount ??= parseCount(text, 30);
  } else if (/energielabel/.test(key)) facts.energyLabel ??= parseEnergyLabel(text);
  else if (/bouwjaar/.test(key)) {
    const yearMatch = text.match(/\b(1[6-9]\d{2}|20[0-2]\d)\b/);
    const year = yearMatch ? Number(yearMatch[1]) : undefined;
    if (year && year >= 1600) facts.constructionYear ??= year;
  } else if (/soort woonhuis|soort appartement|woningtype|type woning|soort bouw/.test(key)) facts.propertyType ??= text;
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
  else if (/bijdrage vve|^vve$|vve-bijdrage/.test(key) && /€|\d/.test(text)) facts.vveContribution ??= parseDutchNumber(text.replace(/[^\d,.]/g, ""));
  else if (/vraagprijs per m|koopprijs per m/.test(key)) { /* stored in extraKenmerken */ }
  else if (/vraagprijs|koopprijs|huurprijs/.test(key)) {
    const price = parseDutchNumber(text.replace(/[^\d,.]/g, ""));
    if (price != null && price >= 50_000 && price <= 5_000_000) facts.askingPrice ??= price;
  } else if (/^status$|aanbodstatus/.test(key)) facts.status ??= parseStatus(text);
  else if (/eigendomssituatie|erfpacht/.test(key)) {
    facts.ownership ??= text;
    if (/erfpacht/i.test(text)) facts.notes = uniqueNotes([...(facts.notes ?? []), "De advertentie noemt erfpacht — controleer canon en afkoop."]);
  }
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
  const description = jsonLdString(node.description);
  if (description && description.length > 40) facts.description ??= description.slice(0, 20_000);
  const address = asRecord(node.address);
  if (address) {
    facts.street ??= jsonLdString(address.streetAddress)?.replace(/\s+\d.*$/, "") ? undefined : facts.street;
    const streetAddress = jsonLdString(address.streetAddress);
    if (streetAddress) facts.addressLabel ??= streetAddress;
    facts.postcode ??= jsonLdString(address.postalCode);
    facts.city ??= jsonLdString(address.addressLocality);
    const house = streetAddress?.match(/\s(\d+)(?:\s*[-/]?([a-zA-Z]))?$/);
    if (house) {
      facts.houseNumber ??= Number(house[1]);
      if (house[2]) facts.houseLetter ??= house[2].toUpperCase();
      const streetName = streetAddress?.slice(0, house.index).trim();
      if (streetName) facts.street ??= streetName;
    }
  }
  const name = jsonLdString(node.name);
  if (name && /\d/.test(name)) facts.addressLabel ??= name;
  const additional = node.additionalProperty;
  const properties = Array.isArray(additional) ? additional : additional ? [additional] : [];
  for (const item of properties) {
    const record = asRecord(item);
    if (!record) continue;
    applyKenmerk(jsonLdString(record.name) ?? "", jsonLdString(record.value) ?? String(record.value ?? ""), facts);
  }
}

const TEXT_HEADINGS = /^(omschrijving|indeling|buurt|omgeving|bijzonderheden|kenmerken|overdracht|uitrusting|tuin|buitenruimte|wat je moet weten|ligt|ligging)$/i;

function extractFreeText($: cheerio.CheerioAPI): { description?: string; sections: ListingTextSection[] } {
  const sections: ListingTextSection[] = [];
  $("h2, h3").each((_, heading) => {
    const title = $(heading).text().replace(/\s+/g, " ").trim();
    if (!title || title.length > 80) return;
    const parts: string[] = [];
    let cursor = $(heading).next();
    while (cursor.length && !cursor.is("h1,h2,h3,nav,footer")) {
      const tag = cursor.prop("tagName")?.toLowerCase();
      if (tag === "p" || tag === "div" || tag === "section" || tag === "li") {
        const text = cursor.text().replace(/\s+/g, " ").trim();
        if (text.length > 40 && !/cookie|javascript|recaptcha/i.test(text)) parts.push(text);
      }
      cursor = cursor.next();
    }
    const text = uniqueNotes(parts).join("\n\n").slice(0, 8_000);
    if (text.length > 80) sections.push({ title, text });
  });
  const og = $('meta[property="og:description"]').attr("content")?.replace(/\s+/g, " ").trim();
  const meta = $('meta[name="description"]').attr("content")?.replace(/\s+/g, " ").trim();
  const named = sections.find((section) => TEXT_HEADINGS.test(section.title))?.text
    ?? sections.sort((a, b) => b.text.length - a.text.length)[0]?.text;
  const description = [named, og, meta].find((value) => value && value.length > 40)?.slice(0, 20_000);
  return { description, sections: sections.slice(0, 12) };
}

const JSON_FIELD_MAP: Array<[RegExp, keyof ImportedListingFacts]> = [
  [/^(description|omschrijving|descriptiontext|sellingtext)$/i, "description"],
  [/^(neighborhooddescription|buurtomschrijving|neighbourhooddescription)$/i, "neighborhood"],
  [/^(postalcode|postcode|zipcode)$/i, "postcode"],
  [/^(streetname|street|straat)$/i, "street"],
  [/^(housenumber|huisnummer)$/i, "houseNumber"],
  [/^(city|plaats|locality)$/i, "city"],
  [/^(livingarea|living_area|woonoppervlakte)$/i, "livingAreaM2"],
  [/^(plotarea|plot_area|perceeloppervlakte)$/i, "plotAreaM2"],
];

function walkEmbeddedFields(value: unknown, facts: ImportedListingFacts, depth = 0) {
  if (depth > 8 || value == null) return;
  if (Array.isArray(value)) {
    value.slice(0, 40).forEach((item) => walkEmbeddedFields(item, facts, depth + 1));
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, raw] of Object.entries(record)) {
    if (/photo|image|media|floorplan|plattegrond/i.test(key)) continue;
    const mapped = JSON_FIELD_MAP.find(([pattern]) => pattern.test(key))?.[1];
    if (mapped && !hasValue(facts[mapped])) {
      if (mapped === "description" || mapped === "neighborhood") {
        const text = jsonLdString(raw);
        if (text && text.length > 40) (facts as Record<string, unknown>)[mapped] = text.slice(0, 20_000);
      } else if (mapped === "houseNumber") {
        const number = jsonLdNumber(raw);
        if (number) facts.houseNumber = number;
      } else if (mapped === "livingAreaM2" || mapped === "plotAreaM2") {
        const number = jsonLdNumber(raw);
        if (number) (facts as Record<string, unknown>)[mapped] = number;
      } else {
        const text = jsonLdString(raw);
        if (text) (facts as Record<string, unknown>)[mapped] = text;
      }
    }
    if (typeof raw === "object") walkEmbeddedFields(raw, facts, depth + 1);
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
  $("script#__NEXT_DATA__, script#__NUXT_DATA__, script[type='application/json']").each((_, script) => {
    try {
      walkEmbeddedFields(JSON.parse($(script).text()) as unknown, facts);
    } catch {
      /* ignore */
    }
  });
  for (const [label, value] of kenmerkPairs($)) applyKenmerk(label, value, facts);
  const free = extractFreeText($);
  if (free.description) facts.description ??= free.description;
  if (free.sections.length) facts.sections = free.sections;
  $("script,style,noscript,svg,nav,footer").remove();
  const visible = ($("main").text() || $("body").text() || $.root().text()).replace(/\s+/g, " ").trim();
  const merged = mergeListingFacts(facts, extractListingFacts(visible.slice(0, 25_000)));
  preferLabelledAreas(merged);
  if (merged.askingPrice) {
    merged.notes = uniqueNotes(merged.notes.filter((note) => !/geen overtuigende vraagprijs/i.test(note)));
  }
  if (merged.description) merged.description = merged.description.slice(0, 20_000);
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

export async function inspectFundaListing(sourceUrl: string): Promise<{ facts: ImportedListingFacts; blocked: boolean; sourceUrl: string }> {
  const normalized = normalizeFundaListingUrl(sourceUrl);
  if (!normalized) {
    throw new ListingImportError("Dit is geen Funda-advertentielink. Plak de link van één woning, geen zoekresultaat.", "invalid_url");
  }
  const urlFacts = factsFromFundaUrl(normalized);
  try {
    const html = await fetchFundaHtml(normalized);
    if (isFundaChallengeHtml(html)) {
      return {
        facts: {
          ...urlFacts,
          notes: uniqueNotes([
            ...urlFacts.notes,
            "Funda vroeg om een mensen-check. We herkennen het adres uit de link. Plak kenmerken of de pagina-HTML uit Funda om de advertentie aan te vullen.",
          ]),
        },
        blocked: true,
        sourceUrl: normalized,
      };
    }
    return { facts: mergeListingFacts(extractFundaListingFromHtml(html), urlFacts), blocked: false, sourceUrl: normalized };
  } catch (error) {
    if (error instanceof ListingImportError && error.code === "invalid_url") throw error;
    const message = error instanceof ListingImportError
      ? error.message
      : "Funda gaf de pagina niet vrij. We gebruiken het adres uit de link.";
    return {
      facts: {
        ...urlFacts,
        notes: uniqueNotes([
          ...urlFacts.notes,
          message,
          "Plak kenmerken of de pagina-HTML uit Funda om de advertentie aan te vullen.",
        ]),
      },
      blocked: true,
      sourceUrl: normalized,
    };
  }
}

const CHALLENGE_NOTE_RE = /mensen-check|niet vrij|niet worden opgehaald|plak kenmerken of de pagina-html/i;

export function looksLikeListingHtml(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 40) return false;
  return /application\/ld\+json|<dl[\s>]|<dt[\s>]|__NEXT_DATA__|__NUXT_DATA__|itemscope|og:description/i.test(trimmed)
    || (/<[a-z][\s\S]{20,}>/i.test(trimmed) && /vraagprijs|woonoppervlakte|energielabel|funda/i.test(trimmed));
}

export function extractImportedListingPaste(value: string): ImportedListingFacts {
  const trimmed = value.trim();
  if (!trimmed) return { notes: [] };
  if (looksLikeListingHtml(trimmed)) {
    const facts = extractFundaListingFromHtml(trimmed);
    if (hasValue(facts.askingPrice) || hasValue(facts.livingAreaM2) || hasValue(facts.description) || hasValue(facts.roomCount)) {
      return facts;
    }
  }
  const textFacts = extractListingFacts(trimmed) as ImportedListingFacts;
  if (!textFacts.description && trimmed.length > 80 && !looksLikeListingHtml(trimmed)) {
    textFacts.description = trimmed.slice(0, 20_000);
  }
  return textFacts;
}

export function mergePasteIntoListingFacts(
  existing: ImportedListingFacts,
  pasted: ImportedListingFacts,
): ImportedListingFacts {
  const merged = mergeListingFacts(existing, pasted);
  if (hasValue(merged.askingPrice) || hasValue(merged.livingAreaM2) || hasValue(merged.description) || hasValue(merged.roomCount)) {
    merged.notes = uniqueNotes(merged.notes.filter((note) => !CHALLENGE_NOTE_RE.test(note)));
  }
  return merged;
}

export function listingFactsAreSparse(facts: ImportedListingFacts) {
  return !hasValue(facts.askingPrice) && !hasValue(facts.livingAreaM2) && !hasValue(facts.bedroomCount)
    && !hasValue(facts.roomCount) && !hasValue(facts.description);
}

export async function importFundaListing(sourceUrl: string, pastedContent?: string): Promise<{ facts: ImportedListingFacts; blocked: boolean; sourceUrl: string }> {
  const inspected = await inspectFundaListing(sourceUrl);
  let facts = inspected.facts;
  if (pastedContent?.trim()) {
    facts = mergePasteIntoListingFacts(facts, extractImportedListingPaste(pastedContent));
  }
  if (inspected.blocked && listingFactsAreSparse(facts)) {
    throw new ListingImportError(
      "Funda vroeg om een mensen-check. Plak kenmerken of de pagina-HTML uit de advertentie en probeer opnieuw.",
      "blocked",
    );
  }
  if (listingFactsAreSparse(facts)) {
    facts = {
      ...facts,
      notes: uniqueNotes([
        ...facts.notes,
        "We vonden weinig kenmerken. Plak de advertentietekst of pagina-HTML als aanvulling.",
      ]),
    };
  }
  return { facts, blocked: inspected.blocked && listingFactsAreSparse(facts), sourceUrl: inspected.sourceUrl };
}
