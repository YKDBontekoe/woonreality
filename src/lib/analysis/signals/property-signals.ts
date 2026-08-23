import type { Evidence, NearbyProperty, Property, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { pdokUrls } from "@/src/lib/sources/pdok/bgt";

export function identityEvidence(property: Property): Evidence {
  return createEvidence({
    id: `bag-${property.bagVboId}`,
    source: "PDOK / BAG",
    sourceUrl: pdokUrls.bag,
    sourceRecordId: property.bagVboId,
    confidence: "high",
    spatialResolution: "BAG-object",
    caveat: "BAG is de objectidentiteit; een adreslabel kan in de tijd wijzigen.",
  });
}

export function contextSignal(input: { property: Property; evidence: Evidence }): Signal {
  const { property, evidence } = input;
  return {
    key: "context",
    label: "BAG-context",
    category: "woning",
    value: property.buildingYear ? String(property.buildingYear) : "bekend",
    unit: property.buildingYear ? "bouwjaar" : undefined,
    severity: "neutral",
    summary: property.areaM2
      ? `BAG koppelt dit adres aan een verblijfsobject van ${property.areaM2} m².`
      : "BAG koppelt dit adres aan een verblijfsobject.",
    action: "Gebruik dit als startpunt; een bouwkundige keuring blijft nodig voor de staat van het gebouw.",
    confidence: "high",
    spatialScale: "BAG-verblijfsobject",
    evidence: [evidence],
    availability: "available",
  };
}

export function usageSignal(input: { property: Property; evidence: Evidence }): Signal {
  const { property, evidence } = input;
  const nonResidential = property.isResidential === false;
  return {
    key: "usage",
    label: "Gebruiksdoel",
    category: "woning",
    value: nonResidential ? (property.usagePurposes?.join(", ") || "Geen woonfunctie") : "Woonfunctie",
    severity: nonResidential ? "attention" : "neutral",
    summary: nonResidential
      ? `BAG registreert dit object niet als woonfunctie (${property.usagePurposes?.join(", ") || "onbekend gebruiksdoel"}). Deze woningcheck is gebouwd voor woningen; de scores hierboven zijn mogelijk niet zinvol voor dit gebruik.`
      : "BAG registreert dit object als woonfunctie.",
    action: nonResidential
      ? "Controleer of dit pand daadwerkelijk te koop staat als woning en of woonbestemming/vergunning aanwezig is voordat je verdergaat."
      : "Geen actie nodig; controleer bij twijfel de vergunde bestemming bij de gemeente.",
    confidence: "high",
    spatialScale: "BAG-verblijfsobject",
    evidence: [evidence],
    availability: "available",
  };
}

export function vveSignal(input: { siblings: NearbyProperty[]; evidence: Evidence; nearbyAvailable: boolean }): Signal {
  const { siblings, evidence, nearbyAvailable } = input;
  const likelyApartmentOrVve = siblings.length >= 1;
  return {
    key: "vve",
    label: "Appartement & VvE",
    value: likelyApartmentOrVve ? `${siblings.length} andere woonadres(sen) in hetzelfde pand` : "Vermoedelijk zelfstandig pand",
    severity: likelyApartmentOrVve ? "attention" : "neutral",
    summary: likelyApartmentOrVve
      ? `BAG registreert ${siblings.length} andere woonfunctie-verblijfsobject(en) in hetzelfde pand. Dit wijst op een appartement(encomplex); controleer VvE-status, reservefonds, splitsingsakte en erfpacht.`
      : "BAG registreert geen andere woonfunctie-verblijfsobjecten in hetzelfde pand; een VvE is dan minder waarschijnlijk, maar niet uitgesloten.",
    action: likelyApartmentOrVve
      ? "Vraag de VvE-jaarstukken, notulen, meerjarenonderhoudsplan (MJOP) en reservefonds op vóór je een bod doet."
      : "Vraag bij twijfel na of het pand is gesplitst in appartementsrechten.",
    category: "woning",
    confidence: "low",
    spatialScale: "BAG-pand",
    evidence: [evidence],
    availability: nearbyAvailable ? "available" : "unavailable",
  };
}

/** BAG has no foundation registration; pre-1945 buildings get an explicit research flag instead of a fake score. */
const FOUNDATION_RESEARCH_BUILD_YEAR = 1945;

export function foundationSignal(input: { property: Property; evidence: Evidence }): Signal {
  const { property, evidence } = input;
  const olderBuilding = property.buildingYear != null && property.buildingYear < FOUNDATION_RESEARCH_BUILD_YEAR;
  return {
    key: "foundation",
    label: "Fundering & constructie",
    category: "woning",
    value: olderBuilding ? "Onderzoeken" : "Niet beoordeeld",
    severity: olderBuilding ? "attention" : "neutral",
    summary: olderBuilding
      ? `Dit pand heeft een BAG-bouwjaar van ${property.buildingYear}. BAG zegt niets over fundering, verzakking of eerder herstel; onderzoek dit vóór je bod.`
      : "Openbare adresdata bevat geen informatie over fundering, constructieve staat of eerder herstel.",
    action: olderBuilding
      ? "Vraag naar funderingsonderzoek, herstel, scheurvorming, peilmetingen en verzekerbaarheid; laat dit beoordelen in een bouwkundige keuring."
      : "Vraag naar constructieve gebreken, eerdere herstelwerkzaamheden en keuringsrapporten.",
    confidence: "low",
    spatialScale: "BAG-pand (geen funderingsregistratie)",
    evidence: [evidence],
    availability: "available",
  };
}
