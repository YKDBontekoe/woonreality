import assert from "node:assert/strict";
import test from "node:test";
import {
  interpretSignal,
  interpretationForDomain,
  SIGNAL_BENCHMARKS,
} from "@/src/lib/signal-interpretation";
import type { DomainSummary, Signal } from "@/src/lib/types";

function signal(overrides: Partial<Signal>): Signal {
  return {
    key: "air",
    label: "Luchtkwaliteit",
    category: "gezondheid",
    value: "18 µg/m³ NO₂",
    severity: "neutral",
    summary: "Test",
    action: "Test",
    confidence: "medium",
    evidence: [],
    availability: "available",
    ...overrides,
  };
}

test("interpretSignal labels air below WHO as good", () => {
  const result = interpretSignal(
    signal({
      raw: { value: 8, unit: "µg/m³", metric: "RIVM jaargemiddelde NO₂" },
    }),
  );
  assert.ok(result);
  assert.equal(result?.verdict, "good");
  assert.equal(result?.label, "Onder WHO-richtlijn");
  assert.equal(result?.benchmark?.referenceValue, SIGNAL_BENCHMARKS.WHO_NO2);
});

test("interpretSignal compares crime to NL average", () => {
  const low = interpretSignal(
    signal({
      key: "crime",
      label: "Misdrijven",
      raw: { value: 30, unit: "per 1.000 inwoners", metric: "geregistreerde misdrijven" },
    }),
  );
  const high = interpretSignal(
    signal({
      key: "crime",
      label: "Misdrijven",
      raw: { value: 70, unit: "per 1.000 inwoners", metric: "geregistreerde misdrijven" },
    }),
  );
  assert.equal(low?.label, "Lager dan NL-gemiddelde");
  assert.equal(high?.label, "Hoger dan NL-gemiddelde");
});

test("interpretSignal explains SES relative to zero", () => {
  const result = interpretSignal(
    signal({
      key: "ses",
      label: "SES",
      category: "buurt",
      raw: { value: 0.62, unit: "SES-WOA", metric: "CBS gemiddelde totaalscore" },
    }),
  );
  assert.ok(result);
  assert.match(result?.explainer ?? "", /Nederland ≈ 0/);
  assert.equal(result?.label, "Boven NL-gemiddelde");
});

test("interpretSignal handles unavailable signals", () => {
  const result = interpretSignal(signal({ availability: "unavailable" }));
  assert.equal(result?.label, "Geen data");
});

test("interpretationForDomain summarizes domain labels", () => {
  const domain: DomainSummary = {
    key: "buurt",
    label: "Buurt & voorzieningen",
    score: 6,
    signalKeys: ["crime", "ses"],
    available: true,
    summary: "Gemiddeld.",
    hasUnscoredAttention: false,
  };
  const text = interpretationForDomain(domain, [
    signal({
      key: "crime",
      category: "buurt",
      raw: { value: 30, unit: "per 1.000 inwoners", metric: "geregistreerde misdrijven" },
    }),
    signal({
      key: "ses",
      category: "buurt",
      raw: { value: 0.1, unit: "SES-WOA", metric: "CBS gemiddelde totaalscore" },
    }),
  ]);
  assert.match(text, /Buurt & voorzieningen:/);
});

test("noise and ses benchmark markers share the you-marker scale", () => {
  const noise = interpretSignal(
    signal({
      key: "noise",
      label: "Geluid",
      raw: { value: 60, unit: "dB", metric: "Lden wegverkeer" },
    }),
  );
  const noiseYou = noise?.benchmark?.markers.find((marker) => marker.kind === "you");
  const noiseReference = noise?.benchmark?.markers.find((marker) => marker.kind === "reference");
  assert.equal(noiseYou?.position, noise?.benchmark?.position);
  assert.equal(noiseReference?.position, 29);

  const ses = interpretSignal(
    signal({
      key: "ses",
      label: "SES",
      category: "buurt",
      raw: { value: 0.1, unit: "SES-WOA", metric: "CBS gemiddelde totaalscore" },
    }),
  );
  const sesReference = ses?.benchmark?.markers.find((marker) => marker.kind === "reference");
  assert.equal(sesReference?.position, 50);
  assert.equal(ses?.benchmark?.precision, 3);
});

test("air interpretation does not treat NOISE as NO2 and parses km strings", () => {
  const pm = interpretSignal(
    signal({
      value: "12 µg/m³",
      raw: { value: 12, unit: "µg/m³", metric: "RIVM jaargemiddelde PM2.5" },
    }),
  );
  assert.equal(pm?.benchmark?.referenceValue, SIGNAL_BENCHMARKS.WHO_PM25);
  assert.equal(pm?.label, "Boven EU-jaarlimiet");

  const transit = interpretSignal(
    signal({
      key: "transit",
      label: "OV",
      category: "mobiliteit",
      value: "1,2 km",
      unit: undefined,
      raw: undefined,
    }),
  );
  assert.equal(transit?.label, "Verder weg");
});
