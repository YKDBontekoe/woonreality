import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
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
  if (/^(nee|geen|niet)\b/.test(value.trim())) return false;
  if (value) return true;
  return /parkeer|garage|oprit/.test(haystack(listing));
}

function listingKind(listing: PropertyListing): "house" | "apartment" | "unknown" {
  const text = `${listing.propertyType ?? ""} ${haystack(listing)}`;
  if (/appartement|flat|maisonnette|penthouse|portiek|galerie/.test(text)) return "apartment";
  if (/eengezins|tussenwoning|hoekwoning|2-onder|twee-onder|vrijstaand|huis|woning/.test(text)) return "house";
  return "unknown";
}

function vveFieldText(listing: PropertyListing) {
  return Object.entries(listing.extraKenmerken ?? {})
    .filter(([label]) => /\bvve\b|vereniging van eigenaren/i.test(label))
    .map(([, value]) => value)
    .join(" ")
    .toLowerCase();
}

function vveMentioned(listing: PropertyListing) {
  return listing.vveContribution != null
    || listing.vveReserveFund != null
    || /\bvve\b/.test(haystack(listing));
}

function hasVve(listing: PropertyListing) {
  if (listing.vveContribution != null && listing.vveContribution > 0) return true;
  if (listing.vveReserveFund != null && listing.vveReserveFund > 0) return true;
  if (/niet van toepassing/.test(vveFieldText(listing))) return false;
  const text = haystack(listing);
  if (/geen vve|zonder vve/.test(text)) return false;
  return /\bvve\b/.test(text);
}

export function listingMatchesBuyerProfile(
  listing: PropertyListing | null | undefined,
  profile: BuyerProfile,
  locale: Locale = "nl",
): ProfileMatchChip[] {
  const t = getLibTranslator(locale, "lib-finance");
  const chips: ProfileMatchChip[] = [];
  if (!listing) {
    return [
      { key: "listing", label: t("listingProfileMatch.listingLabel"), status: "unknown", detail: t("listingProfileMatch.noListingDetails") },
    ];
  }

  if (profile.bedrooms > 0) {
    if (listing.bedroomCount == null) {
      chips.push({ key: "bedrooms", label: `${profile.bedrooms} ${t("listingProfileMatch.bedrooms.unit")}`, status: "unknown", detail: t("listingProfileMatch.bedrooms.notListed") });
    } else {
      const ok = listing.bedroomCount >= profile.bedrooms;
      chips.push({
        key: "bedrooms",
        label: `${listing.bedroomCount} ${t("listingProfileMatch.bedrooms.unit")}`,
        status: ok ? "pass" : "fail",
        detail: ok
          ? t("listingProfileMatch.bedrooms.matchDetail", { wanted: profile.bedrooms })
          : t("listingProfileMatch.bedrooms.mismatchDetail", { have: listing.bedroomCount, wanted: profile.bedrooms }),
      });
    }
  }

  if (profile.garden) {
    const garden = hasGarden(listing);
    chips.push({
      key: "garden",
      label: t("listingProfileMatch.garden.label"),
      status: garden ? "pass" : listing.outdoorSpaceM2 == null && !listing.gardenOrientation ? "unknown" : "fail",
      detail: garden
        ? listing.gardenOrientation || (listing.outdoorSpaceM2 != null ? `${listing.outdoorSpaceM2} m²` : t("listingProfileMatch.garden.mentioned"))
        : t("listingProfileMatch.garden.notMentioned"),
    });
  }

  if (profile.parking) {
    const parking = hasParking(listing);
    chips.push({
      key: "parking",
      label: t("listingProfileMatch.parking.label"),
      status: listing.parking == null && !/parkeer/.test(haystack(listing)) ? "unknown" : parking ? "pass" : "fail",
      detail: listing.parking || (parking ? t("listingProfileMatch.parking.mentioned") : t("listingProfileMatch.parking.notMentioned")),
    });
  }

  if (profile.propertyType !== "any") {
    const kind = listingKind(listing);
    const ok = kind === profile.propertyType;
    chips.push({
      key: "type",
      label: profile.propertyType === "house" ? t("listingProfileMatch.type.house") : t("listingProfileMatch.type.apartment"),
      status: kind === "unknown" ? "unknown" : ok ? "pass" : "fail",
      detail: listing.propertyType || t("listingProfileMatch.type.unknown"),
    });
  }

  if (!profile.acceptVve) {
    const mentioned = vveMentioned(listing);
    const vve = hasVve(listing);
    chips.push({
      key: "vve",
      label: t("listingProfileMatch.vve.label"),
      status: !mentioned ? "unknown" : vve ? "fail" : "pass",
      detail: !mentioned
        ? t("listingProfileMatch.vve.notInListing")
        : vve ? t("listingProfileMatch.vve.inListing") : t("listingProfileMatch.vve.none"),
    });
  } else if (hasVve(listing)) {
    chips.push({
      key: "vve",
      label: t("listingProfileMatch.vve.label"),
      status: "pass",
      detail: listing.vveContribution != null ? t("listingProfileMatch.vve.contributionListed") : t("listingProfileMatch.vve.mentioned"),
    });
  }

  if (profile.budget > 0 && listing.askingPrice != null) {
    const ok = listing.askingPrice <= profile.budget;
    chips.push({
      key: "budget",
      label: t("listingProfileMatch.budget.label"),
      status: ok ? "pass" : "fail",
      detail: ok ? t("listingProfileMatch.budget.within") : t("listingProfileMatch.budget.above"),
    });
  }

  return chips;
}
