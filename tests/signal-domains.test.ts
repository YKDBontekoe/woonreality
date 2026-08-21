import assert from "node:assert/strict";
import test from "node:test";
import { domainsFromSignals } from "@/src/lib/analysis/signal-domains";
import type { Signal } from "@/src/lib/types";

test("domainsFromSignals builds buurt domain summaries from place signals", () => {
  const signals: Signal[] = [
    {
      key: "schools",
      label: "Scholen en opvang",
      category: "buurt",
      value: "0,5 km",
      score: 8,
      severity: "good",
      summary: "School nearby",
      action: "Check route",
      confidence: "medium",
      spatialScale: "gemeente",
      availability: "available",
      evidence: [],
    },
  ];

  const domains = domainsFromSignals(signals);
  assert.equal(domains.length, 1);
  assert.equal(domains[0]?.key, "buurt");
  assert.equal(domains[0]?.label, "Buurt & voorzieningen");
  assert.deepEqual(domains[0]?.signalKeys, ["schools"]);
});
