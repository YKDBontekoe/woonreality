import assert from "node:assert/strict";
import test from "node:test";
import { clamp, mean, round1, roundToStep } from "@/src/lib/math";

test("clamp keeps values inside the default 0-10 band", () => {
  assert.equal(clamp(5), 5);
  assert.equal(clamp(-3), 0);
  assert.equal(clamp(42), 10);
});

test("clamp honours a custom band", () => {
  assert.equal(clamp(150, 0, 100), 100);
  assert.equal(clamp(-1, -10, 10), -1);
});

test("round1 rounds to one decimal", () => {
  assert.equal(round1(6.44), 6.4);
  assert.equal(round1(6.45), 6.5);
});

test("mean returns null for empty input and the average otherwise", () => {
  assert.equal(mean([]), null);
  assert.equal(mean([2, 4, 9]), 5);
});

test("roundToStep snaps to coarse steps for display", () => {
  assert.equal(roundToStep(117.4, 10), 120);
  assert.equal(roundToStep(1149, 100), 1100);
});
