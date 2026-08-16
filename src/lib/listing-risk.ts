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
export function listingRiskFlags(listing: PropertyListing | null | undefined): ListingRiskFlag[] {
  if (!listing) return [];
  const flags: ListingRiskFlag[] = [];
  const ownership = listing.ownership?.toLowerCase() ?? "";
  const description = [listing.description, ...(listing.textSections?.map((section) => section.text) ?? [])].join(" ").toLowerCase();
  const extraValues = Object.values(listing.extraKenmerken ?? {}).join(" ").toLowerCase();
  const haystack = `${ownership} ${description} ${extraValues}`;

  if (/erfpacht/.test(haystack) && !/geen erfpacht|eeuwigdurend afgekocht|volledig afgekocht/.test(haystack)) {
    flags.push({
      key: "erfpacht",
      title: "Erfpacht: check de canon en looptijd",
      summary: "De advertentie noemt erfpacht. Dat betekent een aparte, vaak jaarlijkse canon bovenop je hypotheeklasten, en kan de financierbaarheid en waardeontwikkeling raken.",
      severity: "high",
      action: "Vraag de erfpachtvoorwaarden op: resterende looptijd, canon, herzieningsdatum en of afkoop mogelijk of al gedaan is. Neem dit mee in je hypotheekaanvraag.",
    });
  }

  if (listing.vveContribution != null && listing.vveContribution > 0 && listing.vveReserveFund == null) {
    flags.push({
      key: "vve-reserve-onbekend",
      title: "VvE-reserve niet vermeld",
      summary: "Er is een VvE-bijdrage, maar geen reservefonds genoemd. Zonder reserve loop je risico op een onverwachte bijzondere bijdrage.",
      severity: "low",
      action: "Vraag de VvE-stukken (MJOP, reservefonds, notulen) op via de makelaar of notaris.",
    });
  }

  if (/bijzondere bijdrage|achterstallig onderhoud|inhaal(?:onderhoud)?/.test(haystack)) {
    flags.push({
      key: "vve-bijzondere-bijdrage",
      title: "Bijzondere bijdrage of achterstallig onderhoud genoemd",
      summary: "De tekst noemt een bijzondere bijdrage of achterstallig onderhoud. Dit kan een aanzienlijke extra kostenpost zijn bovenop de koopsom.",
      severity: "high",
      action: "Vraag het bedrag, de reden en of het al is geïnd of nog gaat komen.",
    });
  }

  if (/ouderdomsclausule/.test(haystack)) {
    flags.push({
      key: "ouderdomsclausule",
      title: "Ouderdomsclausule genoemd",
      summary: "Een ouderdomsclausule beperkt wat je later kunt verhalen op de verkoper voor gebreken die passen bij de leeftijd van de woning.",
      severity: "medium",
      action: "Laat de notaris de exacte clausuletekst beoordelen voordat je tekent.",
    });
  }

  if (/asbest/.test(haystack)) {
    flags.push({
      key: "asbest",
      title: "Asbest genoemd in de advertentie",
      summary: "Asbest wordt genoemd. Vooral bij bouw voor 1994 is dit relevant voor je bouwkundige keuring.",
      severity: "medium",
      action: "Vraag of er een asbestinventarisatie is en overweeg een asbestclausule te bespreken met de notaris.",
    });
  }

  if (/(vocht|schimmel|lekkage)/.test(haystack)) {
    flags.push({
      key: "vocht-lekkage",
      title: "Vocht, schimmel of lekkage genoemd",
      summary: "De advertentietekst noemt vocht, schimmel of lekkage. Dit is een concreet keuringspunt.",
      severity: "medium",
      action: "Laat de bouwkundig keurder dit gericht controleren en vraag de verkoper naar de herstelhistorie.",
    });
  }

  return flags;
}

