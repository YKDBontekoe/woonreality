"use client";

import { ArrowLeft, MapPinned, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { SignalExplorer } from "@/components/property/signal-explorer";
import { PageShell } from "@/components/ui/page-shell";
import { placeKindLabels } from "@/src/lib/analysis/analyze-place";
import type { Analysis, PlaceAnalysis, PlaceKind } from "@/src/lib/types";

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void fetch(`/api/place/${encodeURIComponent(kind)}/${encodeURIComponent(code)}`)
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = "/login";
          return null;
        }
        const body = await response.json() as { place?: PlaceAnalysis; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Deze plekcheck lukt nu niet.");
        return body.place ?? null;
      })
      .then((next) => {
        if (cancelled) return;
        setPlace(next);
        if (!next) setError("Deze plek kon niet worden gevonden.");
      })
      .catch((caught) => {
        if (cancelled) return;
        setPlace(null);
        setError(caught instanceof Error ? caught.message : "Deze plekcheck lukt nu niet.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, code]);

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
      domains: [],
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
          <ArrowLeft size={16} aria-hidden="true" /> Terug naar zoeken
        </Link>

        {loading && <div className="place-loading" role="status">Plek laden…</div>}
        {error && !loading && <div className="place-error" role="alert">{error}</div>}

        {place && analysisStub && (
          <>
            <header className="place-hero">
              <div className="place-hero-copy">
                <span className="place-kind-badge">{placeKindLabels[place.kind]}</span>
                <h1>{place.name}</h1>
                {place.subtitle && <p>{place.subtitle}</p>}
                <p className="place-hero-note">
                  Buurtgemiddelden en open data — geen woningcheck. Kies hieronder een adres voor je volledige woningcheck.
                </p>
              </div>
              <div className="place-kpis">
                <div className="place-kpi">
                  <Users size={16} aria-hidden="true" />
                  <small>Inwoners</small>
                  <strong>{formatInhabitants(place.cbs?.inhabitants)}</strong>
                </div>
                <div className="place-kpi">
                  <MapPinned size={16} aria-hidden="true" />
                  <small>Gem. WOZ</small>
                  <strong>{formatWoz(place.cbs?.averageWoz)}</strong>
                </div>
                <div className="place-kpi">
                  <small>Dichtheid</small>
                  <strong>
                    {place.cbs?.populationDensity != null
                      ? `${place.cbs.populationDensity.toLocaleString("nl-NL")} / km²`
                      : "—"}
                  </strong>
                </div>
              </div>
            </header>

            <section className="place-section">
              <SignalExplorer analysis={analysisStub} initialFilter="all" />
            </section>

            {place.buurten.length > 0 && (
              <section className="place-section">
                <div className="section-heading">
                  <div className="section-kicker">Verder verkennen</div>
                  <h2>Buurten in {place.name}</h2>
                  <p>Klik door naar een buurt voor meer detail, of zoek direct een adres.</p>
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
                        <span>{buurt.inhabitants.toLocaleString("nl-NL")} inwoners</span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="place-section" id="zoek-adres-in-plek">
              <div className="section-heading">
                <div className="section-kicker">Volgende stap</div>
                <h2>Zoek een woning in {place.name}</h2>
                <p>Typ straat en huisnummer voor je volledige woningcheck met energie, geluid en meer.</p>
              </div>
              <AddressSearch id="plek-adres" initialQuery={searchSeed} submitLabel="Check woning" addressesOnly />
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
