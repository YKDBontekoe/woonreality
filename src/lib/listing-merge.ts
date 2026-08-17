import type { PropertyListing } from "@/src/lib/types";

function hasListingValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

/**
 * User-captured listing (Funda extension / paste) wins over a licensed feed.
 * Empty fields on the primary listing are filled from the fallback.
 */
export function mergeListings(
  primary: PropertyListing | null | undefined,
  fallback: PropertyListing | null | undefined,
): PropertyListing | null {
  if (!primary) return fallback ?? null;
  if (!fallback) return primary;
  const merged: PropertyListing = { ...fallback };
  for (const [key, value] of Object.entries(primary) as Array<[keyof PropertyListing, PropertyListing[keyof PropertyListing]]>) {
    if (key === "extraKenmerken" || key === "textSections" || key === "notes") continue;
    if (hasListingValue(value)) (merged as Record<string, unknown>)[key] = value;
  }
  merged.extraKenmerken = {
    ...(fallback.extraKenmerken ?? {}),
    ...(primary.extraKenmerken ?? {}),
  };
  if (!Object.keys(merged.extraKenmerken).length) delete merged.extraKenmerken;
  const sections = [...(fallback.textSections ?? []), ...(primary.textSections ?? [])].filter(
    (section, index, all) =>
      all.findIndex((item) => item.title === section.title && item.text === section.text) === index,
  );
  if (sections.length) merged.textSections = sections;
  else delete merged.textSections;
  const notes = [...(fallback.notes ?? []), ...(primary.notes ?? [])].filter(
    (note, index, all) => all.indexOf(note) === index,
  );
  if (notes.length) merged.notes = notes;
  else delete merged.notes;
  return merged;
}

export function listingNeedsExtension(listing: PropertyListing | null | undefined) {
  return !listing?.askingPrice && !listing?.livingAreaM2 && !listing?.description;
}
