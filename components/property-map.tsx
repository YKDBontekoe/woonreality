"use client";

import { ExternalLink, Layers3, MapPinned } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as mapboxgl from "mapbox-gl/esm";
import "mapbox-gl/dist/mapbox-gl.css";
import type { NearbyProperty, Property } from "@/src/lib/types";

export function PropertyMap({ property, nearbyProperties = [] }: { property: Property; nearbyProperties?: NearbyProperty[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const [showBuilding, setShowBuilding] = useState(true);
  const mapUrl = `https://www.openstreetmap.org/?mlat=${property.coordinates.lat}&mlon=${property.coordinates.lng}#map=17/${property.coordinates.lat}/${property.coordinates.lng}`;
  const delta = 0.0035;
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${property.coordinates.lng - delta}%2C${property.coordinates.lat - delta}%2C${property.coordinates.lng + delta}%2C${property.coordinates.lat + delta}&layer=mapnik&marker=${property.coordinates.lat}%2C${property.coordinates.lng}`;

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
      map.addLayer({ id: "search-radius", type: "circle", source: "search-radius", paint: { "circle-radius": 110, "circle-color": "#0a84ff", "circle-opacity": 0.10, "circle-stroke-color": "#2770ca", "circle-stroke-opacity": 0.4, "circle-stroke-width": 1 } });
      if (property.buildingGeometry) {
        map.addSource("building", { type: "geojson", data: { type: "Feature", geometry: property.buildingGeometry, properties: {} } });
        map.addLayer({ id: "building-fill", type: "fill", source: "building", paint: { "fill-color": "#184170", "fill-opacity": 0.42 } });
        map.addLayer({ id: "building-line", type: "line", source: "building", paint: { "line-color": "#102e55", "line-width": 2 } });
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
        map.addLayer({ id: "nearby-homes", type: "circle", source: "nearby-homes", paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#2770ca", "circle-stroke-width": 2 } });
        map.on("click", "nearby-homes", (event) => {
          const feature = event.features?.[0];
          if (!feature || !event.lngLat) return;
          new mapboxgl.Popup({ offset: 8 }).setLngLat(event.lngLat).setHTML(`<strong>${feature.properties?.address}</strong><br/>${feature.properties?.distance} m afstand`).addTo(map);
        });
        map.on("mouseenter", "nearby-homes", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "nearby-homes", () => { map.getCanvas().style.cursor = ""; });
      }
      new mapboxgl.Marker({ color: "#ff9f0a" }).setLngLat([property.coordinates.lng, property.coordinates.lat]).addTo(map);
    });
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, [property, nearbyProperties]);

  useEffect(() => {
    if (!mapInstance.current || !property.buildingGeometry) return;
    for (const id of ["building-fill", "building-line"]) {
      if (mapInstance.current.getLayer(id)) mapInstance.current.setLayoutProperty(id, "visibility", showBuilding ? "visible" : "none");
    }
  }, [property.buildingGeometry, showBuilding]);

  const hasToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  return <div className="map-card interactive-map">{hasToken ? <div ref={mapRef} className="map-canvas" /> : <iframe className="map-osm-frame" title={`Kaart van ${property.addressLabel}`} src={embedUrl} loading="lazy" />}<div className="map-badge"><MapPinned size={12} /> {hasToken ? `${nearbyProperties.length} woningen op de kaart` : "locatie & omgeving"}</div><div className="map-controls">{hasToken && <button type="button" onClick={() => setShowBuilding((value) => !value)}><Layers3 size={12} /> {showBuilding ? "Gebouw verbergen" : "Gebouw tonen"}</button>}<a className="secondary-button" href={mapUrl} target="_blank" rel="noreferrer">Grotere kaart <ExternalLink size={12} /></a></div>{hasToken && <><div className="map-legend"><span><i className="legend-dot home" /> deze woning</span><span><i className="legend-dot nearby" /> omgeving</span></div><div className="map-coordinates">{property.coordinates.lat.toFixed(4)}, {property.coordinates.lng.toFixed(4)}</div></>}</div>;
}
