// CairnMap FINAL CLEANUP: legacy format facade + special formatter executor bridge only.
// Do not add Class/field/display/workflow definitions here. Runtime definitions belong in project-config presets.
import { getClassConfigWorkflowCatalogEntries } from '../../core/project/classCatalogAdapter';
import {
  getClassConfigTagRegistryEntriesAsLegacyRecord,
  listClassConfigs,
  resolveCairnMapLocalizedLabel,
} from '../../core/project/classMetadata';
import { getClassSchema, getClassSchemaByFeatureKey } from '../../core/project/schemaMetadata';
import type { CairnMapClassConfig, CairnMapClassFieldConfig, CairnMapClassGroupConfig } from '../../core/project/classTypes';
import { stringifyFeatureJsonArray } from './featureJsonSerializer';
import { buildWorldCodeMapFromConfig } from './buildDataToolSchema';

export type WorkflowCatalogGeom = '点' | '线' | '面';

export type WorkflowFeatureCatalogEntry = {
  classKey: '地物点' | '地物线' | '地物面' | '建筑' | '建筑楼层' | '道路' | '传送点' | 'Warp点' | '交易点' | string;
  classCode: 'ISP' | 'ISL' | 'ISG' | 'BUD' | 'FLR' | 'ROD' | 'TPP' | 'WRP' | 'TRP' | string;
  drawMode: 'point' | 'polyline' | 'polygon';
  kind: string;
  skind: string;
  skind2: string;
  name: string;
  geom: WorkflowCatalogGeom;
};

export const WORKFLOW_FEATURE_CATALOG: WorkflowFeatureCatalogEntry[] = getClassConfigWorkflowCatalogEntries() as WorkflowFeatureCatalogEntry[];

const getRuntimeWorkflowFeatureCatalog = (): WorkflowFeatureCatalogEntry[] => WORKFLOW_FEATURE_CATALOG;

