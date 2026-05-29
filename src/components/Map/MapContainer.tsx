import { Suspense, lazy, useEffect, useRef, useState, useCallback } from 'react';
import MobileBottomSheet from '@/components/Mobile/MobileBottomSheet';
import MobileQuickDock from '@/components/Mobile/MobileQuickDock';
import MobileFeatureJsonPanel from '@/components/Mobile/MobileFeatureJsonPanel';
import MobileFeatureSharePanel from '@/components/Mobile/MobileFeatureSharePanel';
import MobileFloorPanel from '@/components/Mobile/MobileFloorPanel';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createDynmapCRS, ZTH_FLAT_CONFIG, DynmapProjection } from '@/lib/DynmapProjection';
import { DynmapTileLayer, createDynmapTileLayer } from '@/lib/DynmapTileLayer';
import { createSketchTileLayer } from '@/lib/SketchTileLayer';
import { createWatercolorTileLayer } from '@/lib/SketchTileLayer';
import { PlayerLayer } from './PlayerLayer';
import { RouteHighlightLayer, type RouteHighlightData } from './RouteHighlightLayer';
import { LineHighlightLayer } from './LineHighlightLayer';
import { WorldSwitcher } from './WorldSwitcher';
import { SearchBar, type SearchResult } from '../Search/SearchBar';
import { getMatchingRuleButtonIds } from '../Rules/ButtonRule/buttonRuleFilter';
import { NavigationPanel, type NavigationInitialPoint } from '../Navigation/NavigationPanel';
import { AttributeQueryPanel } from '../AttributeQuery/AttributeQueryPanel';
import { PlayerDetailCard } from '../PlayerDetail/PlayerDetailCard';
import { Toolbar, LayerControl, AboutCard } from '../Toolbar/Toolbar';
import { PlayersList } from '../Players/PlayersList';
import { LoadingOverlay } from '../Loading/LoadingOverlay';
import { DraggablePanel } from '../DraggablePanel/DraggablePanel';
import { SettingsPanel } from '../Settings/SettingsPanel';
import { useDataStore } from '@/store/dataStore';
import { ensureLegacyDataLoaded } from '@/lib/legacyDataLoader';
import { useRuleDataStore } from '@/store/ruleDataStore';
import { useLoadingStore } from '@/store/loadingStore';
import { fetchPlayersDetailed } from '@/lib/playerApi';
import { loadMapSettings, saveMapSettings, MapStyle } from '@/lib/cookies';
import type { ParsedStation, ParsedLine, Coordinate, Player } from '@/types';
import type { ParsedLandmark } from '@/components/Legacy/data/landmarkParser';
import type { MeasuringModuleHandle } from '@/components/Mapping/core/MeasuringModule';
import { useFeatureModuleStore } from '@/store/featureModuleStore';

import RuleDrivenLayer from '@/components/Rules/core/RuleDrivenLayer';
import { resolveFeatureCardComponent } from '@/components/Rules/cardrules/featureCardRegistry';
import { pickIdFieldValue, type FeatureRecord } from '@/components/Rules/rendering/renderRules';
import RuleButtonPanel from '@/components/Rules/ButtonRule/RuleButtonPanel';
import { useRuleButtonState } from '@/components/Rules/ButtonRule/ruleButtonState';

import { formatGridNumber, snapWorldPointByMode } from '@/lib/gridSnapUtils';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import ToolIconButton from '@/components/Toolbar/ToolIconButton';
import { Globe2, PanelsTopLeft, Layers3, SlidersHorizontal, Plus, Minus, Pencil, Ruler, User } from 'lucide-react';
import { buildBuildingNameIndex, getRuleCategoryLabelWithParent, getRuleDisplayName } from '@/components/Search/searchRuleTables';
import { getRuleSearchPool } from '@/components/Rules/search/ruleSearchRegistry';
import { consumeFeatureShareTargetFromLocation, normalizePlayerShareId, type FeatureSharePayload, type FeatureShareTarget, type PlayerShareTarget, type ShareParseResult } from '@/lib/featureShareLink';

// ===== 导航“图上选取”：MapContainer 统一派发地图点击事件 =====
type MapClickWorldPointEventDetail = {
  worldId: string;
  point: { x: number; y: number; z: number };
};


type MobilePanelKey = null | 'navigation' | 'attributeQuery' | 'players' | 'about' | 'settings' | 'featureJson' | 'featureShare';
type MobileQuickPanelKey = null | 'worlds' | 'toolbar' | 'ruleButtons' | 'modeTools';

type PendingShareTarget =
  | { type: 'feature'; target: FeatureShareTarget }
  | { type: 'player'; target: PlayerShareTarget };

type ShareLookupState = {
  pending: PendingShareTarget;
  phase: 'waiting-map-ready' | 'waiting-pool' | 'searching-feature' | 'waiting-player-list' | 'searching-player';
  attempt: number;
  maxAttempts: number;
};

const SHARE_LOOKUP_RETRY_MS = 250;
const SHARE_LOOKUP_WAIT_POOL_ATTEMPTS = 12;
const SHARE_LOOKUP_SEARCH_ATTEMPTS = 8;
const PLAYER_SHARE_LOOKUP_ATTEMPTS = 16;

function createShareLookupState(
  pending: PendingShareTarget,
  phase: ShareLookupState['phase'] = pending.type === 'player' ? 'waiting-player-list' : 'waiting-pool',
  attempt = 0,
  maxAttempts = pending.type === 'player' ? PLAYER_SHARE_LOOKUP_ATTEMPTS : SHARE_LOOKUP_WAIT_POOL_ATTEMPTS,
): ShareLookupState {
  return { pending, phase, attempt, maxAttempts };
}

function getShareLookupText(state: ShareLookupState): string {
  switch (state.phase) {
    case 'waiting-map-ready':
      return '正在等待地图数据加载完成...';
    case 'waiting-pool':
      return '正在准备分享目标索引...';
    case 'searching-feature':
      return '正在查找分享目标...';
    case 'waiting-player-list':
      return '正在同步玩家状态...';
    case 'searching-player':
      return '正在查找在线玩家...';
    default:
      return '正在打开分享链接...';
  }
}

function getShareLookupProgress(state: ShareLookupState): number {
  if (state.maxAttempts <= 0) return 8;
  return Math.min(100, Math.max(8, Math.round((state.attempt / state.maxAttempts) * 100)));
}

// 世界配置
const LazyMeasuringModule = lazy(() => import('@/components/Mapping/core/MeasuringModule'));
const LazyMeasurementToolsModule = lazy(() => import('@/components/Mapping/core/Mtools'));
const LazyRailwayLayer = lazy(() => import('@/components/Legacy/map/RailwayLayer').then((mod) => ({ default: mod.RailwayLayer })));
const LazyLandmarkLayer = lazy(() => import('@/components/Legacy/map/LandmarkLayer').then((mod) => ({ default: mod.LandmarkLayer })));
const LazyLineDetailCard = lazy(() => import('@/components/Legacy/detail/LineDetailCard').then((mod) => ({ default: mod.LineDetailCard })));
const LazyPointDetailCard = lazy(() => import('@/components/Legacy/detail/PointDetailCard').then((mod) => ({ default: mod.PointDetailCard })));
const LazyLinesPage = lazy(() => import('@/components/Legacy/lines/LinesPage').then((mod) => ({ default: mod.LinesPage })));

const WORLDS = [
  { id: 'zth', name: '零洲', center: { x: -643, y: 35, z: -1562 } },
  { id: 'eden', name: '伊甸', center: { x: 0, y: 64, z: 0 } },
  { id: 'naraku', name: '奈落洲', center: { x: 0, y: 64, z: 0 } },
  { id: 'houtu', name: '后土洲', center: { x: 0, y: 64, z: 0 } },
  { id: 'laputa', name: '拉普塔', center: { x: 272, y: 64, z: 104 } }
];

const PLAYER_FEATURE_ENABLED = true;
const LINES_FEATURE_ENABLED = false;

function getRuleCenterCoord(r: FeatureRecord): Coordinate | null {
  if (r?.p3) return { x: r.p3.x, y: r.p3.y ?? 64, z: r.p3.z };
  const coords = Array.isArray(r?.coords3) ? r.coords3 : [];
  if (!coords.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const c of coords) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y ?? 64);
    minZ = Math.min(minZ, c.z);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y ?? 64);
    maxZ = Math.max(maxZ, c.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ) || !Number.isFinite(maxX) || !Number.isFinite(maxZ)) return null;
  return { x: (minX + maxX) / 2, y: Number.isFinite(minY + maxY) ? (minY + maxY) / 2 : 64, z: (minZ + maxZ) / 2 };
}

function getRuleRepresentativeCoord(r: FeatureRecord): Coordinate | null {
  if (r?.p3) return { x: r.p3.x, y: r.p3.y ?? 64, z: r.p3.z };
  const coords = Array.isArray(r?.coords3) ? r.coords3 : [];
  if (!coords.length) return null;

  const bboxCenter = () => getRuleCenterCoord(r);
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
        return {
          x: coords[i - 1].x + (coords[i].x - coords[i - 1].x) * t,
          y: coords[i - 1].y ?? 64,
          z: coords[i - 1].z + (coords[i].z - coords[i - 1].z) * t,
        };
      }
      acc += len;
    }
  }
  return bboxCenter();
}

function getRuleShareId(r: FeatureRecord): string {
  const cls = String(r?.meta?.Class ?? r?.featureInfo?.Class ?? '').trim();
  const picked = pickIdFieldValue(r?.featureInfo, cls);
  return String(r?.meta?.idValue ?? picked.idValue ?? r?.featureInfo?.ID ?? '').trim();
}

function findRuleByShareTarget(pool: FeatureRecord[], target: FeatureShareTarget): FeatureRecord | null {
  const wanted = String(target.featureId ?? '').trim();
  if (!wanted) return null;
  return pool.find((r) => getRuleShareId(r) === wanted) ?? null;
}

