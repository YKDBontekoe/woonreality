"use client";

import { ExternalLink, Layers3, MapPinned } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as mapboxgl from "mapbox-gl/esm";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Property } from "@/src/lib/types";

export function PropertyMap({ property }: { property: Property }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const [showBuilding, setShowBuilding] = useState(true);
  const mapUrl = `https://www.openstreetmap.org/?mlat=${property.coordinates.lat}&mlon=${property.coordinates.lng}#map=17/${property.coordinates.lat}/${property.coordinates.lng}`;

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!mapRef.current || mapInstance.current || !token) return;
    mapboxgl.setAccessToken(token);
    const map = new mapboxgl.Map({
      container: mapRef.current,
      center: [property.coordinates.lng, property.coordinates.lat],
      zoom: 16,
      attributionControl: true,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "mapbox://styles/mapbox/streets-v12",
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      map.addSource("search-radius", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: [property.coordinates.lng, property.coordinates.lat] }, properties: {} } });
      map.addLayer({ id: "search-radius", type: "circle", source: "search-radius", paint: { "circle-radius": 110, "circle-color": "#76b894", "circle-opacity": 0.12, "circle-stroke-color": "#4a8f65", "circle-stroke-opacity": 0.45, "circle-stroke-width": 1 } });
      if (property.buildingGeometry) {
        map.addSource("building", { type: "geojson", data: { type: "Feature", geometry: property.buildingGeometry, properties: {} } });
        map.addLayer({ id: "building-fill", type: "fill", source: "building", paint: { "fill-color": "#244b3c", "fill-opacity": 0.42 } });
        map.addLayer({ id: "building-line", type: "line", source: "building", paint: { "line-color": "#173c2d", "line-width": 2 } });
      }
      new mapboxgl.Marker({ color: "#dc795e" }).setLngLat([property.coordinates.lng, property.coordinates.lat]).addTo(map);
    });
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, [property]);

  useEffect(() => {
    if (!mapInstance.current || !property.buildingGeometry) return;
    for (const id of ["building-fill", "building-line"]) {
      if (mapInstance.current.getLayer(id)) mapInstance.current.setLayoutProperty(id, "visibility", showBuilding ? "visible" : "none");
    }
  }, [property.buildingGeometry, showBuilding]);

  const hasToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  return <div className="map-card interactive-map"><div className="map-fallback-grid" /><div ref={mapRef} className="map-canvas" />{!hasToken && <div className="map-token-notice">Voeg <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> toe om de Mapbox-kaart te laden.</div>}<div className="map-badge"><MapPinned size={12} /> {hasToken ? "interactieve kaart" : "kaartvoorbeeld"}</div><div className="map-controls"><button type="button" onClick={() => setShowBuilding((value) => !value)}><Layers3 size={12} /> {showBuilding ? "Gebouw verbergen" : "Gebouw tonen"}</button><a className="secondary-button" href={mapUrl} target="_blank" rel="noreferrer">Open kaart <ExternalLink size={12} /></a></div><div className="map-coordinates">{property.coordinates.lat.toFixed(4)}, {property.coordinates.lng.toFixed(4)}</div></div>;
}