export function listCatalogSKind2Options(args: {
  kind: string;
  skind: string;
  geom?: WorkflowCatalogGeom;
}) {
  const kind = String(args.kind ?? '').trim();
  const skind = String(args.skind ?? '').trim();
  const geom = args.geom;

  return getRuntimeWorkflowFeatureCatalog()
    .filter((e) => e.kind === kind && e.skind === skind && (geom ? e.geom === geom : true))
    .map((e) => ({
      skind2: e.skind2,
      name: e.name,
      label: `${e.name}（${e.skind2}）`,
      entry: e,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
}

export function listCatalogKindOptions(args: { kind: string; geom?: WorkflowCatalogGeom }) {
  const kind = String(args.kind ?? '').trim();
  const geom = args.geom;

  return getRuntimeWorkflowFeatureCatalog()
    .filter((e) => e.kind === kind && (geom ? e.geom === geom : true))
    .map((e) => ({
      skind: e.skind,
      skind2: e.skind2,
      name: e.name,
      label: `${e.name}（${e.skind}/${e.skind2}）`,
      entry: e,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
}

export function listCatalogClassOptions(args: { classCode: string; geom?: WorkflowCatalogGeom }) {
  const classCode = String(args.classCode ?? '').trim().toUpperCase();
  const geom = args.geom;

  return getRuntimeWorkflowFeatureCatalog()
    .filter((e) => String(e.classCode ?? '').toUpperCase() === classCode && (geom ? e.geom === geom : true))
    .map((e) => ({
      kind: e.kind,
      skind: e.skind,
      name: e.name,
      label: `${e.name}（${e.kind}/${e.skind}）`,
      entry: e,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
}

export type TagPrimitive = string | number | boolean | null;

export type TagRegistryEntry = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'bool' | 'select';
  options?: Array<{ label: string; value: string }>;
};

export const TAG_KEY_OTHER = '__other__';

export const EXT_VALUE_TYPE_TEXT = 'text' as const;
export const EXT_VALUE_TYPE_NUMBER = 'number' as const;
export const EXT_VALUE_TYPE_BOOL = 'bool' as const;
export const EXT_VALUE_TYPE_NULL = 'null' as const;

export type ExtValueType =
  | typeof EXT_VALUE_TYPE_TEXT
  | typeof EXT_VALUE_TYPE_NUMBER
  | typeof EXT_VALUE_TYPE_BOOL
  | typeof EXT_VALUE_TYPE_NULL;

export type DrawMode = 'point' | 'polyline' | 'polygon';
export type BuildOp = 'create' | 'edit' | 'import';

export type FeatureKey =
  | '默认'
  | '车站'
  | '站台'
  | '铁路'
  | '站台轮廓'
  | '车站建筑'
  | '车站建筑点'
  | '车站建筑楼层'
  | '道路'
  | '传送点'
  | 'Warp点'
  | '交易点'
  | '地物点'
  | '地物线'
  | '地物面'
  | '建筑'
  | '建筑楼层';

export type ImportFormat =
  | '点'
  | '线'
  | '面'
  | '批量'
  | Exclude<FeatureKey, '默认'>;

export const EXT_VALUE_TYPE_OPTIONS: Array<{ label: string; value: ExtValueType }> = [
  { label: '文本', value: EXT_VALUE_TYPE_TEXT },
  { label: '数字', value: EXT_VALUE_TYPE_NUMBER },
  { label: '布尔', value: EXT_VALUE_TYPE_BOOL },
  { label: '空(null)', value: EXT_VALUE_TYPE_NULL },
];

const LEGACY_TAG_REGISTRY: Record<string, TagRegistryEntry> = {
  category: { key: 'category', label: '分类(category)', type: 'text' },
  level: { key: 'level', label: '等级(level)', type: 'number' },
  status: { key: 'status', label: '状态(status)', type: 'text' },
  source: { key: 'source', label: '来源(source)', type: 'text' },
};

export const TAG_REGISTRY: Record<string, TagRegistryEntry> = {
  ...getClassConfigTagRegistryEntriesAsLegacyRecord(),
  ...LEGACY_TAG_REGISTRY,
};

export const TAG_KEY_OPTIONS: Array<{ label: string; value: string }> = (() => {
  const opts = Object.values(TAG_REGISTRY)
    .map((e) => ({ label: e.label, value: e.key }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
  opts.push({ label: '其他（自定义）', value: TAG_KEY_OTHER });
  return opts;
})();

const isTagPrimitive = (v: unknown): v is TagPrimitive => v === null || ['string', 'number', 'boolean'].includes(typeof v);

const coerceTagPrimitive = (key: string, raw: unknown): TagPrimitive | undefined => {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const t = TAG_REGISTRY[key]?.type;
  if (t === 'number') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const n = Number(String(raw).trim());
    return Number.isFinite(n) ? n : String(raw);
  }
  if (t === 'bool') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
    return String(raw);
  }
  return typeof raw === 'string' ? raw : String(raw);
};

const validateTagsObjectSoft = (tags: unknown): string | null => {
  if (tags === undefined || tags === null) return null;
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return 'tags 必须是对象';
  for (const [k, v] of Object.entries(tags)) {
    if (!isTagPrimitive(v)) return `tags.${k} 必须是 string/number/bool/null`;
    const def = TAG_REGISTRY[k];
    if (!def) continue;
    if (def.type === 'number' && typeof v !== 'number') {
      const n = Number(String(v).trim());
      if (!Number.isFinite(n)) return `tags.${k} 期望 number`;
    }
    if (def.type === 'bool' && typeof v !== 'boolean') {
      const s = String(v).trim().toLowerCase();
      if (s !== 'true' && s !== 'false') return `tags.${k} 期望 bool`;
    }
    if (def.type === 'select' && typeof v !== 'string') return `tags.${k} 期望 string`;
  }
  return null;
};

const validateExtensionsObjectSoft = (ext: unknown): string | null => {
  if (ext === undefined || ext === null) return null;
  if (!ext || typeof ext !== 'object' || Array.isArray(ext)) return 'extensions 必须是对象';
  for (const [g, v] of Object.entries(ext)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return `extensions.${g} 必须是对象`;
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
      if (!isTagPrimitive(vv)) return `extensions.${g}.${k} 必须是 string/number/bool/null`;
    }
  }
  return null;
};

const buildTagsFromGroupItems = (items: unknown[]): Record<string, TagPrimitive> => {
  const out: Record<string, TagPrimitive> = {};
  for (const it of items ?? []) {
    const row = it as Record<string, unknown>;
    const keyRaw = String(row?.tagKey ?? '').trim();
    const key = keyRaw === TAG_KEY_OTHER ? String(row?.tagKeyOther ?? '').trim() : keyRaw;
    if (!key) continue;
    const rawVal = row?.tagValue;
    const sval = String(rawVal ?? '').trim();
    if (!sval && rawVal !== 0 && rawVal !== false) continue;
    const coerced = coerceTagPrimitive(key, rawVal);
    if (coerced !== undefined) out[key] = coerced;
  }
  return out;
};

const flattenTagsToGroupItems = (tags: unknown): Record<string, unknown>[] => {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return [];
  const out: Record<string, unknown>[] = [];
  for (const [k, v] of Object.entries(tags)) {
    if (!isTagPrimitive(v)) continue;
    const known = Boolean(TAG_REGISTRY[k]);
    out.push({
      tagKey: known ? k : TAG_KEY_OTHER,
      tagKeyOther: known ? '' : k,
      tagValue: v === null ? 'null' : String(v),
    });
  }
  return out;
};

const buildExtensionsFromGroupItems = (items: unknown[]): Record<string, Record<string, TagPrimitive>> => {
  const out: Record<string, Record<string, TagPrimitive>> = {};
  for (const it of items ?? []) {
    const row = it as Record<string, unknown>;
    const g = String(row?.extGroup ?? '').trim();
    const k = String(row?.extKey ?? '').trim();
    const t = (row?.extType ?? EXT_VALUE_TYPE_TEXT) as ExtValueType;
    const rawVal = row?.extValue;
    if (!g || !k) continue;
    if (t === EXT_VALUE_TYPE_NULL) {
      (out[g] ??= {})[k] = null;
      continue;
    }
    const sval = String(rawVal ?? '').trim();
    if (!sval && rawVal !== 0 && rawVal !== false) continue;
    let coerced: TagPrimitive;
    if (t === EXT_VALUE_TYPE_NUMBER) {
      const n = Number(String(rawVal).trim());
      coerced = Number.isFinite(n) ? n : String(rawVal);
    } else if (t === EXT_VALUE_TYPE_BOOL) {
      const s = String(rawVal).trim().toLowerCase();
      coerced = s === 'true' ? true : s === 'false' ? false : String(rawVal);
    } else {
      coerced = typeof rawVal === 'string' ? rawVal : String(rawVal);
    }
    (out[g] ??= {})[k] = coerced;
  }
  return out;
};

const flattenExtensionsToGroupItems = (ext: unknown): Record<string, unknown>[] => {
  if (!ext || typeof ext !== 'object' || Array.isArray(ext)) return [];
  const out: Record<string, unknown>[] = [];
  for (const [g, v] of Object.entries(ext)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
      if (!isTagPrimitive(vv)) continue;
      const extType: ExtValueType = vv === null
        ? EXT_VALUE_TYPE_NULL
        : typeof vv === 'number'
          ? EXT_VALUE_TYPE_NUMBER
          : typeof vv === 'boolean'
            ? EXT_VALUE_TYPE_BOOL
            : EXT_VALUE_TYPE_TEXT;
      out.push({ extGroup: g, extKey: k, extType, extValue: vv === null ? '' : String(vv) });
    }
  }
  return out;
};

export type Coord2D = { x: number; z: number; y?: number };
export type FieldType = 'text' | 'number' | 'select' | 'bool';

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  optional?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: any }>;
  defaultValue?: unknown;
};

export type GroupDef = {
  key: string;
  label: string;
  addButtonText?: string;
  optional?: boolean;
  minItems?: number;
  fields: FieldDef[];
};

export type FormatDef = {
  key: FeatureKey;
  label: string;
  modes: DrawMode[];
  hideTempOutput?: boolean;
  classCode?: string;
  fields: FieldDef[];
  groups?: GroupDef[];
  buildFeatureInfo: (args: {
    op: BuildOp;
    mode: DrawMode;
    coords: Coord2D[];
    values: Record<string, unknown>;
    groups: Record<string, unknown[]>;
    worldId?: string;
    editorId?: string;
    prevFeatureInfo?: Record<string, unknown>;
    now?: Date;
  }) => Record<string, unknown>;
  hydrate: (featureInfo: unknown) => { values: Record<string, unknown>; groups: Record<string, unknown[]> };
  coordsFromFeatureInfo: (featureInfo: unknown) => Coord2D[];
  validateImportItem?: (item: unknown) => string | undefined;
};

const OPTIONAL_TAGS_GROUP_DEF: GroupDef = {
  key: 'tags',
  label: 'tags（可选：用于筛选/渲染差分）',
  optional: true,
  addButtonText: '添加 tag',
  fields: [
    { key: 'tagKey', label: '字段名', type: 'select', options: TAG_KEY_OPTIONS },
    { key: 'tagKeyOther', label: '其他字段名（当字段名=其他时填写）', type: 'text', optional: true },
    { key: 'tagValue', label: '值', type: 'text' },
  ],
};

const OPTIONAL_EXTENSIONS_GROUP_DEF: GroupDef = {
  key: 'extensions',
  label: 'extensions（可选：仅记录信息，不参与规则）',
  optional: true,
  addButtonText: '添加扩展',
  fields: [
    { key: 'extGroup', label: '组/命名空间(extGroup)', type: 'text' },
    { key: 'extKey', label: '字段名(extKey)', type: 'text' },
    { key: 'extType', label: '值类型', type: 'select', options: EXT_VALUE_TYPE_OPTIONS, defaultValue: EXT_VALUE_TYPE_TEXT },
    { key: 'extValue', label: '值(extValue)', type: 'text' },
  ],
};

const ensureOptionalTagExtGroups = (groups?: GroupDef[]): GroupDef[] => {
  const base = Array.isArray(groups) ? groups.slice() : [];
  const keys = new Set(base.map((g) => g.key));
  if (!keys.has('tags')) base.push(OPTIONAL_TAGS_GROUP_DEF);
  if (!keys.has('extensions')) base.push(OPTIONAL_EXTENSIONS_GROUP_DEF);
  return base;
};

const TYPE_NAME_BY_MODE: Record<DrawMode, 'Points' | 'Polyline' | 'Polygon'> = {
  point: 'Points',
  polyline: 'Polyline',
  polygon: 'Polygon',
};

export const WORLD_CODE_BY_WORLD_ID: Record<string, number> = buildWorldCodeMapFromConfig();

const formatYYYYMMDD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
};

const resolveWorldCode = (worldId?: string, fallback?: unknown) => {
  if (worldId && Number.isFinite(WORLD_CODE_BY_WORLD_ID[worldId])) return WORLD_CODE_BY_WORLD_ID[worldId];
  if (fallback !== undefined && Number.isFinite(Number(fallback))) return Number(fallback);
  return WORLD_CODE_BY_WORLD_ID.zth;
};

const pruneUndefinedDeep = (input: unknown): unknown => {
  if (Array.isArray(input)) return input.map((item) => pruneUndefinedDeep(item));
  if (!input || typeof input !== 'object') return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = pruneUndefinedDeep(value);
  }
  return out;
};

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const geometryToDrawMode = (type: CairnMapClassConfig['geometry']['type']): DrawMode => {
  if (type === 'Point') return 'point';
  if (type === 'LineString') return 'polyline';
  return 'polygon';
};

const mapFieldType = (type: CairnMapClassFieldConfig['type']): FieldType => {
  if (type === 'number') return 'number';
  if (type === 'select') return 'select';
  if (type === 'bool' || type === 'boolean') return 'bool';
  return 'text';
};

const mapField = (field: CairnMapClassFieldConfig): FieldDef => ({
  key: field.key,
  label: resolveCairnMapLocalizedLabel(field.label, 'zh-CN', field.key),
  type: mapFieldType(field.type),
  optional: field.optional ?? field.required === false,
  placeholder: field.placeholder,
  options: field.options,
  defaultValue: field.defaultValue,
});

const mapGroup = (group: CairnMapClassGroupConfig): GroupDef => ({
  key: group.key,
  label: resolveCairnMapLocalizedLabel(group.label, 'zh-CN', group.key),
  addButtonText: group.addButtonText,
  optional: group.optional,
  minItems: group.minItems,
  fields: group.fields.map(mapField),
});

const buildCoordinateArray = (coords: Coord2D[]): Array<[number, number] | [number, number, number]> => coords.map((coord) => {
  const x = Number(coord.x);
  const z = Number(coord.z);
  if (Number.isFinite(Number(coord.y))) return [x, Number(coord.y), z];
  return [x, z];
});

const readPointCoordinate = (value: unknown): Coord2D[] => {
  if (!isObject(value)) return [];
  const x = Number(value.x);
  const z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
  const y = Number(value.y);
  return [Number.isFinite(y) ? { x, z, y } : { x, z }];
};

const readCoordinateArray = (value: unknown): Coord2D[] => {
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
    .filter((item): item is Coord2D => Boolean(item));
};

const buildBaseFields = (fields: FieldDef[], values: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined && field.optional) continue;
    out[field.key] = value;
  }
  return out;
};

