"use client";

import { Box, Crosshair, Expand, Layers3, Locate, MapPinned, SunMedium } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  circlePolygon,
  defaultMapOverlays,
  destinationPoint,
  gardenOrientation,
  houseNumberFromLabel,
  MAP_SCENES,
  overlaysForScene,
  type MapSceneId,
  type OverlayId,
} from "@/src/lib/map/geo";
import {
  BAG_EXTRUSION_HEIGHT_M,
  DEFAULT_MAP_HOUR,
  MAP_CAMERA,
  MAP_COLORS,
  formatMapHour,
  isMapboxStandardStyle,
  lightPeriodLabel,
  lightPresetForHour,
  mapStyleUrl,
  sunLabelForHour,
  woonrealityBasemapConfig,
} from "@/src/lib/map/style";
import type { GeoJsonFeatureCollection, NearbyProperty, Property } from "@/src/lib/types";

type MapLayersResponse = {
  green: GeoJsonFeatureCollection;
  water: GeoJsonFeatureCollection;
  roads?: GeoJsonFeatureCollection;
  stops?: GeoJsonFeatureCollection;
};

const OVERLAY_LABELS: Record<OverlayId, string> = {
  nearby: "Woningen",
  walk: "5–10 min lopen",
  transit: "OV-haltes",
  roads: "Wegen",
  noise: "Geluid",
  no2: "NO₂",
  pm25: "PM2.5",
  green: "Groen",
  water: "Water",
  garden: "Tuinligging",
};

const OVERLAY_GROUPS: { label: string; ids: OverlayId[] }[] = [
  { label: "Plek", ids: ["nearby", "garden", "roads"] },
  { label: "Bereik", ids: ["walk", "transit"] },
  { label: "Gezondheid", ids: ["noise", "no2", "pm25"] },
  { label: "Natuur", ids: ["green", "water"] },
];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function setVisible(map: mapboxgl.Map, layerId: string, visible: boolean) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

function addSourceIfMissing(map: mapboxgl.Map, id: string, source: mapboxgl.AnySourceData) {
  if (!map.getSource(id)) map.addSource(id, source);
}

function addLayerIfMissing(map: mapboxgl.Map, layer: mapboxgl.AnyLayer) {
  if (!map.getLayer(layer.id)) map.addLayer(layer);
}

function whenStyleReady(map: mapboxgl.Map, fn: () => void | Promise<void>) {
  if (map.isStyleLoaded()) {
    void fn();
    return;
  }
  map.once("idle", () => {
    void fn();
  });
}

function selectStandardBuilding(map: mapboxgl.Map, lng: number, lat: number) {
  try {
    const features = map.queryRenderedFeatures(map.project([lng, lat]), {
      target: { featuresetId: "buildings", importId: "basemap" },
    } as never);
    const feature = features[0] as { id?: string | number; source?: string } | undefined;
    if (feature?.id == null || !feature.source) return false;
    map.setFeatureState(feature as never, { select: true });
    return true;
  } catch {
    return false;
  }
}

