import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import type { BodemContext } from "@/src/lib/sources/bodem";

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
export function soilSignal(input: { bodem: BodemContext; evidence: Evidence }): Signal | null {
  const { bodem, evidence } = input;
  if (bodem.totalMatches <= 0) return null;
  const labels = hitsByLayerLabel(bodem);
  return {
    key: "soil-contamination",
    label: "Bodemverontreiniging (indicatie)",
    category: "klimaat",
    value: bodem.totalMatches > 99 ? "99+ locaties" : `${bodem.totalMatches} locatie(s)`,
    severity: "attention",
    summary: `In beschikbare regionale bodemregister-lagen zijn indicaties gevonden bij dit adres: ${labels.slice(0, 3).join("; ")}.${
      labels.length > 3 ? " (meer hits mogelijk)" : ""
    } Dit is screening op basis van WFS-bbox-hits; voor zekerheid check je het provinciaal/gemeentelijk bodemloket via Bodemloket.`,
    action: "Check Bodemloket.nl en vraag bij de bevoegde omgevingsdienst naar de relevante bodemrapportage/dossierstatus.",
    confidence: "medium",
    spatialScale: "circa 200 m bbox rond dit adres",
    raw: {
      value: bodem.totalMatches,
      unit: "locaties",
      metric: "Aantal WFS-bbox matches (screening)",
    },
    evidence: [evidence],
    availability: "available",
  };
}