const injectGroups = (out: Record<string, unknown>, groups: Record<string, unknown[]>): Record<string, unknown> => {
  for (const [key, items] of Object.entries(groups ?? {})) {
    if (key === 'tags' || key === 'extensions') continue;
    if (Array.isArray(items) && items.length > 0) out[key] = items;
  }
  const tags = buildTagsFromGroupItems(groups?.tags ?? []);
  const exts = buildExtensionsFromGroupItems(groups?.extensions ?? []);
  if (out.tags === undefined && Object.keys(tags).length > 0) out.tags = tags;
  if (out.extensions === undefined && Object.keys(exts).length > 0) out.extensions = exts;
  return out;
};

const withSystemFields = (def: FormatDef, base: Record<string, unknown>, args: {
  op: BuildOp;
  mode: DrawMode;
  worldId?: string;
  editorId?: string;
  prevFeatureInfo?: Record<string, unknown>;
  now?: Date;
}): Record<string, unknown> => {
  const now = args.now ?? new Date();
  const prev = args.prevFeatureInfo ?? {};
  const editor = String(args.editorId ?? '').trim();
  const Type = TYPE_NAME_BY_MODE[args.mode];
  const Class = def.classCode ?? prev.Class;
  const World = resolveWorldCode(args.worldId, prev.World);

  if (args.op === 'import') {
    return pruneUndefinedDeep({
      ...base,
      Type: prev.Type ?? Type,
      Class: prev.Class ?? Class,
      World: prev.World ?? World,
      ...(prev.CreateTime ? { CreateTime: prev.CreateTime } : {}),
      ...(prev.CreateBy ? { CreateBy: prev.CreateBy } : {}),
      ...(prev.ModifityTime ? { ModifityTime: prev.ModifityTime } : {}),
      ...(prev.ModifityBy ? { ModifityBy: prev.ModifityBy } : {}),
    }) as Record<string, unknown>;
  }

  if (args.op === 'create') {
    return pruneUndefinedDeep({
      ...base,
      Type,
      Class,
      World,
      CreateTime: formatYYYYMMDD(now),
      ...(editor ? { CreateBy: editor } : {}),
    }) as Record<string, unknown>;
  }

  return pruneUndefinedDeep({
    ...base,
    Type: prev.Type ?? Type,
    Class: prev.Class ?? Class,
    World: prev.World ?? World,
    CreateTime: prev.CreateTime ?? formatYYYYMMDD(now),
    ...(prev.CreateBy ? { CreateBy: prev.CreateBy } : (editor ? { CreateBy: editor } : {})),
    ModifityTime: formatYYYYMMDD(now),
    ...(editor ? { ModifityBy: editor } : (prev.ModifityBy ? { ModifityBy: prev.ModifityBy } : {})),
  }) as Record<string, unknown>;
};

