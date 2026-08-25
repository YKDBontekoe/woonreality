import assert from "node:assert/strict";
import test from "node:test";
import { GatewayRateLimitError } from "@ai-sdk/gateway";
import { addUsage, compactJson, EMPTY_TOKEN_USAGE, resolveModel, usageFromResult, withLlmRetry } from "@/src/lib/analysis/llm";

test("compactJson drops null, undefined and empty-string fields", () => {
  const json = compactJson({
    a: null,
    b: undefined,
    c: "",
    d: "waarde",
    e: { f: null, g: 0, h: "x" },
    i: [null, "y", "", 2],
  });
  assert.deepEqual(JSON.parse(json), { d: "waarde", e: { g: 0, h: "x" }, i: ["y", 2] });
});

test("usageFromResult maps token details and tolerates missing usage", () => {
  const usage = usageFromResult({
    usage: {
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      inputTokenDetails: { cacheReadTokens: 60 },
      outputTokenDetails: { reasoningTokens: 12 },
    },
  });
  assert.deepEqual(usage, {
    inputTokens: 100,
    outputTokens: 40,
    totalTokens: 140,
    reasoningTokens: 12,
    cachedInputTokens: 60,
  });
  assert.deepEqual(usageFromResult({}), { ...EMPTY_TOKEN_USAGE, reasoningTokens: 0, cachedInputTokens: 0 });
});

test("addUsage sums optional counters", () => {
  const left = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
  const right = { inputTokens: 10, outputTokens: 20, totalTokens: 30, reasoningTokens: 4, cachedInputTokens: 5 };
  assert.deepEqual(addUsage(left, right), {
    inputTokens: 11,
    outputTokens: 22,
    totalTokens: 33,
    reasoningTokens: 4,
    cachedInputTokens: 5,
  });
});

test("resolveModel trims env values and falls back", () => {
  assert.equal(resolveModel("  openai/gpt-5.6-luna  ", "fallback"), "openai/gpt-5.6-luna");
  assert.equal(resolveModel("   ", "fallback"), "fallback");
  assert.equal(resolveModel(undefined, "fallback"), "fallback");
});

test("withLlmRetry retries gateway rate limits and succeeds", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withLlmRetry(async () => {
    calls += 1;
    if (calls < 3) throw new GatewayRateLimitError({ message: "rate limited" });
    return "ok";
  }, (ms) => {
    delays.push(ms);
    return Promise.resolve();
  });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.equal(delays.length, 2);
});

test("withLlmRetry does not retry non-gateway errors", async () => {
  let calls = 0;
  await assert.rejects(
    withLlmRetry(async () => {
      calls += 1;
      throw new Error("permanent");
    }, () => Promise.resolve()),
    /permanent/,
  );
  assert.equal(calls, 1);
});

test("withLlmRetry exhausts retries on persistent rate limits", async () => {
  let calls = 0;
  await assert.rejects(
    withLlmRetry(async () => {
      calls += 1;
      throw new GatewayRateLimitError({ message: "rate limited" });
    }, () => Promise.resolve()),
    (error) => GatewayRateLimitError.isInstance(error),
  );
  assert.equal(calls, 3);
});
