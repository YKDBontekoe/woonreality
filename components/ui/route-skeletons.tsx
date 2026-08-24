"use client";

import { SiteHeader } from "@/components/site-header";
import type { HeaderCurrent } from "@/components/ui/page-shell";
import { useTranslations } from "next-intl";

/**
 * Route-level loading skeletons. They reuse the shimmer primitives from
 * marketing/purchase css so every workspace shows the same loading language,
 * and they render the same SiteHeader as the loaded page so navigation never
 * jumps between states.
 */

function SkeletonShell({ current, label, children }: { current: HeaderCurrent; label: string; children: React.ReactNode }) {
  return (
    <main className="site-shell" aria-busy="true">
      <div className="container">
        <SiteHeader current={current} />
        <section role="status" aria-live="polite" aria-label={label}>
          <span className="sr-only">{label}</span>
          <div className="property-loading-heading" aria-hidden="true">
            <span className="property-loading-shimmer" />
            <span className="property-loading-shimmer" />
            <span className="property-loading-shimmer" />
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

export function ComparisonSkeleton() {
  const t = useTranslations("common");
  return (
    <SkeletonShell current="vergelijken" label={t("loadingComparison")}>
      <div className="comparison-loading-cards" aria-hidden="true">
        <div className="comparison-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
        <div className="comparison-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function PlaceSkeleton() {
  const t = useTranslations("common");
  return (
    <SkeletonShell current="home" label={t("loadingPlace")}>
      <div className="property-loading-grid" aria-hidden="true">
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
        <div className="property-loading-card map" />
      </div>
    </SkeletonShell>
  );
}

export function CockpitSkeleton() {
  const t = useTranslations("common");
  return (
    <SkeletonShell current="aankoop" label={t("loadingCockpit")}>
      <div className="cockpit-loading-grid" aria-hidden="true">
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function CaseSkeleton() {
  const t = useTranslations("common");
  return (
    <SkeletonShell current="aankoop" label={t("loadingCase")}>
      <div className="cockpit-loading-grid" aria-hidden="true">
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
        <div className="property-loading-card map">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function MortgageSkeleton() {
  const t = useTranslations("common");
  return (
    <SkeletonShell current="hypotheek" label={t("loadingMortgage")}>
      <div className="cockpit-loading-grid" aria-hidden="true">
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
        <div className="property-loading-card map">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function KaartSkeleton() {
  const t = useTranslations("common");
  return (
    <SkeletonShell current="kaart" label={t("loadingMap")}>
      <div className="property-loading-grid" aria-hidden="true">
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
        <div className="property-loading-card map" />
      </div>
    </SkeletonShell>
  );
}

export function AuthSkeleton() {
  const t = useTranslations("common");
  return (
    <SkeletonShell current="login" label={t("loadingLogin")}>
      <div className="comparison-loading-cards" aria-hidden="true">
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function OnboardingSkeleton() {
  const t = useTranslations("common");
  return (
    <SkeletonShell current="aankoop" label={t("loadingOnboarding")}>
      <div className="comparison-loading-cards" aria-hidden="true">
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function ExtensionSkeleton() {
  const t = useTranslations("common");
  return (
    <SkeletonShell current="extensie" label={t("loadingExtension")}>
      <div className="cockpit-loading-grid" aria-hidden="true">
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
        <div className="property-loading-card">
          <span className="property-loading-shimmer" />
          <span className="property-loading-shimmer" />
        </div>
      </div>
    </SkeletonShell>
  );
}
