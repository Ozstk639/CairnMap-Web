import type { CairnMapClassConfig, CairnMapClassGeometryType } from './classTypes';
import { listClassConfigs, resolveCairnMapLocalizedLabel } from './classMetadata';

export type CairnMapWorkflowCatalogGeom = '点' | '线' | '面';
export type CairnMapWorkflowCatalogDrawMode = 'point' | 'polyline' | 'polygon';

export type CairnMapDerivedWorkflowCatalogEntry = {
  classKey: string;
  classCode: string;
  drawMode: CairnMapWorkflowCatalogDrawMode;
  kind: string;
  skind: string;
  skind2: string;
  name: string;
  geom: CairnMapWorkflowCatalogGeom;
};

const toDrawMode = (type: CairnMapClassGeometryType): CairnMapWorkflowCatalogDrawMode => {
  if (type === 'Point') return 'point';
  if (type === 'LineString') return 'polyline';
  return 'polygon';
};

const toGeom = (type: CairnMapClassGeometryType): CairnMapWorkflowCatalogGeom => {
  if (type === 'Point') return '点';
  if (type === 'LineString') return '线';
  return '面';
};

const normalize = (value: unknown): string => String(value ?? '').trim();

function deriveClassCatalogEntries(config: CairnMapClassConfig): CairnMapDerivedWorkflowCatalogEntry[] {
  const options = config.classification?.options ?? [];
  if (!options.length) return [];

  const classKey = config.sourceFeatureKey ?? config.classKey;
  const drawMode = toDrawMode(config.geometry.type);
  const geom = toGeom(config.geometry.type);

  return options
    .filter((option) => option.workflow?.visible !== false)
    .map((option) => ({
      classKey,
      classCode: config.classCode,
      drawMode: (normalize(option.drawMode) as CairnMapWorkflowCatalogDrawMode) || drawMode,
      kind: normalize(option.kind),
      skind: normalize(option.skind),
      skind2: normalize(option.skind2),
      name: resolveCairnMapLocalizedLabel(option.label, 'zh-CN', normalize(option.skind2) || normalize(option.skind) || normalize(option.kind)),
      geom: (normalize(option.geom) as CairnMapWorkflowCatalogGeom) || geom,
    }))
    .filter((entry) => Boolean(entry.classCode && entry.kind));
}

export function getClassConfigWorkflowCatalogEntries(): CairnMapDerivedWorkflowCatalogEntry[] {
  return listClassConfigs().flatMap(deriveClassCatalogEntries);
}
