import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { formatEuro } from "@/src/lib/purchase";
import type { PropertyListing } from "@/src/lib/types";

export type KenmerkGroupKey =
  | "overdracht"
  | "bouw"
  | "oppervlakten"
  | "indeling"
  | "energie"
  | "buiten"
  | "kadastraal"
  | "overig";

type KenmerkClassifyKey = KenmerkGroupKey | "buurt" | "skip";

export type KenmerkRow = { label: string; value: string };

export type KenmerkGroup = {
  key: KenmerkGroupKey;
  label: string;
  rows: KenmerkRow[];
};

export type NeighborhoodStats = {
  inhabitants?: number;
  familySharePct?: number;
  avgPricePerM2?: number;
};

const BUURT_LABEL = /inwoners|gezin met kinderen|gem\.?\s*vraagprijs|buurtinzichten/i;
const BLOB_TITLE = /^(kenmerken|bekijk alle kenmerken)$/i;

function parseDutchNumber(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function classify(label: string): KenmerkClassifyKey {
  const key = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (BLOB_TITLE.test(key) || key === "kadastrale kaart") return "skip";
  if (BUURT_LABEL.test(key)) return "buurt";
  if (/vraagprijs|status|aangeboden|aanvaarding|eigendom|kosten koper|overdracht/.test(key)) return "overdracht";
  if (/soort woonhuis|soort bouw|bouwjaar|dak|woonlagen|type/.test(key)) return "bouw";
  if (/woonoppervlak|gebruiksoppervlak|^wonen$|perceel|^inhoud$|externe berg|oppervlakte/.test(key)) return "oppervlakten";
  if (/kamer|slaapkamer|badkamer|toilet|indeling/.test(key)) return "indeling";
  if (/energie|isolatie|verwarming|warm water|cv-ketel|^cv$|airco|voorzieningen/.test(key)) return "energie";
  if (/tuin|ligging|berging|schuur|parkeer|buiten|balkon|terras/.test(key)) return "buiten";
  if (/kadaster|kadastra/.test(key)) return "kadastraal";
  return "overig";
}

const GROUP_ORDER: KenmerkGroupKey[] = ["overdracht", "bouw", "oppervlakten", "indeling", "energie", "buiten", "kadastraal", "overig"];

type KnownRowKey =
  | "status"
  | "askingPrice"
  | "pricePerM2"
  | "livingArea"
  | "plot"
  | "volume"
  | "rooms"
  | "bedrooms"
  | "bathrooms"
  | "type"
  | "constructionYear"
  | "energyLabel"
  | "insulation"
  | "heating"
  | "glazing"
  | "solarPanels"
  | "outdoorSpace"
  | "gardenOrientation"
  | "balcony"
  | "terrace"
  | "parking"
  | "storage"
  | "vveContribution"
  | "vveReserve"
  | "ownership";

/** Fixed bucket per built-in row, mirroring the historical classify() outcome for the Dutch labels. */
const KNOWN_ROW_KINDS: Record<KnownRowKey, KenmerkClassifyKey> = {
  status: "overdracht",
  askingPrice: "overdracht",
  ownership: "overdracht",
  type: "bouw",
  constructionYear: "bouw",
  livingArea: "oppervlakten",
  plot: "oppervlakten",
  volume: "oppervlakten",
  rooms: "indeling",
  bedrooms: "indeling",
  bathrooms: "indeling",
  energyLabel: "energie",
  insulation: "energie",
  heating: "energie",
  pricePerM2: "overig",
  glazing: "overig",
  solarPanels: "overig",
  vveContribution: "overig",
  vveReserve: "overig",
  outdoorSpace: "buiten",
  gardenOrientation: "buiten",
  balcony: "buiten",
  terrace: "buiten",
  parking: "buiten",
  storage: "buiten",
};

function groupLabel(key: KenmerkGroupKey, locale: Locale) {
  return getLibTranslator(locale, "lib-domain")(`kenmerken.groups.${key}`);
}

type CollectedRow = { kind: KenmerkClassifyKey; label: string; value: string };

function pushUnique(rows: CollectedRow[], kind: KenmerkClassifyKey, label: string, value: string | number | undefined | null) {
  if (value == null || value === "" || value === "—") return;
  const text = String(value);
  const key = label.toLowerCase();
  if (rows.some((row) => row.label.toLowerCase() === key || (row.value === text && row.label.toLowerCase().includes(key.slice(0, 8))))) return;
  rows.push({ kind, label, value: text });
}

export function neighborhoodStatsFromListing(listing: PropertyListing | null | undefined): NeighborhoodStats {
  const stats: NeighborhoodStats = {};
  for (const [label, value] of Object.entries(listing?.extraKenmerken ?? {})) {
    if (/inwoners/i.test(label)) stats.inhabitants = parseDutchNumber(value);
    if (/gezin met kinderen/i.test(label)) {
      const pct = value.match(/(\d+(?:[.,]\d+)?)\s*%/);
      stats.familySharePct = pct ? Number(pct[1].replace(",", ".")) : parseDutchNumber(value);
    }
    if (/gem\.?\s*vraagprijs/i.test(label)) stats.avgPricePerM2 = parseDutchNumber(value);
  }
  return stats;
}

export function listingKenmerkGroups(listing: PropertyListing | null | undefined, locale: Locale = "nl"): KenmerkGroup[] {
  if (!listing) return [];
  const t = getLibTranslator(locale, "lib-domain");
  const row = (key: KnownRowKey) => t(`kenmerken.rows.${key}`);
  const kind = (key: KnownRowKey) => KNOWN_ROW_KINDS[key];
  const collected: CollectedRow[] = [];
  pushUnique(collected, kind("status"), row("status"), listingStatusLabel(listing.status, locale));
  pushUnique(collected, kind("askingPrice"), row("askingPrice"), listing.askingPrice != null ? formatEuro(listing.askingPrice, locale) : undefined);
  pushUnique(collected, kind("pricePerM2"), row("pricePerM2"), listing.pricePerM2 != null ? formatEuro(listing.pricePerM2, locale) : undefined);
  pushUnique(collected, kind("livingArea"), row("livingArea"), listing.livingAreaM2 != null ? `${listing.livingAreaM2} m²` : undefined);
  pushUnique(collected, kind("plot"), row("plot"), listing.plotAreaM2 != null ? `${listing.plotAreaM2} m²` : undefined);
  pushUnique(collected, kind("volume"), row("volume"), listing.volumeM3 != null ? `${listing.volumeM3} m³` : undefined);
  pushUnique(collected, kind("rooms"), row("rooms"), listing.roomCount);
  pushUnique(collected, kind("bedrooms"), row("bedrooms"), listing.bedroomCount);
  pushUnique(collected, kind("bathrooms"), row("bathrooms"), listing.bathroomCount);
  pushUnique(collected, kind("type"), row("type"), listing.propertyType);
  pushUnique(collected, kind("constructionYear"), row("constructionYear"), listing.constructionYear);
  pushUnique(collected, kind("energyLabel"), row("energyLabel"), listing.energyLabel);
  pushUnique(collected, kind("insulation"), row("insulation"), listing.insulation);
  pushUnique(collected, kind("heating"), row("heating"), listing.heating);
  pushUnique(collected, kind("glazing"), row("glazing"), listing.glazing);
  pushUnique(collected, kind("solarPanels"), row("solarPanels"), listing.solarPanelCount);
  pushUnique(collected, kind("outdoorSpace"), row("outdoorSpace"), listing.outdoorSpaceM2 != null ? `${listing.outdoorSpaceM2} m²` : undefined);
  pushUnique(collected, kind("gardenOrientation"), row("gardenOrientation"), listing.gardenOrientation);
  pushUnique(collected, kind("balcony"), row("balcony"), listing.balcony == null ? undefined : listing.balcony ? t("kenmerken.yes") : t("kenmerken.no"));
  pushUnique(collected, kind("terrace"), row("terrace"), listing.terrace == null ? undefined : listing.terrace ? t("kenmerken.yes") : t("kenmerken.no"));
  pushUnique(collected, kind("parking"), row("parking"), listing.parking);
  pushUnique(collected, kind("storage"), row("storage"), listing.storage);
  pushUnique(collected, kind("vveContribution"), row("vveContribution"), listing.vveContribution != null ? formatEuro(listing.vveContribution, locale) : undefined);
  pushUnique(collected, kind("vveReserve"), row("vveReserve"), listing.vveReserveFund != null ? formatEuro(listing.vveReserveFund, locale) : undefined);
  pushUnique(collected, kind("ownership"), row("ownership"), listing.ownership);

  for (const [label, value] of Object.entries(listing.extraKenmerken ?? {})) {
    const extraKind = classify(label);
    if (extraKind === "skip" || extraKind === "buurt") continue;
    if (collected.some((existing) => existing.label.toLowerCase() === label.toLowerCase())) continue;
    pushUnique(collected, extraKind, label, value);
  }

  return GROUP_ORDER.flatMap((key) => {
    const rows = collected.filter((entry) => entry.kind === key).map(({ label, value }) => ({ label, value }));
    if (!rows.length) return [];
    return [{ key, label: groupLabel(key, locale), rows }];
  });
}

function listingStatusLabel(status: PropertyListing["status"], locale: Locale = "nl") {
  return getLibTranslator(locale, "lib-domain")(`kenmerken.status.${status}`);
}

export function isKenmerkenBlob(title: string, text: string) {
  if (!BLOB_TITLE.test(title.trim())) return false;
  return !/\s{2,}|\n/.test(text) && text.length > 80 && /Vraagprijs|Bouwjaar|Energielabel/.test(text);
}