function addHomeMarker(map: mapboxgl.Map, lng: number, lat: number, houseNumber: string) {
  const element = document.createElement("div");
  element.className = "map-pin-wrap";
  element.innerHTML = `<span class="map-pin-marker"></span><span class="map-pin-label">${escapeHtml(houseNumber)}</span>`;
  return new mapboxgl.Marker({ element, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
}

export function PropertyMap({
  property,
  nearbyProperties = [],
  signals = [],
  gardenOrientationText,
  variant = "studio",
  focusBagId,
  onExpand,
}: {
  property: Property;
  nearbyProperties?: NearbyProperty[];
  signals?: { key: string; severity: string }[];
  gardenOrientationText?: string;
  variant?: "hero" | "studio";
  focusBagId?: string | null;
  onExpand?: () => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const garden = useMemo(() => gardenOrientation(gardenOrientationText), [gardenOrientationText]);
  const [pitched, setPitched] = useState(true);
  const [hour, setHour] = useState(DEFAULT_MAP_HOUR);
  const [layersOpen, setLayersOpen] = useState(false);
  const [scene, setScene] = useState<MapSceneId | "custom">("street");
  const [probe, setProbe] = useState(false);
  const [overlays, setOverlays] = useState(() => defaultMapOverlays(signals));
  const [layerError, setLayerError] = useState<string | null>(null);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const probeRef = useRef(probe);
  probeRef.current = probe;
  const pitchedRef = useRef(pitched);
  pitchedRef.current = pitched;
  const contextLayersRef = useRef<MapLayersResponse | null>(null);
  const walkDataRef = useRef<GeoJsonFeatureCollection | null>(null);
  const layerEventsRef = useRef({ nearby: false, ndov: false, probe: false });
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const hasToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const lng = property.coordinates.lng;
  const lat = property.coordinates.lat;
  const houseNumber = String(property.houseNumber) + (property.houseLetter ?? "");

  const applyOverlays = useCallback((map: mapboxgl.Map, next: Record<OverlayId, boolean>) => {
    setVisible(map, "nearby-homes", next.nearby);
    setVisible(map, "nearby-labels", next.nearby);
    setVisible(map, "walk-fill", next.walk);
    setVisible(map, "walk-line", next.walk);
    setVisible(map, "ndov-stops", next.transit);
    setVisible(map, "rivm-noise", next.noise);
    setVisible(map, "rivm-no2", next.no2);
    setVisible(map, "rivm-pm25", next.pm25);
    setVisible(map, "bgt-green", next.green);
    setVisible(map, "bgt-water", next.water);
    setVisible(map, "bgt-roads", next.roads);
    setVisible(map, "garden-line", next.garden);
    setVisible(map, "garden-point", next.garden);
  }, []);

  const ensureRivmLayer = useCallback((map: mapboxgl.Map, overlay: "noise" | "no2" | "pm25") => {
    const sourceId = `rivm-${overlay}`;
    addSourceIfMissing(map, sourceId, {
      type: "raster",
      tiles: [`/api/map/rivm/${overlay}/{z}/{x}/{y}`],
      tileSize: 256,
      maxzoom: 15,
      attribution: overlay === "noise" ? "RIVM Lden" : overlay === "no2" ? "RIVM NO2" : "RIVM PM2.5",
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
  }, []);

  const bindNdovEvents = useCallback((map: mapboxgl.Map) => {
    if (layerEventsRef.current.ndov) return;
    layerEventsRef.current.ndov = true;
    map.on("click", "ndov-stops", (event) => {
      const feature = event.features?.[0];
      if (!feature || !event.lngLat) return;
      new mapboxgl.Popup({ offset: 8, className: "map-popup" })
        .setLngLat(event.lngLat)
        .setHTML(`<strong>OV-halte</strong><br/>${escapeHtml(String(feature.properties?.distance ?? ""))} m hemelsbreed<br/><small>NDOV-catalogus, geen dienstregeling</small>`)
        .addTo(map);
    });
    map.on("mouseenter", "ndov-stops", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "ndov-stops", () => { map.getCanvas().style.cursor = ""; });
  }, []);

  const ensureContextLayers = useCallback(async (map: mapboxgl.Map) => {
    if (!contextLayersRef.current) {
      const response = await fetch(`/api/property/${encodeURIComponent(property.bagVboId)}/map-layers`);
      if (!response.ok) throw new Error("layers");
      contextLayersRef.current = (await response.json()) as MapLayersResponse;
    }
    const payload = contextLayersRef.current;
    addSourceIfMissing(map, "bgt-green", { type: "geojson", data: payload.green });
    addSourceIfMissing(map, "bgt-water", { type: "geojson", data: payload.water });
    addSourceIfMissing(map, "bgt-roads", { type: "geojson", data: payload.roads ?? { type: "FeatureCollection", features: [] } });
    addSourceIfMissing(map, "ndov-stops", { type: "geojson", data: payload.stops ?? { type: "FeatureCollection", features: [] } });
    addLayerIfMissing(map, {
      id: "bgt-green",
      type: "fill",
      source: "bgt-green",
      slot: "middle",
      paint: { "fill-color": MAP_COLORS.greenFill, "fill-opacity": 0.55, "fill-emissive-strength": 0.45 },
    });
    addLayerIfMissing(map, {
      id: "bgt-water",
      type: "fill",
      source: "bgt-water",
      slot: "middle",
      paint: { "fill-color": MAP_COLORS.waterFill, "fill-opacity": 0.5, "fill-emissive-strength": 0.5 },
    });
    addLayerIfMissing(map, {
      id: "bgt-roads",
      type: "fill",
      source: "bgt-roads",
      slot: "middle",
      paint: { "fill-color": "#6f6a64", "fill-opacity": 0.42, "fill-emissive-strength": 0.2 },
    });
    addLayerIfMissing(map, {
      id: "ndov-stops",
      type: "circle",
      source: "ndov-stops",
      slot: "top",
      paint: {
        "circle-radius": 7,
        "circle-color": "#1d1d1f",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-emissive-strength": 0.55,
      },
    });
    bindNdovEvents(map);

    if (!walkDataRef.current) {
      const response = await fetch(`/api/map/isochrone?lat=${lat}&lng=${lng}`);
      if (response.ok) walkDataRef.current = (await response.json()) as GeoJsonFeatureCollection;
    }
    if (walkDataRef.current) {
      addSourceIfMissing(map, "walk", { type: "geojson", data: walkDataRef.current });
      addLayerIfMissing(map, {
        id: "walk-fill",
        type: "fill",
        source: "walk",
        slot: "middle",
        paint: {
          "fill-color": MAP_COLORS.walkFill,
          "fill-opacity": ["match", ["to-number", ["get", "contour"]], 5, 0.28, 0.16],
          "fill-emissive-strength": 0.25,
        },
      });
      addLayerIfMissing(map, {
        id: "walk-line",
        type: "line",
        source: "walk",
        slot: "top",
        paint: {
          "line-color": MAP_COLORS.accentDeep,
          "line-width": 1.8,
          "line-opacity": 0.85,
          "line-emissive-strength": 0.3,
        },
      });
    }
  }, [bindNdovEvents, lat, lng, property.bagVboId]);

  const ensureBaseLayers = useCallback((map: mapboxgl.Map) => {
    addSourceIfMissing(map, "search-radius", {
      type: "geojson",
      data: { type: "Feature", geometry: circlePolygon({ lat, lng }, 250), properties: {} },
    });
    addLayerIfMissing(map, {
      id: "search-radius-fill",
      type: "fill",
      source: "search-radius",
      slot: "middle",
      paint: {
        "fill-color": MAP_COLORS.accent,
        "fill-opacity": 0.08,
        "fill-emissive-strength": 0.1,
      },
    });
    addLayerIfMissing(map, {
      id: "search-radius",
      type: "line",
      source: "search-radius",
      slot: "top",
      paint: {
        "line-color": MAP_COLORS.accentDeep,
        "line-width": 1.6,
        "line-dasharray": [2, 2],
        "line-opacity": 0.85,
        "line-emissive-strength": 0.25,
      },
    });

    if (property.buildingGeometry) {
      addSourceIfMissing(map, "building", {
        type: "geojson",
        data: { type: "Feature", geometry: property.buildingGeometry, properties: {} },
      });
      addLayerIfMissing(map, {
        id: "building-fill",
        type: "fill",
        source: "building",
        slot: "middle",
        paint: { "fill-color": MAP_COLORS.accent, "fill-opacity": 0.22, "fill-emissive-strength": 0.4 },
      });
      addLayerIfMissing(map, {
        id: "building-line",
        type: "line",
        source: "building",
        slot: "top",
        paint: { "line-color": MAP_COLORS.accent, "line-width": 2.4, "line-emissive-strength": 0.5 },
      });
      addLayerIfMissing(map, {
        id: "building-extrusion",
        type: "fill-extrusion",
        source: "building",
        slot: "middle",
        paint: {
          "fill-extrusion-color": MAP_COLORS.accent,
          "fill-extrusion-height": BAG_EXTRUSION_HEIGHT_M,
          "fill-extrusion-opacity": 0.78,
          "fill-extrusion-emissive-strength": 0.3,
        },
      });
      setVisible(map, "building-extrusion", pitchedRef.current);
    }

    if (nearbyProperties.length) {
      addSourceIfMissing(map, "nearby-homes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: nearbyProperties.map((home) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [home.coordinates.lng, home.coordinates.lat] },
            properties: {
              address: home.addressLabel,
              distance: home.distanceM,
              bagId: home.bagVboId,
              houseNumber: houseNumberFromLabel(home.addressLabel),
              area: home.areaM2 ?? "",
            },
          })),
        },
      });
      addLayerIfMissing(map, {
        id: "nearby-homes",
        type: "circle",
        source: "nearby-homes",
        slot: "top",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "distance"], 25, 8, 250, 5],
          "circle-color": "#ffffff",
          "circle-stroke-color": MAP_COLORS.accentDeep,
          "circle-stroke-width": 2,
          "circle-emissive-strength": 0.55,
        },
      });
      addLayerIfMissing(map, {
        id: "nearby-labels",
        type: "symbol",
        source: "nearby-homes",
        slot: "top",
        layout: {
          "text-field": ["get", "houseNumber"],
          "text-size": 11,
          "text-offset": [0, 1.15],
          "text-anchor": "top",
        },
        paint: { "text-color": MAP_COLORS.labels, "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
      });
      if (!layerEventsRef.current.nearby) {
        layerEventsRef.current.nearby = true;
        map.on("click", "nearby-homes", (event) => {
          const feature = event.features?.[0];
          if (!feature || !event.lngLat) return;
          const bagId = String(feature.properties?.bagId ?? "");
          const area = feature.properties?.area ? `${feature.properties.area} m² · ` : "";
          new mapboxgl.Popup({ offset: 10, className: "map-popup" })
            .setLngLat(event.lngLat)
            .setHTML(
              `<strong>${escapeHtml(String(feature.properties?.address ?? ""))}</strong><br/>${escapeHtml(area)}${escapeHtml(String(feature.properties?.distance ?? ""))} m`
              + (bagId ? `<br/><a href="/woning/${encodeURIComponent(bagId)}">Open woningcheck</a>` : ""),
            )
            .addTo(map);
        });
        map.on("mouseenter", "nearby-homes", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "nearby-homes", () => { map.getCanvas().style.cursor = ""; });
      }
    }

    if (garden) {
      const tip = destinationPoint({ lat, lng }, garden.bearing, 70);
      addSourceIfMissing(map, "garden", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: [[lng, lat], [tip.lng, tip.lat]] },
              properties: { kind: "line", label: garden.label },
            },
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [tip.lng, tip.lat] },
              properties: { kind: "tip", label: garden.label },
            },
          ],
        },
      });
      addLayerIfMissing(map, {
        id: "garden-line",
        type: "line",
        source: "garden",
        slot: "top",
        filter: ["==", ["get", "kind"], "line"],
        paint: { "line-color": MAP_COLORS.attention, "line-width": 3.2, "line-emissive-strength": 0.65 },
      });
      addLayerIfMissing(map, {
        id: "garden-point",
        type: "circle",
        source: "garden",
        slot: "top",
        filter: ["==", ["get", "kind"], "tip"],
        paint: { "circle-radius": 6, "circle-color": MAP_COLORS.attention, "circle-emissive-strength": 0.65 },
      });
    }

    if (!homeMarkerRef.current) {
      homeMarkerRef.current = addHomeMarker(map, lng, lat, houseNumber);
    }
  }, [garden, houseNumber, lat, lng, nearbyProperties, property.buildingGeometry]);

  const restoreCustomLayers = useCallback((map: mapboxgl.Map) => {
    whenStyleReady(map, async () => {
      ensureBaseLayers(map);
      try {
        await ensureContextLayers(map);
        const current = overlaysRef.current;
        if (current.noise) ensureRivmLayer(map, "noise");
        if (current.no2) ensureRivmLayer(map, "no2");
        if (current.pm25) ensureRivmLayer(map, "pm25");
        applyOverlays(map, current);
        setLayerError(null);
      } catch {
        setLayerError("Sommige kaartlagen konden niet worden geladen.");
      }
    });
  }, [applyOverlays, ensureBaseLayers, ensureContextLayers, ensureRivmLayer]);
  const restoreRef = useRef(restoreCustomLayers);
  restoreRef.current = restoreCustomLayers;
  const applyOverlaysRef = useRef(applyOverlays);
  applyOverlaysRef.current = applyOverlays;
  const ensureRivmRef = useRef(ensureRivmLayer);
  ensureRivmRef.current = ensureRivmLayer;

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!mapRef.current || mapInstance.current || !token) return;

    mapboxgl.accessToken = token;
    const style = mapStyleUrl();
    const container = mapRef.current;
    container.replaceChildren();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = new mapboxgl.Map({
      container,
      center: [lng, lat],
      zoom: reduceMotion ? MAP_CAMERA.zoom : MAP_CAMERA.introZoom,
      pitch: reduceMotion ? MAP_CAMERA.pitch : MAP_CAMERA.introPitch,
      bearing: MAP_CAMERA.bearing,
      maxPitch: 70,
      attributionControl: true,
      cooperativeGestures: true,
      style,
      ...(isMapboxStandardStyle(style) ? { config: { basemap: woonrealityBasemapConfig() } } : {}),
    });
    const resize = () => map.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    requestAnimationFrame(resize);
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new mapboxgl.FullscreenControl(), "bottom-right");
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");

    map.on("load", () => {
      restoreRef.current(map);
      if (!reduceMotion) {
        map.flyTo({
          center: [lng, lat],
          zoom: MAP_CAMERA.zoom,
          pitch: MAP_CAMERA.pitch,
          bearing: MAP_CAMERA.bearing,
          duration: 1600,
          essential: true,
        });
      }
      if (!layerEventsRef.current.probe) {
        layerEventsRef.current.probe = true;
        map.on("click", async (event) => {
          const raster = (["noise", "no2", "pm25"] as const).find((id) => overlaysRef.current[id])
            ?? (probeRef.current ? "no2" as const : undefined);
          if (!raster) return;
          if (map.queryRenderedFeatures(event.point, { layers: ["nearby-homes", "ndov-stops"].filter((id) => map.getLayer(id)) }).length) return;
          if (probeRef.current && !overlaysRef.current[raster]) {
            ensureRivmRef.current(map, raster);
            applyOverlaysRef.current(map, { ...overlaysRef.current, [raster]: true });
          }
          const response = await fetch(`/api/map/rivm/sample?layer=${raster}&lat=${event.lngLat.lat}&lng=${event.lngLat.lng}`);
          if (!response.ok) return;
          const sample = (await response.json()) as { value?: number; unit?: string };
          if (sample.value == null) return;
          new mapboxgl.Popup({ offset: 8, className: "map-popup" })
            .setLngLat(event.lngLat)
            .setHTML(`<strong>${raster === "noise" ? "Geluid" : raster.toUpperCase()}</strong><br/>${sample.value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} ${escapeHtml(sample.unit ?? "")}<br/><small>RIVM-screening, geen gevelmeting</small>`)
            .addTo(map);
        });
      }
    });

    map.on("style.load", () => {
      restoreRef.current(map);
    });

    map.once("idle", () => {
      selectStandardBuilding(map, lng, lat);
    });

    mapInstance.current = map;
    return () => {
      observer.disconnect();
      homeMarkerRef.current = null;
      layerEventsRef.current = { nearby: false, ndov: false, probe: false };
      map.remove();
      mapInstance.current = null;
    };
  }, [lat, lng]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !isMapboxStandardStyle(mapStyleUrl())) return;
    map.setConfigProperty("basemap", "lightPreset", lightPresetForHour(hour));
  }, [hour]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    map.easeTo({ pitch: pitched ? MAP_CAMERA.pitch : MAP_CAMERA.flatPitch, duration: 500 });
    setVisible(map, "building-extrusion", pitched);
    if (isMapboxStandardStyle(mapStyleUrl())) {
      map.setConfigProperty("basemap", "show3dObjects", pitched);
      map.setConfigProperty("basemap", "show3dBuildings", pitched);
    }
  }, [pitched]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !focusBagId) return;
    const home = nearbyProperties.find((item) => item.bagVboId === focusBagId);
    if (!home) return;
    map.flyTo({
      center: [home.coordinates.lng, home.coordinates.lat],
      zoom: Math.max(map.getZoom(), 18),
      duration: 700,
    });
    const area = home.areaM2 ? `${home.areaM2} m² · ` : "";
    new mapboxgl.Popup({ offset: 10, className: "map-popup" })
      .setLngLat([home.coordinates.lng, home.coordinates.lat])
      .setHTML(
        `<strong>${escapeHtml(home.addressLabel)}</strong><br/>${escapeHtml(area)}${home.distanceM} m`
        + `<br/><a href="/woning/${encodeURIComponent(home.bagVboId)}">Open woningcheck</a>`,
      )
      .addTo(map);
  }, [focusBagId, nearbyProperties]);

  async function applyScene(nextScene: MapSceneId) {
    const next = overlaysForScene(nextScene);
    if (!garden) next.garden = false;
    setScene(nextScene);
    setOverlays(next);
    const map = mapInstance.current;
    if (nextScene === "health") {
      setProbe(true);
      setPitched(false);
      map?.easeTo({ pitch: MAP_CAMERA.flatPitch, duration: 450 });
      if (map && isMapboxStandardStyle(mapStyleUrl())) {
        map.setConfigProperty("basemap", "show3dObjects", false);
        map.setConfigProperty("basemap", "show3dBuildings", false);
      }
    }
    if (!map) return;
    try {
      if (next.green || next.water || next.transit || next.walk || next.roads) await ensureContextLayers(map);
      if (next.noise) ensureRivmLayer(map, "noise");
      if (next.no2) ensureRivmLayer(map, "no2");
      if (next.pm25) ensureRivmLayer(map, "pm25");
      applyOverlays(map, next);
      setLayerError(null);
    } catch {
      setLayerError("Deze laag kon niet worden geladen.");
    }
  }

  function recenter() {
    mapInstance.current?.easeTo({
      center: [lng, lat],
      zoom: MAP_CAMERA.zoom,
      pitch: pitched ? MAP_CAMERA.pitch : MAP_CAMERA.flatPitch,
      bearing: MAP_CAMERA.bearing,
      duration: 700,
    });
  }

  async function toggleOverlay(id: OverlayId) {
    const next = { ...overlays, [id]: !overlays[id] };
    setOverlays(next);
    setScene("custom");
    const map = mapInstance.current;
    if (!map) return;
    try {
      if ((id === "green" || id === "water" || id === "transit" || id === "walk" || id === "roads") && next[id]) {
        await ensureContextLayers(map);
      }
      if ((id === "noise" || id === "no2" || id === "pm25") && next[id]) ensureRivmLayer(map, id);
      applyOverlays(map, next);
      setLayerError(null);
    } catch {
      setLayerError("Deze laag kon niet worden geladen.");
    }
  }

  const lightLabel = `${formatMapHour(hour)} · ${lightPeriodLabel(hour)} · ${sunLabelForHour(hour)}`;
  const hint = scene === "custom"
    ? (probe || overlays.noise || overlays.no2 || overlays.pm25 ? "Klik op de kaart om te meten." : lightLabel)
    : MAP_SCENES.find((item) => item.id === scene)?.hint ?? lightLabel;

  if (!hasToken) {
    return (
      <div className={`map-card map-empty is-${variant}`}>
        <div className="map-badge"><MapPinned size={12} /> locatie</div>
        <div className="map-empty-copy">
          <strong>3D-kaart niet beschikbaar</strong>
          <p>De interactieve Mapbox-kaart vereist een publieke Mapbox-token.</p>
          <span>{lat.toFixed(4)}, {lng.toFixed(4)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`map-card interactive-map is-${variant}${probe ? " is-probe" : ""}`}>
      <div ref={mapRef} className="map-canvas" />
      <div className="map-chrome">
        <div className="map-scenes" role="group" aria-label="Kaartscènes">
          {MAP_SCENES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={scene === item.id ? "selected" : undefined}
              onClick={() => { void applyScene(item.id); }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="map-tools">
          <button type="button" onClick={() => setPitched((value) => !value)}>
            <Box size={13} /> {pitched ? "Plat" : "3D"}
          </button>
          <button type="button" className={probe ? "selected" : undefined} onClick={() => setProbe((value) => !value)}>
            <Crosshair size={13} /> Meet
          </button>
          <button type="button" onClick={recenter}>
            <Locate size={13} /> Hier
          </button>
          {onExpand && (
            <button type="button" onClick={onExpand}>
              <Expand size={13} /> Groter
            </button>
          )}
          <label className="map-time">
            <span className="map-sun-label"><SunMedium size={12} /></span>
            <input
              type="range"
              min={0}
              max={23}
              step={1}
              value={hour}
              aria-label="Tijd van de dag"
              aria-valuetext={`${formatMapHour(hour)} ${lightPeriodLabel(hour)}`}
              onChange={(event) => {
                setHour(Number(event.target.value));
                if (!overlays.noise && !overlays.no2 && !overlays.pm25 && !pitched) setPitched(true);
              }}
            />
            <span className="map-time-meta">
              <strong>{formatMapHour(hour)}</strong>
              <small>{lightPeriodLabel(hour)}</small>
            </span>
          </label>
          <div className="map-layers">
            <button type="button" aria-expanded={layersOpen} onClick={() => setLayersOpen((value) => !value)}>
              <Layers3 size={13} /> Lagen
            </button>
            {layersOpen && (
              <div className="map-layers-panel">
                {OVERLAY_GROUPS.map((group) => (
                  <div className="map-layers-group" key={group.label}>
                    <small>{group.label}</small>
                    {group.ids.filter((id) => id !== "garden" || garden).map((id) => (
                      <label key={id}>
                        <input type="checkbox" checked={overlays[id]} onChange={() => { void toggleOverlay(id); }} />
                        {OVERLAY_LABELS[id]}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="map-legend">
        <span><i className="legend-dot home" /> deze woning</span>
        {overlays.nearby && <span><i className="legend-dot nearby" /> buren</span>}
        {overlays.walk && <span><i className="legend-dot walk" /> loopafstand</span>}
        {overlays.transit && <span><i className="legend-dot transit" /> halte</span>}
        {overlays.green && <span><i className="legend-dot green" /> groen</span>}
        {overlays.water && <span><i className="legend-dot water" /> water</span>}
        {garden && overlays.garden && <span><i className="legend-dot garden" /> tuin</span>}
        <span className="map-sun-chip">{hint}</span>
      </div>
      {layerError && <div className="map-source-notes"><small role="alert">{layerError}</small></div>}
    </div>
  );
}
