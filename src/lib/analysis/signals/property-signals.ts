import type { Evidence, NearbyProperty, Property, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { createSignal } from "@/src/lib/analysis/signals/create-signal";
import { pdokUrls } from "@/src/lib/sources/pdok/bgt";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

export function identityEvidence(property: Property, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: `bag-${property.bagVboId}`,
    source: "PDOK / BAG",
    sourceUrl: pdokUrls.bag,
    sourceRecordId: property.bagVboId,
    confidence: "high",
    spatialResolution: "BAG-object",
    caveat: t("property.identity.caveat"),
  });
}

export function contextSignal(input: { property: Property; evidence: Evidence }, locale: Locale = "nl"): Signal {
  const { property, evidence } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  return createSignal({
    key: "context",
    label: t("property.context.label"),
    category: "woning",
    value: property.buildingYear ? String(property.buildingYear) : t("property.context.valueKnown"),
    unit: property.buildingYear ? t("property.context.unitYear") : undefined,
    summary: property.areaM2
      ? t("property.context.summaryArea", { area: property.areaM2 })
      : t("property.context.summaryPlain"),
    action: t("property.context.action"),
    confidence: "high",
    spatialScale: "BAG-verblijfsobject",
    available: true,
    evidence,
  });
}

export function usageSignal(input: { property: Property; evidence: Evidence }, locale: Locale = "nl"): Signal {
  const { property, evidence } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  const nonResidential = property.isResidential === false;
  return createSignal({
    key: "usage",
    label: t("property.usage.label"),
    category: "woning",
    value: nonResidential ? (property.usagePurposes?.join(", ") || t("property.usage.valueNotResidential")) : t("property.usage.valueResidential"),
    severity: nonResidential ? "attention" : "neutral",
    summary: nonResidential
      ? t("property.usage.summaryNonResidential", { purposes: property.usagePurposes?.join(", ") || t("property.usage.purposesUnknown") })
      : t("property.usage.summaryResidential"),
    action: nonResidential
      ? t("property.usage.actionNonResidential")
      : t("property.usage.actionResidential"),
    confidence: "high",
    spatialScale: "BAG-verblijfsobject",
    available: true,
    evidence,
  });
}

export function vveSignal(input: { siblings: NearbyProperty[]; evidence: Evidence; nearbyAvailable: boolean }, locale: Locale = "nl"): Signal {
  const { siblings, evidence, nearbyAvailable } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  const likelyApartmentOrVve = siblings.length >= 1;
  return createSignal({
    key: "vve",
    label: t("property.vve.label"),
    value: likelyApartmentOrVve ? t("property.vve.valueSiblings", { count: siblings.length }) : t("property.vve.valueStandalone"),
    severity: likelyApartmentOrVve ? "attention" : "neutral",
    summary: likelyApartmentOrVve
      ? t("property.vve.summarySiblings", { count: siblings.length })
      : t("property.vve.summaryStandalone"),
    action: likelyApartmentOrVve
      ? t("property.vve.actionSiblings")
      : t("property.vve.actionStandalone"),
    category: "woning",
    confidence: "low",
    spatialScale: "BAG-pand",
    available: nearbyAvailable,
    evidence,
  });
}

/** BAG has no foundation registration; pre-1945 buildings get an explicit research flag instead of a fake score. */
const FOUNDATION_RESEARCH_BUILD_YEAR = 1945;

export function foundationSignal(input: { property: Property; evidence: Evidence }, locale: Locale = "nl"): Signal {
  const { property, evidence } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  const olderBuilding = property.buildingYear != null && property.buildingYear < FOUNDATION_RESEARCH_BUILD_YEAR;
  return createSignal({
    key: "foundation",
    label: t("property.foundation.label"),
    category: "woning",
    value: olderBuilding ? t("property.foundation.valueResearch") : t("property.foundation.valueNotAssessed"),
    severity: olderBuilding ? "attention" : "neutral",
    summary: olderBuilding
      ? t("property.foundation.summaryOld", { year: property.buildingYear })
      : t("property.foundation.summaryModern"),
    action: olderBuilding
      ? t("property.foundation.actionOld")
      : t("property.foundation.actionModern"),
    confidence: "low",
    spatialScale: "BAG-pand (geen funderingsregistratie)",
    available: true,
    evidence,
  });
}
