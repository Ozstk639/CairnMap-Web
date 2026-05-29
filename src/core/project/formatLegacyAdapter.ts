import { getClassConfigByCode, getClassConfigByFeatureKey, listClassConfigs } from './classMetadata';
import type { CairnMapLegacyFormatSummary } from './formatTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();
const normalizeClassCode = (value: unknown): string => normalize(value).toUpperCase();

export function getFeatureKeyForClassCode(classCode: string): string | undefined {
  return getClassConfigByCode(classCode)?.sourceFeatureKey;
}

export function getClassCodeForFeatureKey(featureKey: string): string | undefined {
  return getClassConfigByFeatureKey(featureKey)?.classCode;
}

export function listKnownFeatureClassPairs(): Array<{ classCode: string; featureKey: string }> {
  return listClassConfigs()
    .map((config) => ({ classCode: config.classCode, featureKey: config.sourceFeatureKey ?? config.classKey }))
    .filter((item) => normalizeClassCode(item.classCode) && normalize(item.featureKey));
}

export function createLegacyFormatSummary(args: {
  featureKey: string;
  classCode?: string;
  fields?: Array<{ key?: string }>;
  groups?: Array<{ key?: string; fields?: Array<{ key?: string }> }>;
  modes?: string[];
}): CairnMapLegacyFormatSummary {
  return {
    featureKey: args.featureKey,
    classCode: args.classCode,
    modes: args.modes ?? [],
    fields: (args.fields ?? []).map((field) => normalize(field.key)).filter(Boolean),
    groups: (args.groups ?? []).map((group) => ({
      key: normalize(group.key),
      fields: (group.fields ?? []).map((field) => normalize(field.key)).filter(Boolean),
    })).filter((group) => group.key),
  };
}
