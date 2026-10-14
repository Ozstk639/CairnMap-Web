/** Shared CSS, collision and hit-box origin. Screen X points right, Y down. */
export type LabelPlacement = 'center' | 'near' | 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' | 'aboveLine' | 'belowLine';
const fractions: Record<LabelPlacement, [number, number]> = {
  center: [-.5, -.5], near: [-.5, -1.2], N: [-.5, -1], S: [-.5, 0], E: [0, -.5], W: [-1, -.5],
  NE: [0, -1], NW: [-1, -1], SE: [0, 0], SW: [-1, 0], aboveLine: [-.5, -1], belowLine: [-.5, 0],
};
export function labelPlacementTransform(placement: LabelPlacement): string {
  const [x, y] = fractions[placement];
  return `translate(${x * 100}%, ${y * 100}%)`;
}
export function labelScreenOffset(placement: LabelPlacement, offsetX = 0, offsetY = 0, screenOffsets = true): { x: number; y: number } {
  return screenOffsets ? { x: Number(offsetX) || 0, y: Number(offsetY) || 0 } : { x: 0, y: placement === 'near' ? -(Number(offsetY) || 0) : 0 };
}
export function placeLabel(anchor: { x: number; y: number }, size: { w: number; h: number }, placement: LabelPlacement, offsetX = 0, offsetY = 0, screenOffsets = true): { x: number; y: number; w: number; h: number } {
  const [x, y] = fractions[placement]; const offset = labelScreenOffset(placement, offsetX, offsetY, screenOffsets);
  return { x: anchor.x + size.w * x + offset.x, y: anchor.y + size.h * y + offset.y, w: size.w, h: size.h };
}
export function labelCandidateShift(candidate: 'C' | 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW', placement: LabelPlacement, size: { w: number; h: number }, gap: number): { dx: number; dy: number } {
  if (candidate === 'C') return { dx: 0, dy: 0 };
  const base = placeLabel({ x: 0, y: 0 }, size, placement);
  const next = placeLabel({ x: 0, y: 0 }, size, candidate);
  return { dx: next.x - base.x + (candidate.includes('E') ? gap : candidate.includes('W') ? -gap : 0), dy: next.y - base.y + (candidate.includes('N') ? -gap : candidate.includes('S') ? gap : 0) };
}

export function iconBoundsAtAnchor(anchor: { x: number; y: number }, size: [number, number], iconAnchor: [number, number], padding = 0): { x: number; y: number; w: number; h: number } {
  return { x: anchor.x - iconAnchor[0] - padding, y: anchor.y - iconAnchor[1] - padding, w: size[0] + padding * 2, h: size[1] + padding * 2 };
}
