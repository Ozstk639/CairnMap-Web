import displayAlgorithmsConfigJson from '../../../project-config/presets/core-structures/shared/display/displayAlgorithms.json';

import type { CairnMapDisplayAlgorithmItem, CairnMapDisplayAlgorithmsConfig } from './displayAlgorithmTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();
const normalizeClassCode = (value: unknown): string => normalize(value).toUpperCase();

export const OPENRIAMAP_RIA_DISPLAY_ALGORITHMS_CONFIG =
  displayAlgorithmsConfigJson as CairnMapDisplayAlgorithmsConfig;

export function getDisplayAlgorithmsConfig(): CairnMapDisplayAlgorithmsConfig {
  return OPENRIAMAP_RIA_DISPLAY_ALGORITHMS_CONFIG;
}

export function listDisplayAlgorithms(): CairnMapDisplayAlgorithmItem[] {
  return OPENRIAMAP_RIA_DISPLAY_ALGORITHMS_CONFIG.items ?? [];
}

export function getDisplayAlgorithmByKey(key: string): CairnMapDisplayAlgorithmItem | undefined {
  const normalized = normalize(key);
  return listDisplayAlgorithms().find((item) => item.algorithmKey === normalized || item.id === normalized);
}

export function isDisplayAlgorithmAllowedForClass(key: string, classCode: string): boolean {
  const algorithm = getDisplayAlgorithmByKey(key);
  if (!algorithm) return false;
  const allowedClasses = algorithm.allowedClasses ?? [];
  if (allowedClasses.length === 0) return true;
  const normalizedClassCode = normalizeClassCode(classCode);
  return allowedClasses.map(normalizeClassCode).includes(normalizedClassCode);
}
