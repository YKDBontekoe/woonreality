export type TtlCacheOptions = {
  /** Entries expire after this many milliseconds. */
  ttlMs: number;
  /**
   * Maximum number of live entries; eviction is LRU (insertion order is
   * refreshed on read). Keeps process memory bounded for hot caches.
   */
  limit?: number;
};

export type TtlCache<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  keys(): IterableIterator<string>;
  readonly size: number;
};

type Entry<T> = { value: T; expiresAt: number };

/**
 * Bounded in-memory TTL cache with LRU eviction ordering. Shared replacement
 * for the ad-hoc Map-based caches previously duplicated across source adapters
 * and the analysis service.
 */
export function createTtlCache<T>({ ttlMs, limit }: TtlCacheOptions): TtlCache<T> {
  const store = new Map<string, Entry<T>>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      // Refresh recency so `limit` evicts the least recently used entry.
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      if (limit !== undefined && limit > 0 && !store.has(key)) {
        while (store.size >= limit) {
          const oldest = store.keys().next().value;
          if (oldest === undefined) break;
          store.delete(oldest);
        }
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(key) {
      store.delete(key);
    },
    keys: store.keys.bind(store),
    get size() {
      return store.size;
    },
  };
}

/**
 * Deduplicates concurrent async work per key: while a promise for `key` is in
 * flight every caller receives that same promise instead of starting a second
 * computation. The entry is removed once settled.
 */
export function createInflightDeduper<P>() {
  const inflight = new Map<string, Promise<P>>();
  return function run(key: string, task: () => Promise<P>): Promise<P> {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = task().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  };
}

/**
 * Sliding-window pool: starts the next item as soon as one finishes instead of
 * waiting for whole batches, keeping upstream concurrency at `concurrency`.
 * Errors must be handled inside `worker`; the pool only waits for completion.
 */
export async function runPool<T>(
  queue: T[],
  worker: (item: T) => Promise<unknown>,
  concurrency: number,
): Promise<void> {
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive number");
  }
  const pending = [...queue];
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    for (let item = pending.shift(); item !== undefined; item = pending.shift()) {
      await worker(item);
    }
  });
  await Promise.all(workers);
}
