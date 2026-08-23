"use client";

import { ArrowLeft, GitCompare, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { ComparisonSkeleton } from "@/components/ui/route-skeletons";
import { placeKindLabels } from "@/src/lib/place-labels";
import { isBestInRow, loadStoredPlaces, placeFactRows, placeRefKey, placeSignalRows, removeStoredPlace, type PlaceRef } from "@/src/lib/place-compare";
import type { PlaceAnalysis } from "@/src/lib/types";

type LoadedPlace = { ref: PlaceRef; place: PlaceAnalysis | null; error?: string };

function PlacesEmptyState({ hint }: { hint?: string }) {
  return (
    <main className="site-shell comparison-shell">
      <div className="container">
        <SiteHeader current="vergelijken" />
        <section className="comparison-empty" aria-labelledby="places-empty-title">
          <Link className="back-link" href="/#zoek-adres"><ArrowLeft size={14} /> Adres zoeken</Link>
          <div className="eyebrow"><GitCompare size={13} /> plekken vergelijken</div>
          <h1 id="places-empty-title">Welke buurt of gemeente past het best?</h1>
          <p className="hero-copy">Open een plekpagina (buurt, gemeente of woonplaats) en kies daar “Vergelijk”. Na twee plekken zet je ze hier naast elkaar.</p>
          {hint ? <p className="compare-alert" role="status">{hint}</p> : null}
          <ol className="comparison-empty-steps">
            <li><span>1</span><div><strong>Zoek een gebied</strong><small>Op de startpagina kun je ook buurten en gemeenten zoeken.</small></div></li>
            <li><span>2</span><div><strong>Kies Vergelijk</strong><small>De knop staat op elke plekpagina.</small></div></li>
            <li><span>3</span><div><strong>Voeg er een tweede toe</strong><small>Daarna zie je de cijfers naast elkaar.</small></div></li>
          </ol>
          <Link className="primary-button" href="/#zoek-adres">Zoek een gebied</Link>
        </section>
      </div>
    </main>
  );
}

export function PlaceComparisonDashboard({ initialRefs }: { initialRefs: PlaceRef[] }) {
  const [refs, setRefs] = useState<PlaceRef[]>(initialRefs);
  const [loaded, setLoaded] = useState<LoadedPlace[]>([]);
  const [loading, setLoading] = useState(true);

  // Session-stored places extend URL refs (e.g. user added one on a place page).
  useEffect(() => {
    const stored = loadStoredPlaces();
    setRefs((current) => {
      const seen = new Set(current.map(placeRefKey));
      return [...current, ...stored.filter((ref) => !seen.has(placeRefKey(ref)))].slice(0, 4);
    });
  }, []);

  useEffect(() => {
    if (!refs.length) {
      setLoaded([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const controller = new AbortController();
    void Promise.all(refs.map(async (ref) => {
      try {
        const response = await fetch(`/api/place/${encodeURIComponent(ref.kind)}/${encodeURIComponent(ref.code)}`, { signal: controller.signal });
        if (response.status === 401) return { ref, place: null, error: "Log in om plekken te vergelijken." };
        const body = await response.json() as { place?: PlaceAnalysis; error?: string };
        if (!response.ok) return { ref, place: null, error: body.error ?? "Plek kon niet worden geladen." };
        return { ref, place: body.place ?? null };
      } catch {
        return { ref, place: null, error: "Plek kon niet worden geladen." };
      }
    })).then((results) => {
      if (active) {
        setLoaded(results);
        setLoading(false);
      }
    });
    return () => { active = false; controller.abort(); };
  }, [refs]);

  function removeColumn(index: number) {
    removeStoredPlace(refs[index]);
    setRefs((current) => current.filter((_, position) => position !== index));
  }

  if (loading) return <ComparisonSkeleton />;

  const valid = loaded.filter((item): item is LoadedPlace & { place: PlaceAnalysis } => item.place != null);
  if (valid.length < 2) {
    const authError = loaded.find((item) => item.error?.includes("Log in"));
    return <PlacesEmptyState hint={authError?.error} />;
  }

  const metricRows = placeSignalRows(valid.map((item) => item.place));
  const factRows = placeFactRows(valid.map((item) => item.place));

  return (
    <main className="site-shell">
      <div className="container comparison-page">
        <SiteHeader current="vergelijken" />
        <Link className="back-link" href="/#zoek-adres"><ArrowLeft size={14} /> Terug naar zoeken</Link>
        <div className="eyebrow"><GitCompare size={13} /> plekken vergelijking</div>
        <h1>Welke plek past het best?</h1>
        <p className="hero-copy">CBS-buurtgemiddelden en open-data signalen per gebied. Dit zijn omgevingsindicaties — geen woningcheck.</p>
        <section className="comparison-cards">
          {valid.map((item, index) => (
            <article className="comparison-card" key={placeRefKey(item.ref)}>
              <div className="comparison-card-top">
                <div>
                  <h2>{item.place.name}</h2>
                  <span>{placeKindLabels[item.place.kind]}{item.place.subtitle ? ` · ${item.place.subtitle}` : ""}</span>
                </div>
                <button className="icon-button" type="button" aria-label="Verwijder uit vergelijking" onClick={() => removeColumn(index)}>
                  <X size={15} />
                </button>
              </div>
              <div className="comparison-scores">
                <div><small>Gem. WOZ</small><strong>{item.place.cbs?.averageWoz != null ? `€ ${Math.round(item.place.cbs.averageWoz).toLocaleString("nl-NL")}` : "—"}</strong></div>
                <div><small>Inwoners</small><strong>{item.place.cbs?.inhabitants?.toLocaleString("nl-NL") ?? "—"}</strong></div>
              </div>
              <div className="comparison-card-footer">
                <Link href={`/plek/${item.place.kind}/${encodeURIComponent(item.place.code)}`}>Open plekpagina</Link>
              </div>
            </article>
          ))}
        </section>
        <section className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Cijfer</th>
                {valid.map((item) => <th key={placeRefKey(item.ref)}>{item.place.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {factRows.map((row) => (
                <tr key={`fact-${row.key}`}>
                  <th>{row.label}</th>
                  {row.values.map((value, index) => <td key={index}>{value ?? "—"}</td>)}
                </tr>
              ))}
              {metricRows.map((row) => (
                <tr key={`metric-${row.key}`}>
                  <th>{row.label}{row.unit ? ` (${row.unit})` : ""}</th>
                  {row.values.map((value, index) => (
                    <td key={index} className={isBestInRow(row.values, index, row.higherIsBetter) ? "best-value" : ""}>
                      {value != null ? value.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <p className="dashboard-disclaimer">Signalen zijn gemiddelden voor het hele gebied; een enkele straat kan sterk afwijken. Open data vervangt geen keuring of advies.</p>
      </div>
    </main>
  );
}
