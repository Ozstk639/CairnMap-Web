import type { CairnMapClassFieldConfig, CairnMapClassGroupConfig } from './classTypes';
import type { CairnMapResolvedClassSchema } from './schemaTypes';

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

function buildPointCoordinate(coord: CairnMapCoord2D | undefined): Record<string, number> {
  const out: Record<string, number> = {
    x: Number(coord?.x ?? 0),
    z: Number(coord?.z ?? 0),
  };
  if (Number.isFinite(Number(coord?.y))) out.y = Number(coord?.y);
  return out;
}

function buildCoordinateArray(coords: CairnMapCoord2D[]): Array<[number, number] | [number, number, number]> {
  return coords.map((coord) => {
    const x = Number(coord.x);
    const z = Number(coord.z);
    if (Number.isFinite(Number(coord.y))) return [x, Number(coord.y), z];
    return [x, z];
  });
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

  const sourceField = schema.geometry.sourceField;
  if (schema.geometry.type === 'Point') {
    out[sourceField] = buildPointCoordinate(args.coords[0]);
  } else {
    out[sourceField] = buildCoordinateArray(args.coords);
  }

  return out;
}

function readPointCoordinate(value: unknown): CairnMapCoord2D[] {
  if (!isObject(value)) return [];
  const x = Number(value.x);
  const z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
  const y = Number(value.y);
  return [Number.isFinite(y) ? { x, z, y } : { x, z }];
}

function readCoordinateArray(value: unknown): CairnMapCoord2D[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!Array.isArray(item)) return null;
      const x = Number(item[0]);
      const z = item.length >= 3 ? Number(item[2]) : Number(item[1]);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      const y = item.length >= 3 ? Number(item[1]) : Number.NaN;
      return Number.isFinite(y) ? { x, z, y } : { x, z };
    })
    .filter((item): item is CairnMapCoord2D => Boolean(item));
}

export function coordsFromGenericFeatureInfo(
  schema: CairnMapResolvedClassSchema,
  featureInfo: unknown
): CairnMapCoord2D[] {
  const info = isObject(featureInfo) ? featureInfo : {};
  const value = info[schema.geometry.sourceField];
  if (schema.geometry.type === 'Point') return readPointCoordinate(value);
  return readCoordinateArray(value);
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
  const coords = coordsFromGenericFeatureInfo(schema, featureInfo);
  if (schema.geometry.required !== false) {
    if (schema.geometry.type === 'Point' && coords.length !== 1) return `${schema.geometry.sourceField} 必须包含 1 个点`;
    if (schema.geometry.type === 'LineString' && coords.length < 2) return `${schema.geometry.sourceField} 至少需要 2 个点`;
    if (schema.geometry.type === 'Polygon' && coords.length < 3) return `${schema.geometry.sourceField} 至少需要 3 个点`;
  }
  return undefined;
}
