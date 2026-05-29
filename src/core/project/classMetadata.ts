import type {
  CairnMapClassConfig,
  CairnMapClassFieldConfig,
  CairnMapClassGroupConfig,
  CairnMapClassTagItem,
  CairnMapLocalizedLabel,
} from './classTypes';
import {
  getOpenRIAMapClassConfigByCode,
  getOpenRIAMapClassConfigByKey,
  getOpenRIAMapClassConfigs,
} from './openriamapRiaClasses';

export type CairnMapResolvedTagRegistryEntry = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'bool' | 'select';
  options?: Array<{ label: string; value: string }>;
};

export type CairnMapResolvedExtensionNamespace = {
  classCode: string;
  id: string;
  label: string;
  allowCustomKeys?: boolean;
};

const DEFAULT_LOCALE = 'zh-CN';

export function resolveCairnMapLocalizedLabel(
  label: CairnMapLocalizedLabel | undefined,
  locale = DEFAULT_LOCALE,
  fallback = ''
): string {
  if (typeof label === 'string') return label || fallback;
  if (!label || typeof label !== 'object') return fallback;

  const exact = label[locale];
  if (typeof exact === 'string' && exact.trim()) return exact;

  const zh = label['zh-CN'];
  if (typeof zh === 'string' && zh.trim()) return zh;

  const en = label.en;
  if (typeof en === 'string' && en.trim()) return en;

  const first = Object.values(label).find((value) => typeof value === 'string' && value.trim());
  return typeof first === 'string' ? first : fallback;
}

const normalize = (value: unknown): string => String(value ?? '').trim();
const normalizeClassCode = (value: unknown): string => normalize(value).toUpperCase();

export function listClassConfigs(): CairnMapClassConfig[] {
  return getOpenRIAMapClassConfigs();
}

export function listClassCodes(): string[] {
  return listClassConfigs().map((item) => item.classCode);
}

export function getClassConfigByCode(classCode: string): CairnMapClassConfig | undefined {
  return getOpenRIAMapClassConfigByCode(classCode);
}

export function getClassConfigByFeatureKey(featureKey: string): CairnMapClassConfig | undefined {
  return getOpenRIAMapClassConfigByKey(featureKey);
}

export function getClassLabelByCode(classCode: string, locale = DEFAULT_LOCALE): string | undefined {
  const config = getClassConfigByCode(classCode);
  if (!config) return undefined;
  return resolveCairnMapLocalizedLabel(config.label, locale, config.classCode);
}

export function getClassLabelByFeatureKey(featureKey: string, locale = DEFAULT_LOCALE): string | undefined {
  const config = getClassConfigByFeatureKey(featureKey);
  if (!config) return undefined;
  return resolveCairnMapLocalizedLabel(config.label, locale, config.sourceFeatureKey ?? config.classKey);
}

export function getClassGeometryByCode(classCode: string): CairnMapClassConfig['geometry'] | undefined {
  return getClassConfigByCode(classCode)?.geometry;
}

export function getClassFieldConfig(classCode: string, fieldKey: string): CairnMapClassFieldConfig | undefined {
  const needle = normalize(fieldKey);
  if (!needle) return undefined;
  const config = getClassConfigByCode(classCode);
  return config?.fields.find(
    (field) => normalize(field.key) === needle || normalize(field.sourceRuntimeField) === needle
  );
}

export function getClassFieldLabel(classCode: string, fieldKey: string, locale = DEFAULT_LOCALE): string | undefined {
  const field = getClassFieldConfig(classCode, fieldKey);
  if (!field) return undefined;
  return resolveCairnMapLocalizedLabel(field.label, locale, field.key);
}

export function getClassGroupConfig(classCode: string, groupKey: string): CairnMapClassGroupConfig | undefined {
  const needle = normalize(groupKey);
  if (!needle) return undefined;
  const config = getClassConfigByCode(classCode);
  return config?.groups?.find((group) => normalize(group.key) === needle);
}

export function getClassGroupLabel(classCode: string, groupKey: string, locale = DEFAULT_LOCALE): string | undefined {
  const group = getClassGroupConfig(classCode, groupKey);
  if (!group) return undefined;
  return resolveCairnMapLocalizedLabel(group.label, locale, group.key);
}

