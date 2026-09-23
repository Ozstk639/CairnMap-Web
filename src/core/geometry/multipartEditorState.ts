import type { MultipartGeometry } from './multipartGeometry';

export type MultipartPartRemoval = {
  nextPartIndex: number;
};

export type MultipartInnerSpaceRemoval = {
  partIndex: number;
  nextInnerSpaceIndex: number;
  hasInnerSpaces: boolean;
};

const clampIndex = (index: number, length: number): number => Math.max(0, Math.min(index, length - 1));

/**
 * Remove the currently selected component and return the index that should be
 * selected afterwards. This operation deliberately does not touch editor
 * coordinates: callers must persist the outgoing editor once before removal.
 */
export function removeMultipartPartAt(
  geometry: MultipartGeometry,
  activePartIndex: number,
): MultipartPartRemoval | null {
  if (geometry.parts.length <= 1) return null;
  const removedIndex = clampIndex(activePartIndex, geometry.parts.length);
  geometry.parts.splice(removedIndex, 1);
  return { nextPartIndex: Math.min(removedIndex, geometry.parts.length - 1) };
}

/**
 * Remove one hole from the selected polygon component. As with component
 * removal, callers own persistence of the outgoing editor and must not replay
 * its coordinates after this mutation.
 */
export function removeMultipartInnerSpaceAt(
  geometry: MultipartGeometry,
  activePartIndex: number,
  activeInnerSpaceIndex: number,
): MultipartInnerSpaceRemoval | null {
  if (geometry.type !== 'Polygon' || geometry.parts.length === 0) return null;
  const partIndex = clampIndex(activePartIndex, geometry.parts.length);
  const component = geometry.parts[partIndex];
  if (!component || component.length <= 1) return null;
  const removedInnerSpaceIndex = clampIndex(activeInnerSpaceIndex, component.length - 1);
  component.splice(removedInnerSpaceIndex + 1, 1);
  const hasInnerSpaces = component.length > 1;
  return {
    partIndex,
    nextInnerSpaceIndex: hasInnerSpaces ? Math.min(removedInnerSpaceIndex, component.length - 2) : 0,
    hasInnerSpaces,
  };
}
