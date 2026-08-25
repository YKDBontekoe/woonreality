"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/components/hooks/use-api";

type GeneratedStatusBody<TReport> = {
  status: AiStatus;
  report?: TReport | null;
};

export type AiStatus = "missing" | "generating" | "ready" | "stale" | "failed" | "unavailable";

/**
 * Shared status→generate flow for AI-backed resources (research report,
 * listing insights): GET the current status; when missing or stale, POST to
 * trigger generation; abort everything when dependencies change or unmount.
 *
 * Previously duplicated verbatim for both resources in property-dashboard.
 */
export function useGeneratedResource<TReport>(options: {
  endpoint: string;
  /** Fetching starts only once this is true. */
  enabled: boolean;
  resetKey?: string;
}): { report: TReport | null; status: AiStatus } {
  const { endpoint, enabled, resetKey } = options;
  const [report, setReport] = useState<TReport | null>(null);
  const [status, setStatus] = useState<AiStatus>("missing");

  useEffect(() => {
    if (!enabled) return;
    setReport(null);
    setStatus("generating");
    const controller = new AbortController();

    async function load() {
      try {
        const statusResult = await apiFetch<GeneratedStatusBody<TReport>>(endpoint, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (statusResult.status === 503) {
          setStatus("unavailable");
          return;
        }
        const body = statusResult.data;
        if (!body) {
          setStatus("failed");
          return;
        }
        setStatus(body.status);
        if (body.report) {
          setReport(body.report);
          return;
        }
        if (body.status !== "missing" && body.status !== "stale") return;
        setStatus("generating");
        const generateResult = await apiFetch<GeneratedStatusBody<TReport>>(endpoint, {
          method: "POST",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const generateBody = generateResult.data;
        if (!generateBody) {
          setStatus("failed");
          return;
        }
        setStatus(generateBody.status);
        if (generateBody.report) setReport(generateBody.report);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setStatus("failed");
      }
    }

    void load();
    return () => controller.abort();
  }, [endpoint, enabled, resetKey]);

  return { report, status };
}
