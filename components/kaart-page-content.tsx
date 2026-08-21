"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { NetherlandsMap } from "@/components/netherlands-map";
import { SiteHeader } from "@/components/site-header";
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
        <div className="kaart-intro">
          <div className="eyebrow">Nederlandkaart</div>
          <h1>Vergelijk buurten op open data</h1>
          <p className="hero-copy">
            Bekijk heel Nederland op SES, misdaad, WOZ, schoolafstand en meer. Klik een gebied voor cijfers met bron — daarna kun je een adres in die buurt checken.
          </p>
          <AddressSearch id="kaart-zoek-adres" submitLabel="Zoek op kaart" onSelect={handleAddressSelect} />
        </div>
      </div>
      <NetherlandsMap
        initialLayer={initialLayer}
        initialLat={initialLat}
        initialLng={initialLng}
        initialZoom={initialZoom}
        focusAddress={focusAddress}
      />
    </main>
  );
}