const isFiniteNum = (v: unknown) => Number.isFinite(Number(v));
const isEmptyRequired = (field: FieldDef, value: unknown) => {
  if (field.optional) return false;
  if (value === undefined || value === null) return true;
  if (field.type === 'number') return !isFiniteNum(value);
  if (field.type === 'bool') return false;
  return String(value).trim().length === 0;
};

const createFormatDefFromClassConfig = (config: CairnMapClassConfig): FormatDef => {
  const key = (config.sourceFeatureKey ?? config.classKey) as FeatureKey;
  const mode = geometryToDrawMode(config.geometry.type);
  const fields = config.fields.map(mapField);
  const groups = ensureOptionalTagExtGroups((config.groups ?? []).map(mapGroup));

  const buildFeatureInfo: FormatDef['buildFeatureInfo'] = ({ op, coords, values, groups: groupValues, worldId, editorId, prevFeatureInfo, now }) => {
    const out = buildBaseFields(fields, values);
    injectGroups(out, groupValues);
    if (config.geometry.type === 'Point') {
      const coord = coords[0];
      out[config.geometry.sourceField] = {
        x: Number(coord?.x ?? 0),
        z: Number(coord?.z ?? 0),
        ...(Number.isFinite(Number(coord?.y)) ? { y: Number(coord?.y) } : {}),
      };
    } else {
      out[config.geometry.sourceField] = buildCoordinateArray(coords);
    }
    return withSystemFields({ ...FORMAT_REGISTRY['默认'], key, classCode: config.classCode, fields, groups, label: resolveCairnMapLocalizedLabel(config.label, 'zh-CN', key), modes: [mode] }, out, {
      op,
      mode,
      worldId,
      editorId,
      prevFeatureInfo,
      now,
    });
  };

  const hydrate: FormatDef['hydrate'] = (featureInfo) => {
    const info = isObject(featureInfo) ? featureInfo : {};
    const values: Record<string, unknown> = {};
    for (const field of fields) values[field.key] = info[field.key];
    const hydratedGroups: Record<string, unknown[]> = {};
    for (const group of groups) {
      if (group.key === 'tags') hydratedGroups[group.key] = flattenTagsToGroupItems(info.tags);
      else if (group.key === 'extensions') hydratedGroups[group.key] = flattenExtensionsToGroupItems(info.extensions);
      else hydratedGroups[group.key] = Array.isArray(info[group.key]) ? info[group.key] as unknown[] : [];
    }
    return { values, groups: hydratedGroups };
  };

  const coordsFromFeatureInfo: FormatDef['coordsFromFeatureInfo'] = (featureInfo) => {
    const info = isObject(featureInfo) ? featureInfo : {};
    const value = info[config.geometry.sourceField];
    return config.geometry.type === 'Point' ? readPointCoordinate(value) : readCoordinateArray(value);
  };

  const validateImportItem = (item: unknown): string | undefined => {
    const info = isObject(item) ? item : {};
    const terr = validateTagsObjectSoft(info.tags);
    if (terr) return terr;
    const eerr = validateExtensionsObjectSoft(info.extensions);
    if (eerr) return eerr;
    return undefined;
  };

  return {
    key,
    label: resolveCairnMapLocalizedLabel(config.label, 'zh-CN', key),
    modes: [mode],
    hideTempOutput: key !== '默认',
    classCode: config.classCode,
    fields,
    groups,
    buildFeatureInfo,
    hydrate,
    coordsFromFeatureInfo,
    validateImportItem,
  };
};