function buildNavigationInitialPointFromFeature(feature: FeatureRecord, title: string): NavigationInitialPoint | null {
  const coord = getRuleRepresentativeCoord(feature);
  if (!coord) return null;
  const display = getRuleDisplayName(feature);
  const name = String(title || display.name || display.rawName || getRuleShareId(feature) || '当前要素').trim();
  return {
    id: getRuleShareId(feature),
    name,
    coord,
    extra: '当前要素',
    ruleRecord: feature,
    nonce: Date.now(),
  };
}

function buildNavigationInitialPointFromPlayer(player: Player): NavigationInitialPoint {
  const coord: Coordinate = { x: player.x, y: player.y ?? 64, z: player.z };
  return {
    id: player.account || player.name,
    name: `X:${formatGridNumber(coord.x)}  Z:${formatGridNumber(coord.z)}`,
    coord,
    extra: `玩家：${player.name}`,
    nonce: Date.now(),
  };
}

function MapContainer() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const projectionRef = useRef<DynmapProjection | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const measuringModuleRef = useRef<MeasuringModuleHandle | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const initialShareParseRef = useRef(consumeFeatureShareTargetFromLocation());
  const initialPendingShareRef = useRef<PendingShareTarget | null>(
    initialShareParseRef.current.kind === 'feature'
      ? { type: 'feature', target: initialShareParseRef.current.target }
      : initialShareParseRef.current.kind === 'player'
        ? { type: 'player', target: initialShareParseRef.current.target }
        : null
  );
  const shareTargetConsumedRef = useRef(false);
  const [shareTargetRevision, setShareTargetRevision] = useState(0);
  const [shareLinkMessage, setShareLinkMessage] = useState<string | null>(
    initialShareParseRef.current.kind === 'invalid-player'
      ? '无效世界或玩家ID'
      : initialShareParseRef.current.kind === 'invalid-feature'
        ? '无效世界或要素ID'
        : null
  );
  const [shareLookupState, setShareLookupState] = useState<ShareLookupState | null>(
    initialPendingShareRef.current ? createShareLookupState(initialPendingShareRef.current) : null
  );

  // 从 cookie 读取初始设置；分享链接中的 world 优先，避免先进入 cookie 世界再切换。
  const savedSettings = loadMapSettings();
  const [currentWorld, setCurrentWorld] = useState(initialPendingShareRef.current?.target.worldId ?? savedSettings?.currentWorld ?? 'zth');

  const applyShareParseResult = useCallback((result: ShareParseResult) => {
    if (result.kind === 'none') return;

    if (result.kind === 'invalid-player') {
      initialPendingShareRef.current = null;
      shareTargetConsumedRef.current = true;
      setShareLookupState(null);
      setShareLinkMessage('无效世界或玩家ID');
      return;
    }

    if (result.kind === 'invalid-feature') {
      initialPendingShareRef.current = null;
      shareTargetConsumedRef.current = true;
      setShareLookupState(null);
      setShareLinkMessage('无效世界或要素ID');
      return;
    }

    const pending: PendingShareTarget = result.kind === 'player'
      ? { type: 'player', target: result.target }
      : { type: 'feature', target: result.target };
    initialPendingShareRef.current = pending;
    shareTargetConsumedRef.current = false;
    setShareLinkMessage(null);
    setShareLookupState(createShareLookupState(pending));
    setCurrentWorld(pending.target.worldId);
    setShareTargetRevision((revision) => revision + 1);
  }, []);

  const [showRailway, setShowRailway] = useState(false);
  const [showLandmark, setShowLandmark] = useState(false);
  const [showPlayers, setShowPlayers] = useState(
    PLAYER_FEATURE_ENABLED && (savedSettings?.showPlayers ?? true)
  );
  const [dimBackground, setDimBackground] = useState(savedSettings?.dimBackground ?? false);
  const [mapStyle, setMapStyle] = useState<MapStyle>(savedSettings?.mapStyle ?? 'default');
  const [showNavigation, setShowNavigation] = useState(false);
  const [showAttributeQuery, setShowAttributeQuery] = useState(false);
  const [showLinesPage, setShowLinesPage] = useState(false);
  const [showPlayersPage, setShowPlayersPage] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileActivePanel, setMobileActivePanel] = useState<MobilePanelKey>(null);
  const [mobileQuickPanel, setMobileQuickPanel] = useState<MobileQuickPanelKey>(null);
  const [mobileSheetCollapsed, setMobileSheetCollapsed] = useState(false);
  const [mobileSheetHidden, setMobileSheetHidden] = useState(false);
  const [mobileSheetOffset, setMobileSheetOffset] = useState(0);
  const [selectedRuleFeature, setSelectedRuleFeature] = useState<FeatureRecord | null>(null);
  const [selectedRuleClassCode, setSelectedRuleClassCode] = useState<string | null>(null);
  const [navigationInitialEndPoint, setNavigationInitialEndPoint] = useState<NavigationInitialPoint | null>(null);

  const [mobileFeatureJson, setMobileFeatureJson] = useState<{ title: string; jsonText: string; filename: string } | null>(null);
  const [mobileFeatureShare, setMobileFeatureShare] = useState<FeatureSharePayload | null>(null);
  const [mobileFloorPanelState, setMobileFloorPanelState] = useState<{
    visible: boolean;
    buildingName: string;
    floorOptions: Array<{ label: string; value: string }>;
    activeFloorIndex: number;
  }>({ visible: false, buildingName: '', floorOptions: [], activeFloorIndex: 0 });
  const [mobileFloorCollapsed, setMobileFloorCollapsed] = useState(false);
  const [mobileQuickDockHeight, setMobileQuickDockHeight] = useState(0);
  const suppressRuleFeatureCardOpenRef = useRef(false);
  const ensureRuleWorldLoaded = useRuleDataStore((s) => s.ensureWorldLoaded);
  const currentRuleDataset = useRuleDataStore((s) => s.datasets[currentWorld]);
  const currentRulePending = useRuleDataStore((s) => s.pending[currentWorld]);
  const isGlobalLoading = useLoadingStore((s) => s.isLoading);
  const activeRuleWorldId = useLoadingStore((s) => s.activeRuleWorldId);
  const measuringModuleState = useFeatureModuleStore((s) => s.modules.measuring);
  const legacyModuleState = useFeatureModuleStore((s) => s.modules.legacy);
  const featureDialogState = useFeatureModuleStore((s) => s.dialog);
  const requestFeatureModuleActivation = useFeatureModuleStore((s) => s.requestModuleActivation);
  const measuringModuleLoaded = measuringModuleState.status === 'loaded';
  const legacyModuleLoaded = legacyModuleState.status === 'loaded';
  const [pendingMeasureModuleOpen, setPendingMeasureModuleOpen] = useState<null | 'measuring' | 'mtools'>(null);
  const [pendingLegacyAction, setPendingLegacyAction] = useState<null | 'railway-on' | 'landmark-on' | 'lines-page'>(null);
  const [measuringOpenSignal, setMeasuringOpenSignal] = useState(0);
  const [measurementToolsOpenSignal, setMeasurementToolsOpenSignal] = useState(0);

  const [stations, setStations] = useState<ParsedStation[]>([]);
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [landmarks, setLandmarks] = useState<ParsedLandmark[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerSnapshotReadyWorld, setPlayerSnapshotReadyWorld] = useState<string | null>(null);
  const [routeHighlight, setRouteHighlight] = useState<RouteHighlightData | null>(null);
  const [showRouteHighlight] = useState(true);

// 是否存在可绘制的路线（用于隐藏图层/显示清除按钮）
  const hasRoute =
    routeHighlight?.styledSegments?.some(s => Array.isArray(s.coords) && s.coords.length >= 2) ?? false;
  const showRouteOverlay = hasRoute && showRouteHighlight;

  const [highlightedLine, setHighlightedLine] = useState<ParsedLine | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{
    type: 'station' | 'landmark';
    name: string;
    coord: Coordinate;
    station?: ParsedStation;
    landmark?: ParsedLandmark;
  } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const legacyRailSearchEnabled = legacyModuleLoaded && showRailway;
  const legacyLandmarkSearchEnabled = legacyModuleLoaded && showLandmark;
  const searchStations = legacyRailSearchEnabled ? stations : [];
  const searchLines = legacyRailSearchEnabled ? lines : [];
  const searchLandmarks = legacyLandmarkSearchEnabled ? landmarks : [];
  const [measuringCloseSignal, setMeasuringCloseSignal] = useState(0);
  const [measureToolsCloseSignal, setMeasureToolsCloseSignal] = useState(0);
  const [measuringModuleActive, setMeasuringModuleActive] = useState(false);
  const [measurementToolsActive, setMeasurementToolsActive] = useState(false);

  // 测绘激活态：用于禁止导航图选点（由 MeasuringModule / MeasurementToolsModule 派发）
// 说明：临时挂载启用时，MeasuringModule 可能被迫处于 active，但此时仍允许导航图选点（只要 MeasurementToolsModule 未启用）
const measuringModuleActiveRef = useRef(false);
const measurementToolsActiveRef = useRef(false);

const isTempRuleMountEnabled = useCallback(() => {
  try {
    const raw = localStorage.getItem('ria_temp_rule_sources_v1');
    if (!raw) return false;
    const data = JSON.parse(raw);
    // 兼容：可能是 { enabled: true } 或 { entries: [{enabled:true}, ...] } 或 { layers: {...} }
    if (typeof data?.enabled === 'boolean') return data.enabled;
    if (Array.isArray(data?.entries)) return data.entries.some((e: any) => Boolean(e?.enabled));
    if (Array.isArray(data?.sources)) return data.sources.some((e: any) => Boolean(e?.enabled));
    if (data && typeof data === 'object') {
      // 尝试遍历对象值
      return Object.values(data).some((v: any) => Boolean(v?.enabled));
    }
    return false;
  } catch {
    return false;
  }
}, []);

useEffect(() => {
  if (PLAYER_FEATURE_ENABLED) return;

  setPlayers([]);
  setSelectedPlayer(null);
  setShowPlayers(false);
  setShowPlayersPage(false);
  setMobileActivePanel((prev) => (prev === 'players' ? null : prev));
}, []);

useEffect(() => {
  if (LINES_FEATURE_ENABLED) return;

  setShowLinesPage(false);
  setPendingLegacyAction((prev) => (prev === 'lines-page' ? null : prev));
}, []);

