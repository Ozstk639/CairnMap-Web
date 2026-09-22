import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';
import { getByPath } from '../../Common/workflowEditorRegistry';
import {
  makeExternalLink,
  makeFeatureLink,
  makeFeatureLinkList,
} from './cardInteractions';
import type { CardFeatureLinkTarget } from './cardInteractions';
import { buildCardEnhancement } from './cardEnhancements';
import {
  resolveCardRegistryLayout,
  type CardLayoutItem,
  type CardRegistryLayout,
  type CardValueTransform,
} from './cardRegistry';
import {
  buildCardRegistryContext,
  isEmptyCardValue,
  type CardRegistryContext,
  type CardRegistryRowEntry,
} from './cardRegistryContext';
import type { CardRow } from './fieldRules';
import type { RailNewIndex } from '../../Navigation/railNewIndex';

export type CardRegistryRowsResult = {
  mainRows: CardRow[];
  otherRows: CardRow[];
  usedPaths: Set<string>;
};

const normalize = (value: unknown): string => String(value ?? '').trim();

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const pickByPath = (value: unknown, path?: string): unknown => {
  if (!path) return value;
  if (value === null || value === undefined) return undefined;
  if (isPlainObject(value)) return getByPath(value, path);
  return undefined;
};

const toFeatureLink = (value: unknown, linkTarget?: CardFeatureLinkTarget, text?: string): unknown => {
  const raw = pickByPath(value, linkTarget?.sourceValuePath);
  const id = normalize(raw);
  if (!id) return '未知';
  return makeFeatureLink(id, text, linkTarget);
};

const toFeatureLinkList = (value: unknown, linkTarget?: CardFeatureLinkTarget): unknown => {
  const arr = Array.isArray(value) ? value : normalize(value) ? [value] : [];
  const items = arr
    .map((item) => {
      const raw = pickByPath(item, linkTarget?.sourceValuePath);
      const id = normalize(raw);
      return id ? makeFeatureLink(id, undefined, linkTarget) : null;
    })
    .filter((item): item is ReturnType<typeof makeFeatureLink> => Boolean(item));
  return items.length ? makeFeatureLinkList(items) : '未知';
};

const applyTransform = (args: {
  value: unknown;
  transform?: CardValueTransform;
  linkTarget?: CardFeatureLinkTarget;
}): unknown => {
  const transform = args.transform ?? 'plain';
  if (transform === 'externalLink') {
    const url = normalize(args.value);
    return url ? makeExternalLink(url) : '未知';
  }
  if (transform === 'featureLink') return toFeatureLink(args.value, args.linkTarget);
  if (transform === 'featureLinkList') return toFeatureLinkList(args.value, args.linkTarget);
  if (transform === 'json') return args.value;
  return isEmptyCardValue(args.value) ? '未知' : args.value;
};

const cloneRow = (row: CardRow, patch?: Partial<CardRow>): CardRow => ({ ...row, ...(patch ?? {}) });

const markUsed = (used: Set<string>, row: CardRow) => {
  for (const path of row.usedPaths ?? []) used.add(path);
};

const rowKey = (row: CardRow): string => `${row.label}@@${JSON.stringify(row.value)}`;

const pushUniqueRow = (rows: CardRow[], row: CardRow, seen: Set<string>) => {
  const label = normalize(row.label);
  if (!label) return;
  const key = rowKey(row);
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(row);
};

const findRegistryEntry = (ctx: CardRegistryContext, item: Extract<CardLayoutItem, { kind: 'registryField' }>): CardRegistryRowEntry | undefined => {
  if (item.key) {
    const byKey = ctx.rowsByKey.get(item.key);
    if (byKey) return byKey;
  }
  if (item.path) return ctx.rowsByPath.get(item.path);
  return undefined;
};

const buildRegistryFieldRow = (
  ctx: CardRegistryContext,
  item: Extract<CardLayoutItem, { kind: 'registryField' }>,
): CardRow | null => {
  if (item.hidden) return null;
  const entry = findRegistryEntry(ctx, item);
  if (!entry) return null;
  const rawValue = getByPath(ctx.featureInfo, entry.source.path);
  const value = item.transform
    ? applyTransform({ value: rawValue, transform: item.transform, linkTarget: item.linkTarget })
    : entry.row.value;
  return cloneRow(entry.row, { label: item.label ?? entry.row.label, value });
};