const createDefaultFormatDef = (): FormatDef => ({
  key: '默认',
  label: '默认',
  modes: ['point', 'polyline', 'polygon'],
  fields: [],
  groups: [],
  buildFeatureInfo: ({ op, mode, coords, worldId, editorId, prevFeatureInfo, now }) => {
    const out: Record<string, unknown> = {};
    if (mode === 'point') {
      const coord = coords[0];
      out.coordinate = {
        x: Number(coord?.x ?? 0),
        z: Number(coord?.z ?? 0),
        ...(Number.isFinite(Number(coord?.y)) ? { y: Number(coord?.y) } : {}),
      };
    } else {
      out.Conpoints = buildCoordinateArray(coords);
    }
    return withSystemFields(FORMAT_REGISTRY['默认'], out, { op, mode, worldId, editorId, prevFeatureInfo, now });
  },
  hydrate: () => ({ values: {}, groups: {} }),
  coordsFromFeatureInfo: (featureInfo) => {
    const info = isObject(featureInfo) ? featureInfo : {};
    return readPointCoordinate(info.coordinate).length > 0 ? readPointCoordinate(info.coordinate) : readCoordinateArray(info.Conpoints);
  },
});

const createRuntimeFormatRegistry = (): Record<FeatureKey, FormatDef> => {
  const registry: Partial<Record<FeatureKey, FormatDef>> = { 默认: createDefaultFormatDef() };
  for (const config of listClassConfigs()) {
    const def = createFormatDefFromClassConfig(config);
    registry[def.key] = def;
  }
  return registry as Record<FeatureKey, FormatDef>;
};