useEffect(() => {
  const handleRuntimeShareUrl = () => {
    applyShareParseResult(consumeFeatureShareTargetFromLocation());
  };

  window.addEventListener('hashchange', handleRuntimeShareUrl);
  window.addEventListener('popstate', handleRuntimeShareUrl);

  return () => {
    window.removeEventListener('hashchange', handleRuntimeShareUrl);
    window.removeEventListener('popstate', handleRuntimeShareUrl);
  };
}, [applyShareParseResult]);

useEffect(() => {
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<{ active?: boolean; source?: string }>;
    const active = Boolean(ce?.detail?.active);
    const source = String(ce?.detail?.source ?? '');
    if (source === 'MeasurementToolsModule') {
      measurementToolsActiveRef.current = active;
      setMeasurementToolsActive(active);
      return;
    }
    if (source === 'MeasuringModule') {
      measuringModuleActiveRef.current = active;
      setMeasuringModuleActive(active);
      return;
    }
    // 兜底：未知来源则视作 MeasuringModule
    measuringModuleActiveRef.current = active;
    setMeasuringModuleActive(active);
  };
  window.addEventListener('ria:measuringActiveChanged', handler as any);
  return () => window.removeEventListener('ria:measuringActiveChanged', handler as any);
}, []);

  useEffect(() => {
    if (!pendingMeasureModuleOpen || !measuringModuleLoaded) return;
    if (pendingMeasureModuleOpen === 'measuring') setMeasuringOpenSignal((v) => v + 1);
    else setMeasurementToolsOpenSignal((v) => v + 1);
    setPendingMeasureModuleOpen(null);
  }, [pendingMeasureModuleOpen, measuringModuleLoaded]);

  useEffect(() => {
    if (!pendingMeasureModuleOpen) return;
    if (featureDialogState.isOpen) return;
    if (measuringModuleLoaded) return;
    if (measuringModuleState.status === 'loading') return;
    setPendingMeasureModuleOpen(null);
  }, [pendingMeasureModuleOpen, featureDialogState.isOpen, measuringModuleLoaded, measuringModuleState.status]);

  const activateLegacyAction = useCallback(async (action: 'railway-on' | 'landmark-on' | 'lines-page') => {
    if (action === 'lines-page' && !LINES_FEATURE_ENABLED) return;
    try {
      await ensureLegacyDataLoaded();
      if (action === 'railway-on') setShowRailway(true);
      else if (action === 'landmark-on') setShowLandmark(true);
      else if (action === 'lines-page' && LINES_FEATURE_ENABLED) setShowLinesPage(true);
    } catch (error) {
      console.warn('[legacy] 旧数据源加载失败：', error);
    } finally {
      setPendingLegacyAction(null);
    }
  }, []);

  useEffect(() => {
    if (!pendingLegacyAction || !legacyModuleLoaded) return;
    void activateLegacyAction(pendingLegacyAction);
  }, [activateLegacyAction, pendingLegacyAction, legacyModuleLoaded]);

  useEffect(() => {
    if (!pendingLegacyAction) return;
    if (featureDialogState.isOpen) return;
    if (legacyModuleLoaded) return;
    if (legacyModuleState.status === 'loading') return;
    setPendingLegacyAction(null);
  }, [pendingLegacyAction, featureDialogState.isOpen, legacyModuleLoaded, legacyModuleState.status]);

  const requestLegacyFeature = useCallback((action: 'railway-on' | 'landmark-on' | 'lines-page') => {
    if (action === 'lines-page' && !LINES_FEATURE_ENABLED) return;
    if (legacyModuleLoaded) {
      void activateLegacyAction(action);
      return;
    }
    setPendingLegacyAction(action);
    requestFeatureModuleActivation('legacy');
  }, [activateLegacyAction, legacyModuleLoaded, requestFeatureModuleActivation]);

  const handleToggleLegacyRailway = useCallback(() => {
    if (showRailway) {
      setShowRailway(false);
      return;
    }
    requestLegacyFeature('railway-on');
  }, [showRailway, requestLegacyFeature]);

  const handleToggleLegacyLandmark = useCallback(() => {
    if (showLandmark) {
      setShowLandmark(false);
      return;
    }
    requestLegacyFeature('landmark-on');
  }, [showLandmark, requestLegacyFeature]);

  const handleOpenLegacyLinesPage = useCallback(() => {
    if (!LINES_FEATURE_ENABLED) return;
    requestLegacyFeature('lines-page');
  }, [requestLegacyFeature]);

  const requestMeasuringModuleEntry = useCallback((target: 'measuring' | 'mtools') => {
    if (measuringModuleLoaded) {
      if (target === 'measuring') setMeasuringOpenSignal((v) => v + 1);
      else setMeasurementToolsOpenSignal((v) => v + 1);
      return;
    }
    setPendingMeasureModuleOpen(target);
    requestFeatureModuleActivation('measuring');
  }, [measuringModuleLoaded, requestFeatureModuleActivation]);


  // 规则图层“分组开关”（按 world 维度持久化）
  const { activeButtonIds: activeRuleButtonIds, toggle: toggleRuleButton } = useRuleButtonState(currentWorld);

  const ruleResolveFeatureByIdRef = useRef<any>(undefined);
  const ruleTriggerLabelClickRef = useRef<any>(undefined);

  const closeMobileSheet = useCallback(() => {
    suppressRuleFeatureCardOpenRef.current = false;
    setMobileActivePanel(null);
    setMobileSheetCollapsed(false);
    setMobileSheetHidden(false);
    setHighlightedLine(null);
    setSelectedPoint(null);
    setSelectedPlayer(null);
    setSelectedRuleFeature(null);
    setSelectedRuleClassCode(null);
    setMobileFeatureJson(null);
    setMobileFeatureShare(null);
    setNavigationInitialEndPoint(null);
    window.dispatchEvent(new CustomEvent('ria:ruleFeatureCardClose'));
  }, []);

  const openMobilePanel = useCallback((panel: MobilePanelKey) => {
    suppressRuleFeatureCardOpenRef.current = false;
    setMobileQuickPanel(null);
    setMobileSheetHidden(false);
    setMobileSheetCollapsed(false);
    setHighlightedLine(null);
    setSelectedPoint(null);
    setSelectedPlayer(null);
    setSelectedRuleFeature(null);
    setSelectedRuleClassCode(null);
    setMobileFeatureJson(null);
    setMobileFeatureShare(null);
    setNavigationInitialEndPoint(null);
    window.dispatchEvent(new CustomEvent('ria:ruleFeatureCardClose'));
    setMobileActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  const toggleMobileSheetCollapsed = useCallback(() => {
    setMobileSheetHidden(false);
    setMobileSheetCollapsed((prev) => !prev);
  }, []);

  const toggleMobileQuickPanel = useCallback((panel: MobileQuickPanelKey) => {
    setMobileQuickPanel((prev) => (prev === panel ? null : panel));
  }, []);

  useEffect(() => {
    const sameFeature = (a: any, b: any) => {
      const auid = String(a?.uid ?? '');
      const buid = String(b?.uid ?? '');
      if (auid || buid) return auid === buid;
      return a === b;
    };

    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<any>).detail ?? {};
      const nextFeature = detail.open ? (detail.feature ?? null) : null;
      ruleResolveFeatureByIdRef.current = detail.resolveFeatureById;
      ruleTriggerLabelClickRef.current = detail.onTryTriggerLabelClickById;

      if (suppressRuleFeatureCardOpenRef.current) {
        if (!detail.open) {
          suppressRuleFeatureCardOpenRef.current = false;
          setSelectedRuleFeature(null);
          setSelectedRuleClassCode(null);
        }
        return;
      }

      setSelectedRuleClassCode(detail.classCode ? String(detail.classCode) : null);
      setSelectedRuleFeature((prev) => {
        const changed = !sameFeature(prev, nextFeature);
        if (detail.open && (changed || !prev)) {
          setMobileQuickPanel(null);
          setMobileSheetHidden(false);
          setMobileSheetCollapsed(false);
          if (mobileActivePanel !== 'featureJson' && mobileActivePanel !== 'featureShare') setMobileActivePanel(null);
        }
        return nextFeature;
      });
    };

    window.addEventListener('ria:ruleFeatureCardState', handler as any);
    return () => window.removeEventListener('ria:ruleFeatureCardState', handler as any);
  }, [mobileActivePanel]);


  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<any>).detail ?? {};
      setMobileFloorPanelState({
        visible: Boolean(detail.visible),
        buildingName: String(detail.buildingName ?? ''),
        floorOptions: Array.isArray(detail.floorOptions) ? detail.floorOptions : [],
        activeFloorIndex: Number.isInteger(detail.activeFloorIndex) ? detail.activeFloorIndex : 0,
      });
    };

    window.addEventListener('ria:mobileFloorPanelState', handler as EventListener);
    return () => window.removeEventListener('ria:mobileFloorPanelState', handler as EventListener);
  }, []);

  const handleMobileFloorSelect = useCallback((index: number) => {
    window.dispatchEvent(new CustomEvent('ria:mobileFloorSelect', { detail: { index } }));
  }, []);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<any>).detail ?? {};
      const feature = detail.feature as FeatureRecord | null | undefined;
      if (!feature) return;

      const point = buildNavigationInitialPointFromFeature(feature, String(detail.title ?? ''));
      setNavigationInitialEndPoint(point);

      const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
      if (isMobile) {
        suppressRuleFeatureCardOpenRef.current = true;
        setMobileQuickPanel(null);
        setMobileFeatureJson(null);
        setMobileFeatureShare(null);
        setSelectedRuleFeature(null);
        setSelectedRuleClassCode(null);
        setMobileActivePanel('navigation');
        setMobileSheetHidden(false);
        setMobileSheetCollapsed(false);
        window.dispatchEvent(new CustomEvent('ria:ruleFeatureCardClose'));
        return;
      }

      setShowNavigation(true);
    };

    window.addEventListener('ria:featureCardNavigate', handler as EventListener);
    return () => window.removeEventListener('ria:featureCardNavigate', handler as EventListener);
  }, []);

  // 关闭"铁路图层"时，同时隐藏线路高亮与详情卡片，避免看起来"图层控制不生效"
  useEffect(() => {
    if (!showRailway) {
      setHighlightedLine(null);
    }
  }, [showRailway]);

  // 控制背景淡化
  useEffect(() => {
    const tilePane = document.querySelector('.leaflet-tile-pane');
    if (tilePane) {
      if (dimBackground) {
        tilePane.classList.add('dimmed');
      } else {
        tilePane.classList.remove('dimmed');
      }
    }
  }, [dimBackground]);

  // 地图风格切换
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;

    // 移除旧瓦片图层
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

