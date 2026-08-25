import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { createSignal } from "@/src/lib/analysis/signals/create-signal";
import type { BodemContext } from "@/src/lib/sources/bodem";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

/** Layer-key descriptors of the regional WFS registers; provider data, not display copy. */
const BODEM_LAYER_LABELS: Record<string, string> = {
  verontreinigd: "verontreinigingen",
  verdacht: "verdachte locaties",
  olietanks: "olietanks / tanklocaties",
  hbb: "Historisch Bodem Bestand (HBB)",
  stortplaatsen_vv: "voormalige stortplaatsen",
  spoedlocaties: "spoedlocaties",
};

export function bodemEvidence(bodem: BodemContext): Evidence {
  return createEvidence({
    id: "bodemregister-wfs",
    source: "Lokale bodemregisters (WFS)",
    sourceUrl: bodem.providers.map((provider) => provider.sourceUrl).join(", "),
    sourceRecordId: bodem.providers
      .map((provider) => `${provider.provider}: ${provider.layers.map((layer) => layer.layerKey).join(", ")}`)
      .join(" | "),
    confidence: "medium",
    fetchedAt: bodem.fetchedAt,
    spatialResolution: "circa 200 m bbox rond dit adres",
    caveat: bodem.caveat,
  });
}

function hitsByLayerLabel(bodem: BodemContext) {
  return bodem.providers.flatMap((provider) =>
    provider.layers
      .filter((layer) => layer.matchedCount > 0)
      .map((layer) => `${provider.provider}: ${BODEM_LAYER_LABELS[layer.layerKey] ?? layer.layerKey} (${layer.matchedCount})`),
  );
}

/** WFS bbox screening only; a hit list is an indication, never proof of contamination. */
export function soilSignal(input: { bodem: BodemContext; evidence: Evidence }, locale: Locale = "nl"): Signal | null {
  const { bodem, evidence } = input;
  if (bodem.totalMatches <= 0) return null;
  const t = getLibTranslator(locale, "lib-analysis");
  const labels = hitsByLayerLabel(bodem);
  return createSignal({
    key: "soil-contamination",
    label: t("soil.label"),
    category: "klimaat",
    value: bodem.totalMatches > 99 ? t("soil.valueMax") : t("soil.valueCount", { count: bodem.totalMatches }),
    severity: "attention",
    summary: t("soil.summary", {
      hits: labels.slice(0, 3).join("; "),
      more: labels.length > 3 ? t("soil.moreHitsSuffix") : "",
    }),
    action: t("soil.action"),
    confidence: "medium",
    spatialScale: "circa 200 m bbox rond dit adres",
    raw: {
      value: bodem.totalMatches,
      unit: "locaties",
      metric: "Aantal WFS-bbox matches (screening)",
    },
    available: true,
    evidence,
  });
}
