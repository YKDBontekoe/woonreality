"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Layers3, MapPinned, MousePointerClick, Search } from "lucide-react";
import { useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { SiteHeader } from "@/components/site-header";

// mapbox-gl is the heaviest dependency in the app; keep it out of the
// initial chunk so the page shell and search render first.
const NetherlandsMap = dynamic(
  () => import("@/components/netherlands-map").then((module) => module.NetherlandsMap),
  {
    ssr: false,
    loading: () => <div className="property-map-loading" role="status">Kaart laden…</div>,
  },
);
import { NATIONAL_LAYERS, NATIONAL_SCENES } from "@/src/lib/map/national-layers";
import type { AddressSearchResult } from "@/src/lib/types";

export function KaartPageContent({
  initialLayer,
  initialLat,
  initialLng,
  initialZoom,
}: {
  initialLayer?: string;
  initialLat?: string;
  initialLng?: string;
  initialZoom?: string;
}) {
  const [focusAddress, setFocusAddress] = useState<AddressSearchResult | null>(null);

  function handleAddressSelect(result: AddressSearchResult) {
    setFocusAddress(result);
    const url = new URL(window.location.href);
    url.searchParams.set("lat", String(result.coordinates.lat));
    url.searchParams.set("lng", String(result.coordinates.lng));
    url.searchParams.set("z", "13");
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <main className="site-shell kaart-shell">
      <div className="container">
        <SiteHeader current="kaart" />
        <Link className="back-link" href="/"><ArrowLeft size={14} /> Terug naar home</Link>
        <div className="kaart-hero">
          <div className="kaart-intro">
            <div className="eyebrow"><span className="eyebrow-dot" /> Nederlandkaart</div>
            <h1>Vergelijk buurten op <em>open data</em></h1>
            <p className="hero-copy">
              Bekijk heel Nederland op SES, misdaad, WOZ en schoolafstand. Klik een gebied voor cijfers met bron — daarna kun je een adres in die buurt checken.
            </p>
            <div className="kaart-pills" aria-label="Beschikbare lagen">
              {Object.values(NATIONAL_LAYERS).slice(0, 5).map((item) => (
                <span className="kaart-pill" key={item.id}>{item.label}</span>
              ))}
              <span className="kaart-pill kaart-pill-muted">+ rasters</span>
            </div>
            <div className="kaart-search-wrap">
              <AddressSearch id="kaart-zoek-adres" submitLabel="Zoek op kaart" onSelect={handleAddressSelect} />
            </div>
          </div>
          <aside className="kaart-guide" aria-label="Kaartuitleg">
            <div className="section-kicker">Zo werkt het</div>
            <ol className="kaart-guide-steps">
              <li><span><Layers3 size={14} /></span><div><strong>Kies een thema</strong><small>{NATIONAL_SCENES.map((scene) => scene.label).join(" · ")}</small></div></li>
              <li><span><MousePointerClick size={14} /></span><div><strong>Klik een gebied</strong><small>Cijfers en bron verschijnen rechts op de kaart</small></div></li>
              <li><span><Search size={14} /></span><div><strong>Zoek een adres</strong><small>Spring naar een plek en open de woningcheck</small></div></li>
            </ol>
            <p className="kaart-guide-note"><MapPinned size={13} /> Zoom verder in voor wijken en buurten.</p>
          </aside>
        </div>
      </div>
      <div className="container kaart-stage-wrap">
        <NetherlandsMap
          initialLayer={initialLayer}
          initialLat={initialLat}
          initialLng={initialLng}
          initialZoom={initialZoom}
          focusAddress={focusAddress}
        />
      </div>
    </main>
  );
}
