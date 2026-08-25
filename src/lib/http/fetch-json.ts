export const DEFAULT_SOURCE_TIMEOUT_MS = 15_000;

/**
 * Error for upstream open-data sources. The message deliberately contains
 * only the source label and HTTP status — never the full URL — so it is safe
 * in server logs and, worst case, in a user-facing message.
 */
export class SourceFetchError extends Error {
  readonly label: string;
  readonly status?: number;

  constructor(label: string, status?: number, options?: { cause?: unknown; timeout?: boolean }) {
    const reason = options?.timeout ? "time-out" : status ? `HTTP ${status}` : "onbereikbaar";
    super(`${label} ${reason}`);
    this.name = "SourceFetchError";
    this.label = label;
    this.status = status;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export type FetchJsonOptions = {
  /** Seconds for Next's data cache; omit combined with cache:"no-store" usage. */
  revalidate?: number;
  /** Explicit RequestCache override (e.g. "no-store") taking precedence over revalidate. */
  cache?: RequestCache;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  accept?: string;
};

type FetchUrl = string | URL;

function requestInit(options: FetchJsonOptions): RequestInit {
  const { revalidate, cache, timeoutMs = DEFAULT_SOURCE_TIMEOUT_MS, headers = {}, method, body, accept } = options;
  return {
    ...(method ? { method } : {}),
    ...(body ? { body } : {}),
    ...(cache ? { cache } : {}),
    headers: {
      ...(accept ? { Accept: accept } : {}),
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
    ...(revalidate !== undefined && !cache ? { next: { revalidate } } : {}),
  };
}

/**
 * Single request pipeline shared by every reader: applies timeout/status
 * discipline and normalizes every failure into a SourceFetchError so callers
 * and logs never see raw network errors.
 */
async function request<T>(url: FetchUrl, label: string, options: FetchJsonOptions, read: (response: Response) => Promise<T>): Promise<T> {
  try {
    const response = await fetch(url, requestInit(options));
    if (!response.ok) throw new SourceFetchError(label, response.status);
    return await read(response);
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new SourceFetchError(label, undefined, { timeout: true });
    throw new SourceFetchError(label, undefined, { cause: error });
  }
}

export function fetchJson<T>(url: FetchUrl, label: string, options: FetchJsonOptions = {}): Promise<T> {
  return request(url, label, options, (response) => response.json() as Promise<T>);
}

/** Text bodies (HTML indexes, XML downloads) with the same timeout/status discipline. */
export function fetchText(url: FetchUrl, label: string, options: FetchJsonOptions = {}): Promise<string> {
  return request(url, label, options, (response) => response.text());
}

export function fetchBuffer(url: FetchUrl, label: string, options: FetchJsonOptions = {}): Promise<Uint8Array> {
  return request(url, label, options, async (response) => new Uint8Array(await response.arrayBuffer()));
}

/**
 * POST JSON with the same guarantees. Kept separate from fetchJson because
 * cached POSTs are not a thing in Next's data cache.
 */
export async function postJson<T>(url: FetchUrl, label: string, payload: unknown, options: Omit<FetchJsonOptions, "method" | "body"> = {}): Promise<T> {
  return fetchJson<T>(url, label, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    method: "POST",
    body: JSON.stringify(payload),
  });
}
