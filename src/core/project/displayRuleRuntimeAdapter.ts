import { resolveClassDisplayRule } from './displayMetadata';
import { toDisplayRuleMetadata } from './displayRuleAdapter';
import { resolveRuntimeDisplayProfile } from './displayProfileRuntimeRegistry';
import { getOpenRIAMapClassConfigByCode } from './openriamapRiaClasses';
import { resolveDisplayAlgorithmRuntimeForClass } from './displayAlgorithmRuntimeBridge';
import { getOpenRIAMapDisplayRuntimeContractsConfig } from './openriamapRiaShared';
import {
  getRelationBindingsForClass,
  resolveSpecialDisplayLogicKeysForClass,
} from './specialDisplayRuntimeBridge';
import {
  DISPLAY_RUNTIME_CONFIG_PRIMARY_CLASS_CODES,
  DISPLAY_RUNTIME_CORE_CLASS_CODES,
  DISPLAY_RUNTIME_LEGACY_ALGORITHM_FALLBACK_CLASS_CODES,
  DISPLAY_RUNTIME_LINE_CLASS_CODES,
  DISPLAY_RUNTIME_POINT_CLASS_CODES,
  DISPLAY_RUNTIME_SURFACE_CLASS_CODES,
} from './displayRuntimeTypes';
import type {
  CairnMapDisplayRuntimeContract,
  CairnMapDisplayRuntimeMode,
  CairnMapDisplayRuntimeModePolicy,
  CairnMapDisplayRuntimeOverlayGroup,
} from './displayRuntimeTypes';

function normalizeClassCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

const DISPLAY_RUNTIME_CONFIG_PRIMARY_CLASS_CODE_SET = new Set<string>(DISPLAY_RUNTIME_CONFIG_PRIMARY_CLASS_CODES);
const DISPLAY_RUNTIME_LEGACY_ALGORITHM_FALLBACK_CLASS_CODE_SET = new Set<string>(DISPLAY_RUNTIME_LEGACY_ALGORITHM_FALLBACK_CLASS_CODES);
const DISPLAY_RUNTIME_CORE_CLASS_CODE_SET = new Set<string>(DISPLAY_RUNTIME_CORE_CLASS_CODES);
const DISPLAY_RUNTIME_POINT_CLASS_CODE_SET = new Set<string>(DISPLAY_RUNTIME_POINT_CLASS_CODES);
const DISPLAY_RUNTIME_LINE_CLASS_CODE_SET = new Set<string>(DISPLAY_RUNTIME_LINE_CLASS_CODES);
const DISPLAY_RUNTIME_SURFACE_CLASS_CODE_SET = new Set<string>(DISPLAY_RUNTIME_SURFACE_CLASS_CODES);

export function getDisplayRuntimeOverlayGroupForClass(classCode: string): CairnMapDisplayRuntimeOverlayGroup {
  const normalizedClassCode = normalizeClassCode(classCode);
  if (DISPLAY_RUNTIME_POINT_CLASS_CODE_SET.has(normalizedClassCode)) return 'point';
  if (DISPLAY_RUNTIME_LINE_CLASS_CODE_SET.has(normalizedClassCode)) return 'line';
  if (DISPLAY_RUNTIME_SURFACE_CLASS_CODE_SET.has(normalizedClassCode)) return 'surface';
  return 'none';
}

function isDisplayRuntimeCoreClass(classCode: string): boolean {
  return DISPLAY_RUNTIME_CORE_CLASS_CODE_SET.has(normalizeClassCode(classCode));
}


function getConfiguredDisplayRuntimeModePolicy(classCode: string): CairnMapDisplayRuntimeModePolicy | null {
  const normalizedClassCode = normalizeClassCode(classCode);
  const contract = getOpenRIAMapDisplayRuntimeContractsConfig().items.find(
    (item) => normalizeClassCode(item.classCode) === normalizedClassCode,
  );
  if (!contract) return null;
  return {
    mode: contract.mode,
    preserveLegacyDynamicLabel: contract.preserveLegacyDynamicLabel === true,
    fallbackReason: contract.fallbackReason,
  };
}

export function getDisplayRuntimeModePolicyForClass(classCode: string): CairnMapDisplayRuntimeModePolicy {
  const normalizedClassCode = normalizeClassCode(classCode);
  const configuredPolicy = getConfiguredDisplayRuntimeModePolicy(normalizedClassCode);
  if (configuredPolicy) return configuredPolicy;

  if (DISPLAY_RUNTIME_CONFIG_PRIMARY_CLASS_CODE_SET.has(normalizedClassCode)) {
    const preserveLegacyDynamicLabel = DISPLAY_RUNTIME_LINE_CLASS_CODE_SET.has(normalizedClassCode) || DISPLAY_RUNTIME_SURFACE_CLASS_CODE_SET.has(normalizedClassCode);
    return { mode: 'configPrimary', preserveLegacyDynamicLabel };
  }
  if (DISPLAY_RUNTIME_LEGACY_ALGORITHM_FALLBACK_CLASS_CODE_SET.has(normalizedClassCode)) {
    return { mode: 'legacyAlgorithmFallback', preserveLegacyDynamicLabel: true };
  }
  if (isDisplayRuntimeCoreClass(normalizedClassCode)) {
    return { mode: 'configOverlay' };
  }
  return { mode: 'legacyPrimary' };
}

export function getDisplayRuntimeModeForClass(classCode: string): CairnMapDisplayRuntimeMode {
  return getDisplayRuntimeModePolicyForClass(classCode).mode;
}

export function resolveDisplayRuntimeContractForClass(classCodeInput: string): CairnMapDisplayRuntimeContract {
  const classCode = normalizeClassCode(classCodeInput);
  const modePolicy = getDisplayRuntimeModePolicyForClass(classCode);
  const classConfig = getOpenRIAMapClassConfigByCode(classCode);
  const resolvedRule = resolveClassDisplayRule(classCode);
  const rule = resolvedRule?.rule ?? null;
  const runtimeProfile = rule ? resolveRuntimeDisplayProfile(rule.profile) : null;
  const specialLogic = resolveSpecialDisplayLogicKeysForClass(classCode);
  const relationBindings = getRelationBindingsForClass(classCode);
  const algorithmRuntime = resolveDisplayAlgorithmRuntimeForClass(classCode);
  const hasAlgorithmIssue = algorithmRuntime.some((item) => !item.registered || !item.allowedForClass);

  return {
    classCode,
    mode: modePolicy.mode,
    overlayGroup: getDisplayRuntimeOverlayGroupForClass(classCode),
    rule,
    ruleMetadata: rule && classConfig ? toDisplayRuleMetadata(rule, classConfig) : null,
    runtimeProfile,
    specialLogic,
    relationBindings,
    preserveLegacyDynamicLabel: modePolicy.preserveLegacyDynamicLabel === true,
    fallbackReason: modePolicy.fallbackReason ?? (!classConfig
      ? `Missing Class config for ${classCode}.`
      : !rule
        ? `Missing display rule for ${classCode}.`
        : runtimeProfile && !runtimeProfile.resolved
          ? `Missing runtime display profile for ${rule.profile}.`
          : hasAlgorithmIssue
            ? `One or more display algorithms are not registered or not allowed for ${classCode}.`
            : undefined),
  };
}

export function listDisplayRuntimeContractsForClasses(classCodes: string[]): CairnMapDisplayRuntimeContract[] {
  return classCodes.map((classCode) => resolveDisplayRuntimeContractForClass(classCode));
}
