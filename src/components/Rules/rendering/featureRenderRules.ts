// CairnMap FINAL CLEANUP: display algorithm executor/facade only. Display rule definitions live in preset Class/shared display JSON.
// CairnMap LEGACY CLEANUP: display algorithm executor only.
// Do not add new Class/display definitions here. New definitions belong in project-config/presets/*/classes and shared/display.
import type { FeatureStore } from "@/components/Rules/data/featureStore";
import type {
  FeatureRecord,
  RenderRule,
} from "@/components/Rules/rendering/renderRules";
import type { FeatureDisplayRuleDraft } from "@/components/Rules/rendering/display/displayTypes";
import {
  isPriorityStructureLabelFeature,
  STRUCTURE_LABEL_PRIORITY,
} from "@/components/Rules/priority/structureLabelPriority";
import {
  DEFAULT_FLOOR_VIEW,
  fmtFloorLabel,
} from "@/components/Rules/utils/ruleHelpers";

import { applyConfigDisplayOverlayToRule } from "../../../core/project/displayRuntimeOverlay";
/**
 * 具体要素渲染规则（从 renderRules.ts 分离）。
 *
 * 注意：本文件只使用 type import，避免与 renderRules.ts 产生运行时循环依赖。
 */

function normalizeColor(c: any): string | null {
  const s = String(c ?? "").trim();
  if (!s) return null;
  if (s.startsWith("#")) return s;
  // 6位HEX：补 #
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`;
  return s; // 其他情况原样返回（例如 'red' / 'rgba(...)'）
}

function getFirstLineIdFromPlatformFi(fi: any): string | null {
  const arr = (fi as any)?.lines;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const id = String(arr[0]?.ID ?? arr[0]?.LineID ?? arr[0]?.id ?? "").trim();
  return id || null;
}

function getLineColorByLineId(
  lineId: string,
  store: FeatureStore,
): string | null {
  const id = String(lineId ?? "").trim();
  if (!id) return null;

  // 1) 优先：FeatureStore 若有 lineColorIndex（你 v3 方案里是 public 字段）
  const idx = (store as any)?.lineColorIndex as
    | Record<string, string>
    | undefined;
  const c1 = idx?.[id];
  const n1 = normalizeColor(c1);
  if (n1) return n1;

  // 2) 兜底：若 store 有 all（v3 里有），线性扫 RLE 找 LineID/ID 对应的 color
  const all = (store as any)?.all as any[] | undefined;
  if (Array.isArray(all)) {
    for (const r of all) {
      const fid = String(
        (r?.featureInfo as any)?.LineID ?? (r?.featureInfo as any)?.ID ?? "",
      ).trim();
      if (fid !== id) continue;
      const cc = String(
        (r?.featureInfo as any)?.color ?? (r?.featureInfo as any)?.Color ?? "",
      ).trim();
      const nn = normalizeColor(cc);
      if (nn) return nn;
    }
  }

  return null;
}

function getPlatformPointColor(
  r: FeatureRecord,
  store: FeatureStore,
): string | null {
  const lineId = getFirstLineIdFromPlatformFi(r.featureInfo);
  if (!lineId) return null;
  return getLineColorByLineId(lineId, store);
}

function getStationPointColorFromPlatforms(
  sta: FeatureRecord,
  store: FeatureStore,
): string | null {
  const pArr = (sta.featureInfo as any)?.platforms;
  if (!Array.isArray(pArr) || pArr.length === 0) return null;

  const pid = String(pArr[0]?.ID ?? pArr[0]?.platformID ?? "").trim();
  if (!pid) return null;

  // 1) 优先：store.byClassId['PLF'][pid][0]
  const byClassId = (store as any)?.byClassId as
    | Record<string, Record<string, FeatureRecord[]>>
    | undefined;
  const hit = byClassId?.["PLF"]?.[pid]?.[0];
  if (hit) return getPlatformPointColor(hit, store);

  // 2) 兜底：线性扫找平台
  const all = (store as any)?.all as FeatureRecord[] | undefined;
  if (Array.isArray(all)) {
    for (const r of all) {
      if (r?.meta?.Class !== "PLF") continue;
      if (String(r?.meta?.idValue ?? "").trim() !== pid) continue;
      return getPlatformPointColor(r, store);
    }
  }

  return null;
}

type StructureZoomMode = "hidden" | "lowPoint" | "highPolygon";

function getStructureZoomMode(ctx: { zoomLevel: number }): StructureZoomMode {
  const z = Number((ctx as any)?.zoomLevel ?? 0);
  if (z < 3) return "hidden";
  if (z <= 5) return "lowPoint";
  return "highPolygon";
}

function makeStructureLabelPlan(
  r: FeatureRecord,
  ctx: { zoomLevel: number },
  options: { styleKey: string; minLevel: number },
): any {
  const mode = getStructureZoomMode(ctx);
  if (mode === "hidden") return { enabled: false };

  const priority = isPriorityStructureLabelFeature(r);
  const lowZoom = mode === "lowPoint";
  return {
    enabled: true,
    styleKey: options.styleKey,
    minLevel: lowZoom ? 0 : options.minLevel,
    placement: "center",
    withDot: lowZoom,
    dotAnchorMode: lowZoom ? "anchorRight" : "inline",
    offsetY: 0,
    textFrom: (rr: FeatureRecord) =>
      String((rr.featureInfo as any)?.Name ?? "").trim(),
    declutter: {
      priority: lowZoom
        ? priority
          ? STRUCTURE_LABEL_PRIORITY.lowZoomPriority
          : STRUCTURE_LABEL_PRIORITY.lowZoomNormal
        : STRUCTURE_LABEL_PRIORITY.highZoom,
      minSpacingPx: lowZoom ? 3 : 4,
      candidates:
        lowZoom && !priority ? ["C"] : ["C", "N", "S", "E", "W"],
      allowHide: true,
      allowAbbrev: true,
      abbrev: (text: string) =>
        text.length > 10 ? text.slice(0, 10) + "…" : text,
    },
  };
}

// ------------------------------
// STA/PLF 点位重合索引（用于“重合排除/兜底显示”）
// - 以 XZ 为主判断重合（2D 地图视觉上重合即可）
// - 对浮点做轻微 round，避免误差导致 key 不一致
// ------------------------------

type StaPlfPointIndex = {
  staKeys: Set<string>;
  /** 仅统计 Connect !== false 的 PLF，用于“STA 在高 zoom 的兜底显示” */
  plfConnectKeys: Set<string>;
};

const __staPlfIndexCache = new WeakMap<FeatureStore, StaPlfPointIndex>();

function roundCoord(n: number, prec = 1000) {
  // prec=1000 => 0.001 精度
  return Math.round(n * prec) / prec;
}

function pointKeyXZ(p3?: { x: number; y: number; z: number }): string | null {
  if (!p3) return null;
  const x = roundCoord(Number(p3.x));
  const z = roundCoord(Number(p3.z));
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return `${x},${z}`;
}

function getStaPlfPointIndex(store: FeatureStore): StaPlfPointIndex {
  const cached = __staPlfIndexCache.get(store);
  if (cached) return cached;

  const staKeys = new Set<string>();
  const plfConnectKeys = new Set<string>();

  const sta = store.byClass["STA"] ?? [];
  for (const r of sta) {
    const k = pointKeyXZ(r.p3);
    if (k) staKeys.add(k);
  }

  const plf = store.byClass["PLF"] ?? [];
  for (const r of plf) {
    const k = pointKeyXZ(r.p3);
    if (!k) continue;

    const connect = (r.featureInfo as any)?.Connect;
    if (connect !== false) plfConnectKeys.add(k);
  }

  const idx: StaPlfPointIndex = { staKeys, plfConnectKeys };
  __staPlfIndexCache.set(store, idx);
  return idx;
}

// ------------------------------
// 通用：点集包含（忽略顺序）+ 全局互斥选择
// 用途：在 zoom>=阈值 时，让两类要素“二选一”显示
// 规则：只要 overlay 存在任意一条“不被 base 包含”，则选择 overlay（隐藏 base）；否则选择 base（隐藏 overlay）
// ------------------------------

type Coord3 = { x: number; y: number; z: number };

function __roundN(n: number, prec = 1000) {
  // 0.001 精度（可按需调）
  return Math.round(n * prec) / prec;
}

function __coordKeyXZ(p: { x: number; z: number }, prec = 1000): string | null {
  const x = __roundN(Number(p.x), prec);
  const z = __roundN(Number(p.z), prec);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return `${x},${z}`;
}

/** polyline 的控制点 -> “去重 + 排序”的 key 列表（忽略顺序） */
function __polyPointKeyListXZ(
  coords3?: Coord3[],
  prec = 1000,
): string[] | null {
  if (!coords3 || coords3.length < 2) return null;

  const set = new Set<string>();
  for (const p of coords3) {
    const k = __coordKeyXZ({ x: p.x, z: p.z }, prec);
    if (!k) return null;
    set.add(k);
  }
  const arr = Array.from(set);
  arr.sort();
  return arr;
}

/** a ⊆ b（aKeys/bKeys 为排序数组） */
function __isSubsetSortedKeys(aKeys: string[], bKeys: string[]): boolean {
  let i = 0,
    j = 0;
  while (i < aKeys.length && j < bKeys.length) {
    const a = aKeys[i];
    const b = bKeys[j];
    if (a === b) {
      i++;
      j++;
      continue;
    }
    if (a > b) {
      j++;
      continue;
    } // b 追赶
    return false; // a < b => b 缺少 a
  }
  return i === aKeys.length;
}

/**
 * 全局互斥选择：
 * - overlay 中只要存在任意一条“不被任何 base 包含”，则选择 overlay
 * - 否则选择 base
 */
function chooseExclusiveByContainment(
  baseKeyLists: string[][],
  overlayKeyLists: string[][],
): "base" | "overlay" {
  if (overlayKeyLists.length === 0) return "base";
  if (baseKeyLists.length === 0) return "overlay";

  const overlayHasUncontained = overlayKeyLists.some(
    (ok) => !baseKeyLists.some((bk) => __isSubsetSortedKeys(ok, bk)),
  );
  return overlayHasUncontained ? "overlay" : "base";
}

// ------------------------------
// RLE 专用：zoom>=6 时，决定显示 dir3 还是显示 alt(0/1/2/4)
// ------------------------------

type RleExclusiveChoice = { choice: "dir3" | "alt" };
const __rleChoiceCache = new WeakMap<FeatureStore, RleExclusiveChoice>();

function getRleExclusiveChoice(store: FeatureStore): RleExclusiveChoice {
  const cached = __rleChoiceCache.get(store);
  if (cached) return cached;

  const rles = store.byClass["RLE"] ?? [];

  const dir3Keys: string[][] = [];
  const altKeys: string[][] = [];

  for (const r of rles) {
    if (r.type !== "Polyline") continue;

    const raw = (r.featureInfo as any)?.direction;
    const dir =
      raw === "" || raw === null || raw === undefined ? NaN : Number(raw);

    const keys = __polyPointKeyListXZ(r.coords3);
    if (!keys) continue;

    if (dir === 3) dir3Keys.push(keys);
    else if (dir === 0 || dir === 1 || dir === 2 || dir === 4)
      altKeys.push(keys);
  }

  const pick = chooseExclusiveByContainment(dir3Keys, altKeys);
  const choice: RleExclusiveChoice = {
    choice: pick === "base" ? "dir3" : "alt",
  };
  __rleChoiceCache.set(store, choice);
  return choice;
}

const DISPLAY_RLE_NETWORK: FeatureDisplayRuleDraft = {
  profile: "networkLine",
  visibility: { geometryMinZoom: 0, labelMinZoom: 4 },
  geometry: { render: "polyline" },
  symbol: { enabled: false },
  label: { enabled: true, source: "Name", styleKey: "rle-line-13" },
  anchor: {
    strategy: "polylineStableCandidates",
    anchorSamples: 7,
    lineLabelMode: "strictOnLine",
    lineCandidateSpacing: 180,
    lineCandidateMinSpacing: 40,
    lineCandidateMax: 32,
    lineShortThresholdMultiplier: 2,
    lineLongMode: "evenSplit",
    lineCandidateEndpointPaddingRatio: 0.12,
    lineCandidateEndpointPaddingMin: 40,
    preferPreviousLineCandidate: true,
    lineCandidateHysteresisPx: 180,
    minLineLabelLengthPx: 90,
    maxAngleDeltaDeg: 40,
    lineTextMode: "rotatedLabel",
    advancedLineTextEnabled: false,
    advancedLineTextBudgetGroup: "none",
    cjkGlyphPathMode: "off",
    cjkGlyphCompactMode: "off",
    cjkGlyphFallbackMode: "rotatedLabel",
    textPathFallback: "rotatedLabel",
    textPathCollisionPaddingPx: 10,
    textPathLetterSpacingPx: 0.5,
    textPathCurvedLetterSpacingPx: 1.8,
    textPathCurvedSpacingMinBendDeg: 30,
  },
  collision: {
    role: "important",
    priority: 4000,
    group: "networkLabel",
    allowHide: true,
    hidePolicy: "abbreviateThenHide",
  },
};

const DISPLAY_ROD_NETWORK: FeatureDisplayRuleDraft = {
  profile: "networkLine",
  visibility: { geometryMinZoom: 0, labelMinZoom: 4 },
  geometry: { render: "polyline" },
  symbol: { enabled: false },
  label: { enabled: true, source: "Name", styleKey: "gm-bw-12" },
  anchor: {
    strategy: "polylineStableCandidates",
    anchorSamples: 7,
    lineLabelMode: "strictOnLine",
    lineCandidateSpacing: 120,
    lineCandidateMinSpacing: 40,
    lineCandidateMax: 40,
    lineShortThresholdMultiplier: 2,
    lineLongMode: "evenSplit",
    lineCandidateEndpointPaddingRatio: 0.12,
    lineCandidateEndpointPaddingMin: 40,
    preferPreviousLineCandidate: true,
    lineCandidateHysteresisPx: 140,
    minLineLabelLengthPx: 80,
    maxAngleDeltaDeg: 45,
    lineTextMode: "auto",
    advancedLineTextEnabled: true,
    advancedLineTextBudgetGroup: "network",
    cjkGlyphRotationPolicy: "uprightWhenSteep",
    cjkGlyphUprightAngleThresholdDeg: 45,
      cjkGlyphPathMode: "auto",
      cjkGlyphSpacingPx: 2,
      cjkGlyphCollisionPaddingPx: 8,
      cjkGlyphMaxCount: 16,
      cjkGlyphAllowTextPathFallback: false,
      lineTextPathHalfLengthMultiplier: 1.6,
      lineTextPathMinHalfLengthWorld: 160,
      lineTextPathMaxHalfLengthRatio: 0.46,
      lineTextCollisionRectMode: "compactTextBox",
      cjkGlyphCompactMode: "auto",
      cjkGlyphMinAdvanceScale: 0.62,
      cjkGlyphFallbackMode: "simpleLineLabel",
      lineTextSimpleFallbackEnabled: true,
      lineTextSimpleFallbackRotate: true,
      lineTextRepositionMode: "chainageSearch",
      lineTextRepositionAttemptsPerDirection: 3,
      lineTextRepositionStepMode: "labelSpan",
      lineTextRepositionFailure: "hide",
      lineTextRepositionStrictSvg: true,
      lineTextAvoidLineGeometry: false,
      lineTextAvoidPolygonGeometry: false,
      lineTextAvoidPointSymbols: true,
      lineTextViewportRectMode: "anchorNormalized",
      lineTextViewportCandidateMode: "stableFirstViewportFallback",
      lineTextViewportCandidateBufferPx: 72,
      lineTextViewportCandidateMaxTargets: 1,
      lineTextViewportCandidateMinIntervalPx: 48,
    lineCjkVerticalRenderMode: "legacyVertical",
    textPathMinLengthPx: 110,
    textPathPaddingPx: 28,
    textPathMaxAngleDeltaDeg: 45,
    textPathMaxTotalBendDeg: 100,
    textPathPreferReadableDirection: true,
    lineTextOrientationPolicy: "autoCjkUpright",
    textPathVerticalAngleThresholdDeg: 45,
    textPathVerticalLengthRatio: 0.6,
    textPathFallback: "rotatedLabel",
    textPathCollisionPaddingPx: 10,
    textPathLetterSpacingPx: 0.5,
    textPathCurvedLetterSpacingPx: 1.8,
    textPathCurvedSpacingMinBendDeg: 30,
  },
  collision: {
    role: "important",
    priority: 3600,
    group: "networkLabel",
    allowHide: true,
    hidePolicy: "abbreviateThenHide",
  },
};

const DISPLAY_STRUCTURE_GEOMETRY_ONLY: FeatureDisplayRuleDraft = {
  profile: "geometryOnlyFallback",
  displayTier: "structure",
  geometry: { render: "polygonFillOutline" },
  symbol: { enabled: false },
  label: { enabled: false },
  collision: {
    role: "ignore",
    priority: 0,
    allowHide: true,
    hidePolicy: "geometryOnly",
  },
};

const DISPLAY_BUILDING_STRUCTURE: FeatureDisplayRuleDraft = {
  profile: "buildingStructure",
  displayTier: "structure",
  visibility: { geometryMinZoom: 5, labelMinZoom: 6 },
  geometry: { render: "polygonFillOutline" },
  symbol: { enabled: false },
  label: {
    enabled: true,
    source: "Name",
    styleKey: "structure-label-12",
    abbreviation: { enabled: true, maxChars: 12, suffix: "…" },
  },
  anchor: {
    strategy: "fixedInterior",
    geoCandidateMode: "fixedInterior",
    preferPreviousGeoCandidate: true,
    candidates: ["C", "N", "S", "E", "W"],
    requireInsideGeometry: true,
  },
  collision: {
    role: "soft",
    priority: 1100,
    group: "structureLabel",
    allowHide: true,
    hidePolicy: "abbreviateThenHide",
    paddingPx: 3,
  },
  density: {
    enabled: true,
    gridSizePx: 104,
    maxLabelsPerGrid: 2,
    reduceOrder: ["hideSoftLabels", "geometryOnly"],
    preserveSelected: true,
    preserveRequired: true,
  },
};

const DISPLAY_STATION_STRUCTURE: FeatureDisplayRuleDraft = {
  profile: "stationStructure",
  displayTier: "structure",
  visibility: { geometryMinZoom: 5, labelMinZoom: 5 },
  geometry: { render: "polygonFillOutline" },
  symbol: { enabled: false },
  label: {
    enabled: true,
    source: "Name",
    styleKey: "structure-label-12",
    abbreviation: { enabled: true, maxChars: 12, suffix: "…" },
  },
  anchor: {
    strategy: "fixedInterior",
    geoCandidateMode: "fixedInterior",
    preferPreviousGeoCandidate: true,
    candidates: ["C", "N", "S", "E", "W"],
    requireInsideGeometry: true,
  },
  collision: {
    role: "optional",
    priority: 2600,
    group: "structureLabel",
    allowHide: true,
    hidePolicy: "abbreviateThenHide",
    paddingPx: 4,
  },
  density: {
    enabled: true,
    gridSizePx: 104,
    maxLabelsPerGrid: 3,
    reduceOrder: ["abbreviateOptionalLabels", "hideOptionalLabels"],
    preserveSelected: true,
    preserveRequired: true,
  },
};

const DISPLAY_TRANSPORT_NODE: FeatureDisplayRuleDraft = {
  profile: "transportNode",
  displayTier: "transportNode",
  visibility: { symbolMinZoom: 4, labelMinZoom: 4 },
  geometry: { render: "none" },
  symbol: { enabled: true, type: "circle", radiusPx: 5 },
  label: {
    enabled: true,
    source: "Name",
    styleKey: "bubble-dark-14",
    abbreviation: { enabled: true, maxChars: 6, suffix: "…" },
  },
  anchor: {
    strategy: "pointVariable",
    candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
  },
  collision: {
    role: "important",
    priority: 6000,
    group: "transportLabel",
    allowHide: true,
    hidePolicy: "abbreviateThenHide",
    paddingPx: 6,
  },
};

const DISPLAY_INDOOR_REQUIRED_DOT_LABEL: FeatureDisplayRuleDraft = {
  profile: "indoorUnit",
  displayTier: "indoor",
  visibility: {
    modes: ["floor", "editing"],
    geometryMinZoom: 0,
    labelMinZoom: 0,
  },
  geometry: { render: "polygonFillOutline" },
  symbol: { enabled: true, type: "dot", radiusPx: 4 },
  label: {
    enabled: true,
    source: "Name",
    styleKey: "bubble-dark-13",
    abbreviation: { enabled: true, maxChars: 10, suffix: "…" },
  },
  anchor: {
    strategy: "pointVariable",
    candidates: ["E"],
    requireInsideGeometry: false,
  },
  collision: {
    role: "required",
    priority: 8000,
    group: "indoorLabel",
    allowHide: false,
    hidePolicy: "forceShow",
  },
  density: { enabled: false },
};

const DISPLAY_POI_POINT: FeatureDisplayRuleDraft = {
  profile: "poiPoint",
  displayTier: "poi",
  visibility: { symbolMinZoom: 5, labelMinZoom: 5 },
  geometry: { render: "none" },
  symbol: { enabled: true, type: "circle", radiusPx: 4 },
  label: {
    enabled: true,
    source: "Name",
    styleKey: "bubble-dark-14",
    abbreviation: { enabled: true, maxChars: 6, suffix: "…" },
  },
  anchor: {
    strategy: "pointVariable",
    candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
  },
  collision: {
    role: "optional",
    priority: 2500,
    group: "poiLabel",
    allowHide: true,
    hidePolicy: "abbreviateThenHide",
    paddingPx: 6,
  },
};

const DISPLAY_ISL_NETWORK: FeatureDisplayRuleDraft = {
  profile: "networkLine",
  displayTier: "network",
  visibility: { geometryMinZoom: 0, labelMinZoom: 0 },
  geometry: { render: "polyline" },
  symbol: { enabled: false },
  label: {
    enabled: true,
    source: "Name",
    styleKey: "gm-outline",
    abbreviation: { enabled: true, maxChars: 10, suffix: "…" },
  },
  anchor: {
    strategy: "polylineStableCandidates",
    anchorSamples: 7,
    lineLabelMode: "strictOnLine",
    lineCandidateSpacing: 200,
    lineCandidateMinSpacing: 40,
    lineCandidateMax: 48,
    lineShortThresholdMultiplier: 2,
    lineLongMode: "evenSplit",
    lineCandidateEndpointPaddingRatio: 0.12,
    lineCandidateEndpointPaddingMin: 40,
    preferPreviousLineCandidate: true,
    lineCandidateHysteresisPx: 200,
    minLineLabelLengthPx: 90,
    maxAngleDeltaDeg: 50,
    lineTextMode: "auto",
    advancedLineTextEnabled: true,
    advancedLineTextBudgetGroup: "network",
    cjkGlyphRotationPolicy: "uprightWhenSteep",
    cjkGlyphUprightAngleThresholdDeg: 45,
      cjkGlyphPathMode: "auto",
      cjkGlyphSpacingPx: 2,
      cjkGlyphCollisionPaddingPx: 8,
      cjkGlyphMaxCount: 16,
      cjkGlyphAllowTextPathFallback: false,
      lineTextPathHalfLengthMultiplier: 1.6,
      lineTextPathMinHalfLengthWorld: 160,
      lineTextPathMaxHalfLengthRatio: 0.46,
      lineTextCollisionRectMode: "compactTextBox",
      cjkGlyphCompactMode: "auto",
      cjkGlyphMinAdvanceScale: 0.62,
      cjkGlyphFallbackMode: "simpleLineLabel",
      lineTextSimpleFallbackEnabled: true,
      lineTextSimpleFallbackRotate: true,
      lineTextRepositionMode: "chainageSearch",
      lineTextRepositionAttemptsPerDirection: 3,
      lineTextRepositionStepMode: "labelSpan",
      lineTextRepositionFailure: "hide",
      lineTextRepositionStrictSvg: true,
      lineTextAvoidLineGeometry: false,
      lineTextAvoidPolygonGeometry: false,
      lineTextAvoidPointSymbols: true,
      lineTextViewportRectMode: "anchorNormalized",
      lineTextViewportCandidateMode: "stableFirstViewportFallback",
      lineTextViewportCandidateBufferPx: 72,
      lineTextViewportCandidateMaxTargets: 1,
      lineTextViewportCandidateMinIntervalPx: 48,
    lineCjkVerticalRenderMode: "legacyVertical",
    textPathMinLengthPx: 140,
    textPathPaddingPx: 36,
    textPathMaxAngleDeltaDeg: 50,
    textPathMaxTotalBendDeg: 120,
    textPathPreferReadableDirection: true,
    lineTextOrientationPolicy: "autoCjkUpright",
    textPathVerticalAngleThresholdDeg: 45,
    textPathVerticalLengthRatio: 0.6,
    textPathFallback: "rotatedLabel",
    textPathCollisionPaddingPx: 10,
    textPathLetterSpacingPx: 0.5,
    textPathCurvedLetterSpacingPx: 1.8,
    textPathCurvedSpacingMinBendDeg: 30,
  },
  collision: {
    role: "important",
    priority: 3800,
    group: "networkLabel",
    allowHide: true,
    hidePolicy: "abbreviateThenHide",
  },
};

const DISPLAY_ISG_SURFACE: FeatureDisplayRuleDraft = {
  profile: "largeGeoSurface",
  displayTier: "geoStructure",
  visibility: { geometryMinZoom: 0, labelMinZoom: 0 },
  geometry: { render: "polygonFillOutline" },
  symbol: { enabled: false },
  label: {
    enabled: true,
    source: "Name",
    styleKey: "gm-outline",
    abbreviation: { enabled: true, maxChars: 10, suffix: "…" },
  },
  anchor: {
    strategy: "largeFeatureStableCandidates",
    geoCandidateMode: "viewportAwareCandidateSet",
    geoCandidateCount: 9,
    geoCandidateMax: 100,
    preferPreviousGeoCandidate: true,
    switchThreshold: 0.4,
    allowViewportCandidateFallback: true,
    largeFeature: { minScreenAreaPx: 10000, preferViewportCenter: true },
  },
  collision: {
    role: "important",
    priority: 5000,
    group: "surfaceLabel",
    allowHide: false,
    hidePolicy: "forceShow",
    paddingPx: 8,
  },
};

const DISPLAY_GENERIC_POINT: FeatureDisplayRuleDraft = {
  displayTier: "poi",
  visibility: { symbolMinZoom: 0 },
  geometry: { render: "none" },
  symbol: { enabled: true, type: "circle", radiusPx: 5 },
  label: { enabled: false, source: "custom", styleKey: "bubble-dark-14" },
  anchor: { strategy: "pointVariable" },
  collision: {
    role: "soft",
    priority: 100,
    group: "poiLabel",
    allowHide: true,
    hidePolicy: "hide",
  },
};

const DISPLAY_FALLBACK_LINE: FeatureDisplayRuleDraft = {
  profile: "geometryOnlyFallback",
  displayTier: "network",
  geometry: { render: "polyline" },
  symbol: { enabled: false },
  label: { enabled: false },
  collision: {
    role: "ignore",
    priority: 0,
    allowHide: true,
    hidePolicy: "geometryOnly",
  },
};

const DISPLAY_FALLBACK_POLYGON: FeatureDisplayRuleDraft = {
  profile: "geometryOnlyFallback",
  displayTier: "structure",
  geometry: { render: "polygonFillOutline" },
  symbol: { enabled: false },
  label: { enabled: false },
  collision: {
    role: "ignore",
    priority: 0,
    allowHide: true,
    hidePolicy: "geometryOnly",
  },
};

const LEGACY_FEATURE_RENDER_RULES: RenderRule[] = [
  // ------------------------------------------------------------------
  // (1) 铁路 RLE：direction 缩放控制 + 沿线 label
  // - direction=3：zoomLevel 0..99 都显示
  // - direction=0/1/2/4：仅 zoomLevel>=5 显示
  // (2) label：附着在铁路线上（依赖 RuleDrivenLayer.tsx 的 Polyline label 补丁）
  // ------------------------------------------------------------------
  {
    name: "铁路 RLE：direction 缩放控制",
    match: { Class: "RLE", Type: "Polyline" },
    zoom: [0, 99],
    display: DISPLAY_RLE_NETWORK,
    visible: (r, ctx, store) => {
      const raw = (r.featureInfo as any)?.direction;
      const dir =
        raw === "" || raw === null || raw === undefined ? NaN : Number(raw);

      // zoom < 6：只显示展示线 dir=3
      if (ctx.zoomLevel < 8) return dir === 3;

      // zoom >= 6：进入互斥选择
      const choice = getRleExclusiveChoice(store).choice;

      if (choice === "dir3") {
        // 只有当“所有 alt 都能被某条 dir3 包含”时，才显示 dir3，alt 全隐藏
        return dir === 3;
      } else {
        // 只要存在任意 alt 不被包含，则 dir3 全隐藏，显示 alt
        return dir === 0 || dir === 1 || dir === 2 || dir === 4;
      }
    },

    symbol: {
      pathStyle: (r) => {
        const c = normalizeColor((r.featureInfo as any)?.color) ?? "#111827";
        return {
          color: c,
          opacity: 0.9,
          weight: 3,
        };
      },

      // RLE：两种线路标签样式
      // - dir=0/1：沿线文字（13px），文字色=线路色，白色粗描边
      // - dir=3：线路“药丸牌”（13px），底色=线路色，白字
      label: (r, _ctx, _store) => {
        const raw = (r.featureInfo as any)?.direction;
        const dir =
          raw === "" || raw === null || raw === undefined ? NaN : Number(raw);
        const c = normalizeColor((r.featureInfo as any)?.color) ?? "#2563eb";
        // ✅ 新数据集：统一使用 Name/ID
        // 兼容旧字段：LineName/LineID（避免历史数据立刻全崩）
        const text =
          String((r.featureInfo as any)?.Name ?? "").trim() ||
          String((r.featureInfo as any)?.ID ?? "").trim() ||
          String((r.featureInfo as any)?.LineName ?? "").trim() ||
          String((r.featureInfo as any)?.LineID ?? "").trim();

        // 仅对指定 dir 挂载；其它 dir 不显示 label（避免旧逻辑干扰）
        const isLineText = dir === 0 || dir === 1;
        const isPill = dir === 3;
        if (!isLineText && !isPill) {
          return { enabled: false } as any;
        }

        return {
          enabled: true,
          minLevel: 5,
          placement: "center",
          textFrom: () => text,
          withDot: false,
          offsetY: 0,
          // 新增：用于 declutter 的“沿线多 anchor 尝试”
          declutter: {
            priority: isLineText ? 12 : 8, // 药丸牌优先级更低
            minSpacingPx: 6,
            candidates: ["C"],
            allowHide: true,
            allowAbbrev: true,
            abbrev: (s: string) => (s.length > 10 ? s.slice(0, 10) + "…" : s),
            // 扩展字段（labelLayout/RuleDrivenLayer 会识别）
            anchorMode: "polyline-stable",
            anchorSamples: 7,
            lineLabelMode: "strictOnLine",
          },

          // styleKey 作为“动态样式对象”传入 labelStyles
          styleKey: isLineText
            ? ({ key: "rle-line-13", color: c } as any)
            : ({ key: "rle-pill-13", color: c } as any),
          displayAnchor: isLineText
            ? ({
                lineTextMode: "auto",
                advancedLineTextEnabled: true,
                advancedLineTextBudgetGroup: "network",
                cjkGlyphPathMode: "auto",
                cjkGlyphCompactMode: "auto",
                cjkGlyphFallbackMode: "hide",
                cjkGlyphRotationPolicy: "uprightWhenSteep",
                cjkGlyphUprightAngleThresholdDeg: 45,
                cjkGlyphAllowTextPathFallback: false,
                lineTextRepositionMode: "chainageSearch",
                lineTextRepositionAttemptsPerDirection: 3,
                lineTextRepositionStepMode: "labelSpan",
                lineTextRepositionFailure: "hide",
                lineTextRepositionStrictSvg: true,
                lineTextAvoidLineGeometry: false,
                lineTextAvoidPolygonGeometry: false,
                lineTextAvoidPointSymbols: true,
                lineTextViewportRectMode: "anchorNormalized",
                lineTextViewportCandidateMode: "stableFirstViewportFallback",
                lineTextViewportCandidateBufferPx: 72,
                lineTextViewportCandidateMaxTargets: 1,
                lineTextViewportCandidateMinIntervalPx: 48,
                textPathFallback: "rotatedLabel",
              } as any)
            : ({
                lineTextRepositionMode: "off",
                advancedLineTextEnabled: false,
                cjkGlyphPathMode: "off",
              } as any),
        } as any;
      },

      labelClick: {
        enabled: true,
        mode: "normal",
        openCard: true,
        // 与导航 RouteHighlightLayer 保持一致：白色描边 + 主色加粗
        highlightStyleKey: "nav-outline",
        // 新增：几何点击开关（按要素自由组合）
        geom: {
          point: true, // 点要素本体可点击
        },
      },
    },
  },

  // ------------------------------------------------------------------
  // 道路 ROD：缩放阈值控制 + 沿线 label
  // - 仅当 zoomLevel 在 (6,7) 内：显示 25% 透明度的“默认宽度/颜色”线条
  // - 当 zoomLevel > 7：显示 35% 透明度的线条 + gm-bw-12 的 Name label（沿线中心贴附）
  //
  // 重要：这里的“当前宽度”= 你这份 src 中 ROD 线要素的**默认显示宽度**（即通用 Polyline 默认样式的 weight），
  // 并不是读取 featureInfo 里的某个 width 字段。
  // ------------------------------------------------------------------
  {
    name: "道路 ROD：缩放阈值控制 + 沿线 label",
    match: { Class: "ROD", Type: "Polyline" },
    zoom: [0, 99],
    display: DISPLAY_ROD_NETWORK,
    visible: (_r, ctx) => {
      const z = Number((ctx as any).zoomLevel ?? 0);
      if (z > 5 && z <= 6) return true;
      if (z > 6) return true;
      return false;
    },
    symbol: {
      pathStyle: (r, ctx) => {
        const z = Number((ctx as any).zoomLevel ?? 0);

        // 颜色：沿用要素自身配置；若未提供则回退到通用 Polyline 默认色
        const c = normalizeColor((r.featureInfo as any)?.color) ?? "#111827";

        // 宽度：沿用通用 Polyline 默认 weight（你这份 src 中为 3）
        const defaultWeight = 3;

        const opacity = z > 6 && z < 7 ? 0.25 : 0.35;
        return {
          color: c,
          weight: defaultWeight,
          opacity,
        };
      },

      label: (_r, ctx) => {
        const z = Number((ctx as any).zoomLevel ?? 0);
        if (!(z > 5)) return { enabled: false } as any;
        return {
          enabled: true,
          minLevel: 0,
          placement: "center",
          textFrom: (r: any) =>
            String((r.featureInfo as any)?.Name ?? "").trim(),
          withDot: false,
          offsetY: 0,
          declutter: {
            // 与 RLE 沿线文字一致的“贴附 + 避让 + 多 anchor”策略（但不做颜色判断）
            priority: 10,
            minSpacingPx: 6,
            candidates: ["C"],
            allowHide: true,
            allowAbbrev: true,
            abbrev: (s: string) => (s.length > 10 ? s.slice(0, 10) + "…" : s),
            anchorMode: "polyline-stable",
            anchorSamples: 7,
            lineLabelMode: "strictOnLine",
          },
          styleKey: "gm-bw-12",
        } as any;
      },

      labelClick: {
        enabled: true,
        mode: "normal",
        openCard: true,
        // 与导航 RouteHighlightLayer 保持一致：白色描边 + 主色加粗
        highlightStyleKey: "nav-outline",
        // 新增：几何点击开关（按要素自由组合）
        geom: {
          point: true, // 点要素本体可点击
        },
      },
    },
  },

  // ------------------------------------------------------------------
  // (3) 站台轮廓 PFB：按关联线路色渲染（补 #）
  // ------------------------------------------------------------------
  {
    name: "站台轮廓 PFB：按线路色渲染（补#）",
    match: { Class: "PFB", Type: "Polygon" },
    zoom: [5, 99],
    display: DISPLAY_STRUCTURE_GEOMETRY_ONLY,
    symbol: {
      pathStyle: (r, _ctx, store) => {
        const c = normalizeColor(store.findRelatedLineColor(r)) ?? "#2563eb";
        return {
          color: c,
          opacity: 0.95,
          weight: 0,
          fillColor: c,
          fillOpacity: 0.22,
        };
      },
    },
  },

  // ------------------------------------------------------------------
  // (4) 车站建筑 STB：
  // - RB_SLU_11：结构轮廓 + 轻量结构名 label。
  // - 不再使用中心点/dot marker 表示建筑。
  // - RB_SLU_A2：Name 非空即可显示 label（楼层视图中仍隐藏）。
  // ------------------------------------------------------------------

  {
    name: "车站建筑 STB：zoom 3-5 点+label；zoom>5 结构轮廓 + label",
    match: { Class: "STB", Type: "Polygon" },
    zoom: [0, 99],
    display: DISPLAY_STATION_STRUCTURE,
    symbol: {
      pathStyle: (r, ctx) => {
        const mode = getStructureZoomMode(ctx);
        if (mode !== "highPolygon") {
          return {
            opacity: 0,
            fillOpacity: 0,
            weight: 0,
            interactive: false,
          };
        }

        const base: L.PathOptions = {
          color: "#111827",
          opacity: 0.28,
          weight: 1,
          fillColor: "#9ca3af",
          fillOpacity: 0.08,
          interactive: false,
        };

        // 楼层视角：激活建筑变淡，避免压住室内楼层。
        if (
          ctx.inFloorView &&
          ctx.activeBuildingUid &&
          ctx.activeBuildingUid === r.uid
        ) {
          return { ...base, opacity: 0.22, fillOpacity: 0.05 };
        }
        return base;
      },
      label: (r, ctx) =>
        makeStructureLabelPlan(r, ctx, {
          styleKey: "structure-label-12",
          minLevel: 5,
        }),
      labelClick: {
        enabled: true,
        mode: "normal",
        labelStyleKey: "structure-label-12",
        highlightStyleKey: "dash",
        openCard: true,
      },
    },
  },

  // ------------------------------------------------------------------
  // (4.5) 建筑 BUD：
  // - RB_SLU_5：建筑作为结构面显示
  // - 不再显示中心点/dot marker
  // - 常态显示浅轮廓 + 轻量结构名 label
  // - 楼层视角激活建筑变淡（与 STB 一致）
  // ------------------------------------------------------------------

  {
    name: "建筑 BUD：zoom 3-5 点+label；zoom>5 结构轮廓 + label",
    match: { Class: "BUD", Type: "Polygon" },
    zoom: [0, 99],
    display: DISPLAY_BUILDING_STRUCTURE,
    symbol: {
      pathStyle: (r, ctx) => {
        const mode = getStructureZoomMode(ctx);
        if (mode !== "highPolygon") {
          return {
            opacity: 0,
            fillOpacity: 0,
            weight: 0,
            interactive: false,
          };
        }

        const base: L.PathOptions = {
          color: "#111827",
          opacity: 0.28,
          weight: 1,
          fillColor: "#9ca3af",
          fillOpacity: 0.08,
          interactive: false,
        };

        if (
          ctx.inFloorView &&
          ctx.activeBuildingUid &&
          ctx.activeBuildingUid === r.uid
        ) {
          return { ...base, opacity: 0.22, fillOpacity: 0.05 };
        }
        return base;
      },
      label: (r, ctx) =>
        makeStructureLabelPlan(r, ctx, {
          styleKey: "structure-label-12",
          minLevel: 5,
        }),
      labelClick: {
        enabled: true,
        mode: "normal",
        labelStyleKey: "structure-label-12",
        highlightStyleKey: "dash",
        openCard: true,
      },
    },
  },

  // (5) 车站点 STA：
  // - zoomLevel<4：不显示
  // - zoomLevel 4..6：显示固定图标
  // - zoomLevel>6：不显示（由 findFirstRule + zoom 裁剪自然实现）
  // ------------------------------------------------------------------

  {
    name: "车站点 STA：zoom 4-5 正常显示；zoom>=6 若与可显示 PLF 重合则兜底显示",
    match: { Class: "STA", Type: "Points" },
    zoom: [4, 99],
    display: DISPLAY_TRANSPORT_NODE,
    visible: (r, ctx, store) => {
      // zoom 4-5：保持原逻辑（正常显示）
      if (ctx.zoomLevel >= 4 && ctx.zoomLevel <= 7) return true;

      // zoom>=6：仅当“该 STA 与 Connect!==false 的 PLF 坐标重合”时显示
      if (ctx.zoomLevel >= 6) {
        const idx = getStaPlfPointIndex(store);
        const k = pointKeyXZ(r.p3);
        return !!k && idx.plfConnectKeys.has(k);
      }

      return false;
    },
    symbol: {
      pane: "ria-point-top",
      point: (r, ctx, store) => {
        void ctx;

        const c = getStationPointColorFromPlatforms(r, store) ?? "#0ea5e9";
        return {
          kind: "circle",
          radius: 4,
          style: {
            color: "#111827",
            opacity: 0.9,
            weight: 2,
            fillColor: c,
            fillOpacity: 0.85,
          },
        };
      },
      label: {
        enabled: true,
        styleKey: "bubble-dark-14",
        minLevel: 4,
        placement: "center",
        textFrom: (r) => String((r.featureInfo as any)?.Name ?? "").trim(),
        offsetY: 0,
        withDot: false,
        declutter: {
          priority: 10,
          minSpacingPx: 6,
          candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
          allowHide: true,
          allowAbbrev: true,
          abbrev: (s) => (s.length > 6 ? s.slice(0, 6) + "…" : s),
        },
      },
      // Google Map 风格：仅 label 可交互；点击后显示图钉，并触发通用卡片
      labelClick: {
        enabled: true,
        mode: "normal",
        openCard: true,
        // 新增：几何点击开关（按要素自由组合）
        geom: {
          point: true, // 点要素本体可点击
        },
      },
    },
  },

  // ------------------------------------------------------------------
  // (6) 站台点 PLF：
  // - zoomLevel<6：不显示
  // - zoomLevel>=6：显示固定图标
  // ------------------------------------------------------------------
  {
    name: "站台点 PLF：zoom>=6 点颜色读取所属第一个线路 color",
    match: { Class: "PLF", Type: "Points" },
    zoom: [8, 99],
    display: DISPLAY_TRANSPORT_NODE,
    visible: (r, _ctx, store) => {
      // 1) Connect=false 永不显示
      const connect = (r.featureInfo as any)?.Connect;
      if (connect === false) return false;

      // 2) 与 STA 坐标重合则 PLF 不显示（地理关系排除）
      const idx = getStaPlfPointIndex(store);
      const k = pointKeyXZ(r.p3);
      if (k && idx.staKeys.has(k)) return false;

      return true;
    },
    symbol: {
      pane: "ria-point-top",
      point: (r, ctx, store) => {
        void ctx;

        const c = getPlatformPointColor(r, store) ?? "#0ea5e9";
        return {
          kind: "circle",
          radius: 4,
          style: {
            color: "#111827",
            opacity: 0.9,
            weight: 2,
            fillColor: c,
            fillOpacity: 0.85,
          },
        };
      },
      label: {
        enabled: true,
        styleKey: "bubble-dark-14",
        minLevel: 8,
        placement: "near",
        textFrom: (r) => String((r.featureInfo as any)?.Name ?? "").trim(),
        offsetY: 10,
        withDot: true,
        declutter: {
          priority: 10,
          minSpacingPx: 6,
          candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
          allowHide: true,
          // 可选：放不下时缩略
          allowAbbrev: true,
          abbrev: (s) => (s.length > 6 ? s.slice(0, 6) + "…" : s),
        },
      },
      labelClick: {
        enabled: true,
        mode: "normal",
        openCard: true,
        // 新增：几何点击开关（按要素自由组合）
        geom: {
          point: true, // 点要素本体可点击
        },
      },
    },
  },

  // ------------------------------
  // 楼层（STF）
  // ------------------------------
  {
    name: "楼层 STF：楼层视角下按 NofFloor 选择（同 NofFloor 允许多面同时显示）",
    match: { Class: DEFAULT_FLOOR_VIEW.floorClass, Type: "Polygon" },
    zoom: [DEFAULT_FLOOR_VIEW.minLevel, 99],
    display: DISPLAY_INDOOR_REQUIRED_DOT_LABEL,
    visible: (r, ctx) => {
      if (!ctx.inFloorView) return false;
      if (!ctx.activeFloorSelector) return false;

      // 必须属于当前激活建筑的 Floors 引用集合
      const ref = String(
        (r.featureInfo as any)?.[DEFAULT_FLOOR_VIEW.floorRefTargetField] ?? "",
      ).trim();
      if (ctx.activeBuildingFloorRefSet && ref) {
        if (!ctx.activeBuildingFloorRefSet.has(ref)) return false;
      }

      // 使用 floorSelectorField（NofFloor）匹配
      const selector = String(
        (r.featureInfo as any)?.[DEFAULT_FLOOR_VIEW.floorSelectorField] ?? "",
      ).trim();
      return selector === String(ctx.activeFloorSelector).trim();
    },
    symbol: {
      pathStyle: (r, ctx, store) => {
        void ctx;
        // 楼层用轻量颜色，支持关联线路色（如果有）
        const c = store.findRelatedLineColor(r) ?? "#4b5563";
        return {
          color: c,
          opacity: 0.85,
          weight: 2,
          fillColor: c,
          fillOpacity: 0.28,
        };
      },

      label: {
        enabled: true,
        styleKey: "bubble-dark-13",
        placement: "center",
        // 类 STA：中心点（dot）+ 右侧文字（candidates:['E']）
        withDot: true,
        textFrom: (r) => {
          const name = String((r.featureInfo as any)?.Name ?? "").trim();
          if (name) return name;
          return fmtFloorLabel(
            (r.featureInfo as any)?.[DEFAULT_FLOOR_VIEW.floorSelectorField],
          );
        },
        minLevel: DEFAULT_FLOOR_VIEW.minLevel,
        declutter: {
          // 楼层页面强制显示：
          // - allowHide=false => 放不下也不隐藏（将回退为 anchor 位置显示，可能发生重叠）
          // - priority 提高 => 尽量优先放置
          // - minSpacingPx=0 => 尽量“挤开”而不是因为间距而放不下
          priority: 999,
          minSpacingPx: 0,
          candidates: ["E"],
          allowHide: false,
          allowAbbrev: true,
          abbrev: (s) => (s.length > 10 ? s.slice(0, 10) + "…" : s),
        },
      },
      labelClick: {
        enabled: true,
        mode: "normal",
        labelStyleKey: "bubble-dark-13",
        highlightStyleKey: "dash",
        openCard: true,
      },
    },
  },

  // ------------------------------
  // 楼层（FLR）
  // ------------------------------
  {
    name: "楼层 FLR：楼层视角下按 NofFloor 选择（兼容 STF/FLR 上行索引）",
    match: { Class: "FLR", Type: "Polygon" },
    zoom: [DEFAULT_FLOOR_VIEW.minLevel, 99],
    display: DISPLAY_INDOOR_REQUIRED_DOT_LABEL,
    visible: (r, ctx) => {
      if (!ctx.inFloorView) return false;
      if (!ctx.activeFloorSelector) return false;

      // 必须属于当前激活建筑的楼层集合（FloorID）
      const ref = String(
        (r.featureInfo as any)?.FloorID ?? (r.featureInfo as any)?.ID ?? "",
      ).trim();
      if (ctx.activeBuildingFloorRefSet && ref) {
        if (!ctx.activeBuildingFloorRefSet.has(ref)) return false;
      }

      const selector = String(
        (r.featureInfo as any)?.[DEFAULT_FLOOR_VIEW.floorSelectorField] ?? "",
      ).trim();
      return selector === String(ctx.activeFloorSelector).trim();
    },
    symbol: {
      pathStyle: (r, ctx, store) => {
        void ctx;
        const c = store.findRelatedLineColor(r) ?? "#4b5563";
        return {
          color: c,
          opacity: 0.85,
          weight: 2,
          fillColor: c,
          fillOpacity: 0.28,
        };
      },

      label: {
        enabled: true,
        styleKey: "bubble-dark-13",
        placement: "center",
        // 类 STA：中心点（dot）+ 右侧文字（candidates:['E']）
        withDot: true,
        textFrom: (r) => {
          const name = String((r.featureInfo as any)?.Name ?? "").trim();
          if (name) return name;
          return fmtFloorLabel(
            (r.featureInfo as any)?.[DEFAULT_FLOOR_VIEW.floorSelectorField],
          );
        },
        minLevel: DEFAULT_FLOOR_VIEW.minLevel,
        declutter: {
          // 楼层页面强制显示（同 STF）：
          // - allowHide=false => 放不下也不隐藏（可能发生重叠）
          priority: 999,
          minSpacingPx: 0,
          candidates: ["E"],
          allowHide: false,
          allowAbbrev: true,
          abbrev: (s) => (s.length > 10 ? s.slice(0, 10) + "…" : s),
        },
      },
      labelClick: {
        enabled: true,
        mode: "normal",
        labelStyleKey: "bubble-dark-13",
        highlightStyleKey: "dash",
        openCard: true,
      },
    },
  },

  // 车站建筑点（示例：SBP）
  // - 展示外部图标
  // - 若同 idValue 的 STB 存在，则不渲染 SBP（示例：“若xxx存在则不渲染xxx”）
  // ------------------------------
  {
    name: "车站建筑点 SBP：外部图标 + 存在性隐藏（示例，可按需改写）",
    match: { Class: "SBP", Type: "Points" },
    zoom: [0, 99],
    display: DISPLAY_POI_POINT,
    hideIfSameIdExistsInClasses: ["STB"],
    symbol: {
      point: {
        pane: "ria-point-top",
        kind: "icon",
        iconUrlFrom: "iconUrl",
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      },
      label: {
        enabled: true,
        styleKey: "bubble-dark-14",
        placement: "near",
        minLevel: 6,
        textFrom: (r) => String((r.featureInfo as any)?.Name ?? "").trim(),
      },
    },
  },

  // ------------------------------

  // ------------------------------
  // 地物点 ISP
  // ------------------------------
  {
    name: "地物点 ISP：圆点 + label",
    match: { Class: "ISP", Type: "Points" },
    zoom: [0, 99],
    display: DISPLAY_POI_POINT,
    symbol: {
      point: {
        pane: "ria-point-top",
        kind: "circle",
        radius: 4,
        style: {
          color: "#111827",
          opacity: 0.9,
          weight: 2,
          fillColor: "#f97316",
          fillOpacity: 0.75,
        },
      },
      label: {
        enabled: true,
        styleKey: "bubble-dark-14",
        minLevel: 4,
        placement: "center",
        textFrom: (r) => String((r.featureInfo as any)?.Name ?? "").trim(),
        offsetY: 0,
        withDot: false,
        declutter: {
          priority: 10,
          minSpacingPx: 6,
          candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
          allowHide: true,
          allowAbbrev: true,
          abbrev: (s) => (s.length > 10 ? s.slice(0, 10) + "…" : s),
        },
      },
      // 允许点本体点击打开信息卡（与 STA 一致：label 点击 + 几何点击）
      labelClick: {
        enabled: true,
        mode: "labelOnly",
        labelStyleKey: "bubble-dark-14",
        pointPinStyleKey: "pin-red",
        openCard: true,
        geom: { point: true },
      },
    },
  },

  // ------------------------------
  // 地物线 ISL
  // ------------------------------
  {
    name: "地物线 ISL：线 + label",
    match: { Class: "ISL", Type: "Polyline" },
    zoom: [0, 99],
    display: DISPLAY_ISL_NETWORK,
    symbol: {
      pathStyle: { color: "#111827", opacity: 0.85, weight: 1 },
      label: (r) => {
        const fi: any = r.featureInfo ?? {};
        const tags: any = fi.tags ?? fi.Tags ?? {};
        const kind = String(
          fi.PLineKind ?? fi.Kind ?? tags.PLineKind ?? tags.Kind ?? "",
        ).trim();
        const skind = String(
          fi.PLineSKind ?? fi.SKind ?? tags.PLineSKind ?? tags.SKind ?? "",
        ).trim();
        const sk2 = String(
          fi.PLineSKind2 ?? fi.SKind2 ?? tags.PLineSKind2 ?? tags.SKind2 ?? "",
        ).trim();

        const isWaterway =
          kind === "NGF" && skind === "WTR" && (sk2 === "RVR" || sk2 === "CAN");
        const styleKey = isWaterway ? "gm-wtb-16" : "gm-outline";

        return {
          enabled: true,
          styleKey: styleKey as any,
          placement: "center",
          minLevel: 0,
          textFrom: (rr) => String((rr.featureInfo as any)?.Name ?? "").trim(),
          declutter: {
            priority: 10,
            minSpacingPx: 6,
            candidates: ["C"],
            lineLabelMode: "strictOnLine",
            anchorMode: "polyline-stable",
            anchorSamples: 7,
            allowHide: true,
            allowAbbrev: true,
            abbrev: (s) => (s.length > 10 ? s.slice(0, 10) + "…" : s),
          },
        };
      },
      // 允许线本体点击打开信息卡
      labelClick: (r) => {
        const fi: any = r.featureInfo ?? {};
        const tags: any = fi.tags ?? fi.Tags ?? {};
        const kind = String(
          fi.PLineKind ?? fi.Kind ?? tags.PLineKind ?? tags.Kind ?? "",
        ).trim();
        const skind = String(
          fi.PLineSKind ?? fi.SKind ?? tags.PLineSKind ?? tags.SKind ?? "",
        ).trim();
        const sk2 = String(
          fi.PLineSKind2 ?? fi.SKind2 ?? tags.PLineSKind2 ?? tags.SKind2 ?? "",
        ).trim();

        const isWaterway =
          kind === "NGF" && skind === "WTR" && (sk2 === "RVR" || sk2 === "CAN");
        const labelStyleKey = isWaterway ? "gm-wtb-16" : "gm-outline";

        return {
          enabled: true,
          mode: "labelOnly",
          labelStyleKey: labelStyleKey as any,
          highlightStyleKey: "dash",
          openCard: true,
          geom: { path: true },
        };
      },
    },
  },

  // ------------------------------
  // 地物面 ISG
  // ------------------------------
  {
    name: "地物面 ISG：面 + label",
    match: { Class: "ISG", Type: "Polygon" },
    zoom: [0, 99],
    display: DISPLAY_ISG_SURFACE,
    // 字段解析接口：Kind / SKind / SKind2 的组合（用于对“通用要素集”的子类细分）
    // - 约定优先读取 featureInfo.PGonKind / PGonSKind / PGonSKind2
    // - 允许从 tags.* 兜底（便于后续扩展/兼容旧数据）
    visible: (r, ctx) => {
      const fi: any = r.featureInfo ?? {};
      const tags: any = fi.tags ?? fi.Tags ?? {};
      const kind = String(
        fi.PGonKind ?? fi.Kind ?? tags.PGonKind ?? tags.Kind ?? "",
      ).trim();
      const skind = String(
        fi.PGonSKind ?? fi.SKind ?? tags.PGonSKind ?? tags.SKind ?? "",
      ).trim();
      const sk2 = String(
        fi.PGonSKind2 ?? fi.SKind2 ?? tags.PGonSKind2 ?? tags.SKind2 ?? "",
      ).trim();

      const zoom = Number(ctx.zoomLevel ?? 0);
      const isNGF_LAD = kind === "NGF" && skind === "LAD";
      const isNGF_WTB = kind === "NGF" && skind === "WTB";
      const isNGF_LIS = kind === "NGF" && skind === "LIS";
      const isADM_DBZ = kind === "ADM" && skind === "DBZ";
      const isADM_PLZ = kind === "ADM" && skind === "PLZ";

      if (isNGF_LAD) {
        if (sk2 === "CON") return zoom <= 4;
        if (sk2 === "PEN" || sk2 === "ISD" || sk2 === "IST") return zoom > 2;
        // 未定义 SKind2：默认按“大于4显示”处理，避免低缩放过密；后续可按需要细分。
        return zoom > 4;
      }

      if (isNGF_WTB) {
        if (sk2 === "SEA") return zoom < 4;
        return zoom > 4;
      }

      if (isNGF_LIS) {
        return zoom > 4;
      }

      if (isADM_DBZ || isADM_PLZ) {
        if (sk2 === "L1") return zoom > 3 && zoom < 5;
        if (sk2 === "L2") return zoom > 5 && zoom < 7;
        if (sk2 === "L3") return zoom > 7 && zoom < 9;
        return false;
      }

      return true;
    },
    symbol: {
      pathStyle: (r) => {
        const fi: any = r.featureInfo ?? {};
        const tags: any = fi.tags ?? fi.Tags ?? {};
        const kind = String(
          fi.PGonKind ?? fi.Kind ?? tags.PGonKind ?? tags.Kind ?? "",
        ).trim();
        const skind = String(
          fi.PGonSKind ?? fi.SKind ?? tags.PGonSKind ?? tags.SKind ?? "",
        ).trim();

        // 字段解析接口：NGF-LIS —— 常态不显示边界，仅保留 label（点击 label 高亮显示边界并弹信息卡）
        if (kind === "NGF" && skind === "LIS") {
          return { opacity: 0, fillOpacity: 0, weight: 0 };
        }

        return {
          color: "#111827",
          opacity: 0.65,
          weight: 1,
          fillColor: "#60a5fa",
          fillOpacity: 0.1,
        };
      },

      // label 允许动态返回 styleKey / minLevel（避免因 findFirstRule 的“单规则”机制导致无法细分子类样式）
      label: (r) => {
        const fi: any = r.featureInfo ?? {};
        const tags: any = fi.tags ?? fi.Tags ?? {};
        const kind = String(
          fi.PGonKind ?? fi.Kind ?? tags.PGonKind ?? tags.Kind ?? "",
        ).trim();
        const skind = String(
          fi.PGonSKind ?? fi.SKind ?? tags.PGonSKind ?? tags.SKind ?? "",
        ).trim();
        const sk2 = String(
          fi.PGonSKind2 ?? fi.SKind2 ?? tags.PGonSKind2 ?? tags.SKind2 ?? "",
        ).trim();

        const isNGF_LAD = kind === "NGF" && skind === "LAD";
        const isNGF_WTB = kind === "NGF" && skind === "WTB";
        const isNGF_LIS = kind === "NGF" && skind === "LIS";
        const isADM_DBZ = kind === "ADM" && skind === "DBZ";
        const isADM_PLZ = kind === "ADM" && skind === "PLZ";

        const styleKey = (() => {
          if (isNGF_LAD) {
            if (sk2 === "CON") return "gm-bw-21";
            if (sk2 === "SBC") return "gm-bw-18";
            if (sk2 === "RGC") return "gm-bw-15";
            if (sk2 === "ISD") return "gm-bw-18";
            // 半岛/地峡/其他 LAD 子类
            return "gm-bw-15";
          }
          if (isNGF_WTB) {
            if (sk2 === "SEA") return "gm-wtb-21";
            if (sk2 === "LKE") return "gm-wtb-18";
            if (sk2 === "STR" || sk2 === "EST") return "gm-wtb-15";
            return "gm-wtb-15";
          }
          if (isNGF_LIS) {
            // 山区/盆地/平原：统一 15
            return "gm-bw-15";
          }
          if (isADM_DBZ || isADM_PLZ) {
            if (sk2 === "L1") return "gm-bw-19";
            if (sk2 === "L2") return "gm-bw-17";
            if (sk2 === "L3") return "gm-bw-15";
            // PLZ: UP/UC
            if (isADM_PLZ && (sk2 === "UP" || sk2 === "UC")) return "gm-bw-16";
            return "gm-bw-15";
          }
          return "gm-outline";
        })();
        const minLevel =
          isADM_DBZ || isADM_PLZ
            ? 0
            : isNGF_LAD || isNGF_WTB || isNGF_LIS
              ? 0
              : 2;

        return {
          enabled: true,
          styleKey: styleKey as any,
          placement: "center",
          minLevel,
          textFrom: (rr) => String((rr.featureInfo as any)?.Name ?? "").trim(),
          declutter: {
            priority: 10,
            minSpacingPx: 6,
            candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
            allowHide: true,
            allowAbbrev: true,
            abbrev: (s) => (s.length > 10 ? s.slice(0, 10) + "…" : s),
          },
        };
      },
      // label 点击 + 面本体点击：打开信息卡
      labelClick: (r) => {
        const fi: any = r.featureInfo ?? {};
        const tags: any = fi.tags ?? fi.Tags ?? {};
        const kind = String(
          fi.PGonKind ?? fi.Kind ?? tags.PGonKind ?? tags.Kind ?? "",
        ).trim();
        const skind = String(
          fi.PGonSKind ?? fi.SKind ?? tags.PGonSKind ?? tags.SKind ?? "",
        ).trim();
        const sk2 = String(
          fi.PGonSKind2 ?? fi.SKind2 ?? tags.PGonSKind2 ?? tags.SKind2 ?? "",
        ).trim();

        const isNGF_LAD = kind === "NGF" && skind === "LAD";
        const isNGF_WTB = kind === "NGF" && skind === "WTB";
        const isNGF_LIS = kind === "NGF" && skind === "LIS";
        const isADM_DBZ = kind === "ADM" && skind === "DBZ";
        const isADM_PLZ = kind === "ADM" && skind === "PLZ";

        const labelStyleKey = (() => {
          if (isNGF_LAD) {
            if (sk2 === "CON") return "gm-bw-21";
            if (sk2 === "SBC") return "gm-bw-18";
            if (sk2 === "RGC") return "gm-bw-15";
            if (sk2 === "ISD") return "gm-bw-18";
            return "gm-bw-15";
          }
          if (isNGF_WTB) {
            if (sk2 === "SEA") return "gm-wtb-21";
            if (sk2 === "LKE") return "gm-wtb-18";
            if (sk2 === "STR" || sk2 === "EST") return "gm-wtb-15";
            return "gm-wtb-15";
          }
          if (isNGF_LIS) return "gm-bw-15";
          if (isADM_DBZ || isADM_PLZ) {
            if (sk2 === "L1") return "gm-bw-19";
            if (sk2 === "L2") return "gm-bw-17";
            if (sk2 === "L3") return "gm-bw-15";
            if (isADM_PLZ && (sk2 === "UP" || sk2 === "UC")) return "gm-bw-16";
            return "gm-bw-15";
          }
          return "gm-outline";
        })();

        return {
          enabled: true,
          mode: "labelOnly",
          labelStyleKey: labelStyleKey as any,
          highlightStyleKey: "dash",
          openCard: true,
          //geom: { polygon: true },
        };
      },
    },
  },

  // ------------------------------
  // 交易点 TRP（Point）
  // - STA 风格：圆心 + label，支持避让与点击交互
  // - zoom > 4 才显示
  // ------------------------------
  {
    name: "交易点 TRP：STA 风格（绿色圆心，zoom>4）",
    // TRP is always a point feature, but historical/imported data may have inconsistent Type values.
    // Avoid hiding TRP after schema normalization by matching only by Class.
    match: { Class: "TRP" },
    zoom: [5, 99],
    display: DISPLAY_POI_POINT,
    symbol: {
      pane: "ria-point-top",
      point: {
        kind: "circle",
        radius: 4,
        style: {
          color: "#111827",
          opacity: 0.9,
          weight: 2,
          fillColor: "#22c55e",
          fillOpacity: 0.85,
        },
      },
      label: {
        enabled: true,
        styleKey: "bubble-dark-14",
        minLevel: 5,
        placement: "center",
        // New normalized schema: self name is always `Name`
        textFrom: (r) => String((r.featureInfo as any)?.Name ?? "").trim(),
        declutter: {
          priority: 10,
          minSpacingPx: 6,
          candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
          allowHide: true,
          allowAbbrev: true,
          abbrev: (s) => (s.length > 6 ? s.slice(0, 6) + "…" : s),
        },
      },
      labelClick: {
        enabled: true,
        mode: "normal",
        openCard: true,
        highlightStyleKey: "dash",
        geom: { point: true },
      },
    },
  },

  // ------------------------------
  // 传送点 TPP（Point）
  // - STA 风格：圆心 + label，支持避让与点击交互
  // - zoom > 4 才显示
  // ------------------------------
  {
    name: "传送点 TPP：STA 风格（橙色圆心，zoom>4）",
    match: { Class: "TPP" },
    zoom: [5, 99],
    display: DISPLAY_POI_POINT,
    symbol: {
      pane: "ria-point-top",
      point: {
        kind: "circle",
        radius: 4,
        style: {
          color: "#111827",
          opacity: 0.9,
          weight: 2,
          fillColor: "#f97316",
          fillOpacity: 0.85,
        },
      },
      label: {
        enabled: true,
        styleKey: "bubble-dark-14",
        minLevel: 5,
        placement: "center",
        textFrom: (r) => String((r.featureInfo as any)?.Name ?? "").trim(),
        declutter: {
          priority: 10,
          minSpacingPx: 6,
          candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
          allowHide: true,
          allowAbbrev: true,
          abbrev: (s) => (s.length > 6 ? s.slice(0, 6) + "…" : s),
        },
      },
      labelClick: {
        enabled: true,
        mode: "normal",
        openCard: true,
        highlightStyleKey: "dash",
        geom: { point: true },
      },
    },
  },

  // ------------------------------
  // 传送点 TPP（Point）
  // - STA 风格：圆心 + label，支持避让与点击交互
  // - zoom > 4 才显示
  // ------------------------------
  {
    name: "传送点 WRP：STA 风格（橙色圆心，zoom>4）",
    match: { Class: "WRP" },
    zoom: [5, 99],
    display: DISPLAY_POI_POINT,
    symbol: {
      pane: "ria-point-top",
      point: {
        kind: "circle",
        radius: 4,
        style: {
          color: "#111827",
          opacity: 0.9,
          weight: 2,
          fillColor: "#f97316",
          fillOpacity: 0.85,
        },
      },
      label: {
        enabled: true,
        styleKey: "bubble-dark-14",
        minLevel: 5,
        placement: "center",
        textFrom: (r) => String((r.featureInfo as any)?.Name ?? "").trim(),
        declutter: {
          priority: 10,
          minSpacingPx: 6,
          candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
          allowHide: true,
          allowAbbrev: true,
          abbrev: (s) => (s.length > 6 ? s.slice(0, 6) + "…" : s),
        },
      },
      labelClick: {
        enabled: true,
        mode: "normal",
        openCard: true,
        highlightStyleKey: "dash",
        geom: { point: true },
      },
    },
  },

  // 点要素：外部图标 + label（示例）
  // ------------------------------
  {
    name: "点要素（示例）：若 featureInfo.iconUrl 存在则使用外部图标，并在附近显示 name label",
    match: { Type: "Points" },
    zoom: [0, 99],
    display: DISPLAY_GENERIC_POINT,
    symbol: {
      point: (r) => {
        const url = String((r.featureInfo as any)?.iconUrl ?? "").trim();
        if (url) {
          return {
            kind: "icon",
            iconUrl: url,
            iconSize: [24, 24],
            iconAnchor: [12, 24],
          };
        }
        return {
          kind: "circle",
          radius: 5,
          style: {
            color: "#111827",
            opacity: 0.9,
            weight: 2,
            fillColor: "#f97316",
            fillOpacity: 0.6,
          },
        };
      },
      label: {
        // RB_SLU_5：未注册点要素不再主动显示 label，避免 fallback 污染地图。
        // 已注册 POI / STA / PLF / TRP / TPP / WRP 仍由各自规则显示 label。
        enabled: false,
        styleKey: "bubble-dark-14",
        placement: "near",
        minLevel: 6,
        textFrom: (r) =>
          String(
            (r.featureInfo as any)?.name ??
              (r.featureInfo as any)?.staName ??
              "",
          ).trim(),
      },
    },
  },

  // ------------------------------
  // 通用 fallback：线/面
  // ------------------------------
  {
    name: "通用：Polyline 默认样式",
    match: { Type: "Polyline" },
    zoom: [0, 99],
    display: DISPLAY_FALLBACK_LINE,
    symbol: {
      pathStyle: { color: "#111827", opacity: 0.85, weight: 3 },
    },
  },
  {
    name: "通用：Polygon 默认样式",
    match: { Type: "Polygon" },
    zoom: [0, 99],
    display: DISPLAY_FALLBACK_POLYGON,
    symbol: {
      pathStyle: {
        color: "#111827",
        opacity: 0.85,
        weight: 2,
        fillColor: "#60a5fa",
        fillOpacity: 0.08,
      },
    },
  },
];

export const FEATURE_RENDER_RULES: RenderRule[] = LEGACY_FEATURE_RENDER_RULES.map((rule) =>
  applyConfigDisplayOverlayToRule(rule),
);