export function getClassGroupFieldLabel(
  classCode: string,
  groupKey: string,
  fieldKey: string,
  locale = DEFAULT_LOCALE
): string | undefined {
  const group = getClassGroupConfig(classCode, groupKey);
  const needle = normalize(fieldKey);
  if (!group || !needle) return undefined;
  const field = group.fields.find(
    (item) => normalize(item.key) === needle || normalize(item.sourceRuntimeField) === needle
  );
  if (!field) return undefined;
  return resolveCairnMapLocalizedLabel(field.label, locale, field.key);
}

function normalizeTagType(value: unknown): CairnMapResolvedTagRegistryEntry['type'] {
  const raw = normalize(value).toLowerCase();
  if (raw === 'number') return 'number';
  if (raw === 'bool' || raw === 'boolean') return 'bool';
  if (raw === 'select') return 'select';
  return 'text';
}

function normalizeTagOptions(item: CairnMapClassTagItem): Array<{ label: string; value: string }> | undefined {
  if (!Array.isArray(item.options)) return undefined;
  const options = item.options
    .map((option) => {
      const value = String(option.value ?? '').trim();
      const label = String(option.label ?? value).trim();
      return value ? { label: label || value, value } : null;
    })
    .filter((option): option is { label: string; value: string } => Boolean(option));
  return options.length ? options : undefined;
}

export function getClassTagRegistryEntries(classCode?: string): CairnMapResolvedTagRegistryEntry[] {
  const targetClassCode = normalizeClassCode(classCode);
  const entries: CairnMapResolvedTagRegistryEntry[] = [];
  for (const config of listClassConfigs()) {
    if (targetClassCode && normalizeClassCode(config.classCode) !== targetClassCode) continue;
    if (!config.tags?.enabled) continue;
    for (const item of config.tags.items ?? []) {
      const key = normalize(item.key);
      if (!key) continue;
      entries.push({
        key,
        label: resolveCairnMapLocalizedLabel(item.label, DEFAULT_LOCALE, key),
        type: normalizeTagType(item.type),
        options: normalizeTagOptions(item),
      });
    }
  }
  return entries;
}

export function getClassConfigTagRegistryEntriesAsLegacyRecord(): Record<string, CairnMapResolvedTagRegistryEntry> {
  const record: Record<string, CairnMapResolvedTagRegistryEntry> = {};
  for (const entry of getClassTagRegistryEntries()) {
    if (!record[entry.key]) record[entry.key] = entry;
  }
  return record;
}

export function getClassExtensionNamespaces(classCode?: string): CairnMapResolvedExtensionNamespace[] {
  const targetClassCode = normalizeClassCode(classCode);
  const entries: CairnMapResolvedExtensionNamespace[] = [];
  for (const config of listClassConfigs()) {
    if (targetClassCode && normalizeClassCode(config.classCode) !== targetClassCode) continue;
    if (!config.extensions?.enabled) continue;
    for (const namespace of config.extensions.namespaces ?? []) {
      const id = normalize(namespace.id);
      if (!id) continue;
      entries.push({
        classCode: config.classCode,
        id,
        label: normalize(namespace.label) || id,
        allowCustomKeys: namespace.allowCustomKeys,
      });
    }
  }
  return entries;
}

export function getClassConfigByWorkflowKey(workflowKey: string): CairnMapClassConfig | undefined {
  const key = normalize(workflowKey);
  if (!key) return undefined;
  return listClassConfigs().find(
    (config) => config.sourceFeatureKey === key || config.classKey === key || config.classCode === key
  );
}

export function getClassFieldLabelByWorkflowKey(
  workflowKey: string,
  fieldKey: string,
  locale = DEFAULT_LOCALE
): string | undefined {
  const config = getClassConfigByWorkflowKey(workflowKey);
  return config ? getClassFieldLabel(config.classCode, fieldKey, locale) : undefined;
}

export function getClassGroupLabelByWorkflowKey(
  workflowKey: string,
  groupKey: string,
  locale = DEFAULT_LOCALE
): string | undefined {
  const config = getClassConfigByWorkflowKey(workflowKey);
  return config ? getClassGroupLabel(config.classCode, groupKey, locale) : undefined;
}

export function getClassGroupFieldLabelByWorkflowKey(
  workflowKey: string,
  groupKey: string,
  fieldKey: string,
  locale = DEFAULT_LOCALE
): string | undefined {
  const config = getClassConfigByWorkflowKey(workflowKey);
  return config ? getClassGroupFieldLabel(config.classCode, groupKey, fieldKey, locale) : undefined;
}
