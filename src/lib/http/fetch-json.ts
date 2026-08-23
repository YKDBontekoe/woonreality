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
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  accept?: string;
};

type FetchUrl = string | URL;

function requestInit(url: FetchUrl, label: string, options: FetchJsonOptions): RequestInit {
  const { revalidate, timeoutMs = DEFAULT_SOURCE_TIMEOUT_MS, headers = {}, method, body, accept } = options;
  return {
    ...(method ? { method } : {}),
    ...(body ? { body } : {}),
    headers: {
      ...(accept ? { Accept: accept } : {}),
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
    ...(revalidate !== undefined ? { next: { revalidate } } : {}),
  };
}

async function readResponse(response: Response, url: FetchUrl, label: string): Promise<Response> {
  if (!response.ok) throw new SourceFetchError(label, response.status);
  return response;
}

export async function fetchJson<T>(url: FetchUrl, label: string, options: FetchJsonOptions = {}): Promise<T> {
  try {
    const response = await fetch(url, requestInit(url, label, options));
    await readResponse(response, url, label);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new SourceFetchError(label, undefined, { timeout: true });
    throw new SourceFetchError(label, undefined, { cause: error });
  }
}

/** Text bodies (HTML indexes, XML downloads) with the same timeout/status discipline. */
export async function fetchText(url: FetchUrl, label: string, options: FetchJsonOptions = {}): Promise<string> {
  try {
    const response = await fetch(url, requestInit(url, label, options));
    await readResponse(response, url, label);
    return await response.text();
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new SourceFetchError(label, undefined, { timeout: true });
    throw new SourceFetchError(label, undefined, { cause: error });
  }
}

export async function fetchBuffer(url: FetchUrl, label: string, options: FetchJsonOptions = {}): Promise<Uint8Array> {
  try {
    const response = await fetch(url, requestInit(url, label, options));
    await readResponse(response, url, label);
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new SourceFetchError(label, undefined, { timeout: true });
    throw new SourceFetchError(label, undefined, { cause: error });
  }
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