const buildRawFieldRow = (
  ctx: CardRegistryContext,
  item: Extract<CardLayoutItem, { kind: 'rawField' }>,
): CardRow | null => {
  if (item.hidden) return null;
  const rawValue = getByPath(ctx.featureInfo, item.path);
  if (isEmptyCardValue(rawValue)) return null;
  return {
    label: item.label,
    value: applyTransform({ value: rawValue, transform: item.transform, linkTarget: item.linkTarget }),
    usedPaths: item.usedPaths ?? [item.path],
  };
};

const buildDefaultLayout = (): CardRegistryLayout => ({
  items: [{ kind: 'classification' }, { kind: 'registryDefaultGroup' }],
});

const pushRegistryDefaultGroup = (args: {
  ctx: CardRegistryContext;
  rows: CardRow[];
  used: Set<string>;
  seen: Set<string>;
}) => {
  for (const entry of args.ctx.defaultMainRows) {
    if (entry.row.usedPaths?.some((path) => args.used.has(path))) continue;
    pushUniqueRow(args.rows, entry.row, args.seen);
    markUsed(args.used, entry.row);
  }
};

export const buildRowsByLayout = (
  ctx: CardRegistryContext,
  railIndex?: RailNewIndex | null,
): { mainRows: CardRow[]; usedPaths: Set<string>; includedDefaultGroup: boolean } => {
  const resolvedLayout = resolveCardRegistryLayout({
    schemaKey: ctx.schemaKey,
    classCode: ctx.classCode,
    kind: ctx.kind,
    skind: ctx.skind,
    skind2: ctx.skind2,
  });
  const layout = resolvedLayout && resolvedLayout.items.length > 0 ? resolvedLayout : buildDefaultLayout();

  const mainRows: CardRow[] = [];
  const usedPaths = new Set<string>(ctx.systemPaths);
  const seen = new Set<string>();
  let includedDefaultGroup = false;

  for (const item of layout.items) {
    if (item.kind === 'classification') {
      if (item.hidden || !ctx.classificationRow) continue;
      const row = cloneRow(ctx.classificationRow, item.label ? { label: item.label } : undefined);
      pushUniqueRow(mainRows, row, seen);
      markUsed(usedPaths, row);
      continue;
    }

    if (item.kind === 'registryField') {
      const row = buildRegistryFieldRow(ctx, item);
      if (!row) continue;
      pushUniqueRow(mainRows, row, seen);
      markUsed(usedPaths, row);
      continue;
    }

    if (item.kind === 'registryDefaultGroup') {
      includedDefaultGroup = true;
      pushRegistryDefaultGroup({ ctx, rows: mainRows, used: usedPaths, seen });
      continue;
    }

    if (item.kind === 'rawField') {
      const row = buildRawFieldRow(ctx, item);
      if (!row) continue;
      pushUniqueRow(mainRows, row, seen);
      markUsed(usedPaths, row);
      continue;
    }

    if (item.kind === 'enhancement') {
      const rows = buildCardEnhancement(item.key, ctx, railIndex);
      for (const row of rows) {
        pushUniqueRow(mainRows, row, seen);
        markUsed(usedPaths, row);
      }
    }
  }

  return { mainRows, usedPaths, includedDefaultGroup };
};

const shouldSkipDefaultKey = (key: string): boolean => {
  const banned = new Set(['CoordP', 'CoordL', 'CoordG', 'Conpoints', 'Flrpoints', 'PLpoints', 'Linepoints', 'coordinate']);
  return banned.has(key);
};

