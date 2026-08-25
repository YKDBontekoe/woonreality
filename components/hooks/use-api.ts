"use client";

import { useCallback, useEffect, useState } from "react";
import { loginHref } from "@/src/lib/login-href";

/** Sends the visitor to /login, preserving the current location for the post-login redirect. */
export function redirectToLogin() {
  window.location.href = loginHref();
}

export type ApiResult<T> = {
  status: number;
  ok: boolean;
  data: T | null;
  /** Server-provided error message from an `{ error }` body, when present. */
  error: string | null;
};

/**
 * Single client-side fetch primitive: JSON parsing, `{ error }` extraction and
 * abort handling in one place. Replaces the AbortController boilerplate that
 * was previously hand-rolled in every dashboard component.
 */
export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<ApiResult<T>> {
  const { json, headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
  });
  let data: T | null = null;
  let error: string | null = null;
  try {
    const body = (await response.json()) as T & { error?: string };
    data = body;
    if (!response.ok && body?.error != null) error = String(body.error);
  } catch {
    // Empty or non-JSON body; leave data/error as-is.
  }
  return { status: response.status, ok: response.ok, data, error };
}

function isAbort(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}

export type UseApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string;
};

/**
 * Fetches a JSON endpoint with automatic abort-on-change/unmount and a retry
 * counter. Pass `null` as url to skip fetching (e.g. while a dependency such
 * as the analysis is still loading).
 */
export function useApi<T>(url: string | null, options: { errorMessage: string; cache?: RequestCache } = { errorMessage: "" }) {
  const { errorMessage, cache = "no-store" } = options;
  const [state, setState] = useState<UseApiState<T>>({ data: null, loading: Boolean(url), error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: "" });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true }));
    apiFetch<T>(url, { signal: controller.signal, cache })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok && !result.data) {
          setState({ data: null, loading: false, error: result.error ?? errorMessage });
          return;
        }
        setState({ data: result.data, loading: false, error: "" });
      })
      .catch((caught) => {
        if (isAbort(caught)) return;
        setState({ data: null, loading: false, error: caught instanceof Error ? caught.message : errorMessage });
      });
    return () => controller.abort();
  }, [url, attempt, cache, errorMessage]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return { ...state, reload };
}
