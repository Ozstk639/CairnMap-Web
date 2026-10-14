import type { RenderStabilityExtension } from '@/configStudio/types';
/** Decide lifecycle reuse independently from geometry/Leaflet. Every reused
 * placement is reprojected by the renderer; state/content changes always win. */
export function shouldReuseNativePlacement(input: { settings?: RenderStabilityExtension; reason: string; sameContent: boolean; panDistancePx: number; sameZoom: boolean }): boolean {
  const { settings, reason, sameContent, panDistancePx, sameZoom } = input;
  if (!settings?.enabled || !sameContent) return false;
  if (reason === 'move' && settings.freezeDuringPan !== false) return true;
  if (reason === 'moveend') return settings.recomputeOnMoveEnd === false || sameZoom && panDistancePx <= (settings.hysteresisPx ?? 0);
  if (reason === 'zoomend') return settings.recomputeOnZoomEnd === false;
  return false;
}
