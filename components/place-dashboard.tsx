"use client";

import { ArrowLeft, GitCompare, MapPinned, Users } from "lucide-react";
import { Link } from "@/src/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { SignalExplorer } from "@/components/property/signal-explorer";
import { PageShell } from "@/components/ui/page-shell";
import { domainsFromSignals } from "@/src/lib/analysis/signal-domains";
import { saveStoredPlace } from "@/src/lib/place-compare";
import { placeKindLabels } from "@/src/lib/place-labels";
import type { Analysis, PlaceAnalysis, PlaceKind } from "@/src/lib/types";
import { loginHref } from "@/src/lib/login-href";

function formatInhabitants(value?: number) {
  if (value == null) return "—";
  return value.toLocaleString("nl-NL");
}

function formatWoz(value?: number) {
  if (value == null) return "—";
  return `€ ${Math.round(value * 1000).toLocaleString("nl-NL")}`;
}

export function PlaceDashboard({ kind, code }: { kind: PlaceKind; code: string }) {
  const [place, setPlace] = useState<PlaceAnalysis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const t = useTranslations("plek");
  const router = useRouter();
  const [retryCount, setRetryCount] = useState(0);

  function startPlaceComparison() {
    if (!place) return;
    saveStoredPlace({ kind, code });
    router.push(`/vergelijken?places=${kind}:${encodeURIComponent(code)}`);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void fetch(`/api/place/${encodeURIComponent(kind)}/${encodeURIComponent(code)}?retry=${retryCount}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = loginHref();
          return null;
        }
        const body = await response.json() as { place?: PlaceAnalysis; error?: string };
        if (!response.ok) throw new Error(body.error ?? t("loadFailedError"));
        return body.place ?? null;
      })
      .then((next) => {
        if (cancelled) return;
        setPlace(next);
        if (!next) setError(t("notFoundError"));
      })
      .catch((caught) => {
        if (cancelled) return;
        setPlace(null);
        setError(caught instanceof Error ? caught.message : t("loadFailedError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, code, retryCount, t]);

  const analysisStub = useMemo<Analysis | null>(() => {
    if (!place) return null;
    return {
      property: {
        bagVboId: "",
        bagPandIds: [],
        addressLabel: place.name,
        street: place.name,
        houseNumber: 0,
        postcode: "",
        city: place.subtitle ?? place.name,
        coordinates: place.coordinates,
        isResidential: true,
      },
      overallScore: 0,
      analysisVersion: "place",
      scoringVersion: "place",
      signals: place.signals,
      components: [],
      evidence: [],
      generatedAt: place.generatedAt,
      sources: place.sources.map((source) => source.source),
      domains: domainsFromSignals(place.signals),
      everydayInsights: [],
      highlights: [],
      dataCoverage: { available: 0, total: 0, label: "" },
      sourceStatuses: place.sources,
      knownGaps: [],
      nearbyProperties: [],
    };
  }, [place]);

  const searchSeed = place ? [place.name, place.subtitle].filter(Boolean).join(", ") : "";

  return (
    <PageShell current="home" className="place-shell">
      <div className="place-dashboard">
        <Link className="text-link place-back" href="/">
          <ArrowLeft size={16} aria-hidden="true" /> {t("backToSearch")}
        </Link>

        {loading && <div className="place-loading" role="status">{t("loadingPlace")}</div>}
        {error && !loading && (
          <div className="place-error" role="alert">
            {error}{" "}
            {place === null && error !== t("notFoundError") && (
              <button className="text-link" type="button" onClick={() => setRetryCount((count) => count + 1)}>{t("retry")}</button>
            )}
          </div>
        )}

        {place && analysisStub && (
          <>
            <header className="place-hero">
              <div className="place-hero-copy">
                <span className="place-kind-badge">{placeKindLabels[place.kind]}</span>
                <h1>{place.name}</h1>
                {place.subtitle && <p>{place.subtitle}</p>}
                <p className="place-hero-note">
                  {t("heroNote")}
                </p>
              </div>
              <div className="place-kpis">
                <div className="place-kpi">
                  <Users size={16} aria-hidden="true" />
                  <small>{t("kpiInhabitants")}</small>
                  <strong>{formatInhabitants(place.cbs?.inhabitants)}</strong>
                </div>
                <div className="place-kpi">
                  <MapPinned size={16} aria-hidden="true" />
                  <small>{t("kpiAvgWoz")}</small>
                  <strong>{formatWoz(place.cbs?.averageWoz)}</strong>
                </div>
                <div className="place-kpi">
                  <small>{t("kpiDensity")}</small>
                  <strong>
                    {place.cbs?.populationDensity != null
                      ? `${place.cbs.populationDensity.toLocaleString("nl-NL")} / km²`
                      : "—"}
                  </strong>
                </div>
                <div className="place-kpi place-kpi-action">
                  <button className="secondary-button" type="button" onClick={startPlaceComparison}>
                    <GitCompare size={13} /> {t("compareButton")}
                  </button>
                </div>
              </div>
            </header>

            <section className="place-section">
              <SignalExplorer analysis={analysisStub} initialFilter="all" />
            </section>

            {place.buurten.length > 0 && (
              <section className="place-section">
                <div className="section-heading">
                  <div className="section-kicker">{t("exploreKicker")}</div>
                  <h2>{t("buurtenTitle", { name: place.name })}</h2>
                  <p>
                    {t("buurtenIntro")}
                    {place.buurtenTruncated && ` ${t("buurtenTruncated")}`}
                  </p>
                </div>
                <div className="place-buurt-grid">
                  {place.buurten.map((buurt) => (
                    <Link
                      key={buurt.code}
                      className="place-buurt-card"
                      href={`/plek/buurt/${encodeURIComponent(buurt.code)}`}
                    >
                      <strong>{buurt.name}</strong>
                      {buurt.inhabitants != null && (
                        <span>{t("buurtInhabitants", { count: buurt.inhabitants.toLocaleString("nl-NL") })}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="place-section" id="zoek-adres-in-plek">
                <div className="section-heading">
                  <div className="section-kicker">{t("nextKicker")}</div>
                  <h2>{t("searchTitle", { name: place.name })}</h2>
                  <p>{t("searchIntro")}</p>
                </div>
                <AddressSearch id="plek-adres" initialQuery={searchSeed} submitLabel={t("checkProperty")} addressesOnly />
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
