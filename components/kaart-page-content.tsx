"use client";

import { Link } from "@/src/lib/i18n/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Layers3, MapPinned, MousePointerClick, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { SiteHeader } from "@/components/site-header";

// mapbox-gl is the heaviest dependency in the app; keep it out of the
// initial chunk so the page shell and search render first.
const NetherlandsMap = dynamic(
  () => import("@/components/netherlands-map").then((module) => module.NetherlandsMap),
  {
    ssr: false,
    loading: () => <MapLoading />,
  },
);

function MapLoading() {
  const t = useTranslations("kaart");
  return <div className="property-map-loading" role="status">{t("loadingMap")}</div>;
}
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
  const t = useTranslations("kaart");
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
        <Link className="back-link" href="/"><ArrowLeft size={14} /> {t("backHome")}</Link>
        <div className="kaart-hero">
          <div className="kaart-intro">
            <div className="eyebrow"><span className="eyebrow-dot" /> {t("eyebrow")}</div>
            <h1>{t("heroTitleA")} <em>{t("heroTitleEm")}</em></h1>
            <p className="hero-copy">
              {t("heroCopy")}
            </p>
            <div className="kaart-pills" aria-label={t("layersPillAria")}>
              {Object.values(NATIONAL_LAYERS).slice(0, 5).map((item) => (
                <span className="kaart-pill" key={item.id}>{item.label}</span>
              ))}
              <span className="kaart-pill kaart-pill-muted">{t("moreRasters")}</span>
            </div>
            <div className="kaart-search-wrap">
              <AddressSearch id="kaart-zoek-adres" submitLabel={t("searchSubmit")} onSelect={handleAddressSelect} />
            </div>
          </div>
          <aside className="kaart-guide" aria-label={t("guideAria")}>
            <div className="section-kicker">{t("guideKicker")}</div>
            <ol className="kaart-guide-steps">
              <li><span><Layers3 size={14} /></span><div><strong>{t("step1Title")}</strong><small>{NATIONAL_SCENES.map((scene) => scene.label).join(" · ")}</small></div></li>
              <li><span><MousePointerClick size={14} /></span><div><strong>{t("step2Title")}</strong><small>{t("step2Text")}</small></div></li>
              <li><span><Search size={14} /></span><div><strong>{t("step3Title")}</strong><small>{t("step3Text")}</small></div></li>
            </ol>
            <p className="kaart-guide-note"><MapPinned size={13} /> {t("guideNote")}</p>
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
