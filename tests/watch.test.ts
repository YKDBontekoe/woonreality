import assert from "node:assert/strict";
import test from "node:test";
import { buildWatchDigest, diffWatchDigests, watchAlertHash, WATCH_COMPONENT_DELTA, WATCH_OVERALL_DELTA } from "../src/lib/watch";

function digestInput(overrides: Partial<{ overallScore: number; woz: number; fundering: number; capturedAt: string }> = {}) {
  return {
    overallScore: overrides.overallScore ?? 6.4,
    scoringVersion: "2026.08.v2",
    generatedAt: overrides.capturedAt ?? "2026-08-01T10:00:00.000Z",
    components: [
      { key: "woz", label: "WOZ-verhouding", score: overrides.woz ?? 7 },
      { key: "fundering", label: "Funderingsrisico", score: overrides.fundering ?? 5 },
      { key: "mobiliteit", label: "Mobiliteit", score: 8 },
    ],
  };
}

test("buildWatchDigest keeps scored components keyed by signal key", () => {
  const digest = buildWatchDigest(digestInput());
  assert.equal(digest.overallScore, 6.4);
  assert.equal(digest.components.woz.label, "WOZ-verhouding");
  assert.equal(Object.keys(digest.components).length, 3);
});

test("buildWatchDigest skips components without a key", () => {
  const input = { ...digestInput(), components: [{ key: "", label: "Leeg", score: 3 }, ...digestInput().components] };
  assert.equal(Object.keys(buildWatchDigest(input).components).length, 3);
});

test("diffWatchDigests reports nothing on first snapshot", () => {
  const digest = buildWatchDigest(digestInput());
  assert.deepEqual(diffWatchDigests({ ...digest, components: {} }, digest), []);
});

test("diffWatchDigests flags overall score beyond the noise threshold", () => {
  const previous = buildWatchDigest(digestInput({ overallScore: 6.4 }));
  const current = buildWatchDigest(digestInput({ overallScore: 6.4 + WATCH_OVERALL_DELTA, capturedAt: "2026-08-20T10:00:00.000Z" }));
  const changes = diffWatchDigests(previous, current);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, "overall");
  assert.equal(changes[0].from, 6.4);
});

test("diffWatchDigests ignores sub-threshold component drift", () => {
  const previous = buildWatchDigest(digestInput({ woz: 7 }));
  const current = buildWatchDigest(digestInput({ woz: 7.5 }));
  assert.deepEqual(diffWatchDigests(previous, current), []);
});

test("diffWatchDigests flags moved components sorted by impact", () => {
  const previous = buildWatchDigest(digestInput({ fundering: 5, woz: 7 }));
  const current = buildWatchDigest(digestInput({ fundering: 5 - WATCH_COMPONENT_DELTA, woz: 7 + 2 }));
  const changes = diffWatchDigests(previous, current);
  assert.deepEqual(changes.map((change) => change.key), ["woz", "fundering"]);
  assert.equal(changes[1].label, "Funderingsrisico");
});

test("diffWatchDigests stays silent across scoring versions", () => {
  const previous = buildWatchDigest(digestInput());
  const current = buildWatchDigest({ ...digestInput({ overallScore: 2 }), scoringVersion: "2030.01.v1" });
  assert.deepEqual(diffWatchDigests(previous, current), []);
});

test("watchAlertHash is stable per bag id and change", () => {
  const change = { key: "woz", label: "WOZ", from: 7, to: 9 };
  assert.equal(watchAlertHash("1234", change), "1234:woz:7:9");
});
