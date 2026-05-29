import type { FeatureRecord, LabelPlan, RenderRule } from '../../components/Rules/rendering/renderRules';

import { resolveClassDisplayRule, resolveLabelStyle } from './displayMetadata';
import { resolveDisplayRuntimeContractForClass } from './displayRuleRuntimeAdapter';
import { inspectSpecialDisplayLogicForClass } from './specialDisplayRuntimeBridge';
import { resolveDisplayAlgorithmRuntimeForClass } from './displayAlgorithmRuntimeBridge';

export const CONFIG_DISPLAY_POINT_OVERLAY_CLASS_CODES = [
  'TPP',
  'WRP',
  'TRP',
  'ISP',
  'SBP',
  'PLF',
  'STA',
] as const;

export const CONFIG_DISPLAY_LINE_OVERLAY_CLASS_CODES = [
  'RLE',
  'ROD',
  'ISL',
] as const;

export const CONFIG_DISPLAY_SURFACE_OVERLAY_CLASS_CODES = [
  'ISG',
  'BUD',
  'FLR',
  'STB',
  'STF',
  'PFB',
] as const;

export const CONFIG_DISPLAY_OVERLAY_CLASS_CODES = [
  ...CONFIG_DISPLAY_POINT_OVERLAY_CLASS_CODES,
  ...CONFIG_DISPLAY_LINE_OVERLAY_CLASS_CODES,
  ...CONFIG_DISPLAY_SURFACE_OVERLAY_CLASS_CODES,
] as const;

const CONFIG_DISPLAY_POINT_OVERLAY_CLASS_CODE_SET = new Set<string>(CONFIG_DISPLAY_POINT_OVERLAY_CLASS_CODES);
const CONFIG_DISPLAY_LINE_OVERLAY_CLASS_CODE_SET = new Set<string>(CONFIG_DISPLAY_LINE_OVERLAY_CLASS_CODES);
const CONFIG_DISPLAY_SURFACE_OVERLAY_CLASS_CODE_SET = new Set<string>(CONFIG_DISPLAY_SURFACE_OVERLAY_CLASS_CODES);
const CONFIG_DISPLAY_OVERLAY_CLASS_CODE_SET = new Set<string>(CONFIG_DISPLAY_OVERLAY_CLASS_CODES);

export type CairnMapDisplayOverlayGroup = 'point' | 'line' | 'surface' | 'none';

const ENABLE_DISPLAY_OVERLAY_SUCCESS_DEBUG = false;
const reportedOverlayIssues = new Set<string>();

type OverlaySeverity = 'error' | 'warn';

export type CairnMapDisplayOverlayResult =
  | {
      ok: true;
      classCode: string;
      ruleId: string;
      profileId: string;
      labelSource?: string;
      labelStyleKey?: string;
      specialLogicKeys: string[];
    }
  | {
      ok: false;
      classCode: string;
      reason: string;
      severity: OverlaySeverity;
    };

function normalizeClassCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function reportOverlayIssue(
  severity: OverlaySeverity,
  key: string,
  message: string,
  details?: Record<string, unknown>
): void {
  if (reportedOverlayIssues.has(key)) return;
  reportedOverlayIssues.add(key);

  const prefix = '[CairnMap Display Overlay]';
  if (details && Object.keys(details).length) {
    if (severity === 'error') console.error(`${prefix} ${message}`, details);
    else console.warn(`${prefix} ${message}`, details);
    return;
  }

  if (severity === 'error') console.error(`${prefix} ${message}`);
  else console.warn(`${prefix} ${message}`);
}

function getSpecialLogicKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText((item as Record<string, unknown> | null)?.key)).filter(Boolean);
}

function resolveRuntimeLabelStyleKey(labelStyleKey: string): string | undefined {
  const result = resolveLabelStyle(labelStyleKey);
  if (result.resolvedBy === 'missing' || result.resolvedBy === 'none') return undefined;

  const runtimeKey = normalizeText(result.labelStyle?.sourceRuntimeKey);
  if (runtimeKey) return runtimeKey;

  // Dynamic style registry IDs such as `rle-line-dynamic` and `gm-bw-dynamic`
  // document a runtime pattern, but they are not themselves concrete runtime
  // label style keys. Keep the legacy concrete key for those cases in
  // CM_DISPLAY_4 instead of writing the abstract registry ID into the rule.
  if (result.labelStyle?.sourceRuntimePattern) return undefined;

  return labelStyleKey;
}

export function getConfigDisplayOverlayGroup(classCode: string): CairnMapDisplayOverlayGroup {
  const normalized = normalizeClassCode(classCode);
  if (CONFIG_DISPLAY_POINT_OVERLAY_CLASS_CODE_SET.has(normalized)) return 'point';
  if (CONFIG_DISPLAY_LINE_OVERLAY_CLASS_CODE_SET.has(normalized)) return 'line';
  if (CONFIG_DISPLAY_SURFACE_OVERLAY_CLASS_CODE_SET.has(normalized)) return 'surface';
  return 'none';
}

