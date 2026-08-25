/**
 * Minimal structural surface of the Mapbox GL map used by the shared layer
 * helpers, so this module does not depend on mapbox-gl types.
 */
export type MapboxMapLike = {
  getSource(id: string): unknown;
  getLayer(id: string): unknown;
  addSource(id: string, source: unknown): unknown;
  addLayer(layer: unknown): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
};

export function addSourceIfMissing<S>(map: MapboxMapLike, id: string, source: S) {
  if (!map.getSource(id)) map.addSource(id, source);
}

export function addLayerIfMissing<L extends { id: string }>(map: MapboxMapLike, layer: L) {
  if (!map.getLayer(layer.id)) map.addLayer(layer);
}

export function setVisible(map: MapboxMapLike, layerIds: string | string[], visibility: boolean) {
  for (const layerId of Array.isArray(layerIds) ? layerIds : [layerIds]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility ? "visible" : "none");
    }
  }
}
