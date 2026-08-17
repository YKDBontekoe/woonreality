import type { PropertyListing } from "@/src/lib/types";

export function hasListingExtractText(listing: PropertyListing | null | undefined) {
  if (!listing) return false;
  const description = listing.description?.trim() ?? "";
  const sections = (listing.textSections ?? []).some((section) => section.text.trim().length > 40);
  return description.length >= 40 || sections;
}
