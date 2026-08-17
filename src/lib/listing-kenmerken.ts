import { formatEuro } from "@/src/lib/purchase";
import type { PropertyListing } from "@/src/lib/types";

export type KenmerkRow = { label: string; value: string };

export type KenmerkGroup = {
  key: string;
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

function classify(label: string): KenmerkGroup["key"] | "buurt" | "skip" {
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

const GROUP_LABELS: Record<string, string> = {
  overdracht: "Overdracht",
  bouw: "Bouw",
  oppervlakten: "Oppervlakten",
  indeling: "Indeling",
  energie: "Energie",
  buiten: "Buiten",
  kadastraal: "Kadastraal",
  overig: "Overig",
};

const GROUP_ORDER = ["overdracht", "bouw", "oppervlakten", "indeling", "energie", "buiten", "kadastraal", "overig"];

function pushUnique(rows: KenmerkRow[], label: string, value: string | number | undefined | null) {
  if (value == null || value === "" || value === "—") return;
  const text = String(value);
  const key = label.toLowerCase();
  if (rows.some((row) => row.label.toLowerCase() === key || row.value === text && row.label.toLowerCase().includes(key.slice(0, 8)))) return;
  rows.push({ label, value: text });
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

export function listingKenmerkGroups(listing: PropertyListing | null | undefined): KenmerkGroup[] {
  if (!listing) return [];
  const collected: KenmerkRow[] = [];
  pushUnique(collected, "Status", listingStatusLabel(listing.status));
  pushUnique(collected, "Vraagprijs", listing.askingPrice != null ? formatEuro(listing.askingPrice) : undefined);
  pushUnique(collected, "Prijs per m²", listing.pricePerM2 != null ? formatEuro(listing.pricePerM2) : undefined);
  pushUnique(collected, "Woonoppervlak", listing.livingAreaM2 != null ? `${listing.livingAreaM2} m²` : undefined);
  pushUnique(collected, "Perceel", listing.plotAreaM2 != null ? `${listing.plotAreaM2} m²` : undefined);
  pushUnique(collected, "Inhoud", listing.volumeM3 != null ? `${listing.volumeM3} m³` : undefined);
  pushUnique(collected, "Kamers", listing.roomCount);
  pushUnique(collected, "Slaapkamers", listing.bedroomCount);
  pushUnique(collected, "Badkamers", listing.bathroomCount);
  pushUnique(collected, "Type", listing.propertyType);
  pushUnique(collected, "Bouwjaar", listing.constructionYear);
  pushUnique(collected, "Energielabel", listing.energyLabel);
  pushUnique(collected, "Isolatie", listing.insulation);
  pushUnique(collected, "Verwarming", listing.heating);
  pushUnique(collected, "Beglazing", listing.glazing);
  pushUnique(collected, "Zonnepanelen", listing.solarPanelCount);
  pushUnique(collected, "Buitenruimte", listing.outdoorSpaceM2 != null ? `${listing.outdoorSpaceM2} m²` : undefined);
  pushUnique(collected, "Tuinligging", listing.gardenOrientation);
  pushUnique(collected, "Balkon", listing.balcony == null ? undefined : listing.balcony ? "Ja" : "Nee");
  pushUnique(collected, "Terras", listing.terrace == null ? undefined : listing.terrace ? "Ja" : "Nee");
  pushUnique(collected, "Parkeren", listing.parking);
  pushUnique(collected, "Berging", listing.storage);
  pushUnique(collected, "VvE-bijdrage", listing.vveContribution != null ? formatEuro(listing.vveContribution) : undefined);
  pushUnique(collected, "VvE-reserve", listing.vveReserveFund != null ? formatEuro(listing.vveReserveFund) : undefined);
  pushUnique(collected, "Eigendomssituatie", listing.ownership);

  const shown = new Set(collected.map((row) => row.label.toLowerCase()));
  for (const [label, value] of Object.entries(listing.extraKenmerken ?? {})) {
    const kind = classify(label);
    if (kind === "skip" || kind === "buurt") continue;
    if (shown.has(label.toLowerCase())) continue;
    if (/woonoppervlak|^wonen$|perceel|aantal kamers|slaapkamer|energielabel|bouwjaar|vraagprijs/.test(label.toLowerCase()) && shown.has(label.toLowerCase().split(" ")[0] ?? "")) continue;
    pushUnique(collected, label, value);
    shown.add(label.toLowerCase());
  }

  const buckets = new Map<string, KenmerkRow[]>();
  for (const row of collected) {
    const kind = classify(row.label);
    if (kind === "skip" || kind === "buurt") continue;
    const list = buckets.get(kind) ?? [];
    list.push(row);
    buckets.set(kind, list);
  }

  return GROUP_ORDER.flatMap((key) => {
    const rows = buckets.get(key);
    if (!rows?.length) return [];
    return [{ key, label: GROUP_LABELS[key] ?? key, rows }];
  });
}

function listingStatusLabel(status: PropertyListing["status"]) {
  return {
    active: "Te koop",
    sold: "Verkocht",
    withdrawn: "Ingetrokken",
    unknown: "Status onbekend",
  }[status];
}

export function isKenmerkenBlob(title: string, text: string) {
  if (!BLOB_TITLE.test(title.trim())) return false;
  return !/\s{2,}|\n/.test(text) && text.length > 80 && /Vraagprijs|Bouwjaar|Energielabel/.test(text);
}
