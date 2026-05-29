import type { CairnMapClassConfig } from './classTypes';
import { getOpenRIAMapClassConfigByCode, getOpenRIAMapClassConfigs } from './openriamapRiaClasses';
import { getOpenRIAMapDisplayProfilesConfig, getOpenRIAMapLabelStylesConfig } from './openriamapRiaShared';
import type {
  CairnMapDisplayProfileConfig,
  CairnMapDisplayRule,
  CairnMapLabelStyleConfig,
  CairnMapResolvedClassDisplay,
  CairnMapResolvedDisplayRule,
  CairnMapResolvedLabelStyle,
} from './displayTypes';

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeClassCode(value: unknown): string {
  return normalizeId(value).toUpperCase();
}

function stylePatternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace('\\{size\\}', '\\d+');
  return new RegExp(`^${escaped}$`);
}

function normalizeDisplayRule(rule: unknown, fallbackClassCode: string): CairnMapDisplayRule | null {
  if (!rule || typeof rule !== 'object') return null;
  const record = rule as Record<string, unknown>;
  const id = normalizeId(record.id);
  const profile = normalizeId(record.profile);
  if (!id || !profile) return null;

  const matchRecord = (record.match && typeof record.match === 'object' ? record.match : {}) as Record<string, unknown>;
  const classCode = normalizeClassCode(matchRecord.classCode || fallbackClassCode);
  if (!classCode) return null;

  return {
    ...(record as Omit<CairnMapDisplayRule, 'id' | 'match' | 'profile'>),
    id,
    profile,
    match: {
      ...(matchRecord as CairnMapDisplayRule['match']),
      classCode,
    },
  };
}

function getClassDisplayRulesFromConfig(classConfig: CairnMapClassConfig): CairnMapDisplayRule[] {
  const rawRules = Array.isArray(classConfig.display?.rules) ? classConfig.display.rules : [];
  return rawRules
    .map((rule) => normalizeDisplayRule(rule, classConfig.classCode))
    .filter((rule): rule is CairnMapDisplayRule => Boolean(rule));
}

export function listDisplayProfiles(): CairnMapDisplayProfileConfig[] {
  return getOpenRIAMapDisplayProfilesConfig().items as CairnMapDisplayProfileConfig[];
}

export function listLabelStyles(): CairnMapLabelStyleConfig[] {
  return getOpenRIAMapLabelStylesConfig().items as CairnMapLabelStyleConfig[];
}

export function getDisplayProfileById(profileId: string): CairnMapDisplayProfileConfig | null {
  const normalized = normalizeId(profileId);
  if (!normalized) return null;
  return listDisplayProfiles().find((profile) => profile.id === normalized) ?? null;
}

export function resolveLabelStyle(styleKey: string | undefined | null): CairnMapResolvedLabelStyle {
  const key = normalizeId(styleKey);
  if (!key) return { labelStyle: null, resolvedBy: 'none' };

  const styles = listLabelStyles();
  const byId = styles.find((style) => style.id === key);
  if (byId) return { labelStyle: byId, resolvedBy: 'id' };

  const byRuntimeKey = styles.find((style) => style.sourceRuntimeKey === key);
  if (byRuntimeKey) return { labelStyle: byRuntimeKey, resolvedBy: 'sourceRuntimeKey' };

  const byPattern = styles.find((style) => {
    if (!style.sourceRuntimePattern) return false;
    return stylePatternToRegExp(style.sourceRuntimePattern).test(key);
  });
  if (byPattern) return { labelStyle: byPattern, resolvedBy: 'sourceRuntimePattern' };

  return { labelStyle: null, resolvedBy: 'missing' };
}

export function getLabelStyleByKey(styleKey: string): CairnMapLabelStyleConfig | null {
  return resolveLabelStyle(styleKey).labelStyle;
}

export function listClassDisplayRules(): CairnMapDisplayRule[] {
  return getOpenRIAMapClassConfigs().flatMap((classConfig) => getClassDisplayRulesFromConfig(classConfig));
}

export function getClassDisplayRules(classCode: string): CairnMapDisplayRule[] {
  const classConfig = getOpenRIAMapClassConfigByCode(classCode);
  return classConfig ? getClassDisplayRulesFromConfig(classConfig) : [];
}

export function getPrimaryClassDisplayRule(classCode: string): CairnMapDisplayRule | null {
  return getClassDisplayRules(classCode)[0] ?? null;
}

export function resolveClassDisplay(classCode: string): CairnMapResolvedClassDisplay {
  const rules = getClassDisplayRules(classCode);
  return {
    classCode: normalizeClassCode(classCode),
    rules,
    primaryRule: rules[0] ?? null,
  };
}

export function resolveClassDisplayRule(classCode: string, ruleId?: string): CairnMapResolvedDisplayRule | null {
  const rules = getClassDisplayRules(classCode);
  const requestedRuleId = normalizeId(ruleId);
  const rule = requestedRuleId ? rules.find((item) => item.id === requestedRuleId) : rules[0];
  if (!rule) return null;

  const labelStyleResult = resolveLabelStyle(rule.label?.styleKey);
  return {
    classCode: normalizeClassCode(classCode),
    rule,
    profile: getDisplayProfileById(rule.profile),
    labelStyle: labelStyleResult.labelStyle,
    labelStyleResolvedBy: labelStyleResult.resolvedBy,
  };
}

export function isKnownDisplayProfile(profileId: string): boolean {
  return getDisplayProfileById(profileId) !== null;
}

export function isKnownLabelStyleKey(styleKey: string): boolean {
  const result = resolveLabelStyle(styleKey);
  return result.resolvedBy !== 'missing' && result.resolvedBy !== 'none';
}
