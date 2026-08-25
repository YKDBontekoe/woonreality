"use client";

import { ArrowLeft, GitCompare } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Link } from "@/src/lib/i18n/navigation";
import { PageShell } from "@/components/ui/page-shell";

type LinkHref = ComponentProps<typeof Link>["href"];

/**
 * Shared compare-page plumbing: copy-link-with-fallback, empty-state shell and
 * URL rewriting used by both the property and the place comparison dashboards.
 */
export function useShareUrl(buildUrl: () => string, copyPrompt = "") {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = buildUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(copyPrompt, url);
    }
  }
  return { copied, share };
}

/** Rewrites the current URL so a refresh does not resurrect removed entries. */
export function removeIdsFromUrl(ids: string[], param: string, minInUrl = 1) {
  const url = new URL(window.location.href);
  if (ids.length >= minInUrl) url.searchParams.set(param, ids.join(","));
  else url.searchParams.delete(param);
  window.history.replaceState(null, "", url.toString());
}

export type CompareEmptyStateStep = { title: string; text: string };

export function CompareEmptyState({
  titleId,
  eyebrow,
  title,
  copy,
  steps,
  backLabel,
  ctaLabel,
  backHref = "/#zoek-adres",
  ctaHref = "/#zoek-adres",
  alert,
}: {
  titleId: string;
  eyebrow: string;
  title: string;
  copy: string;
  steps: [CompareEmptyStateStep, CompareEmptyStateStep, CompareEmptyStateStep];
  backLabel: string;
  ctaLabel: string;
  backHref?: LinkHref;
  ctaHref?: LinkHref;
  alert?: { text: string; role?: "status" | "alert" };
}) {
  return (
    <PageShell current="vergelijken" className="comparison-shell">
      <section className="comparison-empty" aria-labelledby={titleId}>
        <Link className="back-link" href={backHref}><ArrowLeft size={14} /> {backLabel}</Link>
        <div className="eyebrow"><GitCompare size={13} /> {eyebrow}</div>
        <h1 id={titleId}>{title}</h1>
        <p className="hero-copy">{copy}</p>
        {alert ? <p className="compare-alert" role={alert.role ?? "status"}>{alert.text}</p> : null}
        <ol className="comparison-empty-steps">
          {steps.map((step, index) => (
            <li key={index}><span>{index + 1}</span><div><strong>{step.title}</strong><small>{step.text}</small></div></li>
          ))}
        </ol>
        <Link className="primary-button" href={ctaHref}>{ctaLabel}</Link>
      </section>
    </PageShell>
  );
}