export function isConfigDisplayOverlayEnabled(classCode: string): boolean {
  return CONFIG_DISPLAY_OVERLAY_CLASS_CODE_SET.has(normalizeClassCode(classCode));
}

export function getConfigDisplayOverlayForClass(classCodeInput: string): CairnMapDisplayOverlayResult {
  const classCode = normalizeClassCode(classCodeInput);
  if (!isConfigDisplayOverlayEnabled(classCode)) {
    return {
      ok: false,
      classCode,
      reason: 'Class is not in CM_DISPLAY_4 overlay whitelist.',
      severity: 'warn',
    };
  }

  const overlayGroup = getConfigDisplayOverlayGroup(classCode);
  const resolved = resolveClassDisplayRule(classCode);
  if (!resolved) {
    reportOverlayIssue(
      'error',
      `${classCode}:missing-primary-rule`,
      `Failed to resolve display overlay for class ${classCode}. Falling back to legacy display rule.`,
      {
        classCode,
        overlayGroup,
        reason: `Missing primary display rule in classes/${classCode}.json`,
        fallback: 'legacy featureRenderRules.ts',
        source: `project-config/packages/openriamap-ria/classes/${classCode}.json`,
      }
    );
    return {
      ok: false,
      classCode,
      reason: `Missing primary display rule in classes/${classCode}.json`,
      severity: 'error',
    };
  }

  const rule = resolved.rule;
  const profileId = normalizeText(rule.profile);
  if (!profileId || !resolved.profile) {
    reportOverlayIssue(
      'error',
      `${classCode}:missing-profile:${profileId || '<empty>'}`,
      `Failed to resolve display overlay for class ${classCode}. Falling back to legacy display rule.`,
      {
        classCode,
        overlayGroup,
        ruleId: rule.id,
        profile: profileId,
        reason: `Display profile "${profileId || '<empty>'}" not found in shared/displayProfiles.json`,
        fallback: 'legacy featureRenderRules.ts',
        source: `project-config/packages/openriamap-ria/classes/${classCode}.json`,
      }
    );
    return {
      ok: false,
      classCode,
      reason: `Display profile "${profileId || '<empty>'}" not found in shared/displayProfiles.json`,
      severity: 'error',
    };
  }

  const label = rule.label;
  const labelEnabled = Boolean(label) && label?.enabled !== false;
  const labelSource = labelEnabled ? normalizeText(label?.source) : '';
  const labelStyleKey = labelEnabled ? normalizeText(label?.styleKey) : '';

  if (labelEnabled && !labelSource) {
    reportOverlayIssue(
      'warn',
      `${classCode}:missing-label-source:${rule.id}`,
      `Label source missing for class ${classCode}. Falling back to legacy label.textFrom.`,
      {
        classCode,
        overlayGroup,
        ruleId: rule.id,
        fallback: 'legacy label.textFrom',
        source: `project-config/packages/openriamap-ria/classes/${classCode}.json`,
      }
    );
  }

  if (labelEnabled && labelStyleKey) {
    const labelStyleResult = resolveLabelStyle(labelStyleKey);
    if (labelStyleResult.resolvedBy === 'missing' || labelStyleResult.resolvedBy === 'none') {
      reportOverlayIssue(
        'warn',
        `${classCode}:missing-label-style:${labelStyleKey}`,
        `Label style "${labelStyleKey}" for class ${classCode} could not be resolved. Falling back to legacy label style.`,
        {
          classCode,
          ruleId: rule.id,
          labelStyleKey,
          fallback: 'legacy label.styleKey',
          source: `project-config/packages/openriamap-ria/classes/${classCode}.json`,
        }
      );
    }
  } else if (labelEnabled && !labelStyleKey) {
    reportOverlayIssue(
      'warn',
      `${classCode}:missing-label-style:<empty>`,
      `Label style missing for class ${classCode}. Falling back to legacy label style.`,
      {
        classCode,
        overlayGroup,
        ruleId: rule.id,
        fallback: 'legacy label.styleKey',
        source: `project-config/packages/openriamap-ria/classes/${classCode}.json`,
      }
    );
  }

  if (ENABLE_DISPLAY_OVERLAY_SUCCESS_DEBUG) {
    reportOverlayIssue(
      'warn',
      `${classCode}:success:${rule.id}`,
      `Resolved display overlay for class ${classCode}.`,
      { classCode, overlayGroup, ruleId: rule.id, profile: profileId, labelSource, labelStyleKey }
    );
  }

  const specialLogicKeys = getSpecialLogicKeys(rule.specialLogic);
  inspectSpecialDisplayLogicForClass(classCode, specialLogicKeys);
  const algorithmRuntime = resolveDisplayAlgorithmRuntimeForClass(classCode);
  for (const algorithm of algorithmRuntime) {
    if (!algorithm.registered || !algorithm.allowedForClass) {
      reportOverlayIssue(
        'error',
        `${classCode}:display-algorithm:${algorithm.key}`,
        `Display algorithm "${algorithm.key}" for class ${classCode} is not registered or not allowed.`,
        { classCode, algorithmKey: algorithm.key, registered: algorithm.registered, allowedForClass: algorithm.allowedForClass }
      );
    }
  }

  return {
    ok: true,
    classCode,
    ruleId: rule.id,
    profileId,
    labelSource: labelSource || undefined,
    labelStyleKey: labelStyleKey ? resolveRuntimeLabelStyleKey(labelStyleKey) : undefined,
    specialLogicKeys,
  };
}

