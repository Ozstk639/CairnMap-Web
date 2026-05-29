import { getClassConfigWorkflowCatalogEntries } from '@/core/project/classCatalogAdapter';
import { listClassConfigs } from '@/core/project/classMetadata';
import { getOpenRIAMapWorldsConfig } from '@/core/project/openriamapRiaEnvironment';

export const DATA_TOOL_SCHEMA_VERSION = '1.1.0';
export const SPECIAL_CLASS_LIST = ['ISG', 'ISL', 'ISP'] as const;
export const BASE_FEATURE_CLASS_LIST = ['RLE', 'STA', 'STB', 'PLF', 'PFB', 'SBP'] as const;

export type DataToolSchema = {
  schemaVersion: string;
  worlds: Record<string, number>;
  featureClasses: string[];
  specialClasses: string[];
  workflowKinds: Record<string, string[]>;
  workflowSubKinds: Record<string, Record<string, string[]>>;
  classToDrawMode: Record<string, string>;
  classToGeometry: Record<string, string>;
};

const sortObjectKeys = <T>(obj: Record<string, T>): Record<string, T> => Object.fromEntries(
  Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, 'zh-CN')),
) as Record<string, T>;

const geometryToDrawMode = (geometryType: string): string => {
  if (geometryType === 'Point') return 'point';
  if (geometryType === 'LineString') return 'polyline';
  return 'polygon';
};

const geometryToChineseName = (geometryType: string): string => {
  if (geometryType === 'Point') return '点';
  if (geometryType === 'LineString') return '线';
  return '面';
};

export function buildWorldCodeMapFromConfig(): Record<string, number> {
  const worlds: Record<string, number> = {};
  for (const item of getOpenRIAMapWorldsConfig().items ?? []) {
    const id = String(item.id ?? '').trim();
    const code = Number(item.numericCode);
    if (id && Number.isFinite(code)) worlds[id] = code;
  }
  return sortObjectKeys(worlds);
}

export function buildDataToolSchema(): DataToolSchema {
  const featureClasses = new Set<string>(BASE_FEATURE_CLASS_LIST);
  const workflowKinds: Record<string, Set<string>> = {};
  const workflowSubKinds: Record<string, Record<string, Set<string>>> = {};
  const classToDrawMode: Record<string, string> = {};
  const classToGeometry: Record<string, string> = {};

  for (const config of listClassConfigs()) {
    const classCode = String(config.classCode ?? '').trim().toUpperCase();
    if (!classCode) continue;
    featureClasses.add(classCode);
    classToDrawMode[classCode] = geometryToDrawMode(config.geometry.type);
    classToGeometry[classCode] = geometryToChineseName(config.geometry.type);
  }

  for (const item of getClassConfigWorkflowCatalogEntries()) {
    const classCode = String(item.classCode ?? '').trim().toUpperCase();
    if (!classCode) continue;
    featureClasses.add(classCode);
    (workflowKinds[classCode] ??= new Set<string>()).add(item.kind);
    if (item.skind) {
      ((workflowSubKinds[classCode] ??= {})[item.kind] ??= new Set<string>()).add(item.skind);
    }
    if (!classToDrawMode[classCode]) classToDrawMode[classCode] = item.drawMode;
    if (!classToGeometry[classCode]) classToGeometry[classCode] = item.geom;
  }

  const workflowKindsSorted = sortObjectKeys(
    Object.fromEntries(
      Object.entries(workflowKinds).map(([classCode, set]) => [classCode, Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'))]),
    ),
  );

  const workflowSubKindsSorted = sortObjectKeys(
    Object.fromEntries(
      Object.entries(workflowSubKinds).map(([classCode, byKind]) => [
        classCode,
        sortObjectKeys(
          Object.fromEntries(
            Object.entries(byKind).map(([kind, set]) => [kind, Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'))]),
          ),
        ),
      ]),
    ),
  );

  return {
    schemaVersion: DATA_TOOL_SCHEMA_VERSION,
    worlds: buildWorldCodeMapFromConfig(),
    featureClasses: Array.from(featureClasses).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    specialClasses: Array.from(SPECIAL_CLASS_LIST),
    workflowKinds: workflowKindsSorted,
    workflowSubKinds: workflowSubKindsSorted,
    classToDrawMode: sortObjectKeys(classToDrawMode),
    classToGeometry: sortObjectKeys(classToGeometry),
  };
}

export const DATA_TOOL_SCHEMA = buildDataToolSchema();
