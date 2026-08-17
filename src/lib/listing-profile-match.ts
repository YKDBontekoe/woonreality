import type { BuyerProfile } from "@/src/lib/purchase";
import type { PropertyListing } from "@/src/lib/types";

export type MatchStatus = "pass" | "fail" | "unknown";

export type ProfileMatchChip = {
  key: string;
  label: string;
  status: MatchStatus;
  detail: string;
};

function haystack(listing: PropertyListing) {
  return [
    listing.propertyType,
    listing.parking,
    listing.storage,
    listing.gardenOrientation,
    listing.ownership,
    ...Object.entries(listing.extraKenmerken ?? {}).flatMap(([label, value]) => [label, value]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasGarden(listing: PropertyListing) {
  if (listing.outdoorSpaceM2 != null && listing.outdoorSpaceM2 > 0) return true;
  if (listing.gardenOrientation) return true;
  return /tuin|achtertuin|voortuin/.test(haystack(listing));
}

function hasParking(listing: PropertyListing) {
  const value = listing.parking?.toLowerCase() ?? "";
  if (/^(nee|geen|niet)$/.test(value.trim())) return false;
  if (value) return true;
  return /parkeer|garage|oprit/.test(haystack(listing));
}

function listingKind(listing: PropertyListing): "house" | "apartment" | "unknown" {
  const text = `${listing.propertyType ?? ""} ${haystack(listing)}`;
  if (/appartement|flat|maisonnette|penthouse|portiek|galerie/.test(text)) return "apartment";
  if (/eengezins|tussenwoning|hoekwoning|2-onder|twee-onder|vrijstaand|huis|woning/.test(text)) return "house";
  return "unknown";
}

function vveText(listing: PropertyListing) {
  return haystack(listing);
}

function vveMentioned(listing: PropertyListing) {
  return listing.vveContribution != null
    || listing.vveReserveFund != null
    || /\bvve\b/.test(vveText(listing));
}

function hasVve(listing: PropertyListing) {
  if (listing.vveContribution != null && listing.vveContribution > 0) return true;
  if (listing.vveReserveFund != null && listing.vveReserveFund > 0) return true;
  const text = vveText(listing);
  if (/geen vve|zonder vve|niet van toepassing/.test(text)) return false;
  return /\bvve\b/.test(text);
}

export function listingMatchesBuyerProfile(
  listing: PropertyListing | null | undefined,
  profile: BuyerProfile,
): ProfileMatchChip[] {
  const chips: ProfileMatchChip[] = [];
  if (!listing) {
    return [
      { key: "listing", label: "Advertentie", status: "unknown", detail: "Nog geen Funda-kenmerken" },
    ];
  }

  if (profile.bedrooms > 0) {
    if (listing.bedroomCount == null) {
      chips.push({ key: "bedrooms", label: `${profile.bedrooms} slk`, status: "unknown", detail: "Niet in de advertentie" });
    } else {
      const ok = listing.bedroomCount >= profile.bedrooms;
      chips.push({
        key: "bedrooms",
        label: `${listing.bedroomCount} slk`,
        status: ok ? "pass" : "fail",
        detail: ok ? `≥ ${profile.bedrooms} gewenst` : `${listing.bedroomCount} van ${profile.bedrooms} gewenst`,
      });
    }
  }

  if (profile.garden) {
    const garden = hasGarden(listing);
    chips.push({
      key: "garden",
      label: "Tuin",
      status: garden ? "pass" : listing.outdoorSpaceM2 == null && !listing.gardenOrientation ? "unknown" : "fail",
      detail: garden ? listing.gardenOrientation || `${listing.outdoorSpaceM2} m²` : "Niet genoemd",
    });
  }

  if (profile.parking) {
    const parking = hasParking(listing);
    chips.push({
      key: "parking",
      label: "Parkeren",
      status: listing.parking == null && !/parkeer/.test(haystack(listing)) ? "unknown" : parking ? "pass" : "fail",
      detail: listing.parking || (parking ? "Genoemd" : "Niet genoemd"),
    });
  }

  if (profile.propertyType !== "any") {
    const kind = listingKind(listing);
    const ok = kind === profile.propertyType;
    chips.push({
      key: "type",
      label: profile.propertyType === "house" ? "Huis" : "Appartement",
      status: kind === "unknown" ? "unknown" : ok ? "pass" : "fail",
      detail: listing.propertyType || "Type onbekend",
    });
  }

  if (!profile.acceptVve) {
    const mentioned = vveMentioned(listing);
    const vve = hasVve(listing);
    chips.push({
      key: "vve",
      label: "VvE",
      status: !mentioned ? "unknown" : vve ? "fail" : "pass",
      detail: !mentioned ? "Niet in de advertentie" : vve ? "VvE in de advertentie" : "Geen VvE",
    });
  } else if (hasVve(listing)) {
    chips.push({
      key: "vve",
      label: "VvE",
      status: "pass",
      detail: listing.vveContribution != null ? "Bijdrage genoemd" : "VvE genoemd",
    });
  }

  if (profile.budget > 0 && listing.askingPrice != null) {
    const ok = listing.askingPrice <= profile.budget;
    chips.push({
      key: "budget",
      label: "Budget",
      status: ok ? "pass" : "fail",
      detail: ok ? "Onder je budget" : "Boven je budget",
    });
  }

  return chips;
}
