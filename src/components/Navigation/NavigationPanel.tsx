/**
 * 导航面板组件
 * - 旧版：调用 lib/pathfinding（铁路/传送/步行）
 * - 新增：铁路（新）模式
 *   - 起终点仍从「站点/地标/玩家」中选择（与原逻辑一致）
 *   - 但铁路（新）会：
 *     1) 调用 Navigation_Start：将起终点坐标映射到最近的 STB/SBP（优先 STB，找不到则 SBP）
 *     2) 调用 Navigation_Rail：在规则（Rule）铁路体系（STA/PLF/STB/SBP/RLE）上计算最短路/最少换乘
 *   - 输出结果：
 *     - 每个铁路段右侧独立开关展开“途经站”
 *     - 概览区以线路 color 分段展示（类似你提供的截图）
 *     - onRouteFound 仍保持传回 Array<{coord}>，但会额外挂载 styledSegments / stationMarkers（后续 MapContainer/RouteHighlightLayer 可直接复用）
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  ArrowUpDown,
  Search as SearchIcon,
  Train,
  Home,
  Footprints,
  //User,
  Zap,
  Clock,
  Rocket,
  Shield,
  ChevronDown,
  ChevronRight,
  MousePointerClick,
  Route,
} from 'lucide-react';
import type { ParsedStation, ParsedLine, Coordinate, Player, TravelMode } from '@/types';
import type { ParsedLandmark } from '@/components/Legacy/data/landmarkParser';
import type { MultiModePathResult } from '@/components/Legacy/data/pathfinding';
import type { LegacyModuleBundle } from '@/entrypoints/legacyEntry';
import { useFeatureModuleStore } from '@/store/featureModuleStore';
import { ensureLegacyDataLoaded } from '@/lib/legacyDataLoader';

import { computeRailPlanFromCoords, type NavRailNewIntegratedPlan, type TransferType } from './Navigation_RailNewIntegrated';
import { listRailNewStaBuildingsForSearch, type RailNewStaBuildingSearchItem } from './Navigation_RailNewIntegrated';
import { computeTeleportNewPlanFromCoords, type NavTeleportNewIntegratedPlan } from './Navigation_TeleportNewIntegrated';
import { computeRoadPlanFromCoords, ROAD_TRAVEL_PROFILES, type NavRoadPlan } from './Navigation_Road';
import { listHubReturnPoints } from './teleportHubReturnPoints';
import type { RouteHighlightData, RouteStyledSegment, RouteStationMarker } from '@/components/Map/RouteHighlightLayer';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';

import { getRuleSearchPool } from '@/components/Rules/search/ruleSearchRegistry';
import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';
import { formatGridNumber, snapWorldPointByMode } from '@/lib/gridSnapUtils';
import {
  isRuleBlacklisted,
  getRulePriorityIndex,
  getRuleDisplayName,
  buildBuildingNameIndex,
  getRuleCategoryLabelWithParent,
} from '@/components/Search/searchRuleTables';
import { loadRailNewIndex, passLineBooleanFilters, type RailNewIndex } from '@/components/Navigation/railNewIndex';



async function loadNavigationLegacyBundle(): Promise<LegacyModuleBundle> {
  const mod = await import('@/entrypoints/legacyEntry');
  return mod.loadLegacyModuleBundle();
}

// ---------------------------
// utils
// ---------------------------

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '-';
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
}

function formatArrivalTime(secondsFromNow: number): string {
  if (!Number.isFinite(secondsFromNow)) return '';
  const t = new Date(Date.now() + Math.max(0, secondsFromNow) * 1000);
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function calculateWalkTime(distance: number, useElytra: boolean = true): number {
  const speed = useElytra ? 40 : 4.317;
  return distance / speed;
}

function getRepresentativeCoordForRule(r: FeatureRecord): Coordinate | null {
  if (!r) return null;
  if (r.type === 'Points' && r.p3) {
    return { x: r.p3.x, y: r.p3.y ?? 64, z: r.p3.z };
  }

  const coords = Array.isArray(r.coords3) ? r.coords3 : [];
  if (!coords.length) return null;

  // bbox center（面/线兜底）
  const bboxCenter = () => {
    let minX = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const c of coords) {
      minX = Math.min(minX, c.x);
      minZ = Math.min(minZ, c.z);
      maxX = Math.max(maxX, c.x);
      maxZ = Math.max(maxZ, c.z);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minZ) || !Number.isFinite(maxX) || !Number.isFinite(maxZ)) return null;
    return { x: (minX + maxX) / 2, y: 64, z: (minZ + maxZ) / 2 };
  };

  // Polyline：按路径长度取中点（插值）
  if (r.type === 'Polyline' && coords.length >= 2) {
    let total = 0;
    const segLens: number[] = [];
    for (let i = 1; i < coords.length; i++) {
      const dx = coords[i].x - coords[i - 1].x;
      const dz = coords[i].z - coords[i - 1].z;
      const len = Math.hypot(dx, dz);
      segLens.push(len);
      total += len;
    }
    if (total <= 0) return bboxCenter();
    const half = total / 2;
    let acc = 0;
    for (let i = 1; i < coords.length; i++) {
      const len = segLens[i - 1] ?? 0;
      if (acc + len >= half && len > 0) {
        const t = (half - acc) / len;
        const x = coords[i - 1].x + (coords[i].x - coords[i - 1].x) * t;
        const z = coords[i - 1].z + (coords[i].z - coords[i - 1].z) * t;
        return { x, y: 64, z };
      }
      acc += len;
    }
    return { x: coords[Math.floor(coords.length / 2)].x, y: 64, z: coords[Math.floor(coords.length / 2)].z };
  }

  // Polygon：bbox center
  return bboxCenter();
}

// getRuleCategoryName / getRuleDisplayName moved to searchRuleTables.ts (single source of truth)

function normalizeHexColorInput(v: any): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const t = s.startsWith('0x') || s.startsWith('0X') ? `#${s.slice(2)}` : s;
  if (/^#[0-9a-fA-F]{3}$/.test(t) || /^#[0-9a-fA-F]{6}$/.test(t) || /^#[0-9a-fA-F]{8}$/.test(t)) return t;
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`;
  return t;
}

function extractLinePrefix(s: string): string {
  const t = String(s ?? '').trim();
  if (!t) return '';
  const idx = t.indexOf('线');
  if (idx > 0) return t.slice(0, idx + 1);
  return t;
}

function LineBadgesTruncate({ tokens }: { tokens: LineToken[] }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const calc = () => {
      const ov = inner.scrollWidth > outer.clientWidth + 1;
      setOverflow(ov);
    };
    calc();

    const ro = new ResizeObserver(() => calc());
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [tokens]);

  return (
    <div ref={outerRef} className="relative min-w-0 flex-1 overflow-hidden">
      <div ref={innerRef} className="flex items-center gap-1 flex-nowrap">
        {tokens.map((it, j) => (
          <span
            key={`${it.label}-${j}`}
            className="inline-flex flex-none w-fit shrink-0 items-center rounded px-1.5 border text-[9px] font-semibold leading-[14px] h-[14px] whitespace-nowrap"
            style={{ borderColor: it.color, backgroundColor: it.color, color: '#ffffff' }}
            title={it.title ?? it.label}
          >
            {it.label}
          </span>
        ))}
      </div>
      {overflow ? (
        <span className="absolute right-0 top-0 bottom-0 flex items-center pl-1 text-gray-400 bg-white">...</span>
      ) : null}
    </div>
  );
}

function makeCoordLabel(p: { x: number; z: number }) {
  return `X:${formatGridNumber(p.x)}  Z:${formatGridNumber(p.z)}`;
}


// ---------------------------
// types
// ---------------------------

export type NavigationInitialPoint = {
  id?: string;
  name: string;
  coord: Coordinate;
  extra?: string;
  ruleRecord?: FeatureRecord;
  nonce?: number;
};

interface NavigationPanelProps {
  stations: ParsedStation[];
  lines: ParsedLine[];
  landmarks: ParsedLandmark[];
  players?: Player[];
  worldId: string;
  onRouteFound?: (route: RouteHighlightData | Array<{ coord: Coordinate }>) => void;
  onClose: () => void;
  onPointClick?: (coord: Coordinate) => void;
  initialEndPoint?: NavigationInitialPoint | null;
}

interface SearchItem {
  type: 'station' | 'landmark' | 'player' | 'StaBuilding' | 'rule' | 'coord';
  name: string;
  coord: Coordinate;

  // for SearchBar-like display
  extra?: string;
  searchKey?: string;

  // rule 专用
  ruleRecord?: FeatureRecord;

  // StaBuilding 专用（可选，但建议保留）
  staBuildingId?: string;
  staBuildingKind?: 'STB' | 'SBP';
}


// UI：在 TravelMode 的基础上增加 rail_new
type TravelModePanel = TravelMode | 'rail_new' | 'teleport_new' | 'road';

// 新铁路：最小化依赖的显示结构
type RailNewLegKind = 'access' | 'walk' | 'rail' | 'transfer';

interface RailNewLegBase {
  kind: RailNewLegKind;
}

interface RailNewWalkLeg extends RailNewLegBase {
  kind: 'access' | 'walk' | 'transfer';
  label: string;
  from: Coordinate;
  to: Coordinate;
  distance: number;
  timeSeconds: number;
  dashed?: boolean;
}

interface RailNewRailLeg extends RailNewLegBase {
  kind: 'rail';
  lineKey: string;
  lineName: string;
  color: string;
  fromStation: string;
  toStation: string;
  viaStations: string[];
  distance: number;
  timeSeconds: number;
  // 用于联络线“xxx/xxx/xxx”拼接显示
  lineNameChain?: string[];
}

type RailNewLeg = RailNewWalkLeg | RailNewRailLeg;

interface RailNewPlan {
  found: boolean;
  totalTimeSeconds: number;
  totalDistance: number;
  totalTransfers: number;
  legs: RailNewLeg[];
  // 可选：由 Navigation_Rail 返回的高亮数据
  routeHighlight?: {
    path?: Array<{ coord: Coordinate }>;
    styledSegments?: unknown[];
    stationMarkers?: unknown[];
  };
}

// 让 onRouteFound 仍传 Array<{coord}>，但在数组对象上挂载更多字段。
export type RoutePathV2 = Array<{ coord: Coordinate }> & {
  styledSegments?: unknown[];
  stationMarkers?: unknown[];
};

// ---------------------------
// Mode config
// ---------------------------

const TRAVEL_MODES: Array<{ mode: TravelModePanel; label: string; icon: typeof Train }> = [
  { mode: 'rail_new', label: '铁路(新)', icon: Train },
  { mode: 'teleport_new', label: '传送(新)', icon: Zap },
  { mode: 'road', label: '道路', icon: Route },
  { mode: 'rail', label: '铁路', icon: Train },
  { mode: 'teleport', label: '传送', icon: Zap },
  { mode: 'walk', label: '步行', icon: Footprints },
];

// 新铁路：可调整参数（默认值可按你的需要随时改）
const DEFAULT_RAIL_NEW_CONFIG = {
  // 站内换乘步行速度（m/s）
  transferWalkSpeed: 3.0,
  // 铁路乘坐速度（m/s）
  railRideSpeed: 16.0,
  // 站内换乘成本阈值：距离 cost = dist / factor（你此前要求的“十分之一权重”本质等价）
  transferCostFactor: 1.0,
  // 正常站台同台换乘成本（用于让联络线连接节点优先）
  normalPlatformTransferCost: 5.0,
};

// ---------------------------
// Search input
// ---------------------------

interface PointSearchInputProps {
  value: SearchItem | null;
  onChange: (item: SearchItem | null) => void;
  items: SearchItem[];
  placeholder: string;
  label: string;
  labelRight?: React.ReactNode;
  disabled?: boolean;
  railIndex?: RailNewIndex | null;
  buildingNameIndex?: Map<string, string>;
}

type LineToken = { label: string; color: string; title?: string };

function PointSearchInput({ value, onChange, items, placeholder, label, labelRight, disabled, railIndex, buildingNameIndex }: PointSearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value?.name || '');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    if (query.length === 0) return [];
    const q = query.toLowerCase();
    return items
      .filter((item) => {
        const key = String(item.searchKey ?? item.name ?? '').toLowerCase();
        return key.includes(q);
      })
      .slice(0, 30);
  }, [query, items]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setQuery(value?.name || '');
  }, [value]);

  // 导航起终点：保持固定宽度（不做 SearchBar 那种自适应加宽）

  const getLineTokensForRule = (r: FeatureRecord | undefined | null): LineToken[] => {
    if (!r || !railIndex) return [];
    const fi: any = r?.featureInfo ?? {};
    const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();

    const refs: Array<{ id: string; flags?: Record<string, boolean> }> = [];

    const collectFromPlf = (plfId: string) => {
      const pid = String(plfId ?? '').trim();
      if (!pid) return;
      const plf = railIndex.plfs.get(pid);
      if (!plf?.lines?.length) return;
      for (const lr of plf.lines) refs.push({ id: String((lr as any).id ?? '').trim(), flags: (lr as any)?.flags });
    };

    if (cls === 'PLF') {
      collectFromPlf(String((r as any)?.meta?.idValue ?? fi?.ID ?? ''));
    } else if (cls === 'PFB') {
      collectFromPlf(String(fi?.ID ?? ''));
    } else if (cls === 'STA') {
      const stationId = String((r as any)?.meta?.idValue ?? fi?.ID ?? '').trim();
      const sta = stationId ? railIndex.stas.get(stationId) : undefined;
      for (const pid of (sta?.platformIds ?? [])) collectFromPlf(pid);
    } else if (cls === 'STB' || cls === 'SBP') {
      const buildingId = String((r as any)?.meta?.idValue ?? '').trim();
      const stationIds = buildingId && railIndex.buildingToStations.get(buildingId)
        ? Array.from(railIndex.buildingToStations.get(buildingId)!)
        : [];
      for (const sid of stationIds) {
        const sta = sid ? railIndex.stas.get(sid) : undefined;
        for (const pid of (sta?.platformIds ?? [])) collectFromPlf(pid);
      }
    }

    const picked: Array<{ id: string; bureau: string; line: string; name: string; prefix: string; color: string }> = [];
    for (const lr of refs) {
      const id = String(lr.id ?? '').trim();
      if (!id) continue;
      if (!passLineBooleanFilters(lr.flags)) continue;
      const rle = railIndex.rles.get(id);
      if (!rle) continue;
      const name = String((rle as any).name || (rle as any).line || (rle as any).id || id).trim();
      const prefix = extractLinePrefix(name);
      const color = normalizeHexColorInput((rle as any)?.color) || '#999999';
      picked.push({ id, bureau: String((rle as any)?.bureau ?? '').trim(), line: String((rle as any)?.line ?? '').trim(), name, prefix, color });
    }
    if (picked.length === 0) return [];

    const groups = new Map<string, Array<typeof picked[number]>>();
    const orderKeys: string[] = [];
    for (const it of picked) {
      const key = it.bureau && it.line ? `${it.bureau}@@${it.line}` : `__id__@@${it.id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
        orderKeys.push(key);
      }
      groups.get(key)!.push(it);
    }

    const out: LineToken[] = [];
    const seen = new Set<string>();
    const pushToken = (label: string, color: string, title?: string) => {
      const k = `${label}@@${color}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ label, color, title });
    };

    for (const gk of orderKeys) {
      const arr = groups.get(gk) ?? [];
      if (arr.length === 0) continue;
      if (arr.length === 1) {
        const a = arr[0];
        pushToken(a.prefix || a.name, a.color, a.name);
        continue;
      }
      const firstPrefix = String(arr[0].prefix || '').trim();
      const allSamePrefix = firstPrefix && arr.every((x) => String(x.prefix || '').trim() === firstPrefix);
      if (allSamePrefix) {
        pushToken(firstPrefix, arr[0].color, arr.map((x) => x.name).join(' / '));
        continue;
      }
      const localSeen = new Set<string>();
      for (const a of arr) {
        const p = String(a.prefix || a.name).trim();
        if (!p) continue;
        if (localSeen.has(p)) continue;
        localSeen.add(p);
        pushToken(p, a.color, a.name);
      }
    }
    return out;
  };

  const handleSelect = (item: SearchItem) => {
    setQuery(item.name);
    onChange(item);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-500 block">{label}</label>
        {labelRight ? <div className="flex items-center gap-1">{labelRight}</div> : null}
      </div>

      {/* 输入框：尽量与主 SearchBar 的视觉一致 */}
      <div className={disabled ? 'opacity-60 pointer-events-none' : ''}>
        <AppCard className="flex items-center p-0 rounded-2xl overflow-hidden shadow-none">
          <div className="px-3 py-2 text-gray-400">
            <SearchIcon className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
              // 仅当完全匹配名称时才绑定 value；否则保持输入态
              const match = items.find((it) => it.name === e.target.value);
              if (match) onChange(match);
              else onChange(null);
            }}
            onFocus={() => !disabled && setIsOpen(true)}
            placeholder={placeholder}
            className="flex-1 w-full px-3 py-2 text-sm outline-none rounded-r-2xl"
          />
        </AppCard>
      </div>


      {/* 下拉结果：复用 SearchBar 的行布局（名称+类型在左，坐标靠右） */}
      {isOpen && filteredItems.length > 0 && (
        <div
          ref={dropdownRef as any}
          className="absolute top-full left-0 mt-1 z-50"
          style={{ width: undefined }}
        >
          <AppCard className="max-h-80 overflow-y-auto">
            {filteredItems.map((item, idx) => (
              <AppButton
                key={`${item.type}-${item.name}-${idx}`}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center justify-start border-b border-gray-100 last:border-b-0"
                onClick={() => handleSelect(item)}
              >
                <div data-sr-row className="flex w-full items-center">
                  <div data-sr-left className="flex-1 min-w-0">
                    <div data-sr-left-inner className="flex flex-col min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{item.name}</div>
                      {item.extra && (
                        <div className="text-xs text-gray-500 flex items-center gap-2 min-w-0">
                          <span className="shrink-0">{(() => {
                            if (item.type !== 'rule') return item.extra;
                            const r = item.ruleRecord;
                            const fi: any = r?.featureInfo ?? {};
                            const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
                            if (!buildingNameIndex) return item.extra;

                            if (cls === 'FLR') {
                              const bid = String(fi?.BuildingID ?? fi?.buildingID ?? fi?.buildingId ?? '').trim();
                              const bname = bid ? (buildingNameIndex.get(bid) || '') : '';
                              return bname ? `${item.extra}（${bname}）` : item.extra;
                            }
                            if (cls === 'STF') {
                              const bid = String(fi?.staBuildingID ?? fi?.staBuildingId ?? fi?.STBuilding ?? fi?.BuildingID ?? '').trim();
                              const bname = bid ? (buildingNameIndex.get(bid) || '') : '';
                              return bname ? `${item.extra}（${bname}）` : item.extra;
                            }
                            return item.extra;
                          })()}</span>

                          {/* 包含线路：PLF/PFB/STA/STB/SBP */}
                          {item.type === 'rule' && (() => {
                            const r = item.ruleRecord;
                            const fi: any = r?.featureInfo ?? {};
                            const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
                            if (!['PLF', 'PFB', 'STA', 'STB', 'SBP'].includes(cls)) return null;
                            const tokens = getLineTokensForRule(r);
                            if (!tokens.length) return null;
                            return (
                              <LineBadgesTruncate tokens={tokens} />
                            );
                          })()}

                          {/* RLE：颜色条 */}
                          {item.type === 'rule' && (() => {
                            const r = item.ruleRecord;
                            const fi: any = r?.featureInfo ?? {};
                            const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
                            if (cls !== 'RLE') return null;
                            const color = normalizeHexColorInput(fi?.color ?? fi?.Color) || '#999999';
                            return (
                              <span className="inline-block rounded-sm" style={{ width: 22, height: 14, backgroundColor: color }} title={color} />
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div data-sr-coord className="text-xs text-gray-400 flex-none ml-3">
                    {`${Math.round(item.coord.x)}, ${Math.round(item.coord.z)}`}
                  </div>
                </div>
              </AppButton>
            ))}
          </AppCard>
        </div>
      )}

      {isOpen && query.length > 0 && filteredItems.length === 0 && (
        <AppCard className="absolute top-full left-0 right-0 mt-1 p-3 text-sm text-gray-500 z-50">
          未找到匹配结果
        </AppCard>
      )}
    </div>
  );
}

// [修改 3] 替换整个 “New Rail: adapters” 区块
// 位置：从
//   // ---------------------------
//   // New Rail: adapters
//   // ---------------------------
// 到 callNavRailPlan(...) 结束
// 全部删掉，并替换为下面这一段（helper 只负责：label + 组装 RailNewPlan + 组装 RouteHighlightData）

function transferTypeLabel(t: TransferType): string {
  switch (t) {
    case 'stationTransfer':
      return '站内换乘';
    case 'samePlatformTransfer':
      return '同台换乘';
    case 'throughRun':
      return '直通运行';
    case 'mergeMainline':
      return '并入主线';
    case 'leaveMainline':
      return '并出主线';
    case 'enterConnector':
      return '驶入联络线';
    case 'interComponentFly':
      return '跨网飞行';
    default:
      return '换乘';
  }
}

function buildRouteHighlightFromIntegrated(raw: NavRailNewIntegratedPlan, startCoord: Coordinate, endCoord: Coordinate, useElytra: boolean): RouteHighlightData | null {
  const styledSegments: RouteStyledSegment[] = [];
  const stationMarkers: RouteStationMarker[] = [];

  const startB = raw.startResolvedBuilding?.point;
  const endB = raw.endResolvedBuilding?.point;

  const startD = raw.access?.startToBuildingDistance ?? raw.startResolvedBuilding?.distanceToInput ?? 0;
  const endD = raw.access?.endToBuildingDistance ?? raw.endResolvedBuilding?.distanceToInput ?? 0;

  // 接驳段（作为 access 虚线）
  if (startB && startD > 0.01) {
    styledSegments.push({
      kind: 'access',
      coords: [startCoord, startB],
      dashed: true,
      color: '#22c55e',
      tooltip: useElytra ? '鞘翅接驳' : '步行接驳',
    });
  }
  if (endB && endD > 0.01) {
    styledSegments.push({
      kind: 'access',
      coords: [endB, endCoord],
      dashed: true,
      color: '#22c55e',
      tooltip: useElytra ? '鞘翅接驳' : '步行接驳',
    });
  }

  // 铁路/换乘 overlay（颜色来自 RLE.color）
  for (const seg of raw.overlay?.segments ?? []) {
    styledSegments.push({
      kind: seg.kind === 'rail' ? 'rail' : 'transfer',
      coords: seg.coords,
      color: seg.color,
      dashed: !!(seg as any).dashed,
      tooltip: seg.kind === 'rail' ? seg.lineName : transferTypeLabel((seg as any).transferType),
    });
  }

  // markers（可选：起终点 + 站体点）
  stationMarkers.push({ kind: 'start', coord: startCoord, label: '起点', color: '#2563eb', radius: 6 });
  stationMarkers.push({ kind: 'end', coord: endCoord, label: '终点', color: '#ef4444', radius: 6 });

  if (raw.startResolvedBuilding?.point) {
    stationMarkers.push({
      kind: 'station',
      coord: raw.startResolvedBuilding.point,
      label: raw.startResolvedBuilding.name,
      color: '#10b981',
      radius: 5,
    });
  }
  if (raw.endResolvedBuilding?.point) {
    stationMarkers.push({
      kind: 'station',
      coord: raw.endResolvedBuilding.point,
      label: raw.endResolvedBuilding.name,
      color: '#10b981',
      radius: 5,
    });
  }

  if (styledSegments.length === 0) return null;

  return {
    styledSegments,
    stationMarkers,
    startCoord,
    endCoord,
    startLabel: '起点',
    endLabel: '终点',
  };
}

function buildRailNewPlanFromIntegrated(raw: NavRailNewIntegratedPlan, startCoord: Coordinate, endCoord: Coordinate, useElytra: boolean): RailNewPlan {
  if (!raw.ok) {
    return { found: false, totalTimeSeconds: 0, totalDistance: 0, totalTransfers: 0, legs: [] };
  }

  const startB = raw.startResolvedBuilding?.point;
  const endB = raw.endResolvedBuilding?.point;

  const startD = raw.access?.startToBuildingDistance ?? raw.startResolvedBuilding?.distanceToInput ?? 0;
  const endD = raw.access?.endToBuildingDistance ?? raw.endResolvedBuilding?.distanceToInput ?? 0;

  const legs: RailNewLeg[] = [];

  // 起点接驳
  if (startB && startD > 0.01) {
    legs.push({
      kind: 'access',
      label: useElytra ? '鞘翅接驳' : '步行接驳',
      from: startCoord,
      to: startB,
      distance: startD,
      timeSeconds: calculateWalkTime(startD, useElytra),
      dashed: true,
    });
  }

  // overlay 中 transfer 段用来补齐 transfer leg 的 from/to
  const transferOverlays = (raw.overlay?.segments ?? []).filter((s) => s.kind === 'transfer') as any[];
  let ti = 0;

  for (const seg of raw.segments ?? []) {
    if (seg.kind === 'rail') {
      const first = seg.lines?.[0];
      legs.push({
        kind: 'rail',
        lineKey: seg.lines.map((l) => `${l.lineId}:${l.direction}`).join('|'),
        lineName: first?.lineName ?? '线路',
        color: first?.color ?? '#3b82f6',
        fromStation: seg.fromStation,
        toStation: seg.toStation,
        viaStations: seg.viaStations ?? [],
        distance: seg.distance ?? 0,
        timeSeconds: seg.timeSeconds ?? 0,
        lineNameChain: seg.lines?.length > 1 ? seg.lines.map((l) => l.lineName) : undefined,
      });
    } else if (seg.kind === 'transfer') {
      const ov = transferOverlays[ti++];
      const coords: Coordinate[] | undefined = Array.isArray(ov?.coords) ? ov.coords : undefined;
      const from = coords?.[0] ?? startB ?? startCoord;
      const to = coords?.[coords.length - 1] ?? endB ?? endCoord;

      legs.push({
        kind: 'transfer',
        label: transferTypeLabel(seg.transferType),
        from,
        to,
        distance: seg.distance ?? 0,
        timeSeconds: seg.timeSeconds ?? 0,
        dashed: true,
      });
    }
  }

  // 终点接驳
  if (endB && endD > 0.01) {
    legs.push({
      kind: 'access',
      label: useElytra ? '鞘翅接驳' : '步行接驳',
      from: endB,
      to: endCoord,
      distance: endD,
      timeSeconds: calculateWalkTime(endD, useElytra),
      dashed: true,
    });
  }

  const totalTimeSeconds =
    (raw.totalTimeSeconds ?? 0) +
    (startD > 0.01 ? calculateWalkTime(startD, useElytra) : 0) +
    (endD > 0.01 ? calculateWalkTime(endD, useElytra) : 0);

  const totalDistance = (raw.totalDistance ?? 0) + startD + endD;

  return {
    found: true,
    totalTimeSeconds,
    totalDistance,
    totalTransfers: raw.transferCount ?? 0,
    legs,
  };
}





// ---------------------------
// Component
// ---------------------------

export function NavigationPanel({
  stations,
  lines,
  landmarks,
  players = [],
  worldId,
  onRouteFound,
  onClose,
  onPointClick,
  initialEndPoint,
}: NavigationPanelProps) {
  const [startPoint, setStartPoint] = useState<SearchItem | null>(null);
  const [endPoint, setEndPoint] = useState<SearchItem | null>(null);
  const [travelMode, setTravelMode] = useState<TravelModePanel>('rail_new');
  const [preferLessTransfer, setPreferLessTransfer] = useState(true);
  const [useElytra, setUseElytra] = useState(true);

  const [resultLegacy, setResultLegacy] = useState<MultiModePathResult | null>(null);
  const [resultRailNew, setResultRailNew] = useState<RailNewPlan | null>(null);
  const [resultTeleportNew, setResultTeleportNew] = useState<NavTeleportNewIntegratedPlan | null>(null);
  const [resultRoad, setResultRoad] = useState<NavRoadPlan | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!initialEndPoint?.coord) return;
    const coord: Coordinate = {
      x: initialEndPoint.coord.x,
      y: initialEndPoint.coord.y ?? 64,
      z: initialEndPoint.coord.z,
    };
    const item: SearchItem = {
      type: initialEndPoint.ruleRecord ? 'rule' : 'coord',
      name: initialEndPoint.name || makeCoordLabel(coord),
      coord,
      extra: initialEndPoint.extra ?? (initialEndPoint.ruleRecord ? '规则要素' : '坐标'),
      searchKey: `${initialEndPoint.id ?? ''} ${initialEndPoint.name ?? ''} ${coord.x} ${coord.z}`.trim(),
      ruleRecord: initialEndPoint.ruleRecord,
    };
    setEndPoint(item);
    setMapPickTarget(null);
    setResultLegacy(null);
    setResultRailNew(null);
    setResultTeleportNew(null);
    setResultRoad(null);
  }, [initialEndPoint]);
  const legacyModuleState = useFeatureModuleStore((s) => s.modules.legacy);
  const featureDialogState = useFeatureModuleStore((s) => s.dialog);
  const requestFeatureModuleActivation = useFeatureModuleStore((s) => s.requestModuleActivation);
  const legacyModuleLoaded = legacyModuleState.status === 'loaded';
  const [legacyBundle, setLegacyBundle] = useState<LegacyModuleBundle | null>(null);
  const [pendingLegacyMode, setPendingLegacyMode] = useState<null | 'rail' | 'teleport'>(null);

  // 寻路超过阈值时显示进度窗（所有导航模式通用）
  const [searchProgressOpen, setSearchProgressOpen] = useState(false);
  const [searchProgressText, setSearchProgressText] = useState('正在计算最短路径');

  // 道路：出行方式（速度）选择
  const [roadProfileName, setRoadProfileName] = useState<string>(ROAD_TRAVEL_PROFILES[0]?.name ?? '步行');

  // 道路：起/终点层数偏好（用于择优评分）
  const [roadStartLevelPref, setRoadStartLevelPref] = useState<number>(0);
  const [roadEndLevelPref, setRoadEndLevelPref] = useState<number>(0);

  // 图上选取（起/终点互斥）
  const [mapPickTarget, setMapPickTarget] = useState<'start' | 'end' | null>(null);
  const [measuringModuleActive, setMeasuringModuleActive] = useState(false);
  const [measurementToolsActive, setMeasurementToolsActive] = useState(false);

  const isTempRuleMountEnabled = useCallback(() => {
    try {
      const raw = localStorage.getItem('ria_temp_rule_sources_v1');
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (typeof data?.enabled === 'boolean') return data.enabled;
      if (Array.isArray(data?.entries)) return data.entries.some((e: any) => Boolean(e?.enabled));
      if (Array.isArray(data?.sources)) return data.sources.some((e: any) => Boolean(e?.enabled));
      if (data && typeof data === 'object') return Object.values(data).some((v: any) => Boolean(v?.enabled));
      return false;
    } catch {
      return false;
    }
  }, []);

  const blockMapPick = measurementToolsActive || (measuringModuleActive && !isTempRuleMountEnabled());


  // 监听测绘/测量工具激活态：
// - MeasurementToolsModule 启用时：始终禁止导航图选点
// - MeasuringModule 启用时：若临时挂载启用，则不禁止（便于在临时挂载下测试道路导航）
useEffect(() => {
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<{ active?: boolean; source?: string }>;
    const active = Boolean(ce?.detail?.active);
    const source = String(ce?.detail?.source ?? '');
    if (source === 'MeasurementToolsModule') {
      setMeasurementToolsActive(active);
      return;
    }
    if (source === 'MeasuringModule') {
      setMeasuringModuleActive(active);
      return;
    }
    // 兜底：未知来源当作 MeasuringModule
    setMeasuringModuleActive(active);
  };
  window.addEventListener('ria:measuringActiveChanged', handler as any);
  return () => window.removeEventListener('ria:measuringActiveChanged', handler as any);
}, []);

  useEffect(() => {
    if (blockMapPick && mapPickTarget) {
      setMapPickTarget(null);
    }
  }, [blockMapPick, mapPickTarget]);

  // 监听地图点击（来自 MapContainer 派发）
  useEffect(() => {
    const handler = (ev: Event) => {
      if (!mapPickTarget) return;
      if (blockMapPick) return;
      const ce = ev as CustomEvent<any>;
      const detail = ce?.detail as { worldId?: string; point?: { x: number; y: number; z: number } };
      if (!detail?.point) return;
      if (detail.worldId && detail.worldId !== worldId) return;

      const snapped = snapWorldPointByMode({ x: detail.point.x, z: detail.point.z });
      const coord: Coordinate = { x: snapped.x, y: detail.point.y ?? 64, z: snapped.z };
      const item: SearchItem = {
        type: 'coord',
        name: makeCoordLabel({ x: coord.x, z: coord.z }),
        extra: '坐标',
        searchKey: `${formatGridNumber(coord.x)} ${formatGridNumber(coord.z)} ${coord.x} ${coord.z}`,
        coord,
      };

      if (mapPickTarget === 'start') {
        setStartPoint(item);
      } else {
        setEndPoint(item);
      }
      setResultLegacy(null);
      setResultRailNew(null);
      setResultTeleportNew(null);
    };
    window.addEventListener('ria:mapClickWorldPoint', handler as any);
    return () => window.removeEventListener('ria:mapClickWorldPoint', handler as any);
  }, [mapPickTarget, blockMapPick, worldId]);

  const togglePick = (target: 'start' | 'end') => {
    if (blockMapPick) return;
    setMapPickTarget((prev) => (prev === target ? null : target));
  };

  const closeAndResetPick = () => {
    setMapPickTarget(null);
  };

  // teleport_new：返回主城
  const hubReturnPoints = useMemo(() => listHubReturnPoints(worldId), [worldId]);
  const [returnToHubEnabled, setReturnToHubEnabled] = useState(false);
  const [returnPointId, setReturnPointId] = useState<string>('');

  useEffect(() => {
    if (!hubReturnPoints.length) {
      setReturnPointId('');
      return;
    }
    // 若未设置或选项已失效，则默认选第一个
    if (!returnPointId || !hubReturnPoints.some((p) => p.id === returnPointId)) {
      setReturnPointId(hubReturnPoints[0].id);
    }
  }, [hubReturnPoints, returnPointId]);

  const [railNewStaBuildingItems, setRailNewStaBuildingItems] = useState<SearchItem[]>([]);

  useEffect(() => {
    if (!legacyModuleLoaded) return;
    let cancelled = false;
    loadNavigationLegacyBundle()
      .then((bundle) => {
        if (!cancelled) setLegacyBundle(bundle);
      })
      .catch(() => {
        if (!cancelled) setLegacyBundle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [legacyModuleLoaded]);

  useEffect(() => {
    if (!pendingLegacyMode || !legacyModuleLoaded || !legacyBundle) return;
    let cancelled = false;
    ensureLegacyDataLoaded()
      .then(() => {
        if (cancelled) return;
        setTravelMode(pendingLegacyMode);
        closeAndResetPick();
        setResultLegacy(null);
        setResultRailNew(null);
        setResultTeleportNew(null);
        setResultRoad(null);
        setPendingLegacyMode(null);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('[navigation] 旧导航数据加载失败：', error);
          setPendingLegacyMode(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pendingLegacyMode, legacyModuleLoaded, legacyBundle]);

  useEffect(() => {
    if (!pendingLegacyMode) return;
    if (featureDialogState.isOpen) return;
    if (legacyModuleLoaded) return;
    if (legacyModuleState.status === 'loading') return;
    setPendingLegacyMode(null);
  }, [pendingLegacyMode, featureDialogState.isOpen, legacyModuleLoaded, legacyModuleState.status]);

  const requestLegacyModeActivation = useCallback((mode: 'rail' | 'teleport') => {
    if (legacyModuleLoaded) {
      void ensureLegacyDataLoaded()
        .then(() => {
          setTravelMode(mode);
          closeAndResetPick();
          setResultLegacy(null);
          setResultRailNew(null);
          setResultTeleportNew(null);
          setResultRoad(null);
        })
        .catch((error) => console.warn('[navigation] 旧导航数据加载失败：', error));
      return;
    }
    setPendingLegacyMode(mode);
    requestFeatureModuleActivation('legacy');
  }, [legacyModuleLoaded, requestFeatureModuleActivation]);

useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const buildings: RailNewStaBuildingSearchItem[] = await listRailNewStaBuildingsForSearch({ worldId });

      if (!alive) return;

      // 去重：同名优先 STB（中点）；没有 STB 则用 SBP
      const byName = new Map<string, RailNewStaBuildingSearchItem>();
      for (const b of buildings) {
        const key = b.name || b.id;
        const prev = byName.get(key);
        if (!prev) byName.set(key, b);
        else if (prev.kind !== 'STB' && b.kind === 'STB') byName.set(key, b);
      }

      const items: SearchItem[] = [];
      for (const b of byName.values()) {
        items.push({
          type: 'StaBuilding',
          name: b.name,
          extra: b.kind === 'STB' ? '车站' : '车站建筑点',
          searchKey: [b.name, b.id, b.kind].filter(Boolean).join(' '),
          coord: b.coord,
          staBuildingId: b.id,
          staBuildingKind: b.kind,
        });
      }

      items.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
      setRailNewStaBuildingItems(items);
    } catch (err) {
      console.error('[rail_new] listRailNewStaBuildingsForSearch failed', err);
      if (alive) setRailNewStaBuildingItems([]);
    }

  })();

  return () => {
    alive = false;
  };
}, [worldId]);


  // rail_new：每段展开状态
  const [expandedRailLegs, setExpandedRailLegs] = useState<Record<string, boolean>>({});

  // SearchBar 同源：用于“线路彩色标签”与过滤逻辑
  const [railIndex, setRailIndex] = useState<RailNewIndex | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const idx = await loadRailNewIndex(worldId);
        if (alive) setRailIndex(idx);
      } catch {
        if (alive) setRailIndex(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [worldId]);

  const buildingNameIndex = useMemo(() => {
    // 用于楼层类补充“所属建筑名”
    const m = new Map<string, string>();
    try {
      const pool = getRuleSearchPool(worldId);
      for (const r of pool) {
        const fi: any = r?.featureInfo ?? {};
        const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
        if (cls !== 'BUD' && cls !== 'STB') continue;
        const disp = getRuleDisplayName(r);
        if (disp.idValue && disp.name) m.set(disp.idValue, disp.name);
      }
    } catch {
      // ignore
    }
    return m;
  }, [worldId]);

  const formatLineName = (lineId: string): string => {
    const line = lines.find((l) => l.lineId === lineId);
    if (line) return line.bureau === 'RMP' ? line.line : `${line.bureau}-${line.line}`;
    return lineId;
  };

  const searchItems = useMemo(() => {
    const items: SearchItem[] = [];

    // 站点（去重 name）
    const stationNames = new Set<string>();
    for (const station of stations) {
      if (!stationNames.has(station.name)) {
        stationNames.add(station.name);
        items.push({ type: 'station', name: station.name, extra: '旧+车站', searchKey: station.name, coord: station.coord });
      }
    }

    // 地标
    for (const landmark of landmarks) {
      if (!landmark.coord) continue;
      const id = (landmark as any)?.id;
      const idStr = id === null || id === undefined ? '' : String(id).trim();
      const shownName = idStr ? `#${idStr} ${landmark.name}` : landmark.name;
      const sk = idStr ? `${landmark.name} ${idStr} #${idStr}` : landmark.name;
      items.push({ type: 'landmark', name: shownName, extra: '旧+地标', searchKey: sk, coord: landmark.coord });
    }

    // 玩家：可用玩家名搜索，但选中后输入框显示坐标，路线计算固定使用选中瞬间坐标。
    for (const player of players) {
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y) || !Number.isFinite(player.z)) continue;
      const coord: Coordinate = { x: player.x, y: player.y, z: player.z };
      const playerName = String(player.name ?? '').trim();
      const account = String(player.account ?? '').trim();
      items.push({
        type: 'player',
        name: makeCoordLabel({ x: coord.x, z: coord.z }),
        extra: playerName ? `玩家：${playerName}` : '玩家',
        searchKey: `${playerName} ${account} ${formatGridNumber(coord.x)} ${formatGridNumber(coord.z)} ${coord.x} ${coord.y} ${coord.z}`,
        coord,
      });
    }

    for (const b of railNewStaBuildingItems) items.push(b);

    // 规则要素（与主搜索栏同源：规则预加载池，包含临时挂载）
    try {
      const pool = getRuleSearchPool(worldId);
      const buildingNameIndex = buildBuildingNameIndex(pool);
      const ruleItems: SearchItem[] = [];
      for (const r of pool) {
        if (isRuleBlacklisted(r)) continue;
        const coord = getRepresentativeCoordForRule(r);
        if (!coord) continue;
        const disp = getRuleDisplayName(r);
        const fi: any = r?.featureInfo ?? {};
        const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
        const extra = getRuleCategoryLabelWithParent(r, buildingNameIndex);
        const searchKey = [
          disp.name,
          disp.rawName,
          disp.idValue,
          extra,
          cls,
          String((r as any)?.meta?.idValue ?? ''),
          String(r.uid ?? ''),
        ]
          .filter(Boolean)
          .join(' ');
        ruleItems.push({ type: 'rule', name: disp.name, extra, searchKey, coord, ruleRecord: r });
      }
      ruleItems.sort((a, b) => {
        const pa = a.ruleRecord ? getRulePriorityIndex(a.ruleRecord) : Number.POSITIVE_INFINITY;
        const pb = b.ruleRecord ? getRulePriorityIndex(b.ruleRecord) : Number.POSITIVE_INFINITY;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
      items.push(...ruleItems);
    } catch {
      // ignore
    }

    return items;
  }, [stations, landmarks, players, railNewStaBuildingItems, worldId]);

  const railwayGraph = useMemo(() => (legacyBundle ? legacyBundle.buildRailwayGraph(lines) : null), [legacyBundle, lines]);
  const toriiList = useMemo(() => (legacyBundle ? legacyBundle.extractToriiList(landmarks) : []), [legacyBundle, landmarks]);

  // 交换起终点
  const handleSwap = () => {
    const temp = startPoint;
    setStartPoint(endPoint);
    setEndPoint(temp);
    setResultLegacy(null);
    setResultRailNew(null);
    setResultTeleportNew(null);
    setResultRoad(null);
  };

  // 新铁路：展开/收起途经站
  const toggleRailLegExpand = (key: string) => {
    setExpandedRailLegs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 搜索
  const handleSearch = async () => {
    if (!startPoint || !endPoint) return;

    const isSameLocation = startPoint.coord.x === endPoint.coord.x && startPoint.coord.z === endPoint.coord.z;
    if (isSameLocation) {
      setResultLegacy({
        found: false,
        mode: 'walk',
        segments: [],
        totalWalkDistance: 0,
        totalRailDistance: 0,
        totalTransfers: 0,
        teleportCount: 0,
        reverseTeleportCount: 0,
      });
      setResultRailNew({ found: false, totalTimeSeconds: 0, totalDistance: 0, totalTransfers: 0, legs: [] });
      setResultTeleportNew(null);
      setResultRoad(null);
      return;
    }

    setSearching(true);
    setSearchProgressOpen(false);
    setSearchProgressText('正在计算最短路径');

    const progressTimer = window.setTimeout(() => {
      setSearchProgressOpen(true);
    }, 3000);

    try {
// [修改 4] handleSearch() 里 rail_new 分支：整段替换
// 位置：if (travelMode === 'rail_new') { ... } 这一整段
// 用下面替换掉原来的 “callNavStartNearestBuildings + callNavRailPlan + 数组挂载 styledSegments” 的实现

if (travelMode === 'rail_new') {
  const raw = await computeRailPlanFromCoords({
    worldId,
    startCoord: startPoint.coord,
    endCoord: endPoint.coord,
    mode: preferLessTransfer ? 'transfers' : 'time',

    // 参数映射：保持你原 UI config 不动
    transferWalkSpeed: DEFAULT_RAIL_NEW_CONFIG.transferWalkSpeed,
    railSpeed: DEFAULT_RAIL_NEW_CONFIG.railRideSpeed,
    stationTransferCostDivisor: DEFAULT_RAIL_NEW_CONFIG.transferCostFactor,
    normalSamePlatformTransferCost: DEFAULT_RAIL_NEW_CONFIG.normalPlatformTransferCost,
  });

  const plan = buildRailNewPlanFromIntegrated(raw, startPoint.coord, endPoint.coord, useElytra);

  setResultRailNew(plan);
  setResultLegacy(null);
  setResultTeleportNew(null);
  setResultRoad(null);

  // 通知地图高亮：务必传 RouteHighlightData（不要再传 Array，否则 MapContainer 会归一化为 generic）
  if (onRouteFound && raw.ok) {
    const rh = buildRouteHighlightFromIntegrated(raw, startPoint.coord, endPoint.coord, useElytra);
    if (rh) onRouteFound(rh);
  }

  return;
}

// teleport_new：直接调用增强版传送图寻路
if (travelMode === 'teleport_new') {
  const raw = await computeTeleportNewPlanFromCoords({
    worldId,
    startCoord: startPoint.coord,
    endCoord: endPoint.coord,
    useElytra,
    returnToHub: {
      enabled: returnToHubEnabled,
      returnPointId: returnToHubEnabled ? returnPointId : undefined,
    },
  });

  setResultTeleportNew(raw);
  setResultLegacy(null);
  setResultRailNew(null);
  setResultRoad(null);

  if (onRouteFound && raw.ok) {
    onRouteFound(raw.routeHighlight);
  }

  return;
}

// road：道路导航（ROD）
if (travelMode === 'road') {
  const profile = ROAD_TRAVEL_PROFILES.find(p => p.name === roadProfileName) ?? ROAD_TRAVEL_PROFILES[0];
  const raw = await computeRoadPlanFromCoords({
    worldId,
    startCoord: startPoint.coord,
    endCoord: endPoint.coord,
    defaultSpeed: profile?.speed ?? 4.3,
    // 用于道路 Mode 过滤（若 profile 未提供 code，则视为不启用过滤）
    travelModeCode: (profile as any)?.code,
    // 与 rail_new / teleport_new 一致：面板“鞘翅接驳”仅影响起终点接驳段
    useElytra,
    // 经验值：与铁路(新)模块默认跨组件飞行速度一致
    elytraSpeed: 40,
    elytraThreshold: 50,
    // StepA eps：按你的要求默认 1.5
    eps: 1.5,

    startLevelPref: roadStartLevelPref,
    endLevelPref: roadEndLevelPref,
  });

  // 记录 profile 名称（便于结果展示）
  if (raw.ok) {
    raw.profileName = profile?.name ?? roadProfileName;
    raw.profileSpeed = profile?.speed ?? (raw.profileSpeed ?? 4.3);
  }

  setResultRoad(raw);
  setResultLegacy(null);
  setResultRailNew(null);
  setResultTeleportNew(null);

  if (onRouteFound && raw.ok) {
    onRouteFound(raw.routeHighlight);
  }

  return;
}


      // ---------------------------
      // legacy pathfinding
      // ---------------------------

      if (travelMode === 'walk' || travelMode === 'auto' || travelMode === 'rail' || travelMode === 'teleport') {
        if (!legacyModuleLoaded) {
          requestFeatureModuleActivation('legacy');
          return;
        }
        await ensureLegacyDataLoaded();
      }

      const legacy = legacyBundle ?? await loadNavigationLegacyBundle();
      if (!legacyBundle) setLegacyBundle(legacy);
      const activeRailwayGraph = railwayGraph ?? legacy.buildRailwayGraph(lines);
      const activeToriiList = toriiList.length ? toriiList : legacy.extractToriiList(landmarks);

      let pathResult: MultiModePathResult;

      switch (travelMode) {
        case 'walk':
          pathResult = legacy.findWalkPath(startPoint.coord, endPoint.coord);
          break;

        case 'teleport': {
          const teleportPath = legacy.findTeleportPath(startPoint.coord, endPoint.coord, activeToriiList, worldId);
          let reverseTeleportCount = 0;
          const teleportSegments = teleportPath.segments.map((seg) => {
            if (seg.type === 'teleport' && seg.torii) {
              const isReverse = seg.destinationName === seg.torii.name;
              if (isReverse) reverseTeleportCount++;
              return {
                type: 'teleport' as const,
                torii: seg.torii,
                destination: seg.to,
                destinationName: seg.destinationName || '传送点',
                isReverse,
              };
            }
            return { type: 'walk' as const, from: seg.from, to: seg.to, distance: seg.distance };
          });
          pathResult = {
            found: teleportPath.found,
            mode: 'teleport',
            segments: teleportSegments,
            totalWalkDistance: teleportPath.totalWalkDistance,
            totalRailDistance: 0,
            totalTransfers: 0,
            teleportCount: teleportPath.teleportCount - reverseTeleportCount,
            reverseTeleportCount,
          };
          break;
        }

        case 'rail':
          pathResult = legacy.findRailOnlyPath(startPoint.coord, endPoint.coord, activeRailwayGraph, stations, preferLessTransfer);
          break;

        case 'auto':
        default:
          pathResult = legacy.findAutoPath(startPoint.coord, endPoint.coord, activeRailwayGraph, landmarks, stations, worldId, preferLessTransfer);
          break;
      }

      setResultLegacy(pathResult);
      setResultRailNew(null);
      setResultTeleportNew(null);
      setResultRoad(null);

      if (onRouteFound && pathResult.found) {
        const path: Array<{ coord: Coordinate }> = [];
        for (const segment of pathResult.segments) {
          if (segment.type === 'walk') {
            path.push({ coord: segment.from });
            path.push({ coord: segment.to });
          } else if (segment.type === 'rail') {
            for (const node of segment.railPath.path) path.push({ coord: node.coord });
          } else if (segment.type === 'teleport') {
            path.push({ coord: segment.torii.coord });
            path.push({ coord: segment.destination });
          }
        }
        onRouteFound(path);
      }
    } finally {
      window.clearTimeout(progressTimer);
      setSearchProgressOpen(false);
      setSearching(false);
    }
  };

  // ---------------------------
  // Render
  // ---------------------------

  const hasResult = !!(resultLegacy || resultRailNew || resultTeleportNew || resultRoad);

  return (
    <AppCard className="relative w-full sm:w-72 max-h-[70vh] sm:max-h-[82vh] flex flex-col">
      {searchProgressOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20">
          <AppCard className="p-4 w-[240px]">
            <div className="text-sm text-gray-800 font-semibold mb-1">请稍候</div>
            <div className="text-xs text-gray-600">{searchProgressText}</div>
            <div className="mt-3 h-1 w-full bg-gray-200 rounded overflow-hidden">
              <div className="h-1 w-1/2 bg-blue-400 animate-pulse" />
            </div>
          </AppCard>
        </div>
      )}
      {/* 标题 */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 className="font-bold text-gray-800">路径规划</h3>
        <AppButton
          onClick={() => {
            closeAndResetPick();
            onClose();
          }}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </AppButton>
      </div>

      {/* 模式选择 */}
      <div className="flex border-b">
        {TRAVEL_MODES.map(({ mode, label, icon: Icon }) => (
          <AppButton
            key={mode}
            className={`flex-1 py-2 px-1 flex flex-col items-center gap-0.5 text-xs transition-colors ${
              travelMode === mode
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => {
              if (mode === 'rail' || mode === 'teleport') {
                requestLegacyModeActivation(mode);
                return;
              }
              setTravelMode(mode);
              closeAndResetPick();
              setResultLegacy(null);
              setResultRailNew(null);
              setResultTeleportNew(null);
              setResultRoad(null);
            }}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </AppButton>
        ))}
      </div>

      {/* 输入区域 */}
      <div className="p-3 border-b">
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1">
            <PointSearchInput
              value={startPoint}
              onChange={(v) => {
                setStartPoint(v);
                setResultLegacy(null);
                setResultRailNew(null);
                setResultTeleportNew(null);
                setResultRoad(null);
              }}
              items={searchItems}
              railIndex={railIndex}
              buildingNameIndex={buildingNameIndex}
              placeholder="搜索起点（同主搜索栏范围）..."
              label="起点"
              labelRight={
                <AppButton
                  onClick={() => togglePick('start')}
                  disabled={blockMapPick}
                  className={`px-2 py-0.5 text-xs rounded border flex items-center gap-1 ${
                    mapPickTarget === 'start' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-200'
                  } ${blockMapPick ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                  title={blockMapPick ? '测量工具启用时不可图上选取；测绘启用时仅在未启用临时挂载时禁止' : '图上选取起点'}
                >
                  <MousePointerClick className="w-3.5 h-3.5" />
                  <span>{mapPickTarget === 'start' ? '图选中' : '图上选取'}</span>
                </AppButton>
              }
            />
          </div>
          <AppButton
            onClick={handleSwap}
            className="mt-6 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="交换起终点"
          >
            <ArrowUpDown className="w-4 h-4" />
          </AppButton>
        </div>

        <div className="mb-2">
          <PointSearchInput
            value={endPoint}
            onChange={(v) => {
              setEndPoint(v);
              setResultLegacy(null);
              setResultRailNew(null);
              setResultTeleportNew(null);
              setResultRoad(null);
            }}
            items={searchItems}
            railIndex={railIndex}
            buildingNameIndex={buildingNameIndex}
            placeholder="搜索终点（同主搜索栏范围）..."
            label="终点"
            labelRight={
              <AppButton
                onClick={() => togglePick('end')}
                disabled={blockMapPick}
                className={`px-2 py-0.5 text-xs rounded border flex items-center gap-1 ${
                  mapPickTarget === 'end' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-200'
                } ${blockMapPick ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                title={blockMapPick ? '测量工具启用时不可图上选取；测绘启用时仅在未启用临时挂载时禁止' : '图上选取终点'}
              >
                <MousePointerClick className="w-3.5 h-3.5" />
                <span>{mapPickTarget === 'end' ? '图选中' : '图上选取'}</span>
              </AppButton>
            }
          />
        </div>

        {mapPickTarget && !blockMapPick && (
          <div className="mb-2 text-xs text-blue-600">
            开启图上选取功能：请点击地图以设置{mapPickTarget === 'start' ? '起点' : '终点'}坐标。
          </div>
        )}

        {/* 道路：出行方式（速度）选择 */}
        {travelMode === 'road' && (
          <div className="mb-2">
            <div className="text-[11px] text-gray-500 mb-1">出行方式</div>
            <select
              className="w-full border rounded px-2 py-1 text-xs bg-white"
              value={roadProfileName}
              onChange={(e) => {
                setRoadProfileName(e.target.value);
                setResultRoad(null);
              }}
            >
              {ROAD_TRAVEL_PROFILES.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}（{p.speed}格/秒）
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {(travelMode === 'rail' || travelMode === 'auto' || travelMode === 'rail_new') && (
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={preferLessTransfer}
                  onChange={(e) => {
                    setPreferLessTransfer(e.target.checked);
                    setResultLegacy(null);
                    setResultRailNew(null);
                    setResultTeleportNew(null);
                    setResultRoad(null);
                  }}
                  className="w-3 h-3"
                />
                <span className="text-gray-600">少换乘</span>
              </label>
            )}

            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={useElytra}
                onChange={(e) => {
                  setUseElytra(e.target.checked);
                  setResultLegacy(null);
                  setResultRailNew(null);
                  setResultTeleportNew(null);
                  setResultRoad(null);
                }}
                className="w-3 h-3"
              />
              <span className="text-gray-600">鞘翅</span>
            </label>

            {travelMode === 'road' && (
              <>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <span className="text-gray-600">起点层数</span>
                  <select
                    className="text-xs border rounded px-1.5 py-0.5 bg-white"
                    value={roadStartLevelPref}
                    onChange={(e) => {
                      setRoadStartLevelPref(Number(e.target.value));
                      setResultRoad(null);
                    }}
                  >
                    {Array.from({ length: 21 }, (_, i) => i - 10).map((v) => (
                      <option key={`sLv-${v}`} value={v}>{v}</option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <span className="text-gray-600">终点层数</span>
                  <select
                    className="text-xs border rounded px-1.5 py-0.5 bg-white"
                    value={roadEndLevelPref}
                    onChange={(e) => {
                      setRoadEndLevelPref(Number(e.target.value));
                      setResultRoad(null);
                    }}
                  >
                    {Array.from({ length: 21 }, (_, i) => i - 10).map((v) => (
                      <option key={`eLv-${v}`} value={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>

          <AppButton
            onClick={() => void handleSearch()}
            disabled={!startPoint || !endPoint || searching}
            className="px-4 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-xs font-medium"
          >
            {searching ? '搜索中...' : '搜索'}
          </AppButton>
        </div>

        {/* teleport_new：返回主城 */}
        {travelMode === 'teleport_new' && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={returnToHubEnabled}
                onChange={(e) => {
                  setReturnToHubEnabled(e.target.checked);
                  setResultTeleportNew(null);
                  setResultLegacy(null);
                  setResultRailNew(null);
                }}
                className="w-3 h-3"
              />
              <span className="text-gray-600">返回主城</span>
            </label>

            {returnToHubEnabled && (
              hubReturnPoints.length ? (
                <select
                  className="text-xs border rounded px-2 py-1 bg-white"
                  value={returnPointId}
                  onChange={(e) => {
                    setReturnPointId(e.target.value);
                    setResultTeleportNew(null);
                  }}
                >
                  {hubReturnPoints.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-gray-500">（当前世界未配置回城点）</span>
              )
            )}
          </div>
        )}
      </div>

      {/* 结果区域 */}
      {hasResult && (
        <div className="flex-1 overflow-y-auto p-3">
          {/* 新铁路结果 */}
          {travelMode === 'rail_new' && resultRailNew && (
            <>
              {resultRailNew.found ? (
                <>
                  {/* 概览（截图风格简化版） */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-800">铁路（新）</div>
                      <div className="text-xs text-gray-500">
                        到达时间 <span className="font-medium text-gray-800">{formatArrivalTime(resultRailNew.totalTimeSeconds)}</span>
                      </div>
                    </div>

                    {/* 线路 pills */}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {resultRailNew.legs
                        .filter((l) => l.kind === 'rail')
                        .map((l, idx) => {
                          const leg = l as RailNewRailLeg;
                          return (
                            <div
                              key={`pill-${idx}`}
                              className="px-3 py-1 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: leg.color || '#3b82f6' }}
                              title={leg.lineKey}
                            >
                              {leg.lineNameChain?.length ? leg.lineNameChain.join('/') : leg.lineName}
                            </div>
                          );
                        })}
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      全程约 <span className="font-medium text-gray-800">{formatTime(resultRailNew.totalTimeSeconds)}</span>
                      {resultRailNew.totalTransfers > 0 && (
                        <span className="ml-3">换乘 <span className="font-medium text-blue-600">{resultRailNew.totalTransfers}</span> 次</span>
                      )}
                    </div>
                  </div>

                  {/* 详情 timeline */}
                  <div className="space-y-2">
                    {resultRailNew.legs.map((leg, index) => {
                      if (leg.kind === 'rail') {
                        const k = `${index}`;
                        const expanded = !!expandedRailLegs[k];
                        const displayLineName = leg.lineNameChain?.length ? leg.lineNameChain.join('/') : leg.lineName;
                        const stationsList = leg.viaStations?.length ? leg.viaStations : [leg.fromStation, leg.toStation].filter(Boolean);
                        const isConnectorLeg = leg.lineKey
                        .split('|')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .every((k) => k.endsWith(':4'));
                        const first = stationsList[0] || leg.fromStation;
                        const last = stationsList[stationsList.length - 1] || leg.toStation;
                        const mid = stationsList.slice(1, Math.max(1, stationsList.length - 1));

                        return (
                          <div key={`rail-leg-${index}`} className="relative pl-5">
                            {index < resultRailNew.legs.length - 1 && (
                              <div
                                className="absolute left-[7px] top-5 bottom-0 w-0.5"
                                style={{ backgroundColor: leg.color || '#3b82f6' }}
                              />
                            )}
                            <div
                              className="absolute left-0 top-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center"
                              style={{ backgroundColor: leg.color || '#3b82f6' }}
                            >
                              <Train className="w-2.5 h-2.5" />
                            </div>

                            <div className="rounded p-2 border" style={{ borderColor: `${leg.color || '#3b82f6'}55` }}>
                              <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] font-medium mb-0.5" style={{ color: leg.color || '#3b82f6' }}>
                                    {displayLineName}
                                    <span className="text-gray-400 ml-1">({formatTime(leg.timeSeconds)})</span>
                                  </div>
                                  {!isConnectorLeg && (
  <div className="text-xs text-gray-800 truncate">
    <span className="font-medium">{first}</span>
    {stationsList.length > 2 ? (
      <span className="text-gray-400 mx-1">→ {stationsList.length - 2}站 →</span>
    ) : (
      <span className="text-gray-400 mx-1">→</span>
    )}
    <span className="font-medium">{last}</span>
  </div>
)}
                                </div>

                                {!isConnectorLeg && (
  <AppButton
    className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-800 flex-shrink-0"
    onClick={() => toggleRailLegExpand(k)}
    title="展开/收起途经站"
  >
    <span>途经</span>
    {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
  </AppButton>
)}
                              </div>

                              {!isConnectorLeg && expanded && mid.length > 0 && (
  <div className="mt-2 flex flex-wrap gap-1">
    {mid.map((s, i) => (
      <span
        key={`${k}-mid-${i}`}
        className="px-2 py-0.5 rounded text-[10px] text-white"
        style={{ backgroundColor: leg.color || '#3b82f6' }}
      >
        {s}
      </span>
    ))}
  </div>
)}
                            </div>
                          </div>
                        );
                      }

                      // walk/access/transfer（接驳段也显示）
                      const icon = leg.kind === 'transfer' ? ChevronRight : Footprints;
                      const Icon = icon;
                      const bg = leg.kind === 'transfer' ? 'bg-gray-50' : 'bg-green-50';
                      const fg = leg.kind === 'transfer' ? 'text-gray-600' : 'text-green-600';

                      return (
                        <div key={`walk-leg-${index}`} className="relative pl-5">
                          {index < resultRailNew.legs.length - 1 && (
                            <div
                              className={`absolute left-[7px] top-5 bottom-0 w-0.5 ${leg.dashed ? 'bg-transparent' : 'bg-gray-200'}`}
                              style={leg.dashed ? { borderLeft: '2px dashed #cbd5e1' } : undefined}
                            />
                          )}
                          <div className={`absolute left-0 top-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center ${leg.kind === 'transfer' ? 'bg-gray-500' : 'bg-green-500'}`}>
                            <Icon className="w-2.5 h-2.5" />
                          </div>

                          <div className={`${bg} rounded p-2`}>
                            <div className={`text-[10px] ${fg} font-medium mb-0.5`}>
                              {leg.label} {Math.round(leg.distance)}m
                              <span className="text-gray-400 ml-1">({formatTime(leg.timeSeconds)})</span>
                            </div>
                            {leg.kind !== 'transfer' && (
  <div className="text-xs text-gray-800">
    <AppButton className="hover:underline" onClick={() => onPointClick?.(leg.from)}>
      ({Math.round(leg.from.x)}, {Math.round(leg.from.z)})
    </AppButton>
    <span className="text-gray-400 mx-1">→</span>
    <AppButton className="hover:underline" onClick={() => onPointClick?.(leg.to)}>
      ({Math.round(leg.to.x)}, {Math.round(leg.to.z)})
    </AppButton>
  </div>
)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500 py-4 text-sm">
                  {startPoint?.coord.x === endPoint?.coord.x && startPoint?.coord.z === endPoint?.coord.z
                    ? '起点和终点相同'
                    : '未找到可用路线（请检查：站台 Situation/Available、线路方向、换乘归属 STB/SBP 等）'}
                </div>
              )}
            </>
          )}

          {/* 新传送结果 */}
          {travelMode === 'teleport_new' && resultTeleportNew && (
            <>
              {resultTeleportNew.ok ? (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-800">传送（新）</div>
                      <div className="text-xs text-gray-500">
                        到达时间 <span className="font-medium text-gray-800">{formatArrivalTime(resultTeleportNew.totalTimeSeconds)}</span>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      全程约 <span className="font-medium text-gray-800">{formatTime(resultTeleportNew.totalTimeSeconds)}</span>
                      <span className="ml-3">
                        传送 <span className="font-medium text-purple-600">{resultTeleportNew.teleportCount}</span> 次
                      </span>
                      {resultTeleportNew.usedHub && (
                        <span className="ml-3">hub <span className="font-medium text-gray-800">{resultTeleportNew.usedHub}</span></span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {resultTeleportNew.segments.map((seg, idx) => {
                      if (seg.kind === 'fly') {
                        const Icon = useElytra ? Rocket : Footprints;
                        return (
                          <div key={`tpnew-fly-${idx}`} className="relative pl-5">
                            {idx < resultTeleportNew.segments.length - 1 && (
                              <div className="absolute left-[7px] top-5 bottom-0 w-0.5" style={{ borderLeft: '2px dashed #cbd5e1' }} />
                            )}
                            <div className="absolute left-0 top-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center bg-green-500">
                              <Icon className="w-2.5 h-2.5" />
                            </div>
                            <div className="bg-green-50 rounded p-2">
                              <div className="text-[10px] text-green-600 font-medium mb-0.5">
                                {useElytra ? '鞘翅飞行' : '步行'} {Math.round(seg.distance)}m
                                <span className="text-gray-400 ml-1">({formatTime(seg.timeSeconds)})</span>
                              </div>
                              <div className="text-xs text-gray-800">
                                <AppButton className="hover:underline" onClick={() => onPointClick?.(seg.from)}>
                                  ({Math.round(seg.from.x)}, {Math.round(seg.from.z)})
                                </AppButton>
                                <span className="text-gray-400 mx-1">→</span>
                                <AppButton className="hover:underline" onClick={() => onPointClick?.(seg.to)}>
                                  ({Math.round(seg.to.x)}, {Math.round(seg.to.z)})
                                </AppButton>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (seg.kind === 'personal_return') {
                        return (
                          <div key={`tpnew-ret-${idx}`} className="relative pl-5">
                            {idx < resultTeleportNew.segments.length - 1 && (
                              <div className="absolute left-[7px] top-5 bottom-0 w-0.5" style={{ borderLeft: '2px dashed #cbd5e1' }} />
                            )}
                            <div className="absolute left-0 top-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center bg-orange-500">
                              <Home className="w-2.5 h-2.5" />
                            </div>
                            <div className="bg-orange-50 rounded p-2">
                              <div className="text-[10px] text-orange-600 font-medium mb-0.5">
                                返回主城：{seg.returnPointName}
                                <span className="text-gray-400 ml-1">({formatTime(seg.timeSeconds)})</span>
                              </div>
                              <div className="text-xs text-gray-800">
                                <AppButton className="hover:underline" onClick={() => onPointClick?.(seg.to)}>
                                  ({Math.round(seg.to.x)}, {Math.round(seg.to.z)})
                                </AppButton>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // teleport
                      return (
                        <div key={`tpnew-tp-${idx}`} className="relative pl-5">
                          {idx < resultTeleportNew.segments.length - 1 && (
                            <div className="absolute left-[7px] top-5 bottom-0 w-0.5" style={{ borderLeft: '2px dashed #cbd5e1' }} />
                          )}
                          <div className="absolute left-0 top-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center bg-purple-500">
                            <Zap className="w-2.5 h-2.5" />
                          </div>
                          <div className="bg-purple-50 rounded p-2">
                            <div className="text-[10px] text-purple-600 font-medium mb-0.5">
                              传送：{seg.tpName || '传送点'}
                              <span className="text-gray-400 ml-1">({formatTime(seg.timeSeconds)})</span>
                            </div>
                            <div className="text-xs text-gray-800">
                              <AppButton className="hover:underline" onClick={() => onPointClick?.(seg.from)}>
                                ({Math.round(seg.from.x)}, {Math.round(seg.from.z)})
                              </AppButton>
                              <span className="text-gray-400 mx-1">⇒</span>
                              <AppButton className="hover:underline" onClick={() => onPointClick?.(seg.to)}>
                                ({Math.round(seg.to.x)}, {Math.round(seg.to.z)})
                              </AppButton>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500 py-4 text-sm">
                  {resultTeleportNew.reason || '未找到可用传送路线'}
                </div>
              )}
            </>
          )}

          {/* 道路结果 */}
          {travelMode === 'road' && resultRoad && (
            <>
              {resultRoad.ok ? (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-800">道路</div>
                      <div className="text-xs text-gray-500">
                        到达时间 <span className="font-medium text-gray-800">{formatArrivalTime(resultRoad.totalTimeSeconds)}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      全程约 <span className="font-medium text-gray-800">{formatTime(resultRoad.totalTimeSeconds)}</span>
                      <span className="ml-3">距离 <span className="font-medium">{Math.round(resultRoad.totalDistance)}m</span></span>
                      {resultRoad.profileName ? (
                        <span className="ml-3">方式 <span className="font-medium text-gray-800">{resultRoad.profileName}</span></span>
                      ) : null}
                    </div>
                  </div>

                  {(() => {
                    const segs = Array.isArray(resultRoad.segments) ? resultRoad.segments : [];
                    const startAcc = segs.length && segs[0]?.kind === 'access' ? segs[0] : null;
                    const endAcc = segs.length >= 2 && segs[segs.length - 1]?.kind === 'access' ? segs[segs.length - 1] : null;

                    const AccessCard = (p: { seg: any; title: string; border: string }) => (
                      <div className={`bg-white border rounded p-2 border-l-4 ${p.border}`}> 
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs text-gray-800">
                              <span className="font-medium">{p.title}</span>
                              <span className="text-gray-400 mx-1">·</span>
                              <span className="text-gray-700">{p.seg?.accessMode === 'elytra' ? '鞘翅接驳' : '步行接驳'}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {Math.round(p.seg?.distance ?? 0)}m · {formatTime(p.seg?.timeSeconds ?? 0)}
                            </div>
                          </div>
                          <AppButton className="text-[10px] text-blue-600 hover:underline" onClick={() => onPointClick?.(p.seg?.to ?? p.seg?.from)}>
                            定位
                          </AppButton>
                        </div>
                      </div>
                    );

                    return (
                      <>
                        {startAcc ? (
                          <div className="mb-2">
                            <AccessCard seg={startAcc} title="进入道路" border="border-l-green-500" />
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          {resultRoad.instructions.map((it, idx) => {
                            const label = (() => {
                              switch (it.action) {
                                case 'start':
                                  return '出发';
                                case 'arrive':
                                  return '到达终点';
                                case 'slight_left':
                                  return '向左前方';
                                case 'left':
                                  return '左转';
                                case 'slight_right':
                                  return '向右前方';
                                case 'right':
                                  return '右转';
                                case 'uturn':
                                  return '掉头';
                                default:
                                  return '直行';
                              }
                            })();

                            return (
                              <div key={`road-ins-${idx}`} className="bg-white border rounded p-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-800">
                                      <span className="font-medium">{label}</span>
                                      <span className="text-gray-400 mx-1">·</span>
                                      <span className="text-gray-700">{it.roadName || '道路'}</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                      {Math.round(it.distance)}m · {formatTime(it.timeSeconds)}
                                    </div>
                                  </div>
                                  <AppButton className="text-[10px] text-blue-600 hover:underline" onClick={() => onPointClick?.(it.at)}>
                                    定位
                                  </AppButton>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {endAcc ? (
                          <div className="mt-2">
                            <AccessCard seg={endAcc} title="离开道路" border="border-l-red-500" />
                          </div>
                        ) : null}
                      </>
                    );
                  })()}

                </>
              ) : (
                <div className="text-center text-gray-500 py-4 text-sm">{resultRoad.reason || '未找到可用道路路线'}</div>
              )}
            </>
          )}

          {/* 旧模式结果 */}
          {travelMode !== 'rail_new' && travelMode !== 'teleport_new' && travelMode !== 'road' && resultLegacy && (
            <>
              {resultLegacy.found ? (
                <>
                  <div className="flex items-center gap-3 mb-3 text-xs flex-wrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500">预计:</span>
                      <span className="font-medium text-orange-600">{formatTime((legacyBundle?.calculateEstimatedTime?.(resultLegacy, useElytra) ?? 0))}</span>
                    </div>
                    {resultLegacy.totalTransfers > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">换乘:</span>
                        <span className="font-medium text-blue-600">{resultLegacy.totalTransfers}次</span>
                      </div>
                    )}
                    {resultLegacy.teleportCount > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">传送:</span>
                        <span className="font-medium text-purple-600">{resultLegacy.teleportCount}次</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">{useElytra ? '飞行' : '步行'}:</span>
                      <span className="font-medium">{Math.round(resultLegacy.totalWalkDistance)}m</span>
                    </div>
                    {resultLegacy.totalRailDistance > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">铁路:</span>
                        <span className="font-medium">{Math.round(resultLegacy.totalRailDistance)}m</span>
                      </div>
                    )}
                  </div>

                  {useElytra && resultLegacy.totalWalkDistance > 0 && (() => {
                    const consumption: ReturnType<NonNullable<LegacyModuleBundle['calculateElytraConsumption']>> =
                      legacyBundle?.calculateElytraConsumption?.(resultLegacy.totalWalkDistance) ?? {
                        flightTime: 0,
                        durabilityUsed: 0,
                        durabilityUsedUnbreaking: 0,
                        fireworksUsed: 0,
                        elytraCount: 1,
                        elytraCountUnbreaking: 1,
                      };
                    return (
                      <div className="bg-amber-50 rounded p-2 mb-3 text-xs">
                        <div className="flex items-center gap-1 mb-1 text-amber-700 font-medium">
                          <Rocket className="w-3 h-3" />
                          <span>鞘翅飞行消耗</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap text-gray-600">
                          <div className="flex items-center gap-1">
                            <Rocket className="w-3 h-3 text-red-500" />
                            <span>烟花: </span>
                            <span className="font-medium text-red-600">~{consumption.fireworksUsed}个</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Shield className="w-3 h-3 text-cyan-500" />
                            <span>耐久: </span>
                            <span className="font-medium text-cyan-600">{Math.round((consumption.durabilityUsed / 432) * 100)}%</span>
                            <span className="text-gray-400">({Math.round((consumption.durabilityUsedUnbreaking / 432) * 100)}% 耐久III)</span>
                          </div>
                        </div>
                        {consumption.elytraCount > 1 && (
                          <div className="mt-1 text-amber-600">⚠️ 需要 {consumption.elytraCount} 个鞘翅（或 {consumption.elytraCountUnbreaking} 个耐久III鞘翅）</div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    {resultLegacy.segments.map((segment, index) => {
                      if (segment.type === 'walk') {
                        const walkTime = (legacyBundle?.calculateWalkTime?.(segment.distance, useElytra) ?? 0);
                        return (
                          <div key={index} className="relative pl-5">
                            {index < resultLegacy.segments.length - 1 && (
                              <div className="absolute left-[7px] top-5 bottom-0 w-0.5 bg-gray-200" />
                            )}
                            <div className="absolute left-0 top-0.5 w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                              <Footprints className="w-2.5 h-2.5" />
                            </div>
                            <div className="bg-green-50 rounded p-2">
                              <div className="text-[10px] text-green-600 font-medium mb-0.5">
                                {useElytra ? '飞行' : '步行'} {Math.round(segment.distance)}m
                                <span className="text-gray-400 ml-1">({formatTime(walkTime)})</span>
                              </div>
                              <div className="text-xs text-gray-800">
                                <AppButton className="text-green-700 hover:underline" onClick={() => onPointClick?.(segment.from)}>
                                  ({Math.round(segment.from.x)}, {Math.round(segment.from.z)})
                                </AppButton>
                                <span className="text-gray-400 mx-1">→</span>
                                <AppButton className="text-green-700 hover:underline" onClick={() => onPointClick?.(segment.to)}>
                                  ({Math.round(segment.to.x)}, {Math.round(segment.to.z)})
                                </AppButton>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (segment.type === 'teleport') {
                        const isReverseTP = segment.isReverse || segment.destinationName === segment.torii.name;
                        const toriiLabel = `#${segment.torii.id} ${segment.torii.name}`;

                        let fromName: string;
                        let toName: string;

                        if (isReverseTP) {
                          const prevSegment = index > 0 ? resultLegacy.segments[index - 1] : null;
                          if (prevSegment?.type === 'teleport') fromName = prevSegment.destinationName;
                          else fromName = segment.destinationName !== segment.torii.name ? segment.destinationName : '中转点';
                          toName = toriiLabel;
                        } else {
                          fromName = `任意位置 (${toriiLabel})`;
                          toName = segment.destinationName;
                        }

                        return (
                          <div key={index} className="relative pl-5">
                            {index < resultLegacy.segments.length - 1 && (
                              <div className="absolute left-[7px] top-5 bottom-0 w-0.5 bg-gray-200" />
                            )}
                            <div className="absolute left-0 top-0.5 w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center">
                              <Zap className="w-2.5 h-2.5" />
                            </div>
                            <div className="bg-purple-50 rounded p-2">
                              <div className="text-[10px] text-purple-600 font-medium mb-0.5">
                                传送 → {toName}
                                {isReverseTP && <span className="text-gray-400 ml-1">(+30秒)</span>}
                              </div>
                              <div className="text-xs text-gray-800">
                                <AppButton
                                  className="text-purple-700 hover:underline"
                                  onClick={() => onPointClick?.(isReverseTP ? segment.destination : segment.torii.coord)}
                                >
                                  {fromName}
                                </AppButton>
                                <span className="text-gray-400 mx-1">→</span>
                                <AppButton
                                  className="text-purple-700 hover:underline"
                                  onClick={() => onPointClick?.(isReverseTP ? segment.torii.coord : segment.destination)}
                                >
                                  {toName}
                                </AppButton>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (segment.type === 'rail') {
                        const railSegments = (legacyBundle?.simplifyPath?.(segment.railPath.path) ?? []);
                        const totalRailDist = segment.railPath.totalDistance;
                        const avgDistPerSeg = railSegments.length > 0 ? totalRailDist / railSegments.length : 0;

                        return railSegments.map((railSeg, railIndex) => {
                          const segDist = Math.sqrt(
                            Math.pow(railSeg.endCoord.x - railSeg.startCoord.x, 2) + Math.pow(railSeg.endCoord.z - railSeg.startCoord.z, 2)
                          );
                          const segTime = (legacyBundle?.calculateRailTime?.(segDist || avgDistPerSeg) ?? 0);

                          return (
                            <div key={`${index}-${railIndex}`} className="relative pl-5">
                              {(railIndex < railSegments.length - 1 || index < resultLegacy.segments.length - 1) && (
                                <div className="absolute left-[7px] top-5 bottom-0 w-0.5 bg-gray-200" />
                              )}
                              <div className="absolute left-0 top-0.5 w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center">
                                <Train className="w-2.5 h-2.5" />
                              </div>
                              <div className="bg-blue-50 rounded p-2">
                                <div className="text-[10px] text-blue-600 font-medium mb-0.5">
                                  {formatLineName(railSeg.lineId)}
                                  <span className="text-gray-400 ml-1">({formatTime(segTime)})</span>
                                </div>
                                <div className="text-xs text-gray-800">
                                  <AppButton className="hover:underline hover:text-blue-600" onClick={() => onPointClick?.(railSeg.startCoord)}>
                                    {railSeg.stations[0]}
                                  </AppButton>
                                  {railSeg.stations.length > 2 && (
                                    <span className="text-gray-400 mx-1">→ {railSeg.stations.length - 2}站 →</span>
                                  )}
                                  {railSeg.stations.length === 2 && <span className="text-gray-400 mx-1">→</span>}
                                  {railSeg.stations.length > 1 && (
                                    <AppButton className="hover:underline hover:text-blue-600" onClick={() => onPointClick?.(railSeg.endCoord)}>
                                      {railSeg.stations[railSeg.stations.length - 1]}
                                    </AppButton>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      }

                      return null;
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500 py-4 text-sm">
                  {startPoint?.coord.x === endPoint?.coord.x && startPoint?.coord.z === endPoint?.coord.z
                    ? '起点和终点相同'
                    : '未找到可用路线'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </AppCard>
  );
}

export default NavigationPanel;
