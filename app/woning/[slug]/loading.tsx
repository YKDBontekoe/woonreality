import { SiteHeader } from "@/components/site-header";

export default function PropertyLoading() {
  return (
    <main className="site-shell" aria-busy="true" aria-live="polite">
      <div className="container">
        <SiteHeader current="woning" />
        <section className="property-route-loading" aria-label="Woningcheck wordt geladen">
          <span className="sr-only">Woningcheck wordt geladen…</span>
          <div className="property-loading-heading" aria-hidden="true">
            <span className="property-loading-shimmer" />
            <span className="property-loading-shimmer" />
            <span className="property-loading-shimmer" />
          </div>
          <div className="property-loading-grid" aria-hidden="true">
            <div className="property-loading-card">
              <span className="property-loading-shimmer" />
              <span className="property-loading-shimmer" />
              <span className="property-loading-shimmer" />
              <span className="property-loading-shimmer" />
            </div>
            <div className="property-loading-card map" />
          </div>
        </section>
      </div>
    </main>
  );
}
