"use client";

import { Layers3, Locate, MapPinned, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { addLayerIfMissing, addSourceIfMissing, setVisible } from "@/src/lib/map/mapbox-helpers";
import {
  NATIONAL_LAYERS,
  NATIONAL_RASTERS,
  NATIONAL_SCENES,
  NL_MAP_BOUNDS,
  NL_MAP_CENTER,
  type NationalLayerId,
  type NationalRasterId,
  type NationalSceneId,
  type LayerLegend,
} from "@/src/lib/map/national-layers";
import type { RegionFeatureProperties } from "@/src/lib/map/regions";
import { regionInspectSummary } from "@/src/lib/map/regions";
import { apiFetch } from "@/components/hooks/use-api";
import { MAP_COLORS, applyMapLighting, isMapboxStandardStyle, mapStyleUrl, woonrealityBasemapConfig } from "@/src/lib/map/style";
import type { AddressSearchResult, GeoJsonFeatureCollection } from "@/src/lib/types";

type RegionsResponse = GeoJsonFeatureCollection & {
  meta: {
    layer: NationalLayerId;
    scale: string;
    legend: LayerLegend;
    periodYear?: string;
    featureCount: number;
    truncated: boolean;
  };
};

type RasterState = Record<NationalRasterId, boolean>;

const EMPTY_REGIONS: RegionsResponse = {
  type: "FeatureCollection",
  features: [],
  meta: {
    layer: "ses",
    scale: "gemeente",
    legend: {
      layer: "ses",
      label: "SES-WOA",
      unit: "score",
      min: -0.5,
      max: 0.5,
      stops: [[-0.5, "#d5ead6"], [0, "#f6e7b8"], [0.5, "#f2c6b4"]],
      direction: "neutral",
      source: "CBS SES-WOA",
      sourceUrl: "https://opendata.cbs.nl/#/CBS/nl/dataset/86296NED",
      nullLabel: "Geen data",
    },
    featureCount: 0,
    truncated: false,
  },
};

const DEFAULT_RASTERS: RasterState = { noise: false, no2: false, pm25: false };

function choroplethFillColor(legend: LayerLegend): mapboxgl.ExpressionSpecification {
  const [stopA, stopB, stopC] = legend.stops;
  return [
    "case",
    ["any", ["==", ["get", "value"], null], ["!", ["has", "value"]]],
    "#d8dee8",
    [
      "interpolate",
      ["linear"],
      ["to-number", ["get", "value"]],
      legend.min,
      stopA?.[1] ?? "#d5ead6",
      (legend.min + legend.max) / 2,
      stopB?.[1] ?? "#f6e7b8",
      legend.max,
      stopC?.[1] ?? "#f2c6b4",
    ],
  ];
}

function choroplethPaint(legend: LayerLegend): mapboxgl.FillPaint {
  return {
    "fill-color": choroplethFillColor(legend),
    "fill-opacity": 0.72,
  };
}

function ensureRivmLayer(map: mapboxgl.Map, overlay: NationalRasterId) {
  if (!map.isStyleLoaded()) return;
  const sourceId = `rivm-${overlay}`;
  addSourceIfMissing(map, sourceId, {
    type: "raster",
    tiles: [`/api/map/rivm/${overlay}/{z}/{x}/{y}`],
    tileSize: 256,
    maxzoom: 15,
  });
  addLayerIfMissing(map, {
    id: sourceId,
    type: "raster",
    source: sourceId,
    slot: "top",
    paint: {
      "raster-opacity": overlay === "noise" ? 0.58 : 0.52,
      "raster-resampling": "linear",
    },
  });
}

function parseInitialLayer(value: string | undefined): NationalLayerId {
  return value && Object.hasOwn(NATIONAL_LAYERS, value) ? value as NationalLayerId : "ses";
}

function parseInitialNumber(value: string | undefined, fallback: number) {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function scaleLabel(scale: string | undefined, t: ReturnType<typeof useTranslations>) {
  if (scale === "gemeente") return t("scaleGemeente");
  if (scale === "wijk") return t("scaleWijk");
  if (scale === "buurt") return t("scaleBuurt");
  return t("scaleArea");
}

function activeSceneHint(scene: NationalSceneId | "custom", layer: NationalLayerId) {
  if (scene !== "custom") return NATIONAL_SCENES.find((item) => item.id === scene)?.hint ?? "";
  return NATIONAL_LAYERS[layer].hint;
}

export function NetherlandsMap({
  initialLayer,
  initialLat,
  initialLng,
  initialZoom,
  focusAddress,
  onViewChange,
}: {
  initialLayer?: string;
  initialLat?: string;
  initialLng?: string;
  initialZoom?: string;
  focusAddress?: AddressSearchResult | null;
  /** Fired after the layer, rasters or viewport change so the page can keep
   * the URL shareable. Debounced internally by Mapbox moveend + state effects. */
  onViewChange?: (view: { layer: NationalLayerId; rasters: RasterState; lat: number; lng: number; zoom: number }) => void;
}) {
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const selectedCodeRef = useRef<string | null>(null);
  const layerRef = useRef<NationalLayerId>(parseInitialLayer(initialLayer));
  const rastersRef = useRef<RasterState>(DEFAULT_RASTERS);
  const [layer, setLayer] = useState<NationalLayerId>(() => parseInitialLayer(initialLayer));
  const [scene, setScene] = useState<NationalSceneId | "custom">("buurt");
  const [rasters, setRasters] = useState<RasterState>(DEFAULT_RASTERS);
  const [layersOpen, setLayersOpen] = useState(false);
  const [legend, setLegend] = useState<LayerLegend>(EMPTY_REGIONS.meta.legend);
  const [meta, setMeta] = useState({ scale: "gemeente", periodYear: undefined as string | undefined, truncated: false, featureCount: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RegionFeatureProperties | null>(null);
  const [pendingAddress, setPendingAddress] = useState<AddressSearchResult | null>(null);
  const hasToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const t = useTranslations("kaart");

  useEffect(() => {
    layerRef.current = layer;
    rastersRef.current = rasters;
  }, [layer, rasters]);

  const inspectLines = useMemo(() => (selected ? regionInspectSummary(selected) : []), [selected]);

  const refreshRegions = useCallback(async (map: mapboxgl.Map, nextLayer = layerRef.current) => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const bounds = map.getBounds();
    if (!bounds) return;
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
    const zoom = map.getZoom();
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<RegionsResponse & { error?: string }>(
        `/api/map/regions?bbox=${encodeURIComponent(bbox)}&layer=${encodeURIComponent(nextLayer)}&zoom=${encodeURIComponent(String(zoom))}`,
        { signal: controller.signal },
      );
      if (!result.ok) throw new Error(result.data?.error ?? result.error ?? t("layerLoadFailed"));
      const body = result.data;
      if (!body || controller.signal.aborted || mapInstance.current !== map) return;
      const source = map.getSource("regions") as mapboxgl.GeoJSONSource | undefined;
      source?.setData(body);
      const legendMeta = body.meta?.legend ?? EMPTY_REGIONS.meta.legend;
      if (map.getLayer("regions-fill")) {
        map.setPaintProperty("regions-fill", "fill-color", choroplethFillColor(legendMeta) as never);
      }
      if (selectedCodeRef.current && map.getLayer("regions-outline-selected")) {
        map.setFilter("regions-outline-selected", ["==", ["get", "regionCode"], selectedCodeRef.current]);
      }
      setLegend(legendMeta);
      setMeta({
        scale: body.meta?.scale ?? "gemeente",
        periodYear: body.meta?.periodYear,
        truncated: body.meta?.truncated ?? false,
        featureCount: body.meta?.featureCount ?? body.features.length,
      });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      if (mapInstance.current !== map) return;
      setError(caught instanceof Error ? caught.message : t("layerLoadFailed"));
    } finally {
      if (fetchAbortRef.current === controller) setLoading(false);
    }
  }, [t]);

  const scheduleRefresh = useCallback((map: mapboxgl.Map) => {
    if (moveTimerRef.current) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = window.setTimeout(() => { void refreshRegions(map); }, 320);
  }, [refreshRegions]);

  const applyRasters = useCallback((map: mapboxgl.Map, next: RasterState) => {
    if (!map.isStyleLoaded()) return;
    (Object.keys(next) as NationalRasterId[]).forEach((id) => {
      if (next[id]) ensureRivmLayer(map, id);
      setVisible(map, `rivm-${id}`, next[id]);
    });
  }, []);

  const selectRegion = useCallback((props: RegionFeatureProperties | null) => {
    selectedCodeRef.current = props?.regionCode ?? null;
    setSelected(props);
    const map = mapInstance.current;
    if (!map?.getLayer("regions-outline-selected")) return;
    map.setFilter("regions-outline-selected", props?.regionCode
      ? ["==", ["get", "regionCode"], props.regionCode]
      : ["==", ["get", "regionCode"], ""]);
  }, []);

  const flyTo = useCallback((lng: number, lat: number, zoom = 12.5) => {
    const map = mapInstance.current;
    if (!map) return;
    map.flyTo({ center: [lng, lat], zoom, pitch: 0, bearing: 0, essential: true });
  }, []);

  useEffect(() => {
    if (!focusAddress) return;
    setPendingAddress(focusAddress);
    flyTo(focusAddress.coordinates.lng, focusAddress.coordinates.lat, 13.2);
  }, [focusAddress, flyTo]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!mapRef.current || mapInstance.current || !token) return;

    mapboxgl.accessToken = token;
    const style = mapStyleUrl();
    const container = mapRef.current;
    const initialCenter: [number, number] = [
      parseInitialNumber(initialLng, NL_MAP_CENTER.lng),
      parseInitialNumber(initialLat, NL_MAP_CENTER.lat),
    ];
    const initialZ = parseInitialNumber(initialZoom, NL_MAP_CENTER.zoom);
    const map = new mapboxgl.Map({
      container,
      center: initialCenter,
      zoom: initialZ,
      pitch: 0,
      bearing: 0,
      maxBounds: NL_MAP_BOUNDS,
      minZoom: 6,
      maxZoom: 15,
      attributionControl: true,
      cooperativeGestures: true,
      style,
      ...(isMapboxStandardStyle(style) ? { config: { basemap: woonrealityBasemapConfig() } } : {}),
    });
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "bottom-right");
    mapInstance.current = map;

    const resize = () => map.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    requestAnimationFrame(resize);

    map.on("load", () => {
      applyMapLighting(map, 14, false);
      addSourceIfMissing(map, "regions", { type: "geojson", data: EMPTY_REGIONS });
      addLayerIfMissing(map, {
        id: "regions-fill",
        type: "fill",
        source: "regions",
        slot: "middle",
        paint: choroplethPaint(EMPTY_REGIONS.meta.legend),
      });
      addLayerIfMissing(map, {
        id: "regions-outline",
        type: "line",
        source: "regions",
        slot: "middle",
        paint: { "line-color": "#ffffff", "line-width": 0.6, "line-opacity": 0.65 },
      });
      addLayerIfMissing(map, {
        id: "regions-outline-selected",
        type: "line",
        source: "regions",
        slot: "top",
        filter: ["==", ["get", "regionCode"], ""],
        paint: { "line-color": MAP_COLORS.accent, "line-width": 2.4 },
      });
      map.on("click", "regions-fill", (event) => {
        const feature = event.features?.[0];
        if (!feature?.properties) return;
        selectRegion(feature.properties as RegionFeatureProperties);
      });
      map.on("mouseenter", "regions-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "regions-fill", () => { map.getCanvas().style.cursor = ""; });
      applyRasters(map, rastersRef.current);
      void refreshRegions(map, layerRef.current);
    });
    map.on("moveend", () => {
      scheduleRefresh(map);
      onViewChangeRef.current?.({
        layer: layerRef.current,
        rasters: rastersRef.current,
        lat: map.getCenter().lat,
        lng: map.getCenter().lng,
        zoom: map.getZoom(),
      });
    });

    return () => {
      observer.disconnect();
      if (moveTimerRef.current) window.clearTimeout(moveTimerRef.current);
      fetchAbortRef.current?.abort();
      map.remove();
      mapInstance.current = null;
    };
  }, [applyRasters, initialLat, initialLng, initialZoom, refreshRegions, scheduleRefresh, selectRegion]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map?.isStyleLoaded()) return;
    void refreshRegions(map, layer);
  }, [layer, refreshRegions]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const run = () => applyRasters(map, rasters);
    if (map.isStyleLoaded()) {
      run();
      return;
    }
    map.once("load", run);
  }, [applyRasters, rasters]);

  function applyScene(nextScene: NationalSceneId) {
    const spec = NATIONAL_SCENES.find((item) => item.id === nextScene);
    if (!spec) return;
    setScene(nextScene);
    setLayer(spec.layer);
    const nextRasters = {
      noise: spec.rasters.includes("noise"),
      no2: spec.rasters.includes("no2"),
      pm25: spec.rasters.includes("pm25"),
    };
    setRasters(nextRasters);
    emitViewChange(spec.layer, nextRasters);
  }

  function toggleLayer(nextLayer: NationalLayerId) {
    setLayer(nextLayer);
    setScene("custom");
    emitViewChange(nextLayer, rastersRef.current);
  }

  function toggleRaster(id: NationalRasterId) {
    const next = { ...rastersRef.current, [id]: !rastersRef.current[id] };
    setRasters(next);
    rastersRef.current = next;
    setScene("custom");
    emitViewChange(layerRef.current, next);
  }

  function emitViewChange(nextLayer: NationalLayerId, nextRasters: RasterState) {
    const map = mapInstance.current;
    if (!map) return;
    onViewChangeRef.current?.({
      layer: nextLayer,
      rasters: nextRasters,
      lat: map.getCenter().lat,
      lng: map.getCenter().lng,
      zoom: map.getZoom(),
    });
  }

  if (!hasToken) {
    return (
      <div className="map-card map-empty kaart-map-shell">
        <div className="map-empty-copy">
          <div className="map-empty-pin" aria-hidden="true"><MapPinned size={18} /></div>
          <span className="section-kicker">{t("mapEmptyKicker")}</span>
          <strong>{t("mapEmptyTitle")}</strong>
          <p>{t("mapTokenHintBefore")} <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> {t("mapTokenHintAfter")}</p>
        </div>
      </div>
    );
  }

  const sceneHint = activeSceneHint(scene, layer);

  return (
    <div className="map-card interactive-map is-studio kaart-map-shell">
      <div ref={mapRef} className="map-canvas" />
      <div className="map-chrome kaart-map-chrome">
        <div className="map-scenes" role="group" aria-label={t("themesAria")}>
          {NATIONAL_SCENES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={scene === item.id ? "selected" : undefined}
              aria-pressed={scene === item.id}
              title={item.hint}
              onClick={() => applyScene(item.id)}
            >
              {item.label}
            </button>
          ))}
          {scene === "custom" ? <span className="kaart-scene-custom">{t("customScene")}</span> : null}
        </div>
        <div className="map-tools kaart-map-tools">
          <button type="button" onClick={() => {
            const map = mapInstance.current;
            if (!map) return;
            map.fitBounds(NL_MAP_BOUNDS, { padding: 40, pitch: 0, duration: 700 });
            selectRegion(null);
          }}>
            <Locate size={13} /> {t("wholeNl")}
          </button>
          <button type="button" className={layersOpen ? "selected" : undefined} aria-pressed={layersOpen} onClick={() => setLayersOpen((value) => !value)}>
            <Layers3 size={13} /> {t("layersToggle")}
          </button>
        </div>
      </div>

      {layersOpen && (
        <div className="map-layers-panel kaart-layer-panel">
          <div className="map-layers-group">
            <small>{t("groupNeighborhood")}</small>
            {(["ses", "education", "crime", "children", "density"] as NationalLayerId[]).map((id) => (
              <label key={id}>
                <input type="radio" name="kaart-layer" checked={layer === id} onChange={() => toggleLayer(id)} />
                <span>{NATIONAL_LAYERS[id].label}</span>
                <em>{NATIONAL_LAYERS[id].unit}</em>
              </label>
            ))}
          </div>
          <div className="map-layers-group">
            <small>{t("groupSchools")}</small>
            {(["schools", "woz"] as NationalLayerId[]).map((id) => (
              <label key={id}>
                <input type="radio" name="kaart-layer" checked={layer === id} onChange={() => toggleLayer(id)} />
                <span>{NATIONAL_LAYERS[id].label}</span>
                <em>{NATIONAL_LAYERS[id].unit}</em>
              </label>
            ))}
          </div>
          <div className="map-layers-group">
            <small>{t("groupRasters")}</small>
            {(Object.keys(NATIONAL_RASTERS) as NationalRasterId[]).map((id) => (
              <label key={id}>
                <input type="checkbox" checked={rasters[id]} onChange={() => toggleRaster(id)} />
                <span>{NATIONAL_RASTERS[id].label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className={`kaart-legend${loading ? " is-loading" : ""}`} aria-live="polite">
        <div className="kaart-legend-head">
          <div>
            <strong>{legend.label}</strong>
            <span>{sceneHint}</span>
          </div>
          <div className="kaart-legend-badges">
            <span className="kaart-badge">{scaleLabel(meta.scale, t)}</span>
            {meta.periodYear ? <span className="kaart-badge kaart-badge-muted">{meta.periodYear}</span> : null}
            {loading ? <span className="kaart-badge kaart-badge-live">{t("loadingBadge")}</span> : null}
          </div>
        </div>
        <div className="kaart-legend-bar" aria-hidden="true">
          {legend.stops.map(([value, color]: [number, string]) => (
            <span key={value} style={{ background: color }} />
          ))}
        </div>
        <div className="kaart-legend-scale">
          <span>{legend.min.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}</span>
          <span>{legend.max.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} {legend.unit}</span>
        </div>
        {legend.caveat ? <p className="kaart-legend-note">{legend.caveat}</p> : null}
        {meta.truncated ? <p className="kaart-legend-note">{t("truncatedNote")}</p> : null}
        {error ? <p className="kaart-legend-error" role="alert">{error}</p> : null}
      </div>

      {(selected || pendingAddress) && (
        <aside className="kaart-inspect">
          {selected ? (
            <>
              <div className="kaart-inspect-header">
                <div>
                  <span className="kaart-badge">{scaleLabel(selected.scale, t)}</span>
                  <h2>{selected.regionName ?? t("scaleArea")}</h2>
                  {selected.municipalityName ? <p className="kaart-inspect-meta">{selected.municipalityName}</p> : null}
                </div>
                <button type="button" className="kaart-inspect-close" aria-label={t("closePanelAria")} onClick={() => { selectRegion(null); setPendingAddress(null); }}>
                  <X size={16} />
                </button>
              </div>
              <div className="kaart-inspect-highlight">
                <span>{legend.label}</span>
                <strong>{selected.valueLabel ?? t("noData")}</strong>
              </div>
              <dl className="kaart-inspect-list">
                {inspectLines.filter((line) => line.label !== "Gebied").map((line) => (
                  <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>
                ))}
              </dl>
              <a className="text-link" href={legend.sourceUrl} target="_blank" rel="noreferrer">{t("sourceLink", { source: legend.source })}</a>
            </>
          ) : null}
          {pendingAddress ? (
            <div className="kaart-inspect-address">
              <span className="section-kicker">{t("foundAddress")}</span>
              <strong>{pendingAddress.displayName}</strong>
              <a className="primary-button" href={`/woning/${encodeURIComponent(pendingAddress.bagVboId)}`}>{t("openPropertyCheck")}</a>
            </div>
          ) : null}
        </aside>
      )}
    </div>
  );
}
