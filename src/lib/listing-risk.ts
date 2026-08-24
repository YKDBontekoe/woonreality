import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import type { PropertyListing } from "@/src/lib/types";

export type ListingRiskFlag = {
  key: string;
  title: string;
  summary: string;
  severity: "low" | "medium" | "high";
  action: string;
};

/**
 * Deterministic, rule-based checks over data a buyer (or the Funda extension)
 * already captured in the advertisement. This is exactly the kind of thing an
 * aankoopmakelaar reads a listing for: it does not touch the Reality Score,
 * which stays limited to open government data, and it does not need AI.
 */
export function listingRiskFlags(listing: PropertyListing | null | undefined, locale: Locale = "nl"): ListingRiskFlag[] {
  if (!listing) return [];
  const t = getLibTranslator(locale, "lib-finance");
  const flags: ListingRiskFlag[] = [];
  const flag = (key: string, copyKey: string, severity: ListingRiskFlag["severity"]): ListingRiskFlag => ({
    key,
    title: t(`listingRisk.${copyKey}.title`),
    summary: t(`listingRisk.${copyKey}.summary`),
    severity,
    action: t(`listingRisk.${copyKey}.action`),
  });
  const ownership = listing.ownership?.toLowerCase() ?? "";
  const description = [listing.description, ...(listing.textSections?.map((section) => section.text) ?? [])].join(" ").toLowerCase();
  const extraValues = Object.values(listing.extraKenmerken ?? {}).join(" ").toLowerCase();
  const haystack = `${ownership} ${description} ${extraValues}`;

  if (/erfpacht/.test(haystack) && !/geen erfpacht|eeuwigdurend afgekocht|volledig afgekocht/.test(haystack)) {
    flags.push(flag("erfpacht", "erfpacht", "high"));
  }

  if (listing.vveContribution != null && listing.vveContribution > 0 && listing.vveReserveFund == null) {
    flags.push(flag("vve-reserve-onbekend", "vveReserveUnknown", "low"));
  }

  if (/bijzondere bijdrage|achterstallig onderhoud|inhaal(?:onderhoud)?/.test(haystack)) {
    flags.push(flag("vve-bijzondere-bijdrage", "vveSpecialLevy", "high"));
  }

  if (/ouderdomsclausule/.test(haystack)) {
    flags.push(flag("ouderdomsclausule", "ouderdomsclausule", "medium"));
  }

  if (/asbest/.test(haystack)) {
    flags.push(flag("asbest", "asbest", "medium"));
  }

  if (/(vocht|schimmel|lekkage)/.test(haystack)) {
    flags.push(flag("vocht-lekkage", "vochtLekkage", "medium"));
  }

  return flags;
}
