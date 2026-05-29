import { getOpenRIAMapClassConfigs } from './openriamapRiaClasses';
import { getClassDisplayRules, getPrimaryClassDisplayRule } from './displayMetadata';
import type { CairnMapClassConfig } from './classTypes';
import type { CairnMapDisplayRule, CairnMapDisplayRuleMetadata } from './displayTypes';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

export function toDisplayRuleMetadata(
  rule: CairnMapDisplayRule,
  classConfig: Pick<CairnMapClassConfig, 'classCode'>
): CairnMapDisplayRuleMetadata {
  const labelEnabled = rule.label?.enabled !== false && Boolean(rule.label);
  return {
    classCode: classConfig.classCode,
    ruleId: rule.id,
    profileId: rule.profile,
    displayTier: rule.displayTier,
    geometryRender: rule.geometry?.render,
    labelEnabled,
    labelSource: labelEnabled ? rule.label?.source : undefined,
    labelStyleKey: labelEnabled ? rule.label?.styleKey : undefined,
    specialLogicKeys: toStringArray(rule.specialLogic?.map((item) => item.key)),
    bindingKeys: toStringArray(rule.bindings?.map((item) => item.key)),
    runtimeStatus: rule.runtimeStatus,
  };
}

export function toDisplayRuleMetadataList(): CairnMapDisplayRuleMetadata[] {
  return getOpenRIAMapClassConfigs().flatMap((classConfig) =>
    getClassDisplayRules(classConfig.classCode).map((rule) => toDisplayRuleMetadata(rule, classConfig))
  );
}

export function getDisplayRuleProfileId(classCode: string): string | undefined {
  return getPrimaryClassDisplayRule(classCode)?.profile;
}

export function getDisplayRuleLabelSource(classCode: string): string | undefined {
  const rule = getPrimaryClassDisplayRule(classCode);
  return rule?.label?.enabled === false ? undefined : rule?.label?.source;
}

export function getDisplayRuleLabelStyleKey(classCode: string): string | undefined {
  const rule = getPrimaryClassDisplayRule(classCode);
  return rule?.label?.enabled === false ? undefined : rule?.label?.styleKey;
}

export function getDisplayRuleSpecialLogicKeys(classCode: string): string[] {
  const rule = getPrimaryClassDisplayRule(classCode);
  return toStringArray(rule?.specialLogic?.map((item) => item.key));
}
