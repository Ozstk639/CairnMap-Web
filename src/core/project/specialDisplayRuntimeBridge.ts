import { getPrimaryClassDisplayRule } from './displayMetadata';
import {
  getRelationBindingById,
  listRelationBindingsForClass,
  resolveSpecialDisplayLogicForClass,
} from './specialDisplayLogicMetadata';
import type {
  CairnMapRelationBindingItem,
  CairnMapResolvedSpecialLogic,
} from './specialDisplayLogicTypes';

export type CairnMapSpecialDisplayLogicFlagState = 'enabled' | 'disabled' | 'unknown';

export const SPECIAL_DISPLAY_LOGIC_FLAGS: Record<string, boolean> = {
  teleportPointBinding: true,
  warpPointBinding: true,
  tradePointCardBinding: true,
  genericPointIconBinding: true,

  buildingFloorBinding: false,
  buildingStructureBinding: false,
  floorViewBinding: false,

  stationPlatformVisibilityBinding: false,
  stationBuildingBinding: false,
  stationBuildingPointFallback: false,
  stationPointColorBinding: false,
  platformLineColorBinding: false,
  platformConnectVisibility: false,
  stationPlatformOutlineColorBinding: false,
  stationFloorViewBinding: false,

  railLineColorBinding: false,
  railDirectionVisibility: false,
  roadLineStyleBinding: false,
  roadZoomVisibility: false,
  largeGeometryStableAnchor: false,
  lineLabelPathBinding: false,
  geoClassificationStyleBinding: false,
  lineClassificationStyleBinding: false,
  hideIfSameIdExistsInClasses: false,
} as const;

const reportedSpecialLogicIssues = new Set<string>();

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeClassCode(value: unknown): string {
  return normalize(value).toUpperCase();
}

function reportSpecialLogicIssueOnce(
  severity: 'error' | 'warn',
  key: string,
  message: string,
  details?: Record<string, unknown>
): void {
  if (reportedSpecialLogicIssues.has(key)) return;
  reportedSpecialLogicIssues.add(key);

  const prefix = '[CairnMap Special Display Logic]';
  if (severity === 'error') console.error(`${prefix} ${message}`, details ?? {});
  else console.warn(`${prefix} ${message}`, details ?? {});
}

export function isSpecialDisplayLogicEnabled(key: string): boolean {
  return SPECIAL_DISPLAY_LOGIC_FLAGS[normalize(key)] === true;
}

export function getSpecialDisplayLogicFlagState(key: string): CairnMapSpecialDisplayLogicFlagState {
  const normalized = normalize(key);
  if (!normalized || !(normalized in SPECIAL_DISPLAY_LOGIC_FLAGS)) return 'unknown';
  return SPECIAL_DISPLAY_LOGIC_FLAGS[normalized] ? 'enabled' : 'disabled';
}

export function resolveSpecialDisplayLogicKeysForClass(classCode: string): CairnMapResolvedSpecialLogic[] {
  const normalizedClassCode = normalizeClassCode(classCode);
  const rule = getPrimaryClassDisplayRule(normalizedClassCode);
  const keys = Array.isArray(rule?.specialLogic)
    ? rule.specialLogic.map((item) => normalize(item.key)).filter(Boolean)
    : [];
  return resolveSpecialDisplayLogicForClass(normalizedClassCode, keys);
}

export function getRelationBindingsForClass(classCode: string): CairnMapRelationBindingItem[] {
  return listRelationBindingsForClass(classCode);
}

export function getRelationBindingDiagnosticsForClass(classCode: string): Array<{
  binding: CairnMapRelationBindingItem;
  direction: 'source' | 'target' | 'both';
  enabled: boolean;
}> {
  const normalizedClassCode = normalizeClassCode(classCode);
  return listRelationBindingsForClass(normalizedClassCode).map((binding) => {
    const isSource = normalizeClassCode(binding.sourceClass) === normalizedClassCode;
    const isTarget = normalizeClassCode(binding.targetClass) === normalizedClassCode;
    return {
      binding,
      direction: isSource && isTarget ? 'both' : isSource ? 'source' : 'target',
      enabled: isSpecialDisplayLogicEnabled(binding.bindingKey),
    };
  });
}

export function getRelationBindingByRuntimeId(id: string): CairnMapRelationBindingItem | null {
  return getRelationBindingById(id);
}

export function inspectSpecialDisplayLogicForClass(classCode: string, specialLogicKeys?: string[]): void {
  const normalizedClassCode = normalizeClassCode(classCode);
  const resolved = specialLogicKeys
    ? resolveSpecialDisplayLogicForClass(normalizedClassCode, specialLogicKeys)
    : resolveSpecialDisplayLogicKeysForClass(normalizedClassCode);

  for (const item of resolved) {
    if (!item.known) {
      reportSpecialLogicIssueOnce(
        'error',
        `${normalizedClassCode}:unknown-special-logic:${item.key}`,
        `Unknown specialLogic key "${item.key}" referenced by class ${normalizedClassCode}.`,
        {
          classCode: normalizedClassCode,
          key: item.key,
          fallback: 'legacy special display logic',
        }
      );
      continue;
    }

    if (!item.allowedForClass) {
      reportSpecialLogicIssueOnce(
        'error',
        `${normalizedClassCode}:disallowed-special-logic:${item.key}`,
        `specialLogic key "${item.key}" is not allowed for class ${normalizedClassCode}.`,
        {
          classCode: normalizedClassCode,
          key: item.key,
          allowedClasses: item.definition?.allowedClasses ?? [],
          fallback: 'legacy special display logic',
        }
      );
    }
  }
}
