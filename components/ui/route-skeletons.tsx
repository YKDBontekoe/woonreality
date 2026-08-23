import { SiteHeader } from "@/components/site-header";
import type { HeaderCurrent } from "@/components/ui/page-shell";

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
  return (
    <SkeletonShell current="vergelijken" label="Vergelijking laden…">
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
  return (
    <SkeletonShell current="home" label="Plek-analyse laden…">
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
  return (
    <SkeletonShell current="aankoop" label="Aankoopomgeving laden…">
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
