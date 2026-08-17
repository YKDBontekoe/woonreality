"use client";

import { Box, Layers3, MapPinned, SunMedium } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  BAG_EXTRUSION_HEIGHT_M,
  LIGHT_PRESETS,
  MAP_CAMERA,
  MAP_COLORS,
  isMapboxStandardStyle,
  mapStyleUrl,
  sunLabelForPreset,
  woonrealityBasemapConfig,
  type LightPreset,
} from "@/src/lib/map/style";
import type { GeoJsonFeatureCollection, NearbyProperty, Property } from "@/src/lib/types";

type OverlayId = "nearby" | "noise" | "no2" | "green" | "water";

type MapLayersResponse = {
  green: GeoJsonFeatureCollection;
  water: GeoJsonFeatureCollection;
};

const OVERLAYS: { id: OverlayId; label: string }[] = [
  { id: "nearby", label: "Woningen" },
  { id: "noise", label: "Geluid" },
  { id: "no2", label: "Lucht" },
  { id: "green", label: "Groen" },
  { id: "water", label: "Water" },
];

function setVisible(map: mapboxgl.Map, layerId: string, visible: boolean) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
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

function addHomeMarker(map: mapboxgl.Map, lng: number, lat: number) {
  const element = document.createElement("div");
  element.className = "map-pin-marker";
  element.setAttribute("aria-hidden", "true");
  return new mapboxgl.Marker({ element, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
}

export function PropertyMap({ property, nearbyProperties = [] }: { property: Property; nearbyProperties?: NearbyProperty[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const [pitched, setPitched] = useState(true);
  const [lightPreset, setLightPreset] = useState<LightPreset>("day");
  const [layersOpen, setLayersOpen] = useState(false);
  const [overlays, setOverlays] = useState<Record<OverlayId, boolean>>({
    nearby: true,
    noise: false,
    no2: false,
    green: false,
    water: false,
  });
  const [layerError, setLayerError] = useState<string | null>(null);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const hasToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const lng = property.coordinates.lng;
  const lat = property.coordinates.lat;

  const applyOverlays = useCallback((map: mapboxgl.Map, next: Record<OverlayId, boolean>) => {
    setVisible(map, "nearby-homes", next.nearby);
    setVisible(map, "rivm-noise", next.noise);
    setVisible(map, "rivm-no2", next.no2);
    setVisible(map, "bgt-green", next.green);
    setVisible(map, "bgt-water", next.water);
  }, []);

  const ensureRivmLayer = useCallback((map: mapboxgl.Map, overlay: "noise" | "no2") => {
    const sourceId = `rivm-${overlay}`;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "raster",
        tiles: [`/api/map/rivm/${overlay}/{z}/{x}/{y}`],
        tileSize: 256,
        attribution: overlay === "noise" ? "RIVM Lden" : "RIVM NO2",
      });
      map.addLayer({
        id: sourceId,
        type: "raster",
        source: sourceId,
        slot: "middle",
        paint: { "raster-opacity": 0.45 },
      });
    }
  }, []);

  const ensureBgtLayers = useCallback(async (map: mapboxgl.Map) => {
    if (map.getSource("bgt-green")) return;
    const response = await fetch(`/api/property/${encodeURIComponent(property.bagVboId)}/map-layers`);
    if (!response.ok) throw new Error("layers");
    const payload = (await response.json()) as MapLayersResponse;
    map.addSource("bgt-green", { type: "geojson", data: payload.green });
    map.addSource("bgt-water", { type: "geojson", data: payload.water });
    map.addLayer({
      id: "bgt-green",
      type: "fill",
      source: "bgt-green",
      slot: "bottom",
      paint: {
        "fill-color": MAP_COLORS.greenFill,
        "fill-opacity": 0.28,
        "fill-emissive-strength": 0.35,
      },
    });
    map.addLayer({
      id: "bgt-water",
      type: "fill",
      source: "bgt-water",
      slot: "bottom",
      paint: {
        "fill-color": MAP_COLORS.waterFill,
        "fill-opacity": 0.32,
        "fill-emissive-strength": 0.4,
      },
    });
  }, [property.bagVboId]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!mapRef.current || mapInstance.current || !token) return;

    mapboxgl.accessToken = token;
    const style = mapStyleUrl();
    const container = mapRef.current;
    container.replaceChildren();
    const map = new mapboxgl.Map({
      container,
      center: [lng, lat],
      zoom: MAP_CAMERA.zoom,
      pitch: MAP_CAMERA.pitch,
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
    map.on("error", (event) => {
      console.error("Mapbox failed to render", event.error);
    });

    map.on("load", () => {
      map.addSource("search-radius", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: {} },
      });
      map.addLayer({
        id: "search-radius",
        type: "circle",
        source: "search-radius",
        slot: "bottom",
        paint: {
          "circle-radius": 110,
          "circle-color": MAP_COLORS.accent,
          "circle-opacity": 0.1,
          "circle-stroke-color": MAP_COLORS.accentDeep,
          "circle-stroke-opacity": 0.4,
          "circle-stroke-width": 1,
          "circle-emissive-strength": 0.2,
        },
      });

      if (property.buildingGeometry) {
        map.addSource("building", {
          type: "geojson",
          data: { type: "Feature", geometry: property.buildingGeometry, properties: {} },
        });
        map.addLayer({
          id: "building-fill",
          type: "fill",
          source: "building",
          slot: "bottom",
          paint: {
            "fill-color": MAP_COLORS.accent,
            "fill-opacity": 0.22,
            "fill-emissive-strength": 0.35,
          },
        });
        map.addLayer({
          id: "building-line",
          type: "line",
          source: "building",
          slot: "bottom",
          paint: {
            "line-color": MAP_COLORS.accentDeep,
            "line-width": 2,
            "line-emissive-strength": 0.4,
          },
        });
      }

      if (nearbyProperties.length) {
        map.addSource("nearby-homes", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: nearbyProperties.map((home) => ({
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: [home.coordinates.lng, home.coordinates.lat] },
              properties: { address: home.addressLabel, distance: home.distanceM },
            })),
          },
        });
        map.addLayer({
          id: "nearby-homes",
          type: "circle",
          source: "nearby-homes",
          paint: {
            "circle-radius": 5,
            "circle-color": "#ffffff",
            "circle-stroke-color": MAP_COLORS.accentDeep,
            "circle-stroke-width": 2,
            "circle-emissive-strength": 0.5,
          },
        });
        map.on("click", "nearby-homes", (event) => {
          const feature = event.features?.[0];
          if (!feature || !event.lngLat) return;
          new mapboxgl.Popup({ offset: 8, className: "map-popup" })
            .setLngLat(event.lngLat)
            .setHTML(`<strong>${feature.properties?.address}</strong><br/>${feature.properties?.distance} m afstand`)
            .addTo(map);
        });
        map.on("mouseenter", "nearby-homes", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "nearby-homes", () => {
          map.getCanvas().style.cursor = "";
        });
      }

      addHomeMarker(map, lng, lat);
      applyOverlays(map, overlaysRef.current);
    });

    map.once("idle", () => {
      const highlighted = selectStandardBuilding(map, lng, lat);
      if (!highlighted && map.getSource("building") && !map.getLayer("building-extrusion")) {
        map.addLayer({
          id: "building-extrusion",
          type: "fill-extrusion",
          source: "building",
          slot: "middle",
          paint: {
            "fill-extrusion-color": MAP_COLORS.accent,
            "fill-extrusion-height": BAG_EXTRUSION_HEIGHT_M,
            "fill-extrusion-opacity": 0.72,
            "fill-extrusion-emissive-strength": 0.25,
          },
        });
      }
    });

    mapInstance.current = map;
    return () => {
      observer.disconnect();
      map.remove();
      mapInstance.current = null;
    };
  }, [applyOverlays, lat, lng, nearbyProperties, property.buildingGeometry]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !isMapboxStandardStyle(mapStyleUrl())) return;
    map.setConfigProperty("basemap", "lightPreset", lightPreset);
  }, [lightPreset]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    map.easeTo({ pitch: pitched ? MAP_CAMERA.pitch : MAP_CAMERA.flatPitch, duration: 500 });
    setVisible(map, "building-extrusion", pitched);
  }, [pitched]);

  async function toggleOverlay(id: OverlayId) {
    const next = { ...overlays, [id]: !overlays[id] };
    setOverlays(next);
    const map = mapInstance.current;
    if (!map) return;
    try {
      if ((id === "green" || id === "water") && next[id]) await ensureBgtLayers(map);
      if ((id === "noise" || id === "no2") && next[id]) ensureRivmLayer(map, id);
      applyOverlays(map, next);
      setLayerError(null);
    } catch {
      setLayerError("Deze laag kon niet worden geladen.");
    }
  }

  const activeNotes = [
    overlays.noise ? "RIVM wegverkeer Lden, screeningraster — geen gevelmeting." : null,
    overlays.no2 ? "RIVM NO2, screeningraster." : null,
    overlays.green || overlays.water ? "BGT groen en water binnen circa 250 m." : null,
    "Schaduw is een Mapbox-indicatie, geen zonstudie of gevelmeting.",
  ].filter(Boolean);

  if (!hasToken) {
    return (
      <div className="map-card map-empty">
        <div className="map-badge">
          <MapPinned size={12} /> locatie
        </div>
        <div className="map-empty-copy">
          <strong>3D-kaart niet beschikbaar</strong>
          <p>De interactieve Mapbox-kaart vereist een publieke Mapbox-token.</p>
          <span>{lat.toFixed(4)}, {lng.toFixed(4)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="map-card interactive-map">
      <div ref={mapRef} className="map-canvas" />
      <div className="map-badge">
        <MapPinned size={12} /> {nearbyProperties.length} woningen op de kaart
      </div>
      <div className="map-tools">
        <button type="button" onClick={() => setPitched((value) => !value)}>
          <Box size={12} /> {pitched ? "Plattegrond" : "3D"}
        </button>
        <div className="map-sun" role="group" aria-label="Zon en schaduw">
          <span className="map-sun-label"><SunMedium size={12} /> Zon</span>
          {LIGHT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={lightPreset === preset.id ? "selected" : undefined}
              onClick={() => {
                setLightPreset(preset.id);
                if (!pitched) setPitched(true);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="map-layers">
          <button type="button" aria-expanded={layersOpen} onClick={() => setLayersOpen((value) => !value)}>
            <Layers3 size={12} /> Lagen
          </button>
          {layersOpen && (
            <div className="map-layers-panel">
              {OVERLAYS.map((overlay) => (
                <label key={overlay.id}>
                  <input
                    type="checkbox"
                    checked={overlays[overlay.id]}
                    onChange={() => { void toggleOverlay(overlay.id); }}
                  />
                  {overlay.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="map-legend">
        <span><i className="legend-dot home" /> deze woning</span>
        {overlays.nearby && <span><i className="legend-dot nearby" /> omgeving</span>}
        <span className="map-sun-chip">{sunLabelForPreset(lightPreset)}</span>
      </div>
      <div className="map-source-notes">
        {activeNotes.map((note) => <small key={note}>{note}</small>)}
        {layerError && <small role="alert">{layerError}</small>}
        <span className="map-coordinates-inline">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
      </div>
    </div>
  );
}
