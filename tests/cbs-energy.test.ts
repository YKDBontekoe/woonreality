import assert from "node:assert/strict";
import test from "node:test";
import { FALLBACK_TARIFFS, fetchLatestEnergyTariffs } from "../src/lib/sources/cbs-energy";

test("fetchLatestEnergyTariffs falls back on rejected fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    const result = await fetchLatestEnergyTariffs();
    assert.deepEqual(result, FALLBACK_TARIFFS);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchLatestEnergyTariffs falls back on invalid JSON", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    // Response.json() will reject due to invalid JSON body.
    return new Response("not-json", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await fetchLatestEnergyTariffs();
    assert.deepEqual(result, FALLBACK_TARIFFS);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