export function getConfigLabelSourceForClass(classCode: string): string | null {
  const overlay = getConfigDisplayOverlayForClass(classCode);
  return overlay.ok ? overlay.labelSource ?? null : null;
}

export function getConfigLabelStyleKeyForClass(classCode: string): string | null {
  const overlay = getConfigDisplayOverlayForClass(classCode);
  return overlay.ok ? overlay.labelStyleKey ?? null : null;
}

function makeLabelTextFrom(source: string): Exclude<LabelPlan['textFrom'], string | undefined> {
  return (record: FeatureRecord): string => {
    const featureInfo = (record?.featureInfo ?? {}) as Record<string, unknown>;
    return normalizeText(featureInfo[source]);
  };
}

function isObjectLabelPlan(value: RenderRule['symbol']['label']): value is LabelPlan {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}


function applyConfigDisplayDeclaration<T extends RenderRule>(rule: T, overlay: Extract<CairnMapDisplayOverlayResult, { ok: true }>): T {
  const contract = resolveDisplayRuntimeContractForClass(overlay.classCode);
  if (contract.mode !== 'configPrimary') return rule;

  const configRule = contract.rule;
  if (!configRule) return rule;

  const legacyDisplay = rule.display ?? {};
  const configLabel = configRule.label;
  const nextDisplay = {
    ...legacyDisplay,
    profile: overlay.profileId,
    displayTier: configRule.displayTier ?? legacyDisplay.displayTier,
    geometry: configRule.geometry?.render
      ? {
          ...(legacyDisplay.geometry ?? {}),
          render: configRule.geometry.render,
        }
      : legacyDisplay.geometry,
    label: configLabel
      ? {
          ...(legacyDisplay.label ?? {}),
          enabled: configLabel.enabled !== false,
          source: overlay.labelSource ?? configLabel.source ?? legacyDisplay.label?.source,
          styleKey: overlay.labelStyleKey ?? configLabel.styleKey ?? legacyDisplay.label?.styleKey,
        }
      : legacyDisplay.label,
  } as RenderRule['display'];

  return {
    ...rule,
    display: nextDisplay,
  } as T;
}

export function applyConfigDisplayOverlayToRule<T extends RenderRule>(rule: T): T {
  const classCode = normalizeClassCode(rule.match?.Class);
  if (!classCode || !isConfigDisplayOverlayEnabled(classCode)) return rule;

  const overlay = getConfigDisplayOverlayForClass(classCode);
  if (!overlay.ok) return rule;

  const ruleWithDisplayDeclaration = applyConfigDisplayDeclaration(rule, overlay);
  const symbol = ruleWithDisplayDeclaration.symbol;
  const contract = resolveDisplayRuntimeContractForClass(classCode);
  const configLabelEnabled = contract.rule?.label?.enabled !== false;
  if (!symbol || !('label' in symbol)) {
    if (configLabelEnabled) {
      reportOverlayIssue(
        'warn',
        `${classCode}:missing-legacy-symbol-label`,
        `Legacy render rule for class ${classCode} has no symbol.label. Config overlay skipped.`,
        { classCode, overlayGroup: getConfigDisplayOverlayGroup(classCode), ruleName: rule.name, fallback: 'legacy render rule' }
      );
    }
    return ruleWithDisplayDeclaration;
  }

  const legacyLabel = symbol.label;
  if (typeof legacyLabel === 'function') {
    if (contract.preserveLegacyDynamicLabel) return ruleWithDisplayDeclaration;
    reportOverlayIssue(
      'warn',
      `${classCode}:dynamic-legacy-label`,
      `Dynamic label function found for class ${classCode}. Config overlay skipped.`,
      { classCode, overlayGroup: getConfigDisplayOverlayGroup(classCode), ruleName: rule.name, fallback: 'legacy label function' }
    );
    return ruleWithDisplayDeclaration;
  }

  if (!isObjectLabelPlan(legacyLabel)) {
    reportOverlayIssue(
      'warn',
      `${classCode}:invalid-legacy-label`,
      `Legacy label plan for class ${classCode} is not an object. Config overlay skipped.`,
      { classCode, overlayGroup: getConfigDisplayOverlayGroup(classCode), ruleName: rule.name, fallback: 'legacy render rule' }
    );
    return ruleWithDisplayDeclaration;
  }

  const nextLabel: LabelPlan = { ...legacyLabel };
  if (overlay.labelStyleKey) nextLabel.styleKey = overlay.labelStyleKey as LabelPlan['styleKey'];
  if (overlay.labelSource) nextLabel.textFrom = makeLabelTextFrom(overlay.labelSource);

  return {
    ...ruleWithDisplayDeclaration,
    symbol: {
      ...symbol,
      label: nextLabel,
    },
  } as T;
}