export const FORMAT_REGISTRY: Record<FeatureKey, FormatDef> = createRuntimeFormatRegistry();

export type MissingEntry =
  | { kind: 'field'; key: string; label: string }
  | { kind: 'group'; groupKey: string; groupLabel: string; minItems: number }
  | { kind: 'groupItemField'; groupKey: string; groupLabel: string; index: number; key: string; label: string }
  | { kind: 'geometry'; detail: string };

export type DetailedValidationResult = { ok: boolean; missing: MissingEntry[] };

export const validateRequiredDetailed = (
  def: FormatDef,
  values: Record<string, unknown>,
  groups: Record<string, unknown[]>
): DetailedValidationResult => {
  if (def.key === '默认' || !def.classCode) return { ok: true, missing: [] };
  const missing: MissingEntry[] = [];

  for (const f of def.fields ?? []) {
    if (isEmptyRequired(f, values?.[f.key])) missing.push({ kind: 'field', key: f.key, label: f.label });
  }

  for (const g of def.groups ?? []) {
    const items = (groups?.[g.key] ?? []) as Record<string, unknown>[];
    const min = g.optional ? 0 : (g.minItems ?? 1);
    if (items.length < min) missing.push({ kind: 'group', groupKey: g.key, groupLabel: g.label, minItems: min });
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      for (const f of g.fields ?? []) {
        if (isEmptyRequired(f, it?.[f.key])) {
          missing.push({ kind: 'groupItemField', groupKey: g.key, groupLabel: g.label, index: idx, key: f.key, label: f.label });
        }
      }
      if (g.key === 'tags' && it?.tagKey === TAG_KEY_OTHER && !String(it?.tagKeyOther ?? '').trim()) {
        missing.push({ kind: 'groupItemField', groupKey: g.key, groupLabel: g.label, index: idx, key: 'tagKeyOther', label: '其他字段名(tagKeyOther)' });
      }
    }
  }

  return { ok: missing.length === 0, missing };
};

