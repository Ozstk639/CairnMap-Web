import type { CairnMapClassFieldConfig, CairnMapClassGroupConfig } from './classTypes';
import type { CairnMapResolvedClassSchema } from './schemaTypes';
import {
  flattenMultipartCoordinates,
  multipartGeometryFromSinglePath,
  readMultipartGeometry,
  validateMultipartGeometry,
  withCanonicalMultipartGeometry,
} from '../geometry/multipartGeometry';

export type CairnMapCoord2D = { x: number; z: number; y?: number };

export type CairnMapGenericFormatBuildArgs = {
  coords: CairnMapCoord2D[];
  values?: Record<string, unknown>;
  groups?: Record<string, unknown[]>;
  previousFeatureInfo?: Record<string, unknown>;
};

export type CairnMapGenericHydratedFormat = {
  values: Record<string, unknown>;
  groups: Record<string, unknown[]>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalize = (value: unknown): string => String(value ?? '').trim();

function coerceFieldValue(field: CairnMapClassFieldConfig, value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return field.optional || field.required === false ? undefined : value;
  }
  if (field.type === 'number') {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : value;
  }
  if (field.type === 'bool') return Boolean(value);
  return value;
}

function pickFields(fields: CairnMapClassFieldConfig[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const key = field.key;
    if (!key) continue;
    const value = coerceFieldValue(field, values[key]);
    if (value === undefined && (field.optional || field.required === false)) continue;
    out[key] = value;
  }
  return out;
}

export function buildGenericFeatureInfoFromSchema(
  schema: CairnMapResolvedClassSchema,
  args: CairnMapGenericFormatBuildArgs
): Record<string, unknown> {
  const values = args.values ?? {};
  const groups = args.groups ?? {};
  const out: Record<string, unknown> = {
    ...pickFields(schema.fields, values),
  };

  for (const group of schema.groups) {
    const items = groups[group.key];
    if (Array.isArray(items) && items.length > 0) out[group.key] = items;
  }

  return withCanonicalMultipartGeometry(
    out,
    multipartGeometryFromSinglePath(schema.geometry.type, args.coords),
  );
}

export function coordsFromGenericFeatureInfo(
  schema: CairnMapResolvedClassSchema,
  featureInfo: unknown
): CairnMapCoord2D[] {
  const resolved = readMultipartGeometry(featureInfo, schema.geometry.type, schema.geometry.sourceField);
  return flattenMultipartCoordinates(resolved.geometry).map((coord) => ({ x: coord.x, y: coord.y, z: coord.z }));
}

export function hydrateGenericFeatureInfoFromSchema(
  schema: CairnMapResolvedClassSchema,
  featureInfo: unknown
): CairnMapGenericHydratedFormat {
  const info = isObject(featureInfo) ? featureInfo : {};
  const values: Record<string, unknown> = {};
  for (const field of schema.fields) values[field.key] = info[field.key];

  const groups: Record<string, unknown[]> = {};
  for (const group of schema.groups) {
    const raw = info[group.key];
    groups[group.key] = Array.isArray(raw) ? raw : [];
  }

  return { values, groups };
}

function missingRequiredField(field: CairnMapClassFieldConfig, values: Record<string, unknown>): boolean {
  if (field.optional || field.required === false) return false;
  const value = values[field.key];
  if (value === undefined || value === null) return true;
  if (field.type === 'number') return !Number.isFinite(Number(value));
  if (field.type === 'bool') return false;
  return normalize(value).length === 0;
}

function minItemsForGroup(group: CairnMapClassGroupConfig): number {
  if (group.optional) return 0;
  return Number.isFinite(Number(group.minItems)) ? Number(group.minItems) : 1;
}

export function validateGenericFeatureInfoFromSchema(
  schema: CairnMapResolvedClassSchema,
  featureInfo: unknown
): string | undefined {
  const hydrated = hydrateGenericFeatureInfoFromSchema(schema, featureInfo);
  for (const field of schema.fields) {
    if (missingRequiredField(field, hydrated.values)) return `缺少 ${field.key}`;
  }
  for (const group of schema.groups) {
    const min = minItemsForGroup(group);
    const items = hydrated.groups[group.key] ?? [];
    if (items.length < min) return `${group.key} 至少需要 ${min} 条`;
  }
  const geometryRead = readMultipartGeometry(featureInfo, schema.geometry.type, schema.geometry.sourceField);
  if (geometryRead.error) return geometryRead.error;
  const geometryError = validateMultipartGeometry(geometryRead.geometry);
  if (schema.geometry.required !== false) {
    if (geometryError) return geometryError;
  }
  return undefined;
}