// 添加新瓦片图层
let newTileLayer: L.TileLayer;


const tileLayerOptions = {
  minZoom: -3,
  maxZoom: map.getMaxZoom(), // =5
  minNativeZoom: -2,
  maxNativeZoom: 3
};

if (mapStyle === 'sketch') {
  newTileLayer = createSketchTileLayer(currentWorld, 'flat', tileLayerOptions);
} else if (mapStyle === 'watercolor') {
  newTileLayer = createWatercolorTileLayer(currentWorld, 'flat', tileLayerOptions);
} else {
  newTileLayer = createDynmapTileLayer(currentWorld, 'flat', tileLayerOptions);
}


    newTileLayer.addTo(map);
    tileLayerRef.current = newTileLayer;
  }, [mapStyle, mapReady, currentWorld]);

  // 保存地图设置到 cookie
  useEffect(() => {
    saveMapSettings({
      currentWorld,
      showRailway,
      showLandmark,
      showPlayers,
      dimBackground,
      mapStyle,
    });
  }, [currentWorld, showRailway, showLandmark, showPlayers, dimBackground, mapStyle]);

  // Legacy 旧数据源改为按需加载；默认进入页面不再预加载旧 railway / landmark。
  const { getWorldData, isLoaded: dataLoaded } = useDataStore();

  // 切换世界时从缓存加载数据
  useEffect(() => {
    if (!dataLoaded) return;

    const worldData = getWorldData(currentWorld);
    if (worldData) {
      setLines(worldData.lines);
      setStations(worldData.stations);
      setLandmarks(worldData.landmarks);
    }

// 玩家数据由独立轮询 effect 统一维护，避免 PlayerLayer / MapContainer 重复请求。

    // 清除之前的路径
    setRouteHighlight(null);
    setHighlightedLine(null);

  }, [currentWorld, dataLoaded, getWorldData]);

  useEffect(() => {
    if (!PLAYER_FEATURE_ENABLED || !mapReady) return;

    let cancelled = false;
    let intervalId: number | null = null;
    const worldId = currentWorld;

    const loadPlayers = async () => {
      const result = await fetchPlayersDetailed(worldId);
      if (cancelled) return;
      setPlayers(result.players);
      if (result.error) {
        console.warn('[MapContainer] 玩家信息读取失败：', result.error);
      } else {
        setPlayerSnapshotReadyWorld(worldId);
      }
    };

    setPlayers([]);
    setSelectedPlayer(null);
    setPlayerSnapshotReadyWorld(null);
    void loadPlayers();
    intervalId = window.setInterval(() => {
      void loadPlayers();
    }, 5000);

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [currentWorld, mapReady]);

  useEffect(() => {
    setSelectedPlayer((prev) => {
      if (!prev) return prev;
      const latest = players.find((p) => (prev.account && p.account === prev.account) || p.name === prev.name);
      return latest ?? prev;
    });
  }, [players]);

  // Rule 数据：按当前 world 单独加载，使用版本校验缓存。
  useEffect(() => {
    if (!mapReady) return;
    void ensureRuleWorldLoaded(currentWorld).catch((err) => {
      console.warn('[MapContainer] ensureRuleWorldLoaded failed:', err);
    });
  }, [currentWorld, ensureRuleWorldLoaded, mapReady]);

  // 搜索结果选中处理
  // 说明：过去仅用 uid 去重会在“先选 STB/其它要素，再选规则要素”时产生偶发短路。
  // 这里改为 token + 时间窗的方式：仅在极短时间内重复点击同一目标时跳过缩放。
  const lastSearchTokenRef = useRef<string | null>(null);
  const lastSearchAtRef = useRef<number>(0);

  const handleSearchSelect = useCallback((result: SearchResult) => {
    const map = leafletMapRef.current;
    const proj = projectionRef.current;
    if (!map || !proj) return;

    // 防止上一轮 setView/fitBounds 的动画仍在进行导致本次 fitBounds 偶发不生效
    map.stop();

    if (result.type === 'player') {
      lastSearchTokenRef.current = result.type ? `${result.type}:` : null;
      lastSearchAtRef.current = Date.now();
      if (!result.coord) return;

      const player = result.playerData
        ? { ...result.playerData, x: result.coord.x, y: result.coord.y, z: result.coord.z }
        : null;
      if (player) {
        setMobileQuickPanel(null);
        setMobileSheetHidden(false);
        setMobileSheetCollapsed(false);
        setSelectedPlayer(player);
        setSelectedPoint(null);
        setHighlightedLine(null);
        setSelectedRuleFeature(null);
        setSelectedRuleClassCode(null);
      }

      const latLng = proj.locationToLatLng(result.coord.x, result.coord.y, result.coord.z);
      map.setView(latLng, 5);
      return;
    }

    // 旧数据（站点/地标/线路）保持原行为：中心到点位 & zoom=5
    if (result.type !== 'rule') {
      // 切换到非 rule 结果后，允许下一次再次选择同一 rule 时重新聚焦/缩放
      lastSearchTokenRef.current = result.type ? `${result.type}:` : null;
      lastSearchAtRef.current = Date.now();
      if (!result.coord) return;
      const latLng = proj.locationToLatLng(result.coord.x, result.coord.y, result.coord.z);
      map.setView(latLng, 5);
      return;
    }

    // Rules：
    // 1) 若对应图层按钮未开启，先自动开启（避免“搜索到但不显示/不可点”）
    // 2) 聚焦到 bbox 中心，并在需要时缩放到能包裹 bbox 的最小 zoom
    // 3) 发事件交给 RuleDrivenLayer 打开信息卡
    const r = result.ruleRecord;

    // ✅ 避免重复点击同一要素时不断触发视图缩放（会导致“二次放大偏离预期”）
    // - 仅在很短时间内重复点击同一 token 时跳过缩放；否则始终允许重新聚焦
    const uid = String(r?.uid ?? '').trim();
    const token = uid ? `rule:${uid}` : 'rule:';
    const now = Date.now();
    const isSameQuickRepeat = lastSearchTokenRef.current === token && (now - lastSearchAtRef.current) < 600;
    lastSearchTokenRef.current = token;
    lastSearchAtRef.current = now;

    if (r) {
      const needIds = getMatchingRuleButtonIds(r);
      if (needIds.length) {
        for (const id of needIds) {
          if (!activeRuleButtonIds.includes(id)) toggleRuleButton(id);
        }
      }
    }

    if (!isSameQuickRepeat) {
      // bbox 缩放：优先用 record.coords3 计算（线/面）
      // 关键：若有 bbox，则只做 fitBounds（不要先 setView 再 fitBounds），避免动画竞争导致偶发失效
      let didFit = false;
      if (r && Array.isArray(r.coords3) && r.coords3.length > 1) {
        const fallbackY = (result.coord?.y ?? 64) as any;
        const pts = r.coords3
          .map((p: any) => {
            const y = Number.isFinite(p?.y) ? p.y : fallbackY;
            const ll = proj.locationToLatLng(p.x, y, p.z);
            return ll;
          })
          .filter((ll: any) => ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng));

        if (pts.length >= 2) {
          const bounds = L.latLngBounds(pts);
          if ((bounds as any)?.isValid?.() ? (bounds as any).isValid() : true) {
            didFit = true;
            // 终止上一轮动画后，在下一帧执行 fitBounds，提升稳定性
            requestAnimationFrame(() => {
              map.stop();
              map.fitBounds(bounds, { animate: true, padding: [16, 16] });
            });
          }
        }
      }

      // 点要素/无 bbox：回退为 setView
      if (!didFit && result.coord) {
        const latLng = proj.locationToLatLng(result.coord.x, result.coord.y, result.coord.z);
        requestAnimationFrame(() => {
          map.stop();
          map.setView(latLng, 5, { animate: true });
        });
      }
    }

    if (r?.uid) {
      window.dispatchEvent(new CustomEvent('ria:ruleFeatureSelect', { detail: { uid: r.uid } }));
    }
  }, [activeRuleButtonIds, toggleRuleButton]);

  useEffect(() => {
    const pending = initialPendingShareRef.current;
    if (!pending || shareTargetConsumedRef.current) return;
    if (!mapReady || currentWorld !== pending.target.worldId) return;

    const currentRuleWorldReadyForShare = Boolean(currentRuleDataset) && !currentRulePending && !isGlobalLoading && activeRuleWorldId !== currentWorld;
    if (pending.type === 'feature' && !currentRuleWorldReadyForShare) {
      setShareLookupState(createShareLookupState(pending, 'waiting-map-ready', 0, 1));
      return;
    }

    const playerSnapshotReadyForShare = playerSnapshotReadyWorld === pending.target.worldId;
    if (pending.type === 'player' && !playerSnapshotReadyForShare) {
      setShareLookupState(createShareLookupState(pending, 'waiting-player-list', 0, 1));
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    let waitingAttempts = 0;
    let searchAttempts = 0;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const finishShare = () => {
      shareTargetConsumedRef.current = true;
      initialPendingShareRef.current = null;
      setShareLookupState(null);
      clearTimer();
    };

    const finishAsInvalid = (message: string) => {
      if (cancelled || shareTargetConsumedRef.current) return;
      finishShare();
      setShareLinkMessage(message);
      console.warn('[share-link] 未找到分享链接对应的目标：', pending);
    };

    const scheduleNextTry = (fn: () => void) => {
      timer = window.setTimeout(fn, SHARE_LOOKUP_RETRY_MS);
    };

    const tryOpenSharedFeature = () => {
      if (cancelled || shareTargetConsumedRef.current || pending.type !== 'feature') return;
      const target = pending.target;

      const pool = getRuleSearchPool(target.worldId);
      if (pool.length === 0) {
        waitingAttempts += 1;
        setShareLookupState(createShareLookupState(
          pending,
          'waiting-pool',
          waitingAttempts,
          SHARE_LOOKUP_WAIT_POOL_ATTEMPTS,
        ));

        if (waitingAttempts < SHARE_LOOKUP_WAIT_POOL_ATTEMPTS) {
          scheduleNextTry(tryOpenSharedFeature);
          return;
        }

        finishAsInvalid('无效世界或要素ID');
        return;
      }

      searchAttempts += 1;
      setShareLookupState(createShareLookupState(
        pending,
        'searching-feature',
        searchAttempts,
        SHARE_LOOKUP_SEARCH_ATTEMPTS,
      ));

      const record = findRuleByShareTarget(pool, target);
      if (record) {
        const buildingNameIndex = buildBuildingNameIndex(pool);
        const display = getRuleDisplayName(record);
        const result: SearchResult = {
          type: 'rule',
          name: display.name || display.rawName || target.featureId,
          coord: getRuleCenterCoord(record),
          extra: getRuleCategoryLabelWithParent(record, buildingNameIndex),
          ruleRecord: record,
        };
        finishShare();
        handleSearchSelect(result);
        return;
      }

      if (searchAttempts < SHARE_LOOKUP_SEARCH_ATTEMPTS) {
        scheduleNextTry(tryOpenSharedFeature);
        return;
      }

      finishAsInvalid('无效世界或要素ID');
    };

    const tryOpenSharedPlayer = () => {
      if (cancelled || shareTargetConsumedRef.current || pending.type !== 'player') return;
      const target = pending.target;
      const wanted = normalizePlayerShareId(target.playerId);

      searchAttempts += 1;
      setShareLookupState(createShareLookupState(
        pending,
        'searching-player',
        searchAttempts,
        PLAYER_SHARE_LOOKUP_ATTEMPTS,
      ));

      const player = players.find((p) => {
        const account = normalizePlayerShareId(p.account);
        const name = normalizePlayerShareId(p.name);
        return account === wanted || name === wanted;
      }) ?? null;

      if (player) {
        finishShare();
        setShareLinkMessage(null);
        setMobileQuickPanel(null);
        setMobileSheetHidden(false);
        setMobileSheetCollapsed(false);
        setSelectedPlayer(player);
        setSelectedPoint(null);
        setHighlightedLine(null);
        setSelectedRuleFeature(null);
        setSelectedRuleClassCode(null);

        const map = leafletMapRef.current;
        const proj = projectionRef.current;
        if (map && proj) {
          map.stop();
          const latLng = proj.locationToLatLng(player.x, player.y, player.z);
          map.setView(latLng, 5, { animate: true });
        }
        return;
      }

      if (searchAttempts < PLAYER_SHARE_LOOKUP_ATTEMPTS) {
        scheduleNextTry(tryOpenSharedPlayer);
        return;
      }

      finishAsInvalid('无效世界或玩家ID');
    };

    timer = window.setTimeout(
      pending.type === 'player' ? tryOpenSharedPlayer : tryOpenSharedFeature,
      0,
    );

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [
    activeRuleWorldId,
    currentRuleDataset,
    currentRulePending,
    currentWorld,
    handleSearchSelect,
    isGlobalLoading,
    mapReady,
    playerSnapshotReadyWorld,
    players,
    shareTargetRevision,
  ]);


  // 线路选中处理 - 高亮线路并调整视图
  const handleLineSelect = useCallback((line: ParsedLine) => {
    if (!showRailway) setShowRailway(true);
    setMobileQuickPanel(null);
    setMobileSheetHidden(false);
    setMobileSheetCollapsed(false);
    setHighlightedLine(line);
    setRouteHighlight(null);  // 清除路径规划
    setSelectedPoint(null);  // 清除点位选中

    const map = leafletMapRef.current;
    const proj = projectionRef.current;
    if (!map || !proj || line.stations.length === 0) return;

    // 计算线路边界
    const bounds = L.latLngBounds(
      line.stations.map(s => proj.locationToLatLng(s.coord.x, s.coord.y || 64, s.coord.z))
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [showRailway]);

  // 站点点击处理
  const handleStationClick = useCallback((station: ParsedStation) => {
    setMobileQuickPanel(null);
    setMobileSheetHidden(false);
    setMobileSheetCollapsed(false);
    setSelectedPoint({
      type: 'station',
      name: station.name,
      coord: station.coord,
      station,
    });
    setHighlightedLine(null);
    setSelectedPlayer(null);

    const map = leafletMapRef.current;
    const proj = projectionRef.current;
    if (!map || !proj) return;
    const latLng = proj.locationToLatLng(station.coord.x, station.coord.y || 64, station.coord.z);
    map.setView(latLng, 5);
  }, []);

  // 地标点击处理
  const handleLandmarkClick = useCallback((landmark: ParsedLandmark) => {
    if (!landmark.coord) return;
    setMobileQuickPanel(null);
    setMobileSheetHidden(false);
    setMobileSheetCollapsed(false);
    setSelectedPoint({
      type: 'landmark',
      name: landmark.name,
      coord: landmark.coord,
      landmark,
    });
    setHighlightedLine(null);
    setSelectedPlayer(null);

    const map = leafletMapRef.current;
    const proj = projectionRef.current;
    if (!map || !proj) return;
    const latLng = proj.locationToLatLng(landmark.coord.x, landmark.coord.y || 64, landmark.coord.z);
    map.setView(latLng, 5);
  }, []);

  // 玩家点击处理
  const handlePlayerClick = useCallback((player: Player) => {
    setMobileQuickPanel(null);
    setMobileSheetHidden(false);
    setMobileSheetCollapsed(false);
    setSelectedPlayer(player);
    setSelectedPoint(null);
    setHighlightedLine(null);

    const map = leafletMapRef.current;
    const proj = projectionRef.current;
    if (!map || !proj) return;
    const latLng = proj.locationToLatLng(player.x, player.y, player.z);
    map.setView(latLng, 5);
  }, []);

  // 计算附近点位
  const getNearbyPoints = useCallback((coord: Coordinate, radius: number = 500) => {
    const getDistance = (a: Coordinate, b: Coordinate) => {
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      return Math.sqrt(dx * dx + dz * dz);
    };

    const nearbyStations = stations
      .filter(s => getDistance(coord, s.coord) <= radius && getDistance(coord, s.coord) > 0)
      .sort((a, b) => getDistance(coord, a.coord) - getDistance(coord, b.coord))
      .slice(0, 5);

    const nearbyLandmarks = landmarks
      .filter(l => l.coord && getDistance(coord, l.coord) <= radius && getDistance(coord, l.coord) > 0)
      .sort((a, b) => getDistance(coord, a.coord!) - getDistance(coord, b.coord!))
      .slice(0, 5);

    return { nearbyStations, nearbyLandmarks };
  }, [stations, landmarks]);

  // 导航路径找到时的处理
const handleRouteFound = useCallback((route: RouteHighlightData | Array<{ coord: Coordinate }>) => {
  setHighlightedLine(null); // 清除线路高亮

  // 统一归一化为 RouteHighlightData
  let rh: RouteHighlightData | null = null;

  if (Array.isArray(route)) {
    const coords = route.map(p => p.coord).filter(Boolean);
    rh = coords.length >= 2 ? { styledSegments: [{ kind: 'generic', coords }] } : null;
  } else {
    rh = route;
  }

  setRouteHighlight(rh);

  // 计算边界并调整视图
  const map = leafletMapRef.current;
  const proj = projectionRef.current;
  if (!map || !proj || !rh?.styledSegments?.length) return;

  const allCoords: Coordinate[] = [];
  for (const seg of rh.styledSegments) {
    if (!Array.isArray(seg.coords)) continue;
    for (const c of seg.coords) allCoords.push(c);
  }
  if (allCoords.length === 0) return;

  const bounds = L.latLngBounds(
    allCoords.map(c => proj.locationToLatLng(c.x, c.y || 64, c.z))
  );
  map.fitBounds(bounds, { padding: [50, 50] });
}, []);


  // 世界切换处理
  const handleWorldChange = useCallback((worldId: string) => {
    // 世界切换前默认触发“关闭测绘”。若用户不确认，则禁止切换。
    // 注意：必须在 setCurrentWorld 之前执行，否则会导致临时挂载/图层归属混乱。
    const ok = measuringModuleRef.current?.requestCloseAndClear?.('切换世界') ?? true;
    if (!ok) return;

    // 同步关闭“测量工具”（不需要二次确认）
    setMeasureToolsCloseSignal(v => v + 1);

    setCurrentWorld(worldId);

    // 更新瓦片图层
    const map = leafletMapRef.current;
    const proj = projectionRef.current;
    if (!map || !proj) return;

    // 移除旧瓦片图层
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    // 添加新瓦片图层（根据当前风格选择）
    let newTileLayer: L.TileLayer;
const tileLayerOptions = {
  minZoom: -3,
  maxZoom: map.getMaxZoom(), // =5
  minNativeZoom: -2,
  maxNativeZoom: 3
};

if (mapStyle === 'sketch') {
  newTileLayer = createSketchTileLayer(worldId, 'flat', tileLayerOptions);
} else if (mapStyle === 'watercolor') {
  newTileLayer = createWatercolorTileLayer(worldId, 'flat', tileLayerOptions);
} else {
  newTileLayer = createDynmapTileLayer(worldId, 'flat', tileLayerOptions);
}


    newTileLayer.addTo(map);
    tileLayerRef.current = newTileLayer;

    // 移动到新世界的中心点
    const world = WORLDS.find(w => w.id === worldId);
    if (world) {
      const centerLatLng = proj.locationToLatLng(
        world.center.x,
        world.center.y,
        world.center.z
      );
      map.setView(centerLatLng, 2);
    }
  }, [mapStyle]);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    // 从 cookie 读取初始世界设置
    const savedWorld = initialPendingShareRef.current?.target.worldId ?? loadMapSettings()?.currentWorld ?? 'zth';

    // 创建 Dynmap CRS
    const crs = createDynmapCRS(ZTH_FLAT_CONFIG);
    const projection = (crs as any).dynmapProjection as DynmapProjection;
    projectionRef.current = projection;

    // 计算初始中心点 - 使用保存的世界，否则退回零洲
    const world = WORLDS.find(w => w.id === savedWorld) ?? WORLDS.find(w => w.id === 'zth') ?? WORLDS[0];
    if (!world) return;

    const centerLatLng = projection.locationToLatLng(
      Number(world.center.x),
      Number(world.center.y),
      Number(world.center.z)
    );

const minZoom = -3;                 // 9级：-3..5
const maxZoom = projection.maxZoom; // 仍然是 5

const map = L.map(mapRef.current, {
  crs: crs,
  center: centerLatLng,
  zoom: 2,
  minZoom,
  maxZoom,

  // 明确锁定“整数缩放”
  zoomSnap: 1,
  zoomDelta: 1,

  zoomControl: false,
  attributionControl: true
});





    // 添加缩放控件 - 仅桌面端使用 Leaflet 默认控件；移动端改为右侧自定义按钮
    const isDesktop = window.innerWidth >= 640;
    if (isDesktop) {
      L.control.zoom({ position: 'bottomright' }).addTo(map);
    }

    // 添加 Dynmap 瓦片图层 - 使用保存的世界和风格
    const savedMapStyle = loadMapSettings()?.mapStyle ?? 'default';
const tileLayerOptions = {
  minZoom: -3,
  maxZoom: projection.maxZoom, // 5
  minNativeZoom: -2,           // 允许请求 zzzz/zzzzz（zoom<0 时仍命中真实瓦片）
  maxNativeZoom: 3             // 保持你现有 Dynmap 行为
};

let tileLayer: L.TileLayer;
if (savedMapStyle === 'sketch') {
  tileLayer = createSketchTileLayer(savedWorld, 'flat', tileLayerOptions);
} else if (savedMapStyle === 'watercolor') {
  tileLayer = createWatercolorTileLayer(savedWorld, 'flat', tileLayerOptions);
} else {
  tileLayer = createDynmapTileLayer(savedWorld, 'flat', tileLayerOptions);
}


    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    // 开发期：输出缩放/中心点对应的瓦片 URL，便于定位“缩放偏移”类问题
    if (import.meta.env.DEV) {
      const logTileDebug = () => {
        const layer = tileLayerRef.current as unknown as DynmapTileLayer | null;
        const proj = projectionRef.current;
        if (!layer || !proj || typeof (layer as any).getDynmapTileForLatLng !== 'function') return;
        const center = map.getCenter();
        const zoom = map.getZoom();
        const tile = (layer as any).getDynmapTileForLatLng(center, zoom);
        const mc = proj.latLngToLocation(center, 64);
        console.log('[tile-debug]', { zoom, tileZoom: tile.tileZoom, center, mc, tile: tile.info, url: tile.url });
      };
      map.on('zoomend moveend', logTileDebug);
      logTileDebug();
    }

    // 添加坐标显示控件
    const coordControl = new L.Control({ position: 'bottomleft' });
    coordControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'coord-display');
      div.style.cssText = 'background: rgba(255,255,255,0.9); padding: 5px 10px; border-radius: 4px; font-family: monospace; font-size: 12px;';
      div.innerHTML = 'X: 0, Z: 0';
      return div;
    };
    coordControl.addTo(map);

    // 监听鼠标移动，更新坐标显示
const coordDiv = coordControl.getContainer?.() ?? document.querySelector('.coord-display');
let rafId: number | null = null;
let latestCoord: { x: number; z: number } | null = null;

const flushCoord = () => {
  if (!coordDiv || !latestCoord) return;
  coordDiv.innerHTML = `X: ${formatGridNumber(latestCoord.x)}, Z: ${formatGridNumber(latestCoord.z)}`;
  rafId = null;
};

    // 导航“图上选取”使用：由 MapContainer 统一派发地图点击事件
    // 注意：只派发世界坐标；具体吸附/写入由 NavigationPanel 处理
    map.on('click', (e: L.LeafletMouseEvent) => {
      try {
        // 禁用条件：测量工具启用时永远禁止；测绘(快捷/完整)启用时，若临时挂载未启用则禁止
        if (measurementToolsActiveRef.current) return;
        if (measuringModuleActiveRef.current && !isTempRuleMountEnabled()) return;
        const proj = projectionRef.current;
        if (!proj) return;
        const p = proj.latLngToLocation(e.latlng, 64);
        window.dispatchEvent(
          new CustomEvent<MapClickWorldPointEventDetail>('ria:mapClickWorldPoint', {
            detail: {
              worldId: currentWorld,
              point: { x: p.x, y: p.y, z: p.z },
            },
          })
        );
      } catch (err) {
        console.warn('[mapClickWorldPoint] dispatch failed', err);
      }
    });

const handleMouseMove = (e: L.LeafletMouseEvent) => {
  const proj = projectionRef.current;
  if (!proj) return;

  const worldCoord = proj.latLngToLocation(e.latlng, 64);

  // 与测绘控件保持一致：坐标显示也遵循“方块中心(.5)/方块边缘(.0)/自动(.5步进)”
  const snapped = snapWorldPointByMode({ x: worldCoord.x, z: worldCoord.z });
  latestCoord = snapped;

  if (rafId === null) {
    rafId = window.requestAnimationFrame(flushCoord);
  }
};

map.on('mousemove', handleMouseMove);


    leafletMapRef.current = map;
    setMapReady(true);

    // 清理函数
    return () => {
      map.off('mousemove', handleMouseMove);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  const mobileSheetTitle = highlightedLine
    ? '线路详情'
    : selectedPoint
      ? '点位详情'
      : selectedPlayer
        ? '玩家详情'
        : selectedRuleFeature
          ? '要素信息'
          : mobileActivePanel === 'navigation'
            ? '路径规划'
            : mobileActivePanel === 'attributeQuery'
              ? '按属性查询'
              : mobileActivePanel === 'players'
                ? '在线玩家'
                : mobileActivePanel === 'about'
                  ? '关于'
                  : mobileActivePanel === 'settings'
                    ? '设置'
                    : mobileActivePanel === 'featureJson'
                      ? 'JSON 详情'
                      : mobileActivePanel === 'featureShare'
                        ? '分享要素'
                        : '';

  const shouldShowMobileSheet = Boolean(highlightedLine || selectedPoint || selectedPlayer || selectedRuleFeature || mobileActivePanel);

  const renderMobileSheetContent = () => {
    if (highlightedLine) {
      return (
        <Suspense fallback={null}>
          <LazyLineDetailCard
            line={highlightedLine}
            onClose={() => setHighlightedLine(null)}
            onStationClick={(_name: string, coord: Coordinate) => {
              const map = leafletMapRef.current;
              const proj = projectionRef.current;
              if (!map || !proj) return;
              const latLng = proj.locationToLatLng(coord.x, coord.y || 64, coord.z);
              map.setView(latLng, 5);
            }}
          />
        </Suspense>
      );
    }

    if (selectedPoint) {
      const { nearbyStations, nearbyLandmarks } = getNearbyPoints(selectedPoint.coord);
      return (
        <Suspense fallback={null}>
          <LazyPointDetailCard
            selectedPoint={selectedPoint}
            nearbyStations={nearbyStations}
            nearbyLandmarks={nearbyLandmarks}
            lines={lines}
            onClose={() => setSelectedPoint(null)}
            onStationClick={handleStationClick}
            onLandmarkClick={handleLandmarkClick}
            onLineClick={(line: ParsedLine) => {
              setSelectedPoint(null);
              handleLineSelect(line);
            }}
          />
        </Suspense>
      );
    }

    if (selectedPlayer) {
      return (
        <PlayerDetailCard
          player={selectedPlayer}
          worldId={currentWorld}
          onClose={() => setSelectedPlayer(null)}
          onNavigate={(player) => {
            setNavigationInitialEndPoint(buildNavigationInitialPointFromPlayer(player));
            setSelectedPlayer(null);
            setMobileActivePanel('navigation');
            setMobileSheetHidden(false);
            setMobileSheetCollapsed(false);
          }}
        />
      );
    }

    if (mobileActivePanel === 'featureJson') {
      return mobileFeatureJson ? (
        <MobileFeatureJsonPanel
          title={mobileFeatureJson.title}
          jsonText={mobileFeatureJson.jsonText}
          filename={mobileFeatureJson.filename}
        />
      ) : null;
    }

    if (mobileActivePanel === 'featureShare') {
      return mobileFeatureShare ? <MobileFeatureSharePanel payload={mobileFeatureShare} /> : null;
    }

    if (selectedRuleFeature) {
      const Card = resolveFeatureCardComponent(selectedRuleClassCode);
      return (
        <Card
          open
          feature={selectedRuleFeature}
          onClose={closeMobileSheet}
          resolveFeatureById={ruleResolveFeatureByIdRef.current}
          onTryTriggerLabelClickById={ruleTriggerLabelClickRef.current}
          variant="embedded"
          onOpenJsonPanel={(payload) => {
            suppressRuleFeatureCardOpenRef.current = true;
            setMobileFeatureJson(payload);
            setMobileFeatureShare(null);
            setMobileActivePanel('featureJson');
            setMobileSheetHidden(false);
            setMobileSheetCollapsed(false);
            setSelectedRuleFeature(null);
            setSelectedRuleClassCode(null);
            window.dispatchEvent(new CustomEvent('ria:ruleFeatureCardClose'));
          }}
          onOpenSharePanel={(payload) => {
            suppressRuleFeatureCardOpenRef.current = true;
            setMobileFeatureShare(payload);
            setMobileFeatureJson(null);
            setMobileActivePanel('featureShare');
            setMobileSheetHidden(false);
            setMobileSheetCollapsed(false);
            setSelectedRuleFeature(null);
            setSelectedRuleClassCode(null);
            window.dispatchEvent(new CustomEvent('ria:ruleFeatureCardClose'));
          }}
        />
      );
    }

    switch (mobileActivePanel) {
      case 'about':
        return <AboutCard onClose={closeMobileSheet} />;
      case 'settings':
        return <SettingsPanel onClose={closeMobileSheet} />;
      case 'navigation':
        return (
          <NavigationPanel
            stations={stations}
            lines={lines}
            landmarks={landmarks}
            players={PLAYER_FEATURE_ENABLED ? players : []}
            worldId={currentWorld}
            onRouteFound={handleRouteFound}
            onClose={closeMobileSheet}
            initialEndPoint={navigationInitialEndPoint}
            onPointClick={(coord) => {
              const map = leafletMapRef.current;
              const proj = projectionRef.current;
              if (!map || !proj) return;
              const latLng = proj.locationToLatLng(coord.x, coord.y || 64, coord.z);
              map.setView(latLng, 5);
            }}
          />
        );
      case 'attributeQuery':
        return (
          <AttributeQueryPanel
            worldId={currentWorld}
            onSelect={(r) => {
              handleSearchSelect(r);
            }}
            onClose={closeMobileSheet}
          />
        );
case 'players':
  if (!PLAYER_FEATURE_ENABLED) return null;
  return (
    <PlayersList
      worldId={currentWorld}
      onClose={closeMobileSheet}
      onPlayerSelect={(player) => {
        closeMobileSheet();
        handlePlayerClick(player);
      }}
      onNavigateToPlayer={(player) => {
        setNavigationInitialEndPoint(buildNavigationInitialPointFromPlayer(player));
        setMobileActivePanel('navigation');
        setMobileSheetHidden(false);
        setMobileSheetCollapsed(false);
      }}
    />
  );
      default:
        return null;
    }
  };

  return (
    <div
      className="relative w-full h-full"
      style={{ ['--ria-mobile-bottom-offset' as any]: `${mobileSheetOffset}px` }}
    >
      {/* 地图容器 */}
      <div ref={mapRef} className="w-full h-full" />

      {shareLookupState && (
        <div className="absolute top-4 left-1/2 z-[2400] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
          <AppCard className="bg-white/95 border border-blue-100 shadow-xl">
            <div className="px-4 py-3 text-sm text-gray-800">
              <div className="font-semibold text-blue-700">{shareLookupState.pending.type === 'player' ? '正在打开玩家分享链接' : '正在打开分享链接'}</div>
              <div className="mt-1 text-xs text-gray-600">{getShareLookupText(shareLookupState)}</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${getShareLookupProgress(shareLookupState)}%` }}
                />
              </div>
            </div>
          </AppCard>
        </div>
      )}

      {shareLinkMessage && (
        <div className="absolute top-4 left-1/2 z-[2500] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
          <AppCard className="bg-white/95 border border-amber-200 shadow-xl">
            <div className="px-4 py-3 text-sm text-gray-800">
              <div className="font-semibold text-amber-700">分享链接无法打开</div>
              <div className="mt-1">{shareLinkMessage}</div>
              <div className="mt-3 flex justify-end">
                <AppButton
                  onClick={() => setShareLinkMessage(null)}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                >
                  知道了
                </AppButton>
              </div>
            </div>
          </AppCard>
        </div>
      )}

      {/* 规则驱动图层（总开关控制，worldId 切换自动重载） */}
      {mapReady && leafletMapRef.current && projectionRef.current && (
        <RuleDrivenLayer
          mapReady={mapReady}
          map={leafletMapRef.current}
          projection={projectionRef.current}
          worldId={currentWorld}
          visible={true}
          activeButtonIds={activeRuleButtonIds}
        />
      )}


      {/* 铁路图层 - 有路径规划结果时隐藏 */}
      {legacyModuleLoaded && mapReady && leafletMapRef.current && projectionRef.current && (
        <Suspense fallback={null}>
          <LazyRailwayLayer
            map={leafletMapRef.current}
            projection={projectionRef.current}
            worldId={currentWorld}
            visible={showRailway && !showRouteOverlay}
            mapStyle={mapStyle}
            onStationClick={handleStationClick}
          />
        </Suspense>
      )}

      {/* 地标图层 - 有路径规划结果时隐藏 */}
      {legacyModuleLoaded && mapReady && leafletMapRef.current && projectionRef.current && (
        <Suspense fallback={null}>
          <LazyLandmarkLayer
            map={leafletMapRef.current}
            projection={projectionRef.current}
            worldId={currentWorld}
            visible={showLandmark && !showRouteOverlay}
            onLandmarkClick={handleLandmarkClick}
          />
        </Suspense>
      )}

{/* 玩家图层（临时关闭） */}
{PLAYER_FEATURE_ENABLED && mapReady && leafletMapRef.current && projectionRef.current && (
  <PlayerLayer
    map={leafletMapRef.current}
    projection={projectionRef.current}
    worldId={currentWorld}
    visible={showPlayers}
    players={players}
    onPlayerClick={handlePlayerClick}
  />
)}

      {/* 顶部区域：桌面端恢复原始布局；移动端仅保留搜索框与关于快捷按钮 */}
      <div className="hidden sm:flex absolute top-4 left-4 right-auto z-[1000] flex-col gap-2 sm:max-w-[300px]">
        <AppCard className="bg-white/90 px-3 py-2 sm:px-4">
          <h1 className="text-base sm:text-lg font-bold text-gray-800">RIA 在线地图</h1>
          <WorldSwitcher
            frameless
            worlds={WORLDS}
            currentWorld={currentWorld}
            onWorldChange={handleWorldChange}
          />
        </AppCard>

        <SearchBar
          variant="desktop"
          stations={searchStations}
          landmarks={searchLandmarks}
          lines={searchLines}
          players={PLAYER_FEATURE_ENABLED ? players : []}
          worldId={currentWorld}
          onSelect={handleSearchSelect}
          onLineSelect={handleLineSelect}
        />

        <Toolbar
          onNavigationClick={() => { setNavigationInitialEndPoint(null); setShowNavigation(true); }}
          onAttributeQueryClick={() => { setShowAttributeQuery(true); }}
          onLinesClick={handleOpenLegacyLinesPage}
          onPlayersClick={() => { setShowPlayersPage(true); }}
          onHelpClick={() => { setShowAbout(true); }}
          onSettingsClick={() => { setShowSettings(true); }}
        />

        {hasRoute && (
          <AppButton
            onClick={() => setRouteHighlight(null)}
            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 w-fit text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>清除路径</span>
          </AppButton>
        )}
      </div>

      <div className="sm:hidden absolute top-2 left-2 right-2 z-[1003]">
        <SearchBar
          variant="mobile"
          mobile
          stations={searchStations}
          landmarks={searchLandmarks}
          lines={searchLines}
          players={PLAYER_FEATURE_ENABLED ? players : []}
          worldId={currentWorld}
          onSelect={handleSearchSelect}
          onLineSelect={handleLineSelect}
          onAboutClick={() => openMobilePanel('about')}
        />
      </div>

      <div className="sm:hidden absolute right-2 top-[40%] -translate-y-1/2 z-[1001]">
        <MobileQuickDock
          activeKey={mobileQuickPanel}
          onToggle={(key) => toggleMobileQuickPanel(key as MobileQuickPanelKey)}
          items={[
            { key: 'worlds', label: '世界切换', icon: <Globe2 className="w-5 h-5" />, activeClassName: 'bg-rose-100 text-rose-700' },
            { key: 'toolbar', label: '工具栏', icon: <PanelsTopLeft className="w-5 h-5" />, activeClassName: 'bg-violet-100 text-violet-700' },
            { key: 'ruleButtons', label: '图层切换按钮', icon: <Layers3 className="w-5 h-5" />, activeClassName: 'bg-emerald-100 text-emerald-700' },
            { key: 'modeTools', label: '模式工具', icon: <SlidersHorizontal className="w-5 h-5" />, activeClassName: 'bg-sky-100 text-sky-700' },
          ]}
          directionMap={{ worlds: 'down', toolbar: 'down', ruleButtons: shouldShowMobileSheet ? 'up' : 'down', modeTools: shouldShowMobileSheet ? 'up' : 'down' }}
          renderPanel={(key) => {
            if (key === 'worlds') {
              return (
                <WorldSwitcher
                  frameless
                  mobile
                  worlds={WORLDS}
                  currentWorld={currentWorld}
                  onWorldChange={(worldId) => {
                    handleWorldChange(worldId);
                    setMobileQuickPanel(null);
                  }}
                />
              );
            }
            if (key === 'toolbar') {
              return (
                <Toolbar
                  frameless
                  mobile
                  onNavigationClick={() => openMobilePanel('navigation')}
                  onAttributeQueryClick={() => openMobilePanel('attributeQuery')}
                  onLinesClick={() => {
                    setMobileQuickPanel(null);
                    handleOpenLegacyLinesPage();
                  }}
                  onPlayersClick={() => openMobilePanel('players')}
                  onHelpClick={() => openMobilePanel('about')}
                  onSettingsClick={() => openMobilePanel('settings')}
                />
              );
            }
            if (key === 'ruleButtons') {
              return (
                <RuleButtonPanel
                  frameless
                  mode="mobile"
                  activeButtonIds={activeRuleButtonIds}
                  onToggle={toggleRuleButton}
                />
              );
            }
            return (
              <LayerControl
                frameless
                mobile
                showRailway={showRailway}
                showLandmark={showLandmark}
                showPlayers={showPlayers}
                dimBackground={dimBackground}
                mapStyle={mapStyle}
                onToggleRailway={handleToggleLegacyRailway}
                onToggleLandmark={handleToggleLegacyLandmark}
                onTogglePlayers={setShowPlayers}
                onToggleDimBackground={setDimBackground}
                onToggleMapStyle={setMapStyle}
              />
            );
          }}
          onDockHeightChange={setMobileQuickDockHeight}
          zoomControls={(
            <AppCard className="bg-white/92 p-1 flex flex-col gap-1 shadow-xl w-11 items-center">
              <AppButton
                onClick={() => leafletMapRef.current?.zoomIn()}
                className="h-9 w-9 text-gray-700 active:bg-gray-100"
                title="放大"
              >
                <Plus className="w-5 h-5" />
              </AppButton>
              <AppButton
                onClick={() => leafletMapRef.current?.zoomOut()}
                className="h-9 w-9 text-gray-700 active:bg-gray-100"
                title="缩小"
              >
                <Minus className="w-5 h-5" />
              </AppButton>
            </AppCard>
          )}
        />
      </div>

      <div
        className="sm:hidden absolute right-2 top-[40%] -translate-y-1/2 z-[1001] pointer-events-none"
        style={{ marginTop: `${mobileQuickDockHeight + 8}px` }}
      >
        <div className="pointer-events-auto">
          <MobileFloorPanel
            visible={Boolean(mobileFloorPanelState.visible && mobileFloorPanelState.floorOptions.length > 0)}
            collapsed={mobileFloorCollapsed}
            buildingName={mobileFloorPanelState.buildingName}
            floorOptions={mobileFloorPanelState.floorOptions}
            activeFloorIndex={mobileFloorPanelState.activeFloorIndex}
            onSelectFloor={handleMobileFloorSelect}
            onToggleCollapsed={() => setMobileFloorCollapsed((prev) => !prev)}
          />
        </div>
      </div>

      {/* 桌面端：可拖拽浮动面板 */}
      {/* 关于卡片 */}
      {showAbout && (
        <div className="hidden sm:block">
        <DraggablePanel
          id="about"
          defaultPosition={{ x: 16, y: 240 }}
        >
          <AboutCard onClose={() => setShowAbout(false)} />
        </DraggablePanel>
        </div>
      )}

      {/* 设置面板 */}
      {showSettings && (
        <div className="hidden sm:block">
        <DraggablePanel
          id="settings"
          defaultPosition={{ x: 16, y: 240 }}
        >
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </DraggablePanel>
        </div>
      )}

      {/* 路径规划面板 */}
      {showNavigation && (
        <div className="hidden sm:block">
        <DraggablePanel
          id="navigation"
          defaultPosition={{ x: 16, y: 240 }}
        >
          <NavigationPanel
            stations={stations}
            lines={lines}
            landmarks={landmarks}
            players={PLAYER_FEATURE_ENABLED ? players : []}
            worldId={currentWorld}
            onRouteFound={handleRouteFound}
            onClose={() => { setShowNavigation(false); setNavigationInitialEndPoint(null); }}
            initialEndPoint={navigationInitialEndPoint}
            onPointClick={(coord) => {
              const map = leafletMapRef.current;
              const proj = projectionRef.current;
              if (!map || !proj) return;
              const latLng = proj.locationToLatLng(coord.x, coord.y || 64, coord.z);
              map.setView(latLng, 5);
            }}
          />
        </DraggablePanel>
        </div>
      )}

      {/* 按属性查询面板 */}
      {showAttributeQuery && (
        <div className="hidden sm:block">
        <DraggablePanel
          id="attributeQuery"
          defaultPosition={{ x: 16, y: 240 }}
        >
          <AttributeQueryPanel
            worldId={currentWorld}
            onSelect={(r) => {
              handleSearchSelect(r);
            }}
            onClose={() => setShowAttributeQuery(false)}
          />
        </DraggablePanel>
        </div>
      )}

      {/* 玩家列表面板 */}
      {PLAYER_FEATURE_ENABLED && showPlayersPage && (
        <div className="hidden sm:block">
        <DraggablePanel
          id="players"
          defaultPosition={{ x: 16, y: 240 }}
        >
          <PlayersList
            worldId={currentWorld}
            onClose={() => setShowPlayersPage(false)}
            onPlayerSelect={(player) => {
              handlePlayerClick(player);
            }}
            onNavigateToPlayer={(player) => {
              setNavigationInitialEndPoint(buildNavigationInitialPointFromPlayer(player));
              setShowNavigation(true);
            }}
          />
        </DraggablePanel>
        </div>
      )}

      {/* 线路详情卡片 */}
      {legacyModuleLoaded && highlightedLine && (
        <div className="hidden sm:block">
        <DraggablePanel
          id="lineDetail"
          defaultPosition={{ x: 340, y: 16 }}
        >
          <Suspense fallback={null}>
          <LazyLineDetailCard
            line={highlightedLine}
            onClose={() => setHighlightedLine(null)}
            onStationClick={(_name: string, coord: Coordinate) => {
              const map = leafletMapRef.current;
              const proj = projectionRef.current;
              if (!map || !proj) return;
              const latLng = proj.locationToLatLng(coord.x, coord.y || 64, coord.z);
              map.setView(latLng, 5);
            }}
          />
          </Suspense>
        </DraggablePanel>
        </div>
      )}

      {/* 点位详情卡片 */}
      {legacyModuleLoaded && selectedPoint && (() => {
        const { nearbyStations, nearbyLandmarks } = getNearbyPoints(selectedPoint.coord);
        return (
          <div className="hidden sm:block">
          <DraggablePanel
            id="pointDetail"
            defaultPosition={{ x: 340, y: 16 }}
              >
            <Suspense fallback={null}>
            <LazyPointDetailCard
              selectedPoint={selectedPoint}
              nearbyStations={nearbyStations}
              nearbyLandmarks={nearbyLandmarks}
              lines={lines}
              onClose={() => setSelectedPoint(null)}
              onStationClick={handleStationClick}
              onLandmarkClick={handleLandmarkClick}
              onLineClick={(line) => {
                setSelectedPoint(null);
                handleLineSelect(line);
              }}
            />
            </Suspense>
          </DraggablePanel>
          </div>
        );
      })()}

      {/* 玩家详情卡片 */}
      {selectedPlayer && (
        <div className="hidden sm:block">
        <DraggablePanel
          id="playerDetail"
          defaultPosition={{ x: 340, y: 16 }}
          windowControlTone="light"
          expandedControlLayout="playerCardGrid"
          minimizedTitleNode={(
            <span className="flex min-w-0 items-center gap-2">
              <User className="h-4 w-4 flex-none text-cyan-600" />
              <span className="truncate">{selectedPlayer.name}</span>
            </span>
          )}
        >
          <PlayerDetailCard
            player={selectedPlayer}
            worldId={currentWorld}
            desktopWindowMode
            onClose={() => setSelectedPlayer(null)}
            onNavigate={(player) => {
              setNavigationInitialEndPoint(buildNavigationInitialPointFromPlayer(player));
              setShowNavigation(true);
            }}
          />
        </DraggablePanel>
        </div>
      )}

      {/* 桌面端：右上角图层控制 */}
      <div className="hidden sm:block absolute top-4 right-4 z-[1000]">
        <div className="flex items-start gap-2">
          <RuleButtonPanel
            activeButtonIds={activeRuleButtonIds}
            onToggle={toggleRuleButton}
          />

          <LayerControl
            showRailway={showRailway}
            showLandmark={showLandmark}
            showPlayers={showPlayers}
            dimBackground={dimBackground}
            mapStyle={mapStyle}
            onToggleRailway={handleToggleLegacyRailway}
            onToggleLandmark={handleToggleLegacyLandmark}
            onTogglePlayers={setShowPlayers}
            onToggleDimBackground={setDimBackground}
            onToggleMapStyle={setMapStyle}
          >
          {measuringModuleLoaded ? (
            <Suspense fallback={null}>
              <LazyMeasurementToolsModule
                mapReady={mapReady}
                leafletMapRef={leafletMapRef}
                projectionRef={projectionRef}
                closeSignal={measureToolsCloseSignal}
                openSignal={measurementToolsOpenSignal}
                onBecameActive={() => setMeasuringCloseSignal(v => v + 1)}
                launcherSlot={(launcher) => <div className="hidden sm:block">{launcher}</div>}
              />
              <LazyMeasuringModule
                ref={measuringModuleRef}
                mapReady={mapReady}
                leafletMapRef={leafletMapRef}
                projectionRef={projectionRef}
                currentWorldId={currentWorld}
                closeSignal={measuringCloseSignal}
                openSignal={measuringOpenSignal}
                onBecameActive={() => setMeasureToolsCloseSignal(v => v + 1)}
                launcherSlot={(launcher) => <div className="hidden sm:block">{launcher}</div>}
              />
            </Suspense>
          ) : (
            <>
              <div className="hidden sm:block">
                <ToolIconButton
                  label="测量工具"
                  icon={<Ruler className="w-5 h-5" />}
                  active={measurementToolsActive}
                  tone="blue"
                  onClick={() => requestMeasuringModuleEntry('mtools')}
                />
              </div>
              <div className="hidden sm:block">
                <ToolIconButton
                  label="测绘"
                  icon={<Pencil className="w-5 h-5" />}
                  active={measuringModuleActive}
                  tone="blue"
                  onClick={() => requestMeasuringModuleEntry('measuring')}
                  className="h-11 w-11"
                />
              </div>
            </>
          )}
          </LayerControl>
        </div>
      </div>

      <MobileBottomSheet
        open={shouldShowMobileSheet}
        hidden={mobileSheetHidden}
        collapsed={mobileSheetCollapsed}
        title={mobileSheetTitle}
        onClose={closeMobileSheet}
        onToggleCollapsed={() => {
          if (mobileSheetHidden) {
            setMobileSheetHidden(false);
            setMobileSheetCollapsed(false);
            return;
          }
          toggleMobileSheetCollapsed();
        }}
        onOffsetChange={setMobileSheetOffset}
      >
        {renderMobileSheetContent()}
      </MobileBottomSheet>

      {/* 路径高亮图层 */}
{mapReady && leafletMapRef.current && projectionRef.current && showRouteOverlay && routeHighlight && (
  <RouteHighlightLayer
    map={leafletMapRef.current}
    projection={projectionRef.current}
    route={routeHighlight}
  />
)}


      {/* 线路高亮图层 */}
      {mapReady && leafletMapRef.current && projectionRef.current && highlightedLine && showRailway && (
        <LineHighlightLayer
          map={leafletMapRef.current}
          projection={projectionRef.current}
          line={highlightedLine}
        />
      )}

      {/* 线路列表页面 */}
      {LINES_FEATURE_ENABLED && legacyModuleLoaded && showLinesPage && (
        <Suspense fallback={null}>
          <LazyLinesPage
            onBack={() => setShowLinesPage(false)}
            onLineSelect={(line) => {
              setShowLinesPage(false);
              handleLineSelect(line);
            }}
          />
        </Suspense>
      )}

      {/* 加载进度提示 */}
      <LoadingOverlay />
    </div>
  );
}

export default MapContainer;