export const formatMissingEntries = (missing: MissingEntry[]): string => {
  const lines: string[] = [];
  for (const m of missing) {
    if (m.kind === 'field') lines.push(`- 字段：${m.label}（${m.key}）`);
    else if (m.kind === 'group') lines.push(`- 分组：${m.groupLabel}（${m.groupKey}）至少需要 ${m.minItems} 条`);
    else if (m.kind === 'groupItemField') lines.push(`- 分组 ${m.groupLabel}（${m.groupKey}）第 ${m.index + 1} 条：${m.label}（${m.key}）`);
    else if (m.kind === 'geometry') lines.push(`- 几何：${m.detail}`);
  }
  return lines.join('\n');
};

export type ImportValidationContext = {
  worldId?: string;
  strictSystemFields?: boolean;
};

export type ImportValidationResult = {
  ok: boolean;
  missing: MissingEntry[];
  structuralErrors: string[];
  mode: DrawMode;
  coords: Coord2D[];
  hydrated: { values: Record<string, unknown>; groups: Record<string, unknown[]> } | null;
};

const validateGeometryForMode = (mode: DrawMode, coords: Coord2D[]): MissingEntry[] => {
  if (mode === 'point' && coords.length !== 1) return [{ kind: 'geometry', detail: '点模式需要 1 个点（coordinate.x / coordinate.z）' }];
  if (mode === 'polyline' && coords.length < 2) return [{ kind: 'geometry', detail: '线模式至少需要 2 个点（coordinates[]）' }];
  if (mode === 'polygon' && coords.length < 3) return [{ kind: 'geometry', detail: '面模式至少需要 3 个点（coordinates[]）' }];
  return [];
};

