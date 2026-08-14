"use client";

import { ExternalLink, MapPinned } from "lucide-react";
import type { Property } from "@/src/lib/types";

export function PropertyMap({ property }: { property: Property }) {
  const mapUrl = `https://www.openstreetmap.org/?mlat=${property.coordinates.lat}&mlon=${property.coordinates.lng}#map=17/${property.coordinates.lat}/${property.coordinates.lng}`;
  return <div className="map-card">
    <div className="map-grid" />
    <div className="map-badge"><MapPinned size={12} /> BAG-gebouw op kaart</div>
    <div className="building-outline" />
    <div className="map-pin"><MapPinned size={12} /></div>
    <div className="map-coordinates">{property.coordinates.lat.toFixed(4)}, {property.coordinates.lng.toFixed(4)}</div>
    <a className="secondary-button" style={{ position: "absolute", zIndex: 4, right: 14, top: 14, background: "rgba(255,255,255,.82)" }} href={mapUrl} target="_blank" rel="noreferrer">Open kaart <ExternalLink size={12} /></a>
  </div>;
}
