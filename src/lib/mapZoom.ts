/** The single logical Zoom 0–8 / Leaflet -3–5 and tile range contract. */
export const MAP_ZOOM_BOUNDS = { minZoom: -3, maxZoom: 5 } as const;
export const TILE_ZOOM_BOUNDS = { ...MAP_ZOOM_BOUNDS, minNativeZoom: -2, maxNativeZoom: 3 } as const;
export function toZoomLevel(leafletZoom: number): number {
  return Math.max(0, Math.min(8, Math.round(leafletZoom + 3)));
}
export function toLeafletZoom(level: number): number {
  return Math.max(-3, Math.min(5, Math.round(Number(level)) - 3));
}
