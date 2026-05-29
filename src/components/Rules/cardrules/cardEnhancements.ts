import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';
import { passLineBooleanFilters, type RailNewIndex } from '../../Navigation/railNewIndex';
import type { CardEnhancementKey } from './cardRegistry';
import type { CardRegistryContext } from './cardRegistryContext';
import type { CardColorChip, CardLineChips, CardRow } from './fieldRules';

const normalize = (value: unknown): string => String(value ?? '').trim();

function ensureKnown(v: any): string {
  const s = normalize(v);
  return s ? s : '未知';
}

function normalizeHexColor(v: any): string {
  const s = normalize(v);
  if (!s) return '';
  if (/^#([0-9a-fA-F]{6})$/.test(s)) return s;
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`;
  if (/^#([0-9a-fA-F]{3})$/.test(s)) {
    const m = s.slice(1);
    return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  }
  return s;
}

type LineChipItem = { name: string; color: string; text: string };

function mergeUpDownSameColorLines(items: LineChipItem[]): LineChipItem[] {
  const parseUpDown = (name: string): { base: string; dir: 'up' | 'down' } | null => {
    const s = normalize(name);
    if (!s) return null;
    const m = /^(.*?)(?:[-_\uFF0D\u2014\u2013])?(上行|下行)$/.exec(s);
    if (!m) return null;
    const base = normalize(m[1]);
    const dir = m[2] === '上行' ? 'up' : 'down';
    if (!base) return null;
    return { base, dir };
  };

  const has = new Map<string, { up: boolean; down: boolean }>();
  for (const it of items) {
    const p = parseUpDown(it.name);
    if (!p) continue;
    const key = `${p.base}@@${it.color}`;
    const prev = has.get(key) ?? { up: false, down: false };
    if (p.dir === 'up') prev.up = true;
    else prev.down = true;
    has.set(key, prev);
  }

  const emitted = new Set<string>();
  const out: LineChipItem[] = [];
  for (const it of items) {
    const p = parseUpDown(it.name);
    if (!p) {
      out.push(it);
      continue;
    }
    const key = `${p.base}@@${it.color}`;
    const st = has.get(key);
    if (st?.up && st?.down) {
      if (emitted.has(key)) continue;
      emitted.add(key);
      out.push({ name: p.base, color: it.color, text: it.text });
      continue;
    }
    out.push(it);
  }
  return out;
}

function uniqueLinesFromStationIds(stationIds: string[], railIndex?: RailNewIndex | null) {
  if (!railIndex) return [];
  const lineMap = new Map<string, { name: string; color: string; text: string }>();

  for (const sid of stationIds) {
    const sta = railIndex.stas.get(sid);
    if (!sta) continue;

    for (const pid of sta.platformIds) {
      const plf = railIndex.plfs.get(pid);
      if (!plf) continue;

      for (const lr of plf.lines) {
        if (!passLineBooleanFilters((lr as any)?.flags)) continue;
        const rle = railIndex.rles.get(lr.id);
        if (!rle) continue;

        const color = normalizeHexColor(rle.color) || '#999999';
        const name = rle.name || rle.line || rle.id;
        const text = normalizeHexColor(rle.color) || '#999999';

        lineMap.set(rle.id, { name, color, text });
      }
    }
  }

  return mergeUpDownSameColorLines(Array.from(lineMap.values()));
}

function chipsRow(items: LineChipItem[], usedPaths: string[] = []): CardRow {
  const chips: CardLineChips = {
    kind: 'lineChips',
    items: items.length > 0 ? items : [{ name: '未知', color: '#999999', text: '#999999' }],
  };
  return { label: '包含线路', value: chips, usedPaths };
}

function platformLineChips(feature: FeatureRecord, railIndex?: RailNewIndex | null): CardRow {
  const fi: any = feature?.featureInfo ?? {};
  const plfId = normalize(feature?.meta?.idValue ?? fi?.ID ?? fi?.platformId);
  const lineRefs: Array<{ id: string; flags?: Record<string, boolean> }> = [];

  const plf = railIndex && plfId ? railIndex.plfs.get(plfId) : undefined;
  if (plf?.lines?.length) {
    for (const lr of plf.lines) {
      lineRefs.push({ id: normalize(lr.id), flags: (lr as any)?.flags });
    }
  } else {
    const raw = fi?.lines ?? fi?.Lines ?? fi?.LINES ?? [];
    const arr = Array.isArray(raw) ? raw : [];
    for (const x of arr) {
      const id = normalize(x?.ID ?? x?.lineID ?? x?.id ?? x);
      if (!id) continue;
      const flags: Record<string, boolean> = {};
      if (x && typeof x === 'object' && !Array.isArray(x)) {
        for (const k of Object.keys(x)) {
          if (typeof (x as any)[k] === 'boolean') flags[k] = (x as any)[k];
        }
      }
      lineRefs.push({ id, flags: Object.keys(flags).length ? flags : undefined });
    }
  }

  const rawItems: LineChipItem[] = [];
  for (const lr of lineRefs) {
    if (!lr.id) continue;
    if (!passLineBooleanFilters(lr.flags)) continue;
    const rle = railIndex?.rles.get(lr.id);
    const color = normalizeHexColor(rle?.color) || '#999999';
    const name = (rle?.name || rle?.line || rle?.id || lr.id) as string;
    const text = normalizeHexColor(rle?.color) || '#999999';
    rawItems.push({ name, color, text });
  }

  return chipsRow(mergeUpDownSameColorLines(rawItems), ['lines', 'Lines', 'LINES']);
}

function stationLineChips(feature: FeatureRecord, railIndex?: RailNewIndex | null): CardRow {
  const stationId = normalize(feature?.meta?.idValue);
  return chipsRow(uniqueLinesFromStationIds(stationId ? [stationId] : [], railIndex), []);
}

function stationBuildingLineChips(feature: FeatureRecord, railIndex?: RailNewIndex | null): CardRow {
  const buildingId = normalize(feature?.meta?.idValue);
  const stationIds = buildingId && railIndex?.buildingToStations.get(buildingId)
    ? Array.from(railIndex.buildingToStations.get(buildingId)!)
    : [];
  return chipsRow(uniqueLinesFromStationIds(stationIds, railIndex), []);
}

function railColorChip(ctx: CardRegistryContext): CardRow {
  const fi: any = ctx.featureInfo ?? {};
  const colorRaw = fi?.color ?? fi?.Color ?? '';
  const color = normalizeHexColor(colorRaw) || '#999999';
  const colorText = normalizeHexColor(colorRaw) || '#999999';
  const chip: CardColorChip = { kind: 'colorChip', color, text: colorText };
  return { label: '色号', value: chip, usedPaths: ['color', 'Color'] };
}

export function buildCardEnhancement(
  key: CardEnhancementKey,
  ctx: CardRegistryContext,
  railIndex?: RailNewIndex | null,
): CardRow[] {
  if (key === 'platformLineChips') return [platformLineChips(ctx.feature, railIndex)];
  if (key === 'stationLineChips') return [stationLineChips(ctx.feature, railIndex)];
  if (key === 'stationBuildingLineChips') {
    const fi: any = ctx.featureInfo ?? {};
    const height = ensureKnown(fi?.height ?? fi?.Height);
    return [
      { label: '高度', value: height, usedPaths: ['height', 'Height'] },
      stationBuildingLineChips(ctx.feature, railIndex),
    ];
  }
  if (key === 'railColorChip') return [railColorChip(ctx)];
  if (key === 'tradePointCard') {
    const raw = (ctx.featureInfo as any)?.TradeJSON;
    return [{ label: '交易列表', value: raw || '详见交易卡片', usedPaths: ['TradeJSON'] }];
  }
  if (key === 'floorViewRelation') {
    return [{ label: '楼层视图', value: '已启用通用楼层关系', usedPaths: [] }];
  }
  if (key === 'genericRelationLinks') {
    return [];
  }
  return [];
}