export const validateImportItemDetailed = (
  def: FormatDef,
  item: unknown,
  ctx: ImportValidationContext = {}
): ImportValidationResult => {
  const structuralErrors: string[] = [];
  const err = def.validateImportItem?.(item);
  if (err) structuralErrors.push(err);
  const mode = (def.modes?.[0] ?? 'point') as DrawMode;
  const coords = def.coordsFromFeatureInfo(item);
  const missing: MissingEntry[] = [];
  missing.push(...validateGeometryForMode(mode, coords));

  const source = isObject(item) ? item : {};
  if (def.key !== '默认' && def.classCode) {
    const strict = Boolean(ctx.strictSystemFields);
    if (ctx.worldId && WORLD_CODE_BY_WORLD_ID[ctx.worldId] === undefined) {
      structuralErrors.push(`World 映射表缺少 worldId="${ctx.worldId}"（请补充 environment/worlds.json）`);
    }
    const expectedType = TYPE_NAME_BY_MODE[mode];
    const expectedClass = def.classCode;
    const expectedWorld = resolveWorldCode(ctx.worldId);
    const hasNonEmpty = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';
    if (strict) {
      if (!hasNonEmpty(source.Type)) missing.push({ kind: 'field', key: 'Type', label: '要素类型(Type)' });
      if (!hasNonEmpty(source.Class)) missing.push({ kind: 'field', key: 'Class', label: '要素种类(Class)' });
      if (!isFiniteNum(source.World)) missing.push({ kind: 'field', key: 'World', label: '所属世界(World)' });
    }
    if (hasNonEmpty(source.Type) && String(source.Type).trim() !== expectedType) structuralErrors.push(`Type 不匹配：期望 "${expectedType}"，输入 "${String(source.Type).trim()}"`);
    if (hasNonEmpty(source.Class) && String(source.Class).trim() !== expectedClass) structuralErrors.push(`Class 不匹配：期望 "${expectedClass}"，输入 "${String(source.Class).trim()}"`);
    if (hasNonEmpty(source.World)) {
      const n = Number(source.World);
      if (!Number.isFinite(n)) structuralErrors.push(`World 不是有效数字：输入 "${String(source.World).trim()}"`);
      else if (expectedWorld !== undefined && n !== expectedWorld) structuralErrors.push(`World 与当前页面不一致：期望 ${expectedWorld}（来自 currentWorldId="${ctx.worldId ?? 'zth'}"），输入 ${n}`);
    }
  }

  let hydrated: { values: Record<string, unknown>; groups: Record<string, unknown[]> } | null = null;
  try {
    hydrated = def.hydrate(item);
    missing.push(...validateRequiredDetailed(def, hydrated.values ?? {}, hydrated.groups ?? {}).missing);
  } catch {
    hydrated = null;
    structuralErrors.push('hydrate 失败：无法解析附加信息结构');
  }

  const ok = structuralErrors.length === 0 && missing.length === 0;
  return { ok, missing, structuralErrors, mode, coords, hydrated };
};

export const getRuntimeFormatSchemaMetadata = (featureKeyOrClassCode: string) => {
  return getClassSchema(featureKeyOrClassCode) ?? getClassSchemaByFeatureKey(featureKeyOrClassCode);
};

export const getFormatDef = (key: FeatureKey): FormatDef => FORMAT_REGISTRY[key] ?? FORMAT_REGISTRY['默认'];

export const getSubTypeOptions = (mode: DrawMode): FeatureKey[] => {
  return (Object.keys(FORMAT_REGISTRY) as FeatureKey[]).filter((k) => FORMAT_REGISTRY[k].modes.includes(mode));
};

export const layerToJsonText = (layer: { jsonInfo?: { featureInfo: unknown } }): string => {
  const fi = layer.jsonInfo?.featureInfo;
  if (!fi) return '';
  return stringifyFeatureJsonArray([fi]);
};

export const parseCoordListFlexible = (raw: string): Coord2D[] | null => {
  const text = raw.trim();
  if (!text) return null;
  const parts = text.split(';').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;

  const out: Coord2D[] = [];
  for (const p of parts) {
    const nums = p.split(',').map((s) => s.trim()).filter(Boolean);
    if (nums.length !== 2 && nums.length !== 3) return null;
    const x = Number(nums[0]);
    const z = nums.length === 2 ? Number(nums[1]) : Number(nums[2]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (nums.length === 3) {
      const y = Number(nums[1]);
      if (!Number.isFinite(y)) return null;
      out.push({ x, z, y });
    } else {
      out.push({ x, z });
    }
  }
  return out;
};
