import assert from "node:assert/strict";
import { test } from "node:test";
import { createInflightDeduper, createTtlCache, runPool } from "@/src/lib/cache/ttl";

test("ttl cache expires entries after ttlMs", async (t) => {
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  t.after(() => {
    Date.now = realNow;
  });
  const cache = createTtlCache<string>({ ttlMs: 500 });
  cache.set("a", "1");
  assert.equal(cache.get("a"), "1");
  now += 499;
  assert.equal(cache.get("a"), "1");
  now += 2;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 0);
});

test("ttl cache evicts least recently used beyond limit", () => {
  const cache = createTtlCache<number>({ ttlMs: 60_000, limit: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
});

test("ttl cache set on existing key does not evict itself", () => {
  const cache = createTtlCache<number>({ ttlMs: 60_000, limit: 1 });
  cache.set("a", 1);
  cache.set("a", 2);
  assert.equal(cache.get("a"), 2);
});

test("inflight deduper shares one promise per key and clears after settle", async () => {
  const dedupe = createInflightDeduper<number>();
  let calls = 0;
  const task = () =>
    new Promise<number>((resolve) => {
      calls += 1;
      setTimeout(() => resolve(42), 10);
    });
  const [first, second] = await Promise.all([dedupe("k", task), dedupe("k", task)]);
  assert.equal(first, 42);
  assert.equal(second, 42);
  assert.equal(calls, 1);
  await dedupe("k", task);
  assert.equal(calls, 2);
});

test("inflight deduper removes failed promise so retries are possible", async () => {
  const dedupe = createInflightDeduper<number>();
  await assert.rejects(dedupe("boom", async () => {
    throw new Error("nope");
  }), /nope/);
  assert.equal(await dedupe("boom", async () => 7), 7);
});

test("runPool processes all items with bounded concurrency", async () => {
  let active = 0;
  let peak = 0;
  const processed: number[] = [];
  await runPool([1, 2, 3, 4, 5], async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    processed.push(item);
    active -= 1;
  }, 2);
  assert.deepEqual([...processed].sort(), [1, 2, 3, 4, 5]);
  assert.ok(peak <= 2);
});

test("runPool rejects invalid concurrency", async () => {
  await assert.rejects(runPool([1], async () => undefined, 0), RangeError);
});
