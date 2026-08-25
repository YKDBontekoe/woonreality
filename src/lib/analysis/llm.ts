import { GatewayInternalServerError, GatewayRateLimitError, GatewayResponseError } from "@ai-sdk/gateway";
import type { AiTokenUsage } from "@/src/lib/types";

type UsageSource = {
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number };
    outputTokenDetails?: { reasoningTokens?: number };
  };
};

export function usageFromResult(result: UsageSource): AiTokenUsage {
  return {
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    totalTokens: result.usage?.totalTokens ?? 0,
    reasoningTokens: result.usage?.outputTokenDetails?.reasoningTokens ?? 0,
    cachedInputTokens: result.usage?.inputTokenDetails?.cacheReadTokens ?? 0,
  };
}

export const EMPTY_TOKEN_USAGE: AiTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export function addUsage(left: AiTokenUsage, right: AiTokenUsage): AiTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    reasoningTokens: (left.reasoningTokens ?? 0) + (right.reasoningTokens ?? 0),
    cachedInputTokens: (left.cachedInputTokens ?? 0) + (right.cachedInputTokens ?? 0),
  };
}

export function resolveModel(name: string | undefined, fallback: string) {
  return name?.trim() || fallback;
}

/**
 * Prompt JSON without null/undefined/empty-string fields: sparse listings
 * otherwise serialize dozens of `"field":null` pairs that cost input tokens.
 */
export function compactJson(value: unknown) {
  return JSON.stringify(prune(value));
}

function prune(value: unknown): unknown {
  if (value === null || value === "" || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((item) => prune(item)).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const pruned = prune(item);
      if (pruned !== undefined) out[key] = pruned;
    }
    return out;
  }
  return value;
}

const RETRYABLE_DELAYS_MS = [5_000, 15_000];

function isRetryableGatewayError(error: unknown) {
  return GatewayRateLimitError.isInstance(error)
    || GatewayResponseError.isInstance(error)
    || (GatewayInternalServerError.isInstance(error) && /rate-limited|rate limit/i.test(error.message));
}

/**
 * Free-tier and bursty gateway limits surface as transient 429/5xx. One
 * retry with backoff keeps a whole report from dying on a single blip.
 */
export async function withLlmRetry<T>(run: () => Promise<T>, delayMs: (ms: number) => Promise<void> = wait): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRYABLE_DELAYS_MS.length; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === RETRYABLE_DELAYS_MS.length || !isRetryableGatewayError(error)) throw error;
      await delayMs(RETRYABLE_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