export const flattenRemainingRows = (ctx: CardRegistryContext, used: Set<string>): CardRow[] => {
  const fi = ctx.featureInfo ?? {};
  const out: CardRow[] = [];
  const maxDepth = 3;
  const maxArrayLen = 50;
  const registryPaths = ctx.registryPaths;
  const systemPaths = ctx.systemPaths;

  const isUsed = (path: string): boolean => {
    if (!path) return true;
    if (used.has(path)) return true;
    if (registryPaths.has(path)) return true;
    if (systemPaths.has(path)) return true;
    const top = path.split('.')[0] || path;
    return systemPaths.has(top);
  };

  const walk = (node: any, prefix: string, depth: number) => {
    if (depth > maxDepth) {
      if (prefix && !isUsed(prefix)) out.push({ label: prefix, value: node, usedPaths: [prefix] });
      return;
    }

    if (node === null || node === undefined) {
      if (prefix && !isUsed(prefix)) out.push({ label: prefix, value: node, usedPaths: [prefix] });
      return;
    }

    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      if (prefix && !isUsed(prefix)) out.push({ label: prefix, value: node, usedPaths: [prefix] });
      return;
    }

    if (Array.isArray(node)) {
      const topKey = prefix.split('.')[0] || prefix;
      if (shouldSkipDefaultKey(topKey)) return;
      if (node.length > maxArrayLen) {
        if (prefix && !isUsed(prefix)) out.push({ label: prefix, value: `[Array(${node.length})]`, usedPaths: [prefix] });
        return;
      }
      if (prefix && !isUsed(prefix)) out.push({ label: prefix, value: node, usedPaths: [prefix] });
      return;
    }

    if (isPlainObject(node)) {
      const keys = Object.keys(node);
      if (keys.length === 0) {
        if (prefix && !isUsed(prefix)) out.push({ label: prefix, value: node, usedPaths: [prefix] });
        return;
      }
      for (const key of keys) {
        const path = prefix ? `${prefix}.${key}` : key;
        const topKey = path.split('.')[0] || path;
        if (shouldSkipDefaultKey(topKey)) continue;
        if (isUsed(path)) continue;
        walk(node[key], path, depth + 1);
      }
      return;
    }

    if (prefix && !isUsed(prefix)) out.push({ label: prefix, value: String(node), usedPaths: [prefix] });
  };

  for (const key of Object.keys(fi)) {
    if (shouldSkipDefaultKey(key)) continue;
    if (isUsed(key)) continue;
    walk(fi[key], key, 1);
  }

  return out;
};

const pickFirstString = (fi: any, keys: string[]): string => {
  for (const key of keys) {
    const value = fi?.[key];
    const s = value === null || value === undefined ? '' : String(value).trim();
    if (s) return s;
  }
  return '';
};

export const buildSystemMetaRows = (feature: FeatureRecord): CardRow[] => {
  const fi: any = feature?.featureInfo ?? {};
  const groups: Array<{ label: string; keys: string[] }> = [
    { label: '创建时间', keys: ['CreateTime', 'createTime'] },
    { label: '创建者', keys: ['CreateBy', 'createBy'] },
    { label: '最后编辑时间', keys: ['ModifityTime', 'ModifyTime', 'ModifiedTime', 'modifityTime', 'modifyTime', 'modifiedTime'] },
    { label: '编辑者', keys: ['ModifityBy', 'ModifyBy', 'ModifiedBy', 'modifityBy', 'modifyBy', 'modifiedBy'] },
  ];

  const rows: CardRow[] = [];
  for (const group of groups) {
    const value = pickFirstString(fi, group.keys);
    if (!value) continue;
    rows.push({ label: group.label, value, usedPaths: group.keys });
  }
  return rows;
};

export const buildCardRowsFromRegistry = (
  feature: FeatureRecord,
  railIndex?: RailNewIndex | null,
): CardRegistryRowsResult => {
  const ctx = buildCardRegistryContext(feature);
  const { mainRows, usedPaths, includedDefaultGroup } = buildRowsByLayout(ctx, railIndex);
  const otherRows: CardRow[] = [];

  if (includedDefaultGroup) {
    for (const entry of ctx.defaultOtherRows) {
      if (entry.row.usedPaths?.some((path) => usedPaths.has(path))) continue;
      otherRows.push(entry.row);
      for (const path of entry.row.usedPaths ?? []) usedPaths.add(path);
    }
  }

  otherRows.push(...flattenRemainingRows(ctx, usedPaths));
  const systemRows = buildSystemMetaRows(feature);
  otherRows.push(...systemRows);
  for (const row of systemRows) markUsed(usedPaths, row);

  return { mainRows, otherRows, usedPaths };
};

// 兼容 stage3 旧调用名。
export const buildBaseCardRowsFromRegistry = buildCardRowsFromRegistry;
