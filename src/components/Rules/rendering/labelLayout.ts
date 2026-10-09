import { placeLabel, labelCandidateShift } from './labelPlacement';
import * as L from "leaflet";
import {
  LabelDensityLimiter,
  DEFAULT_LABEL_DENSITY_REDUCE_ORDER,
  resolveLabelDensityConfig,
  type ResolvedLabelDensityConfig,
  type LabelDensityReduceStep,
} from "./label/labelDensity";
import {
  getDefaultLabelPlacementCache,
  resolveLabelPlacementCacheConfig,
  type ResolvedLabelPlacementCacheConfig,
} from "./label/labelPlacementCache";
import {
  buildTextPathApproxMetrics,
  isMostlyCjkText,
} from "./label/labelTextPath";
import { buildCjkGlyphPathApproxMetricsResult } from "./label/labelGlyphPath";
import { buildLineTextRepositionCandidates } from "./label/labelLineChainageReposition";
import { resolveLineTextViewportRect } from "./label/labelLineViewportGate";
import type {
  LineLabelViewportAttemptAudit,
  LineLabelViewportFailureSubtype,
} from "@/components/Rules/debug/lineLabelAudit";
import type { PolygonLayoutCandidateAudit } from "@/components/Rules/debug/polygonLabelAudit";
import type {
  DisplayAnchorConfig,
  TextPathStatus,
  DisplayCollisionBlockTarget,
  DisplayCollisionRole,
  DisplayCollisionTarget,
} from "./display/displayTypes";

type LabelPlacement = "center" | "near" | "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW" | "aboveLine" | "belowLine";

/**
 * LabelLayout 引擎（屏幕空间去重/避让）
 *
 * 设计目标：
 * - 将 label 的“显示/隐藏/摆放位置选择”从具体渲染逻辑中抽离为独立模块
 * - 基于屏幕像素（containerPoint）做碰撞检测与候选位置选择
 * - 通过规则（LabelPlan.declutter）提供可维护的外部接口
 *
 * 说明：
 * - 本模块不创建 Leaflet 图层；它只产出每个 label 的最终像素偏移（dx/dy）与是否显示。
 * - 你可以在 RuleDrivenLayer 中，将 dx/dy 叠加到 anchor 的 containerPoint，再转回 latlng，
 *   继续复用你现有的 makeLabelMarker（从而不改变原 label 的 CSS 风格）。
 */

// ---------------------------- 可调参数接口（预留） ----------------------------

export type LabelLayoutParams = {
  /** 视口边缘留白（px）。label bbox 超出该范围则视为“不可放置” */
  viewportPaddingPx: number;
  /** 碰撞检测的最小间距（px），会对 bbox 做 inflate */
  minSpacingPx: number;
  /** label 候选点与 anchor 的额外“间隙”（px） */
  gapPx: number;
  /** 用于空间索引的网格大小（px），越大越快但粗糙，越小越准但更慢 */
  gridCellPx: number;
  /** 单次布局最多尝试的候选数（防止写太多 candidates 导致卡顿） */
  maxCandidatesPerLabel: number;
  /** 是否允许 label 放到视口之外（一般不允许） */
  allowOutsideViewport: boolean;
};

export const DEFAULT_LABEL_LAYOUT_PARAMS: LabelLayoutParams = {
  viewportPaddingPx: 6,
  minSpacingPx: 3,
  gapPx: 6,
  gridCellPx: 80,
  maxCandidatesPerLabel: 10,
  allowOutsideViewport: false,
};

let _runtimeParams: LabelLayoutParams = { ...DEFAULT_LABEL_LAYOUT_PARAMS };

/**
 * 外部可调用：覆盖默认参数（例如你希望提高性能/更宽松/更严格）
 * - 建议在应用启动或 RuleDrivenLayer 初始化时调用一次即可
 */
export function setLabelLayoutParams(patch: Partial<LabelLayoutParams>) {
  _runtimeParams = { ..._runtimeParams, ...patch };
}

export function getLabelLayoutParams(): LabelLayoutParams {
  return { ..._runtimeParams };
}

// ---------------------------- 外部接口（规则层） ----------------------------

export type LabelCandidateName =
  | "C"
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW";

export type LabelCandidate = {
  /** 候选位置名称。若 dx/dy 不给，则由引擎按名称自动计算 */
  name: LabelCandidateName;
  /** 可选：自定义像素偏移（相对 anchor 的 containerPoint） */
  dx?: number;
  dy?: number;
  /**
   * 候选评分偏移（越大越优先）。
   * 默认按 candidates 顺序 + score 排序。
   */
  score?: number;
};

export type LabelDeclutterStrategy = "greedy";

export type LineLabelMode = "free" | "strictOnLine";
export type LineTextMode = "rotatedLabel" | "textPath" | "auto";
export type TextPathFallbackMode = "rotatedLabel" | "hide" | "svgStraightLabel";

export type LabelDeclutterConfig = {
  /** 布局策略（预留，当前实现 greedy） */
  strategy?: LabelDeclutterStrategy;

  /** 候选位置列表。不给则按 placement 自动生成 */
  candidates?: Array<LabelCandidate | LabelCandidateName>;

  /** 优先级：越大越先放（同优先级再看更靠近屏幕中心） */
  priority?: number;

  /**
   * RB_SLU_4: DisplayPlan 碰撞信息的只读镜像。
   * - 当前 labelLayout 仍然使用 priority / allowHide / groupKey 执行旧式 greedy 布局；
   * - 这些字段用于把 DisplayPlan 的 role/group/hidePolicy 随请求进入布局层，
   *   后续 patch 可在不改规则注册文件的情况下升级为完整碰撞矩阵。
   */
  collisionRole?: DisplayCollisionRole;
  collisionGroup?: string;
  hidePolicy?:
    | "hide"
    | "abbreviateThenHide"
    | "forceShow"
    | "showWithoutBlocking"
    | "geometryOnly";
  /** RB_SLU_9: optional explicit collision matrix fields copied from DisplayPlan.collision. */
  collisionAllowOverlap?: boolean;
  collisionCollideWith?: DisplayCollisionTarget[];
  collisionBlocks?: DisplayCollisionBlockTarget[];

  /**
   * RB_SLU_6: 高密度 label 降级元数据。
   * - 当前执行层只消费 label density：每个屏幕网格最多保留若干同组 label；
   * - required label 会按 densityPreserveRequired 默认穿透密度限制；
   * - reduceOrder 先作为只读审计字段进入布局层，后续可继续扩展为更细的降级策略。
   */
  densityEnabled?: boolean;
  densityGridSizePx?: number;
  densityMaxLabelsPerGrid?: number;
  densityPreserveRequired?: boolean;
  densityPreserveSelected?: boolean;
  placementInvalidateWhen?: string[];
  densityGroupKey?: string;
  densityReduceOrder?: LabelDensityReduceStep[];

  /**
   * RB_SLU_7: label placement cache 元数据。
   * - 只缓存上一次成功的 anchor/candidate 选择；
   * - 下一次布局仍会重新经过 viewport / collision / density 检查；
   * - 因此它只提升稳定性，不会绕过避让。
   */
  placementCacheEnabled?: boolean;
  placementCacheKey?:
    | "featureID"
    | "featureID+zoomBucket"
    | "featureID+mode"
    | "custom"
    | string;
  placementCacheCustomKey?: string;
  placementZoomBucketSize?: number;
  placementKeepPreviousCandidate?: boolean;
  placementKeepPreviousAnchor?: boolean;

  /**
   * RB_SLU_13: line label mode.
   * - free keeps the legacy screen-candidate behavior.
   * - strictOnLine only tries the C candidate at line-derived anchors, so a line label never floats away from its polyline.
   */
  lineLabelMode?: LineLabelMode;

  /** RB_SLU_17: pure line-text SVG textPath mode. */
  lineTextMode?: LineTextMode;
  textPathFallback?: TextPathFallbackMode;

  /** label 碰撞间距（覆盖全局 minSpacingPx） */
  minSpacingPx?: number;

  /** 同组控制：每组最多显示多少个（可用于避免同类 label 太密） */
  groupKey?: string;
  maxPerScreen?: number;

  /** 若放不下，是否允许隐藏（默认 true） */
  allowHide?: boolean;

  /** 若放不下，是否允许使用缩略文本（需要提供 abbrev） */
  allowAbbrev?: boolean;
  abbrev?: (text: string) => string;

  /** 覆盖全局视口留白（px） */
  viewportPaddingPx?: number;
};

export type LabelRequest = {
  /** 唯一 id（建议：`${uid}#label`） */
  id: string;
  /** 对应 Feature uid（便于回写到 bundle.label） */
  featureUid?: string;
  partIndex?: number;
  collisionOwnerUid?: string;
  /** label anchor（世界坐标） */
  anchorLatLng: L.LatLng;

  /**
   * 可选：额外的 anchor 候选点（用于“沿线尝试其它中心点”）。
   * - 由调用侧（RuleDrivenLayer）按要素几何计算。
   * - 布局引擎会按顺序依次尝试，找到可放置的位置即停。
   */
  anchorCandidatesLatLng?: L.LatLng[];
  /** Native polygon anchor containment policy, including holes and parts. */
  acceptsAnchor?: (screenPoint: L.Point) => boolean;
  collisionBoundsAdjustment?: { x?: number; y?: number; width?: number; height?: number };

  /** label 文本 */
  text: string;

  /** 可选：渲染旋转角（deg）。主要用于“沿线文字”样式。 */
  rotateDeg?: number;

  /**
   * 可选：当 anchorCandidatesLatLng 存在时，为每个候选 anchor 提供对应的旋转角（deg）。
   * - 长度应与 anchorCandidatesLatLng 一致
   * - 若缺失/长度不匹配，则退回使用 rotateDeg
   */
  rotateDegCandidates?: number[];

  /** RB_SLU_17: one path candidate per anchor index, used by RuleDrivenLayer for optional SVG textPath rendering. */
  anchorCandidateIds?: string[];
  anchorCandidateSourceIndexes?: number[];
  anchorCandidateDisplayOrders?: number[];

  lineTextPathCandidates?: Array<{
    candidateId?: string;
    sourceIndex?: number;
    displayOrder?: number;
    kind?: string;
    chainage?: number;
    totalLengthWorld?: number;
    pathLatLngs: L.LatLng[];
    fullPathLatLngs?: L.LatLng[];
    pathLengthWorld?: number;
    staticWeight?: number;
    finalScore?: number;
    scoreParts?: unknown;
  }>;
  lineTextMode?: LineTextMode;
  textPathFallback?: TextPathFallbackMode;
  textPathBudgetStatus?: "allowed" | "disabled" | "budgetExceeded";
  textPathFallbackReason?: string;
  textPathStatus?: TextPathStatus;
  glyphPathBudgetStatus?: "allowed" | "disabled" | "budgetExceeded";
  glyphPathFallbackReason?: string;
  glyphPathGlyphCount?: number;
  displayAnchor?: Partial<DisplayAnchorConfig>;
  /** RB_SLU_A1: polygon geo-anchor diagnostics passed from labelAnchor. */
  geoAnchorDebug?: unknown;

  /** 复用现有 makeLabelMarker 的 placement（决定 CSS transform 参考点） */
  placement: LabelPlacement;

  offsetY?: number;
  offsetX?: number;
  screenOffsets?: boolean;
  /** A true point may participate in its label's combined collision box. */
  symbolBounds?: { radius: number; offsetX: number; offsetY: number };
  candidatePlacement?: 'relativeToPlacement' | 'aroundAnchor';
  candidateOffsetsPx?: Array<{ name: string; x: number; y: number }>;
  anchorOffsetPx?: { x: number; y: number };
  selected?: boolean;
  worldId?: string;
  displayMode?: string;
  geometrySignature?: string;
  runtimeStability?: import('@/configStudio/types').RenderStabilityExtension;
  densityImportance?: number;
  symbolDensityBlocked?: boolean;

  /** 是否带中心点（影响 bbox 宽度估计） */
  withDot?: boolean;

  /** dot 与文字的锚定语义：anchorRight 表示 dot 中心严格落在候选点上，文字向右展开。 */
  dotAnchorMode?: "inline" | "anchorRight";

  /** 规则层传入的避让配置 */
  declutter: LabelDeclutterConfig;

  /**
   * 可选：用于测量文字尺寸的 font（越接近你 CSS 的字体越准）
   * - 不给则用默认字体估计
   */
  font?: string;
};

export type LabelHiddenReason =
  | "notPlaced"
  | "viewport"
  | "collision"
  | "collisionRequired"
  | "collisionImportant"
  | "collisionOptional"
  | "collisionSoft"
  | "collisionSymbol"
  | "groupLimit"
  | "densityLimit"
  | "hiddenByPolicy";

export type PlacedLabel = {
  /** Ordered density actions actually applied; useful for acceptance diagnostics. */
  densityActionTrace?: LabelDensityReduceStep[];
  id: string;
  featureUid?: string;
  text: string;
  /** 相对 anchor 的像素偏移（containerPoint 坐标系） */
  dx: number;
  dy: number;
  hidden: boolean;
  hideSymbol?: boolean;
  keepGeometry?: boolean;
  /** Actual expanded collision rectangle, used unchanged by placement reuse. */
  collisionRect?: Rect;
  /** RB_SLU_6: 调试/审计用隐藏原因；渲染层可忽略。 */
  hiddenReason?: LabelHiddenReason;

  /** RB_SLU_7: 调试/审计用最终候选位；渲染层可忽略。 */
  candidateName?: LabelCandidateName;
  /** RB_SLU_7: 调试/审计用最终 anchor 候选序号；渲染层可忽略。 */
  anchorCandidateIndex?: number;
  /** RB_SLU_21: stable anchor candidate identity. */
  anchorCandidateId?: string;
  anchorCandidateSourceIndex?: number;
  anchorCandidateDisplayOrder?: number;
  textPathBudgetStatus?: "allowed" | "disabled" | "budgetExceeded";
  textPathFallbackReason?: string;
  /** RB_SLU_20: weighted candidate diagnostics. */
  candidateStaticWeight?: number;
  candidateScore?: number;
  candidateScoreParts?: unknown;
  /** RB_SLU_20: textPath / vertical / fallback decision diagnostics. */
  textPathStatus?: TextPathStatus;
  /** RB_SLU_22: CJK glyph-on-path diagnostics. */
  glyphPathStatus?: "allowed" | "disabled" | "budgetExceeded";
  glyphPathFallbackReason?: string;
  glyphPathGlyphCount?: number;
  glyphPathUsed?: boolean;
  glyphPathCompactUsed?: boolean;
  glyphPathAdvanceScale?: number;
  glyphPathRenderable?: boolean;
  glyphPathFailureReason?: string;
  lineTextPathSignature?: string;
  lineTextZoomBucket?: number;
  lineTextPathLatLngs?: L.LatLng[];
  lineTextRepositionMode?: string;
  lineTextRepositionUsed?: boolean;
  lineTextRepositionShiftIndex?: number;
  lineTextRepositionBaseCandidateId?: string;
  lineTextRepositionAttempts?: number;
  lineTextRepositionFailureReason?: string;
  lineTextStrictSvgRequired?: boolean;
  lineTextAvoidLineGeometry?: boolean;
  lineTextRealViewportFirst?: boolean;
  lineTextViewportFailureSubtype?: LineLabelViewportFailureSubtype;
  lineTextViewportFailureSummary?: string;
  lineTextViewportBufferPx?: number;
  lineTextViewportSizePx?: { w: number; h: number };
  lineTextViewportAttempts?: LineLabelViewportAttemptAudit[];
  lineTextViewportBestAttempt?: LineLabelViewportAttemptAudit;
  lineTextAnyAttemptAnchorInsideViewport?: boolean;
  lineTextAnyAttemptRectInsideViewport?: boolean;
  lineTextAnyAttemptRectOversized?: boolean;
  lineTextSourcePathKind?: "fullPathLatLngs" | "localPathLatLngs" | "unknown";
  lineTextSourcePathPointCount?: number;
  lineTextSourcePathLengthPx?: number;
  lineTextEstimatedLabelSpanPx?: number;
  lineTextEffectiveStepPx?: number;
  lineTextViewportRectMode?: string;
  lineTextViewportCandidateMode?: string;
  lineTextRectSource?: string;
  lineTextRawRectImplausible?: boolean;
  lineTextRawRectCenterDistancePx?: number;
  lineTextViewportTempBase?: boolean;
  lineTextViewportLocalIntervalIndex?: number;
  lineTextViewportLocalIntervalLengthPx?: number;

  /** RB_SLU_A1: polygon label audit diagnostics. */
  polygonLayoutCandidateName?: string;
  polygonLayoutCandidateOffsetPx?: { x: number; y: number };
  polygonFinalLabelPx?: { x: number; y: number };
  polygonLayoutCandidates?: PolygonLayoutCandidateAudit[];
  densityEnabled?: boolean;
  densityPassed?: boolean;
  densityGridKey?: string;
  densityGridSizePx?: number;
  densityCountBefore?: number;
  densityMaxPerGrid?: number;
  densityBlockedReason?: string;
  collisionPassed?: boolean;
  collisionBlockedBy?: PolygonLayoutCandidateAudit["collisionBlockedBy"];

  /** RB_SLU_10: 调试/审计用最终 collision 元数据；渲染层可忽略。 */
  collisionRole?: DisplayCollisionRole;
  collisionGroup?: string;
  priority?: number;

  /**
   * 当某些样式需要“沿线旋转”时，这里给出最终选择 anchor 对应的旋转角。
   * - 若未提供，则渲染侧可继续使用 request.rotateDeg
   */
  rotateDeg?: number;

  /** RB_SLU_17: final line text mode selected for rendering. */
  lineTextMode?: LineTextMode;
  textPathFallback?: TextPathFallbackMode;
};

export type AvoidRectPx = {
  alreadyInflated?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  inflatePx?: number;
  /** 该障碍矩形的归属要素 uid，用于“忽略自己” */
  ownerUid?: string;
  /** RB_SLU_9: obstacle kind used by the label collision matrix. Defaults to symbol. */
  collisionSource?: "symbol" | "geometry" | "label";
  collisionRole?: DisplayCollisionRole;
  collisionGroup?: string;
  priority?: number;
  collisionBlocks?: DisplayCollisionBlockTarget[];
};

// ---------------------------- 核心实现 ----------------------------

type Rect = { x: number; y: number; w: number; h: number };

function rectIntersects(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function inflateRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

type IndexedRect = Rect & {
  ownerUid?: string;
  collisionSource?: "symbol" | "geometry" | "label";
  collisionRole?: DisplayCollisionRole;
  collisionGroup?: string;
  priority?: number;
  collisionBlocks?: DisplayCollisionBlockTarget[];
};

class GridIndex {
  private cell: number;
  private buckets: Map<string, IndexedRect[]> = new Map();

  constructor(cellPx: number) {
    this.cell = Math.max(24, Math.floor(cellPx));
  }

  private key(ix: number, iy: number) {
    return `${ix},${iy}`;
  }

  private cellsForRect(r: Rect) {
    const minX = Math.floor(r.x / this.cell);
    const maxX = Math.floor((r.x + r.w) / this.cell);
    const minY = Math.floor(r.y / this.cell);
    const maxY = Math.floor((r.y + r.h) / this.cell);
    const out: Array<[number, number]> = [];
    for (let ix = minX; ix <= maxX; ix++)
      for (let iy = minY; iy <= maxY; iy++) out.push([ix, iy]);
    return out;
  }

  query(r: Rect): IndexedRect[] {
    const seen = new Set<IndexedRect>();
    for (const [ix, iy] of this.cellsForRect(r)) {
      const bucket = this.buckets.get(this.key(ix, iy));
      if (!bucket) continue;
      for (const it of bucket) seen.add(it);
    }
    return Array.from(seen);
  }

  add(r: IndexedRect) {
    for (const [ix, iy] of this.cellsForRect(r)) {
      const k = this.key(ix, iy);
      const bucket = this.buckets.get(k) ?? [];
      bucket.push(r);
      this.buckets.set(k, bucket);
    }
  }
}

type Measured = { w: number; h: number };
const _measureCache = new Map<string, Measured>();

function getFontSizePx(font: string): number {
  const m = font.match(/(\d+)\s*px/i);
  return m ? Math.max(8, Number(m[1])) : 12;
}

function measureText(
  text: string,
  font: string,
  withDot: boolean,
  dotAnchorMode?: "inline" | "anchorRight",
): Measured {
  const key = `${font}|${withDot ? 1 : 0}|${dotAnchorMode ?? "inline"}|${text}`;
  const hit = _measureCache.get(key);
  if (hit) return hit;

  // SSR/构建环境兜底：用近似估计，避免 document 未定义导致 build 报错
  if (typeof document === "undefined") {
    const fontSize = getFontSizePx(font);
    const approx = {
      w: Math.ceil(text.length * fontSize * 0.62) + 12 + (withDot ? 14 : 0),
      h: Math.ceil(fontSize * 1.35) + 8,
    };
    _measureCache.set(key, approx);
    return approx;
  }

  // canvas measureText
  const canvas =
    (measureText as any).__canvas ||
    ((measureText as any).__canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fontSize = getFontSizePx(font);
    const approx = {
      w: Math.ceil(text.length * fontSize * 0.62) + 12 + (withDot ? 14 : 0),
      h: Math.ceil(fontSize * 1.35) + 8,
    };
    _measureCache.set(key, approx);
    return approx;
  }

  ctx.font = font;
  const metrics = ctx.measureText(text);
  const fontSize = getFontSizePx(font);

  // 你的 label HTML 有 padding + border；这里按经验值加入余量
  const w = Math.ceil(metrics.width) + 12 + (withDot ? 14 : 0);
  const h = Math.ceil(fontSize * 1.35) + 8;

  const measured = { w, h };
  _measureCache.set(key, measured);

  // 简单上限，防止缓存无限增长
  if (_measureCache.size > 5000) {
    const it = _measureCache.keys().next();
    if (!it.done) _measureCache.delete(it.value);
  }

  return measured;
}

/**
 * 根据 placement + offsetY 计算 label bbox（屏幕像素）
 * - 这里要与 makeLabelMarker 的 CSS transform 逻辑保持一致
 */
function computeLabelRect(
  anchor: L.Point,
  size: Measured,
  placement: LabelPlacement,
  offsetY: number,
  dotAnchorMode?: "inline" | "anchorRight",
  offsetX = 0,
  screenOffsets = false,
): Rect {
  if (dotAnchorMode === "anchorRight") {
    // dot-anchor-right：anchor 是 dot 中心，文字从 dot 右侧展开。
    // 左侧预留 dot 半径 + 描边阴影，保证 viewport/collision 盒与视觉一致。
    const dotVisualLeftPadPx = 6;
    const x = anchor.x - dotVisualLeftPadPx;
    const y = anchor.y - size.h / 2;
    return { x, y, w: size.w + dotVisualLeftPadPx, h: size.h };
  }

  return placeLabel(anchor, size, placement, offsetX, offsetY, screenOffsets);
}

function normalizeCandidates(
  req: LabelRequest,
  size: Measured,
  params: LabelLayoutParams,
): LabelCandidate[] {
  const raw = req.candidateOffsetsPx?.length ? req.candidateOffsetsPx.map(offset => ({ name: offset.name as LabelCandidateName, dx: offset.x, dy: offset.y })) : req.declutter.candidates;

  const asCandidate = (
    c: LabelCandidate | LabelCandidateName,
  ): LabelCandidate => {
    if (typeof c === "string") return { name: c };
    return c;
  };

  if (req.declutter?.lineLabelMode === "strictOnLine") {
    return [{ name: "C", dx: 0, dy: 0, score: 100 }];
  }

  const list = (
    raw && raw.length ? raw.map(asCandidate) : defaultCandidates(req.placement, req.screenOffsets)
  ).slice(0, Math.max(1, params.maxCandidatesPerLabel));

  // 将 name 转为 dx/dy（若用户未给 dx/dy）
  return list.map((c, idx) => {
    if (typeof c.dx === "number" && typeof c.dy === "number") return { ...c, dx: c.dx + (req.anchorOffsetPx?.x ?? 0), dy: c.dy + (req.anchorOffsetPx?.y ?? 0) };

    const { dx, dy } = (req.screenOffsets && req.candidatePlacement !== 'aroundAnchor' ? labelCandidateShift : candidateShift)(
      c.name,
      req.placement,
      size,
      params.gapPx,
    );
    return { ...c, dx: dx + (req.anchorOffsetPx?.x ?? 0), dy: dy + (req.anchorOffsetPx?.y ?? 0), score: (c.score ?? 0) + (list.length - idx) * 0.01 };
  });
}

function defaultCandidates(placement: LabelPlacement, screenOffsets = false): LabelCandidate[] {
  if (screenOffsets) return ['C', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].map((name) => ({ name: name as LabelCandidateName }));
  if (placement === "center")
    return [
      { name: "C" },
      { name: "N" },
      { name: "S" },
      { name: "E" },
      { name: "W" },
    ];
  const preferred = placement === 'aboveLine' || placement === 'near' ? 'N' : placement === 'belowLine' ? 'S' : placement as LabelCandidateName;
  const all: LabelCandidateName[] = ['N', 'NE', 'NW', 'E', 'W', 'SE', 'SW', 'S'];
  return [preferred, ...all.filter((candidate) => candidate !== preferred)].map((name) => ({ name }));
}

/**
 * 候选位置 -> anchor 的像素偏移
 * 注意：我们偏移的是“anchor 点”（marker latlng 对应的 containerPoint），而非 bbox 左上角。
 */
function candidateShift(
  name: LabelCandidateName,
  placement: LabelPlacement,
  size: Measured,
  gap: number,
): { dx: number; dy: number } {
  const halfW = size.w / 2;
  const halfH = size.h / 2;

  // 经验偏移：尽量让 bbox 远离 anchor
  if (placement === "center") {
    switch (name) {
      case "C":
        return { dx: 0, dy: 0 };
      case "N":
        return { dx: 0, dy: -(halfH + gap) };
      case "S":
        return { dx: 0, dy: halfH + gap };
      case "E":
        return { dx: halfW + gap, dy: 0 };
      case "W":
        return { dx: -(halfW + gap), dy: 0 };
      case "NE":
        return { dx: halfW + gap, dy: -(halfH + gap) };
      case "NW":
        return { dx: -(halfW + gap), dy: -(halfH + gap) };
      case "SE":
        return { dx: halfW + gap, dy: halfH + gap };
      case "SW":
        return { dx: -(halfW + gap), dy: halfH + gap };
    }
  }

  // placement === 'near'：默认 bbox 已在 anchor 上方；因此更多用“水平”错开
  switch (name) {
    case "N":
      return { dx: 0, dy: 0 };
    case "NE":
      return { dx: halfW + gap, dy: 0 };
    case "NW":
      return { dx: -(halfW + gap), dy: 0 };
    case "E":
      return { dx: halfW + gap, dy: Math.max(0, size.h * 0.25) };
    case "W":
      return { dx: -(halfW + gap), dy: Math.max(0, size.h * 0.25) };
    case "SE":
      return { dx: halfW + gap, dy: size.h + gap };
    case "SW":
      return { dx: -(halfW + gap), dy: size.h + gap };
    case "S":
      return { dx: 0, dy: size.h + gap };
    case "C":
      return { dx: 0, dy: 0 };
  }
}

function inViewport(rect: Rect, size: L.Point, pad: number): boolean {
  const left = pad;
  const top = pad;
  const right = size.x - pad;
  const bottom = size.y - pad;
  return (
    rect.x >= left &&
    rect.y >= top &&
    rect.x + rect.w <= right &&
    rect.y + rect.h <= bottom
  );
}

type LayoutItem = {
  req: LabelRequest;
  anchorPx: L.Point;
  size: Measured;
  candidates: LabelCandidate[];
  priority: number;
  allowHide: boolean;
  allowAbbrev: boolean;
  abbrev?: (s: string) => string;
  groupKey?: string;
  maxPerScreen?: number;
  density?: ResolvedLabelDensityConfig;
  placementCache?: ResolvedLabelPlacementCacheConfig;
  collisionRole: DisplayCollisionRole;
  collisionGroup?: string;
  hidePolicy?: LabelDeclutterConfig["hidePolicy"];
  collisionAllowOverlap?: boolean;
  collisionCollideWith?: DisplayCollisionTarget[];
  collisionBlocks?: DisplayCollisionBlockTarget[];
  lineLabelMode?: LineLabelMode;
  lastFailureReason?: LabelHiddenReason;
  minSpacingPx: number;
  viewportPaddingPx: number;
  centerDist2: number;
};

const DEFAULT_COLLISION_ROLE: DisplayCollisionRole = "optional";

function normalizeCollisionRole(role: unknown): DisplayCollisionRole {
  if (
    role === "required" ||
    role === "important" ||
    role === "optional" ||
    role === "soft" ||
    role === "ignore"
  )
    return role;
  return DEFAULT_COLLISION_ROLE;
}

function collisionRoleOrder(role: DisplayCollisionRole): number {
  switch (role) {
    case "required":
      return 400;
    case "important":
      return 300;
    case "optional":
      return 200;
    case "soft":
      return 100;
    case "ignore":
      return 0;
  }
}

function shouldForceShow(item: LayoutItem): boolean {
  return (
    item.collisionRole === "required" ||
    item.hidePolicy === "forceShow" ||
    item.allowHide === false
  );
}

function blockerTarget(blocker: IndexedRect): DisplayCollisionTarget {
  if (blocker.collisionSource === "symbol") return "symbol";
  if (blocker.collisionSource === "geometry") return "geometry";
  switch (normalizeCollisionRole(blocker.collisionRole)) {
    case "required":
      return "requiredLabel";
    case "important":
      return "importantLabel";
    case "optional":
      return "optionalLabel";
    case "soft":
      return "softLabel";
    case "ignore":
      return "softLabel";
  }
}

function incomingBlockTarget(
  item: LayoutItem,
): DisplayCollisionBlockTarget | undefined {
  if (item.collisionGroup === "poiLabel") return "poiLabel";
  if (item.collisionGroup === "structureLabel") return "structureLabel";
  switch (item.collisionRole) {
    case "optional":
      return "optionalLabel";
    case "soft":
      return "softLabel";
    default:
      return undefined;
  }
}

function doesBlockerExplicitlyBlock(
  blocker: IndexedRect,
  item: LayoutItem,
): boolean | undefined {
  const blocks = blocker.collisionBlocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return undefined;
  const incomingTarget = incomingBlockTarget(item);
  return !!incomingTarget && blocks.includes(incomingTarget);
}

function shouldCollisionBlock(item: LayoutItem, blocker: IndexedRect): boolean {
  if (
    item.collisionAllowOverlap ||
    item.collisionRole === "ignore" ||
    item.hidePolicy === "showWithoutBlocking"
  )
    return false;

  const target = blockerTarget(blocker);
  if (
    Array.isArray(item.collisionCollideWith) &&
    item.collisionCollideWith.length > 0 &&
    !item.collisionCollideWith.includes(target)
  ) {
    return false;
  }

  const explicit = doesBlockerExplicitlyBlock(blocker, item);
  if (typeof explicit === "boolean") return explicit;

  if (target === "symbol") {
    // RB_SLU_9: symbol boxes protect dense low-priority labels but should not suppress
    // required/important surface, network, or interaction labels.
    return (
      item.collisionRole !== "required" && item.collisionRole !== "important"
    );
  }

  if (target === "geometry") {
    return item.collisionRole === "soft" || item.collisionRole === "optional";
  }

  const blockerRole = normalizeCollisionRole(blocker.collisionRole);
  switch (item.collisionRole) {
    case "required":
      return blockerRole === "required";
    case "important":
      return blockerRole === "required" || blockerRole === "important";
    case "optional":
      return (
        blockerRole === "required" ||
        blockerRole === "important" ||
        blockerRole === "optional"
      );
    case "soft":
      return blockerRole !== "ignore";
  }
  return false;
}

function collisionHiddenReason(blocker: IndexedRect): LabelHiddenReason {
  if (blocker.collisionSource === "symbol") return "collisionSymbol";
  switch (normalizeCollisionRole(blocker.collisionRole)) {
    case "required":
      return "collisionRequired";
    case "important":
      return "collisionImportant";
    case "optional":
      return "collisionOptional";
    case "soft":
      return "collisionSoft";
    case "ignore":
      return "collision";
  }
}

function adjustedCollisionRect(rect: Rect, adjustment: LabelRequest['collisionBoundsAdjustment']): Rect {
  return adjustment ? { x: rect.x + (adjustment.x ?? 0), y: rect.y + (adjustment.y ?? 0), w: Math.max(1,rect.w + (adjustment.width ?? 0)), h: Math.max(1,rect.h + (adjustment.height ?? 0)) } : rect;
}

function rectForCandidate(
  item: LayoutItem,
  measured: Measured,
  anchorPxCand: L.Point,
  candidate: LabelCandidate,
): { rect: Rect; dx: number; dy: number } {
  const baseReq = item.req;
  const baseDeltaX = anchorPxCand.x - item.anchorPx.x;
  const baseDeltaY = anchorPxCand.y - item.anchorPx.y;
  const dx = (candidate.dx ?? 0) + baseDeltaX;
  const dy = (candidate.dy ?? 0) + baseDeltaY;
  const anchor = L.point(item.anchorPx.x + dx, item.anchorPx.y + dy);
  let rect = computeLabelRect(
    anchor,
    measured,
    baseReq.placement,
    Number(baseReq.offsetY ?? 0),
    baseReq.dotAnchorMode,
    Number(baseReq.offsetX ?? 0),
    baseReq.screenOffsets,
  );
  if (baseReq.symbolBounds) {
    const symbol = baseReq.symbolBounds;
    const left = Math.min(rect.x, anchor.x + symbol.offsetX - symbol.radius);
    const top = Math.min(rect.y, anchor.y + symbol.offsetY - symbol.radius);
    const right = Math.max(rect.x + rect.w, anchor.x + symbol.offsetX + symbol.radius);
    const bottom = Math.max(rect.y + rect.h, anchor.y + symbol.offsetY + symbol.radius);
    rect = { x: left, y: top, w: right - left, h: bottom - top };
  }
  const adjustment = baseReq.collisionBoundsAdjustment;
  rect = adjustedCollisionRect(rect, adjustment);
  return { rect, dx, dy };
}

function indexedLabelRect(rect: Rect, item: LayoutItem): IndexedRect {
  return {
    ...rect,
    ownerUid: item.req.collisionOwnerUid ?? item.req.featureUid,
    collisionSource: "label",
    collisionRole: item.collisionRole,
    collisionGroup: item.collisionGroup,
    priority: item.priority,
    collisionBlocks: item.collisionBlocks,
  };
}

function isPolygonAuditRequest(req: LabelRequest): boolean {
  const dbg = (req as any).geoAnchorDebug;
  return !!dbg && typeof dbg === "object";
}

function rectToAudit(rect: Rect): { x: number; y: number; w: number; h: number } {
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
}

function pointToAudit(p: L.Point): { x: number; y: number } {
  return { x: p.x, y: p.y };
}

function densityAuditFor(
  limiter: LabelDensityLimiter,
  rect: Rect,
  density: ResolvedLabelDensityConfig | undefined,
): { key?: string; current?: number; max?: number } {
  const inspect = limiter.inspect(rect, density);
  return { key: inspect.key, current: inspect.current, max: inspect.max };
}

type AnchorLayoutCandidate = {
  px: L.Point;
  rotateDeg?: number;
  index: number;
  candidateId?: string;
  sourceIndex?: number;
  displayOrder?: number;
  pathLatLngs?: L.LatLng[];
};

function getLineTextPathCandidate(
  req: LabelRequest,
  ac: { index: number; candidateId?: string; pathLatLngs?: L.LatLng[] },
): NonNullable<LabelRequest["lineTextPathCandidates"]>[number] | undefined {
  if (Array.isArray(ac.pathLatLngs) && ac.pathLatLngs.length >= 2) {
    return {
      candidateId: ac.candidateId,
      pathLatLngs: ac.pathLatLngs,
    } as NonNullable<LabelRequest["lineTextPathCandidates"]>[number];
  }
  const candidates = Array.isArray(req.lineTextPathCandidates)
    ? req.lineTextPathCandidates
    : [];
  if (ac.candidateId) {
    const byId = candidates.find((c) => c.candidateId === ac.candidateId);
    if (byId) return byId;
  }
  return candidates[ac.index];
}

function movePreferredAnchorFirst<
  T extends { index: number; candidateId?: string },
>(
  items: T[],
  preferredIndex: number | undefined,
  enabled: boolean,
  preferredId?: string,
): T[] {
  if (!enabled) return items;
  const idx = preferredId
    ? items.findIndex((it) => it.candidateId === preferredId)
    : typeof preferredIndex === "number"
      ? items.findIndex((it) => it.index === preferredIndex)
      : -1;
  if (idx <= 0) return items;
  return [items[idx], ...items.slice(0, idx), ...items.slice(idx + 1)];
}

function shouldPreferCachedAnchor(
  req: LabelRequest,
  preferredIndex: number | undefined,
  preferredId?: string,
): boolean {
  if (!preferredId && typeof preferredIndex !== "number") return false;
  const lineCandidates = Array.isArray(req.lineTextPathCandidates)
    ? req.lineTextPathCandidates
    : [];
  if (!lineCandidates.length) return true;
  const preferred = preferredId
    ? lineCandidates.find((c) => c.candidateId === preferredId)
    : lineCandidates[preferredIndex ?? -1];
  if (!preferred) return false;
  const anchor = req.displayAnchor ?? {};
  const reuseBonus = Number(anchor.lineCandidateReuseBonus ?? 12);
  const switchThreshold = Number(anchor.lineCandidateSwitchThreshold ?? 16);
  const preferredScore =
    Number(preferred.finalScore ?? preferred.staticWeight ?? 0) +
    (Number.isFinite(reuseBonus) ? reuseBonus : 12);
  let bestScore = -Infinity;
  for (const c of lineCandidates) {
    bestScore = Math.max(
      bestScore,
      Number(c.finalScore ?? c.staticWeight ?? 0),
    );
  }
  if (!Number.isFinite(bestScore)) return true;
  return (
    bestScore <=
    preferredScore + (Number.isFinite(switchThreshold) ? switchThreshold : 16)
  );
}

function movePreferredCandidateFirst(
  candidates: LabelCandidate[],
  preferredName: LabelCandidateName | undefined,
  enabled: boolean,
): LabelCandidate[] {
  if (!enabled || !preferredName) return candidates;
  const idx = candidates.findIndex((it) => it.name === preferredName);
  if (idx <= 0) return candidates;
  return [
    candidates[idx],
    ...candidates.slice(0, idx),
    ...candidates.slice(idx + 1),
  ];
}

function isStructureCenterLabelRequest(req: LabelRequest): boolean {
  const declutter = req.declutter ?? {};
  const collisionGroup = declutter.collisionGroup ?? declutter.groupKey;
  return req.placement === "center" && collisionGroup === "structureLabel";
}

function moveCenterBeforeCachedStructureCandidate(
  candidates: LabelCandidate[],
  preferredName: LabelCandidateName | undefined,
  enabled: boolean,
): LabelCandidate[] {
  const centerIndex = candidates.findIndex((it) => it.name === "C");
  if (centerIndex < 0) {
    return movePreferredCandidateFirst(candidates, preferredName, enabled);
  }

  const center = candidates[centerIndex];
  const rest = candidates.filter((_, idx) => idx !== centerIndex);
  if (!enabled || !preferredName || preferredName === "C") {
    return [center, ...rest];
  }

  const preferredIndex = rest.findIndex((it) => it.name === preferredName);
  if (preferredIndex < 0) return [center, ...rest];

  return [
    center,
    rest[preferredIndex],
    ...rest.slice(0, preferredIndex),
    ...rest.slice(preferredIndex + 1),
  ];
}

/**
 * 执行一次布局（建议在 moveend/zoomend 时调用，不要在 mousemove/drag 时高频调用）
 */
export function layoutLabelsOnMap(
  map: L.Map,
  requests: LabelRequest[],
  opts?: {
    /** 同优先级时：更靠近屏幕中心的 label 更优先（默认 true） */
    preferNearCenter?: boolean;

    /** 新增：需要避让的屏幕矩形（点图标/其它遮挡物） */
    avoidRectsPx?: AvoidRectPx[];
    /** Cached visible labels must still consume density and group budgets. */
    reservedLabels?: Array<{ request: LabelRequest; rect: Rect }>;

    /** 新增：对 avoidRects 额外膨胀（px），用于给图标留出更大缓冲区 */
    avoidSpacingPx?: number;

    /**
     * RB_SLU_15：允许调用方扩大/缩小有效布局视口。
     * - 正数：视口更严格（向内缩）
     * - 负数：允许 label 在当前视口外的 padded layout window 中提前布局
     */
    viewportPaddingPx?: number;
  },
): PlacedLabel[] {
  const params = _runtimeParams;
  const size = map.getSize();
  const center = L.point(size.x / 2, size.y / 2);
  const layoutViewportPaddingPx =
    typeof opts?.viewportPaddingPx === "number"
      ? opts.viewportPaddingPx
      : undefined;

  const items: LayoutItem[] = [];

  for (const req of requests) {
    const decl = req.declutter ?? {};
    const font =
      req.font ?? "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const measured = measureText(req.text, font, !!req.withDot, req.dotAnchorMode);

    const anchorPx = map.latLngToContainerPoint(req.anchorLatLng);
    const candidates = normalizeCandidates(req, measured, {
      ...params,
      viewportPaddingPx:
        layoutViewportPaddingPx ??
        decl.viewportPaddingPx ??
        params.viewportPaddingPx,
    });

    const dx = anchorPx.x - center.x;
    const dy = anchorPx.y - center.y;

    items.push({
      req,
      anchorPx,
      size: measured,
      candidates,
      priority: decl.priority ?? 0,
      allowHide: decl.allowHide !== false,
      allowAbbrev: !!decl.allowAbbrev && typeof decl.abbrev === "function",
      abbrev: decl.abbrev,
      groupKey: decl.groupKey,
      maxPerScreen: decl.maxPerScreen,
      density: resolveLabelDensityConfig({ ...decl, selected: req.selected }),
      placementCache: resolveLabelPlacementCacheConfig({
        id: req.id,
        featureUid: req.featureUid,
        partIndex: req.partIndex,
        text: req.text,
        placement: req.placement,
        zoom: map.getZoom(),
        collisionGroup: decl.collisionGroup,
        groupKey: decl.groupKey,
        placementCacheEnabled: decl.placementCacheEnabled,
        placementCacheKey: decl.placementCacheKey,
        placementCacheCustomKey: decl.placementCacheCustomKey,
        placementZoomBucketSize: decl.placementZoomBucketSize,
        placementKeepPreviousCandidate: decl.placementKeepPreviousCandidate,
        placementKeepPreviousAnchor: decl.placementKeepPreviousAnchor,
        placementInvalidateWhen: decl.placementInvalidateWhen,
        worldId: req.worldId,
        displayMode: req.displayMode,
        geometrySignature: req.geometrySignature,
      }),
      collisionRole: normalizeCollisionRole(decl.collisionRole),
      collisionGroup: decl.collisionGroup ?? decl.groupKey,
      hidePolicy: decl.hidePolicy,
      collisionAllowOverlap: !!decl.collisionAllowOverlap,
      collisionCollideWith: Array.isArray(decl.collisionCollideWith)
        ? decl.collisionCollideWith
        : undefined,
      collisionBlocks: Array.isArray(decl.collisionBlocks)
        ? decl.collisionBlocks
        : undefined,
      lineLabelMode:
        decl.lineLabelMode === "strictOnLine"
          ? "strictOnLine"
          : decl.lineLabelMode === "free"
            ? "free"
            : undefined,
      lastFailureReason: undefined,
      minSpacingPx: decl.minSpacingPx ?? params.minSpacingPx,
      viewportPaddingPx: decl.viewportPaddingPx ?? params.viewportPaddingPx,
      centerDist2: dx * dx + dy * dy,
    });
  }

  // RB_SLU_9 排序：collision role desc，再 priority desc；同级按“离屏幕中心更近”优先（可关）；再按文本短优先。
  // 这样 required / important 标签会先占位，optional / soft 标签随后自然避让。
  items.sort((a, b) => {
    const roleDiff =
      collisionRoleOrder(b.collisionRole) - collisionRoleOrder(a.collisionRole);
    if (roleDiff !== 0) return roleDiff;
    if (a.req.densityImportance !== undefined || b.req.densityImportance !== undefined) { const importance = (b.req.densityImportance ?? 0) - (a.req.densityImportance ?? 0); if (importance) return importance; }
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (opts?.preferNearCenter !== false) {
      if (a.centerDist2 !== b.centerDist2) return a.centerDist2 - b.centerDist2;
    }
    return a.req.text.length - b.req.text.length;
  });

  const placed: PlacedLabel[] = [];
  const index = new GridIndex(params.gridCellPx);

  // 新增：把点图标等“硬占用区”提前写入索引，label 将自动避开
  const avoidPadExtra = opts?.avoidSpacingPx ?? 0;
  const avoidRects = opts?.avoidRectsPx ?? [];
  for (const ar of avoidRects) {
    const pad = ar.alreadyInflated ? 0 : (ar.inflatePx ?? 0) + avoidPadExtra + params.minSpacingPx;
    const inflated = inflateRect({ x: ar.x, y: ar.y, w: ar.w, h: ar.h }, pad);
    index.add({
      ...inflated,
      ownerUid: ar.ownerUid,
      collisionSource: ar.collisionSource ?? "symbol",
      collisionRole: normalizeCollisionRole(ar.collisionRole ?? "important"),
      collisionGroup: ar.collisionGroup,
      priority: typeof ar.priority === "number" ? ar.priority : 5000,
      collisionBlocks: ar.collisionBlocks,
    });
  }

  const groupCount = new Map<string, number>();
  const densityLimiter = new LabelDensityLimiter();
  for (const { request, rect } of opts?.reservedLabels ?? []) {
    const decl = request.declutter ?? {};
    if (decl.groupKey) groupCount.set(decl.groupKey, (groupCount.get(decl.groupKey) ?? 0) + 1);
    densityLimiter.commit(rect, resolveLabelDensityConfig({ ...decl, selected: request.selected }));
  }

  const maybeTextPathMetrics = (
    item: LayoutItem,
    text: string,
    ac: AnchorLayoutCandidate,
  ) => {
    const req = item.req;
    const mode = req.lineTextMode;
    if (mode !== "auto" && mode !== "textPath") return null;
    const pathCandidate = getLineTextPathCandidate(req, ac);
    if (
      !pathCandidate ||
      !Array.isArray(pathCandidate.pathLatLngs) ||
      pathCandidate.pathLatLngs.length < 2
    )
      return null;
    const anchor = req.displayAnchor ?? null;
    if (
      isMostlyCjkText(text) &&
      ((anchor as any)?.cjkGlyphPathMode ?? "auto") !== "off" &&
      ((req as any).glyphPathBudgetStatus ??
        (req as any).textPathBudgetStatus) === "allowed"
    ) {
      const glyphResult = buildCjkGlyphPathApproxMetricsResult({
        map,
        text,
        pathLatLngs: pathCandidate.pathLatLngs,
        anchor,
        metricsOnly: true,
      });
      if (glyphResult.metrics) {
        return {
          metrics: {
            collisionRect: glyphResult.metrics.collisionRect,
            pathLengthPx: glyphResult.metrics.pathLengthPx,
            estimatedTextWidthPx: glyphResult.metrics.estimatedTextWidthPx,
            letterSpacingPx: Number((anchor as any)?.cjkGlyphSpacingPx ?? 0),
            mode: "curvedTextPath" as const,
            status: glyphResult.metrics.status,
          },
          glyphResult,
        };
      }
      return {
        metrics: null,
        glyphResult,
      };
    }

    return buildTextPathApproxMetrics({
      map,
      text,
      pathLatLngs: pathCandidate.pathLatLngs,
      anchor,
    });
  };

  const lineViewportBufferPx = 72;

  const isInLineLabelViewport = (rect: Rect): boolean =>
    params.allowOutsideViewport ||
    inViewport(rect, size, -lineViewportBufferPx);

  const pointInLineLabelViewport = (p: L.Point): boolean =>
    p.x >= -lineViewportBufferPx &&
    p.y >= -lineViewportBufferPx &&
    p.x <= size.x + lineViewportBufferPx &&
    p.y <= size.y + lineViewportBufferPx;

  const orderAnchorsRealViewportFirst = (
    anchors: AnchorLayoutCandidate[],
  ): AnchorLayoutCandidate[] =>
    [...anchors].sort((a, b) => {
      const av = pointInLineLabelViewport(a.px) ? 0 : 1;
      const bv = pointInLineLabelViewport(b.px) ? 0 : 1;
      if (av !== bv) return av - bv;
      const ad = (a.px.x - center.x) ** 2 + (a.px.y - center.y) ** 2;
      const bd = (b.px.x - center.x) ** 2 + (b.px.y - center.y) ** 2;
      if (ad !== bd) return ad - bd;
      return (a.displayOrder ?? a.index) - (b.displayOrder ?? b.index);
    });
  const lineViewportRect = (): Rect => ({
    x: -lineViewportBufferPx,
    y: -lineViewportBufferPx,
    w: size.x + lineViewportBufferPx * 2,
    h: size.y + lineViewportBufferPx * 2,
  });

  const rectOverflow = (rect: Rect, vp: Rect) => {
    const left = Math.max(0, vp.x - rect.x);
    const top = Math.max(0, vp.y - rect.y);
    const right = Math.max(0, rect.x + rect.w - (vp.x + vp.w));
    const bottom = Math.max(0, rect.y + rect.h - (vp.y + vp.h));
    return {
      left,
      right,
      top,
      bottom,
      max: Math.max(left, right, top, bottom),
    };
  };

  const rectInsideLineViewport = (rect: Rect): boolean => {
    const vp = lineViewportRect();
    return (
      rect.x >= vp.x &&
      rect.y >= vp.y &&
      rect.x + rect.w <= vp.x + vp.w &&
      rect.y + rect.h <= vp.y + vp.h
    );
  };

  const pathSliceAudit = (latlngs: L.LatLng[] | undefined) => {
    if (!Array.isArray(latlngs) || latlngs.length < 2) {
      return {
        bounds: undefined as Rect | undefined,
        insideRatio: undefined as number | undefined,
        lengthPx: undefined as number | undefined,
      };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let lengthPx = 0;
    let prev: L.Point | null = null;
    let inside = 0;
    let total = 0;
    const vp = lineViewportRect();
    for (const ll of latlngs) {
      let p: L.Point;
      try {
        p = map.latLngToContainerPoint(ll);
      } catch {
        continue;
      }
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      if (
        p.x >= vp.x &&
        p.y >= vp.y &&
        p.x <= vp.x + vp.w &&
        p.y <= vp.y + vp.h
      )
        inside += 1;
      total += 1;
      if (prev) lengthPx += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
    if (!Number.isFinite(minX) || total <= 0) {
      return {
        bounds: undefined as Rect | undefined,
        insideRatio: undefined as number | undefined,
        lengthPx: undefined as number | undefined,
      };
    }
    return {
      bounds: {
        x: minX,
        y: minY,
        w: Math.max(0, maxX - minX),
        h: Math.max(0, maxY - minY),
      },
      insideRatio: inside / total,
      lengthPx,
    };
  };

  const buildViewportAttemptAudit = (args: {
    attemptIndex: number;
    candidateId?: string;
    baseCandidateId?: string;
    shiftIndex?: number;
    anchorPx: L.Point;
    rect: Rect;
    rawRect?: Rect;
    normalizedRect?: Rect;
    rectSource?: "rawMetrics" | "anchorNormalized" | "anchorNormalizedFallback";
    rawRectCenterDistancePx?: number;
    rawRectImplausible?: boolean;
    viewportTempBase?: boolean;
    viewportLocalIntervalIndex?: number;
    viewportLocalIntervalLengthPx?: number;
    pathLatLngs?: L.LatLng[];
    estimatedLabelSpanPx?: number;
    effectiveStepPx?: number;
    sourcePathKind?: "fullPathLatLngs" | "localPathLatLngs" | "unknown";
    sourcePathPointCount?: number;
    sourcePathLengthPx?: number;
    svgEligible?: boolean;
    svgFailureReason?: string;
    glyphPathStatus?: string;
    textPathStatus?: string;
  }): LineLabelViewportAttemptAudit => {
    const vp = lineViewportRect();
    const anchorInsideViewport =
      args.anchorPx.x >= vp.x &&
      args.anchorPx.y >= vp.y &&
      args.anchorPx.x <= vp.x + vp.w &&
      args.anchorPx.y <= vp.y + vp.h;
    const rectInsideViewport = rectInsideLineViewport(args.rect);
    const rectOversizedForViewport = args.rect.w > vp.w || args.rect.h > vp.h;
    const overflow = rectOverflow(args.rect, vp);
    const ps = pathSliceAudit(args.pathLatLngs);
    let viewportSubtype: LineLabelViewportFailureSubtype | undefined;
    if (!anchorInsideViewport) viewportSubtype = "anchorPointOutsideViewport";
    else if (rectOversizedForViewport)
      viewportSubtype = "labelRectOversizedForViewport";
    else if (!rectInsideViewport && overflow.max > 0 && overflow.max <= 24)
      viewportSubtype = "viewportBufferTooSmall";
    else if (!rectInsideViewport) viewportSubtype = "labelRectOutsideViewport";
    else if (ps.insideRatio !== undefined && ps.insideRatio < 0.2)
      viewportSubtype = "pathSliceOutsideViewport";

    return {
      attemptIndex: args.attemptIndex,
      candidateId: args.candidateId,
      baseCandidateId: args.baseCandidateId,
      shiftIndex: args.shiftIndex,
      anchorPx: { x: args.anchorPx.x, y: args.anchorPx.y },
      anchorInsideViewport,
      rect: { ...args.rect },
      rawRect: args.rawRect ? { ...args.rawRect } : undefined,
      normalizedRect: args.normalizedRect ? { ...args.normalizedRect } : undefined,
      rectSource: args.rectSource,
      rawRectCenterDistancePx: args.rawRectCenterDistancePx,
      rawRectImplausible: args.rawRectImplausible,
      viewportTempBase: args.viewportTempBase,
      viewportLocalIntervalIndex: args.viewportLocalIntervalIndex,
      viewportLocalIntervalLengthPx: args.viewportLocalIntervalLengthPx,
      rectInsideViewport,
      rectOversizedForViewport,
      overflow,
      pathSliceBoundsPx: ps.bounds,
      pathSliceInsideRatio: ps.insideRatio,
      pathSliceLengthPx: ps.lengthPx,
      estimatedLabelSpanPx: args.estimatedLabelSpanPx,
      effectiveStepPx: args.effectiveStepPx,
      sourcePathKind: args.sourcePathKind,
      sourcePathPointCount: args.sourcePathPointCount,
      sourcePathLengthPx: args.sourcePathLengthPx,
      viewportSubtype,
      viewportReason: viewportSubtype,
      svgEligible: args.svgEligible,
      svgFailureReason: args.svgFailureReason,
      glyphPathStatus: args.glyphPathStatus,
      textPathStatus: args.textPathStatus,
    };
  };

  const chooseBestViewportAttempt = (
    attempts: LineLabelViewportAttemptAudit[],
  ): LineLabelViewportAttemptAudit | undefined => {
    return [...attempts].sort((a, b) => {
      const ai = a.anchorInsideViewport ? 0 : 1;
      const bi = b.anchorInsideViewport ? 0 : 1;
      if (ai !== bi) return ai - bi;
      const ao = a.overflow?.max ?? Infinity;
      const bo = b.overflow?.max ?? Infinity;
      if (ao !== bo) return ao - bo;
      const ar = a.rectOversizedForViewport ? 1 : 0;
      const br = b.rectOversizedForViewport ? 1 : 0;
      if (ar !== br) return ar - br;
      const as = Math.abs(Number(a.shiftIndex ?? 0));
      const bs = Math.abs(Number(b.shiftIndex ?? 0));
      if (as !== bs) return as - bs;
      return a.attemptIndex - b.attemptIndex;
    })[0];
  };

  const summarizeViewportAttempts = (
    attempts: LineLabelViewportAttemptAudit[],
  ) => {
    const anyAnchor = attempts.some((a) => a.anchorInsideViewport);
    const anyRect = attempts.some((a) => a.rectInsideViewport);
    const anyOversized = attempts.some((a) => a.rectOversizedForViewport);
    const sourceLimited = attempts.some(
      (a) => a.sourcePathKind === "localPathLatLngs",
    );
    const stepTooSmall = attempts.some((a) => {
      const step = Number(a.effectiveStepPx ?? NaN);
      const shortSide = Math.min(size.x, size.y);
      return Number.isFinite(step) && (step < 48 || step < shortSide * 0.08);
    });
    const best = chooseBestViewportAttempt(attempts);
    let subtype: LineLabelViewportFailureSubtype = "unknownViewportFailure";
    if (!anyAnchor) subtype = "noAttemptAnchorInsideViewport";
    else if (!anyRect) subtype = "noAttemptRectInsideViewport";
    else if (sourceLimited) subtype = "candidateSourcePathLimited";
    else if (stepTooSmall) subtype = "candidateStepTooSmall";
    else if (best?.viewportSubtype) subtype = best.viewportSubtype;
    const summary = [
      `subtype=${subtype}`,
      `attempts=${attempts.length}`,
      `anchorInsideAny=${anyAnchor ? "yes" : "no"}`,
      `rectInsideAny=${anyRect ? "yes" : "no"}`,
      `rectOversizedAny=${anyOversized ? "yes" : "no"}`,
      best?.overflow
        ? `bestOverflow=${Math.round(best.overflow.max * 10) / 10}`
        : undefined,
    ]
      .filter(Boolean)
      .join("; ");
    return {
      subtype,
      summary,
      best,
      anyAnchor,
      anyRect,
      anyOversized,
      sourceLimited,
      stepTooSmall,
    };
  };

  const tryPlaceLineTextWithChainageSearch = (
    item: LayoutItem,
    text: string,
    measured: Measured,
    anchorCandidates: AnchorLayoutCandidate[],
  ): PlacedLabel | null => {
    const baseReq = item.req;
    const anchor = baseReq.displayAnchor ?? {};
    if (anchor.lineTextRepositionMode !== "chainageSearch") return null;
    if (
      !Array.isArray(baseReq.lineTextPathCandidates) ||
      !baseReq.lineTextPathCandidates.length
    )
      return null;

    const attemptsPerDirection = Math.max(
      0,
      Math.min(
        8,
        Math.floor(Number(anchor.lineTextRepositionAttemptsPerDirection ?? 3)),
      ),
    );
    const strictSvg = anchor.lineTextRepositionStrictSvg !== false;
    const failureMode = anchor.lineTextRepositionFailure ?? "hide";
    let attempts = 0;
    let lastFailure: string | undefined;
    const viewportAttempts: LineLabelViewportAttemptAudit[] = [];

    const orderedBaseAnchors = orderAnchorsRealViewportFirst(anchorCandidates);
    const hasStableAnchorInsideViewport = orderedBaseAnchors.some((ac) =>
      pointInLineLabelViewport(ac.px),
    );
    for (let baseIndex = 0; baseIndex < orderedBaseAnchors.length; baseIndex++) {
      const baseAc = orderedBaseAnchors[baseIndex];
      const baseCandidate = getLineTextPathCandidate(baseReq, baseAc);
      if (!baseCandidate) continue;
      const enableViewportTempFallback =
        baseIndex === 0 &&
        !hasStableAnchorInsideViewport &&
        (anchor.lineTextViewportCandidateMode ?? "stableFirstViewportFallback") ===
          "stableFirstViewportFallback";
      const repositionCandidates = buildLineTextRepositionCandidates({
        baseCandidate,
        anchorPx: baseAc.px,
        anchor,
        labelText: text,
        map,
        estimatedLabelSpanPx: Math.max(measured.w, 28),
        attemptsPerDirection,
        enableViewportTempFallback,
        viewportRectPx: lineViewportRect(),
        viewportTempMaxTargets: Number(anchor.lineTextViewportCandidateMaxTargets ?? 1),
        viewportTempMinIntervalPx: Number(anchor.lineTextViewportCandidateMinIntervalPx ?? 48),
      });

      for (const rc of repositionCandidates) {
        attempts += 1;
        let px: L.Point;
        try {
          px = map.latLngToContainerPoint(rc.latlng);
        } catch {
          lastFailure = "invalidCandidate";
          continue;
        }
        const ac: AnchorLayoutCandidate = {
          px,
          rotateDeg: rc.rotateDeg,
          index: baseAc.index,
          candidateId: rc.candidateId,
          sourceIndex: baseAc.sourceIndex,
          displayOrder: baseAc.displayOrder,
          pathLatLngs: rc.pathLatLngs,
        };
        const textPathMetrics = maybeTextPathMetrics(item, text, ac);
        const rectAudit = resolveLineTextViewportRect({
          anchorPx: px,
          rotateDeg: rc.rotateDeg,
          estimatedLabelSpanPx: rc.estimatedLabelSpanPx,
          rawMetricsRect: textPathMetrics?.metrics?.collisionRect ?? null,
          fontSizePx: measured.h,
          paddingPx: Math.max(6, item.minSpacingPx),
          mode: (anchor.lineTextViewportRectMode ?? "anchorNormalized") as any,
        });
        const rect = adjustedCollisionRect(rectAudit.normalizedRect,baseReq.collisionBoundsAdjustment);
        const attemptAudit = buildViewportAttemptAudit({
          attemptIndex: attempts,
          candidateId: rc.candidateId,
          baseCandidateId: rc.baseCandidateId,
          shiftIndex: rc.shiftIndex,
          anchorPx: px,
          rect,
          rawRect: rectAudit.rawRect,
          normalizedRect: rectAudit.normalizedRect,
          rectSource: rectAudit.rectSource,
          rawRectCenterDistancePx: rectAudit.rawRectCenterDistancePx,
          rawRectImplausible: rectAudit.rawRectImplausible,
          viewportTempBase: rc.viewportTempBase,
          viewportLocalIntervalIndex: rc.viewportLocalIntervalIndex,
          viewportLocalIntervalLengthPx: rc.viewportLocalIntervalLengthPx,
          pathLatLngs: rc.pathLatLngs,
          estimatedLabelSpanPx: rc.estimatedLabelSpanPx,
          effectiveStepPx: rc.effectiveStepPx,
          sourcePathKind: rc.sourcePathKind,
          sourcePathPointCount: rc.sourcePathPointCount,
          sourcePathLengthPx: rc.sourcePathLengthPx,
          svgEligible: !!textPathMetrics?.metrics,
          svgFailureReason:
            String(
              (textPathMetrics as any)?.glyphResult?.failureReason ?? "",
            ) || undefined,
          glyphPathStatus:
            String((textPathMetrics as any)?.glyphResult?.status ?? "") ||
            undefined,
          textPathStatus:
            String(textPathMetrics?.metrics?.status ?? "") || undefined,
        });
        viewportAttempts.push(attemptAudit);
        if (strictSvg && !textPathMetrics?.metrics) {
          lastFailure = String(
            (textPathMetrics as any)?.glyphResult?.failureReason ??
              "svgIneligible",
          );
          continue;
        }
        if (!isInLineLabelViewport(rect)) {
          lastFailure = "viewport";
          item.lastFailureReason = "viewport";
          continue;
        }
        const expanded = inflateRect(rect, item.minSpacingPx);
        const hits = index.query(expanded);
        let ok = true;
        for (const h of hits) {
          if (h.ownerUid && h.ownerUid === (baseReq.collisionOwnerUid ?? baseReq.featureUid)) continue;
          if (
            h.collisionSource === "geometry" &&
            (anchor.lineTextAvoidLineGeometry ?? false) === false
          )
            continue;
          if (
            h.collisionSource === "symbol" &&
            (anchor.lineTextAvoidPointSymbols ?? true) === false
          )
            continue;
          if (rectIntersects(expanded, h) && shouldCollisionBlock(item, h)) {
            ok = false;
            lastFailure = collisionHiddenReason(h);
            item.lastFailureReason = collisionHiddenReason(h);
            break;
          }
        }
        if (!ok) continue;
        if (item.groupKey && typeof item.maxPerScreen === "number") {
          const cur = groupCount.get(item.groupKey) ?? 0;
          if (cur >= item.maxPerScreen) {
            lastFailure = "groupLimit";
            item.lastFailureReason = "groupLimit";
            continue;
          }
        }
        if (!densityLimiter.canPlace(expanded, item.density)) {
          lastFailure = "densityLimit";
          item.lastFailureReason = "densityLimit";
          continue;
        }
        index.add(indexedLabelRect(expanded, item));
        densityLimiter.commit(expanded, item.density);
        if (item.groupKey && typeof item.maxPerScreen === "number") {
          groupCount.set(
            item.groupKey,
            (groupCount.get(item.groupKey) ?? 0) + 1,
          );
        }
        return {
          id: baseReq.id,
          featureUid: baseReq.featureUid,
          text,
          dx: px.x - item.anchorPx.x,
          dy: px.y - item.anchorPx.y,
          hidden: false,
          collisionRect: expanded,
          candidateName: "C",
          anchorCandidateIndex: baseAc.index,
          anchorCandidateId: rc.candidateId,
          anchorCandidateSourceIndex: baseAc.sourceIndex,
          anchorCandidateDisplayOrder: baseAc.displayOrder,
          textPathBudgetStatus: (baseReq as any).textPathBudgetStatus,
          textPathFallbackReason: (baseReq as any).textPathFallbackReason,
          glyphPathStatus: (baseReq as any).glyphPathBudgetStatus,
          glyphPathFallbackReason: (baseReq as any).glyphPathFallbackReason,
          glyphPathGlyphCount: (baseReq as any).glyphPathGlyphCount,
          glyphPathUsed:
            textPathMetrics?.metrics?.status === "usedCjkGlyphPath" ||
            textPathMetrics?.metrics?.status === "usedCjkGlyphPathCompact",
          glyphPathCompactUsed: (textPathMetrics as any)?.glyphResult
            ?.compactUsed,
          glyphPathAdvanceScale: (textPathMetrics as any)?.glyphResult
            ?.advanceScale,
          glyphPathRenderable: !!textPathMetrics?.metrics,
          glyphPathFailureReason: (textPathMetrics as any)?.glyphResult
            ?.failureReason,
          collisionRole: item.collisionRole,
          collisionGroup: item.collisionGroup,
          priority: item.priority,
          rotateDeg: rc.rotateDeg,
          lineTextMode: baseReq.lineTextMode,
          textPathFallback: baseReq.textPathFallback,
          textPathStatus:
            textPathMetrics?.metrics?.status ??
            "usedLineTextChainageReposition",
          candidateStaticWeight: baseCandidate.staticWeight,
          candidateScore: baseCandidate.finalScore,
          candidateScoreParts: baseCandidate.scoreParts,
          lineTextPathLatLngs: rc.pathLatLngs,
          lineTextRepositionMode: "chainageSearch",
          lineTextRepositionUsed: rc.shiftIndex !== 0,
          lineTextRepositionShiftIndex: rc.shiftIndex,
          lineTextRepositionBaseCandidateId: rc.baseCandidateId,
          lineTextRepositionAttempts: attempts,
          lineTextStrictSvgRequired: strictSvg,
          lineTextAvoidLineGeometry: anchor.lineTextAvoidLineGeometry ?? false,
          lineTextRealViewportFirst: true,
          lineTextViewportBufferPx: lineViewportBufferPx,
          lineTextViewportSizePx: { w: size.x, h: size.y },
          lineTextViewportAttempts: viewportAttempts,
          lineTextViewportBestAttempt:
            chooseBestViewportAttempt(viewportAttempts),
          lineTextAnyAttemptAnchorInsideViewport: viewportAttempts.some(
            (a) => a.anchorInsideViewport,
          ),
          lineTextAnyAttemptRectInsideViewport: viewportAttempts.some(
            (a) => a.rectInsideViewport,
          ),
          lineTextAnyAttemptRectOversized: viewportAttempts.some(
            (a) => a.rectOversizedForViewport,
          ),
          lineTextSourcePathKind: rc.sourcePathKind,
          lineTextSourcePathPointCount: rc.sourcePathPointCount,
          lineTextSourcePathLengthPx: rc.sourcePathLengthPx,
          lineTextEstimatedLabelSpanPx: rc.estimatedLabelSpanPx,
          lineTextEffectiveStepPx: rc.effectiveStepPx,
          lineTextViewportRectMode: anchor.lineTextViewportRectMode ?? "anchorNormalized",
          lineTextViewportCandidateMode: anchor.lineTextViewportCandidateMode ?? "stableFirstViewportFallback",
          lineTextRectSource: rectAudit.rectSource,
          lineTextRawRectImplausible: rectAudit.rawRectImplausible,
          lineTextRawRectCenterDistancePx: rectAudit.rawRectCenterDistancePx,
          lineTextViewportTempBase: rc.viewportTempBase,
          lineTextViewportLocalIntervalIndex: rc.viewportLocalIntervalIndex,
          lineTextViewportLocalIntervalLengthPx: rc.viewportLocalIntervalLengthPx,
        };
      }
    }
    item.lastFailureReason =
      lastFailure === "viewport"
        ? "viewport"
        : lastFailure === "densityLimit"
          ? "densityLimit"
          : lastFailure === "groupLimit"
            ? "groupLimit"
            : lastFailure && String(lastFailure).startsWith("collision")
              ? "collision"
              : "notPlaced";
    const viewportSummary = summarizeViewportAttempts(viewportAttempts);
    if (failureMode === "simpleLineLabel") return null;
    return {
      id: baseReq.id,
      featureUid: baseReq.featureUid,
      text,
      dx: 0,
      dy: 0,
      hidden: true,
      hiddenReason: item.lastFailureReason ?? "notPlaced",
      collisionRole: item.collisionRole,
      collisionGroup: item.collisionGroup,
      priority: item.priority,
      lineTextMode: baseReq.lineTextMode,
      textPathFallback: baseReq.textPathFallback,
      textPathStatus: "fallbackLineTextChainageRepositionHidden",
      textPathBudgetStatus: (baseReq as any).textPathBudgetStatus,
      glyphPathStatus: (baseReq as any).glyphPathBudgetStatus,
      glyphPathUsed: false,
      lineTextRepositionMode: "chainageSearch",
      lineTextRepositionAttempts: attempts,
      lineTextRepositionFailureReason: lastFailure ?? "notPlaced",
      lineTextStrictSvgRequired: strictSvg,
      lineTextAvoidLineGeometry: anchor.lineTextAvoidLineGeometry ?? false,
      lineTextRealViewportFirst: true,
      lineTextViewportFailureSubtype:
        lastFailure === "viewport" ? viewportSummary.subtype : undefined,
      lineTextViewportFailureSummary:
        lastFailure === "viewport" ? viewportSummary.summary : undefined,
      lineTextViewportBufferPx: lineViewportBufferPx,
      lineTextViewportSizePx: { w: size.x, h: size.y },
      lineTextViewportAttempts: viewportAttempts,
      lineTextViewportBestAttempt: viewportSummary.best,
      lineTextAnyAttemptAnchorInsideViewport: viewportSummary.anyAnchor,
      lineTextAnyAttemptRectInsideViewport: viewportSummary.anyRect,
      lineTextAnyAttemptRectOversized: viewportSummary.anyOversized,
      lineTextSourcePathKind: viewportSummary.best?.sourcePathKind,
      lineTextSourcePathPointCount: viewportSummary.best?.sourcePathPointCount,
      lineTextSourcePathLengthPx: viewportSummary.best?.sourcePathLengthPx,
      lineTextEstimatedLabelSpanPx: viewportSummary.best?.estimatedLabelSpanPx,
      lineTextEffectiveStepPx: viewportSummary.best?.effectiveStepPx,
      lineTextViewportRectMode: anchor.lineTextViewportRectMode ?? "anchorNormalized",
      lineTextViewportCandidateMode: anchor.lineTextViewportCandidateMode ?? "stableFirstViewportFallback",
      lineTextRectSource: viewportSummary.best?.rectSource,
      lineTextRawRectImplausible: viewportSummary.best?.rawRectImplausible,
      lineTextRawRectCenterDistancePx: viewportSummary.best?.rawRectCenterDistancePx,
      lineTextViewportTempBase: viewportSummary.best?.viewportTempBase,
      lineTextViewportLocalIntervalIndex: viewportSummary.best?.viewportLocalIntervalIndex,
      lineTextViewportLocalIntervalLengthPx: viewportSummary.best?.viewportLocalIntervalLengthPx,
    };
  };

  const tryPlace = (item: LayoutItem, text: string): PlacedLabel | null => {
    item.lastFailureReason = "notPlaced";
    const baseReq = item.req;
    const font =
      baseReq.font ??
      "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const measured = measureText(text, font, !!baseReq.withDot, baseReq.dotAnchorMode);
    const polygonAuditEnabled = isPolygonAuditRequest(baseReq);
    const polygonLayoutCandidates: PolygonLayoutCandidateAudit[] = [];

    const placementCache = getDefaultLabelPlacementCache();
    const placementCacheConfig =
      resolveLabelPlacementCacheConfig({
        id: baseReq.id,
        featureUid: baseReq.featureUid,
        partIndex: baseReq.partIndex,
        text,
        placement: baseReq.placement,
        zoom: map.getZoom(),
        collisionGroup: baseReq.declutter?.collisionGroup,
        groupKey: baseReq.declutter?.groupKey,
        placementCacheEnabled: baseReq.declutter?.placementCacheEnabled,
        placementCacheKey: baseReq.declutter?.placementCacheKey,
        placementCacheCustomKey: baseReq.declutter?.placementCacheCustomKey,
        placementZoomBucketSize: baseReq.declutter?.placementZoomBucketSize,
        placementKeepPreviousCandidate:
          baseReq.declutter?.placementKeepPreviousCandidate,
        placementKeepPreviousAnchor:
          baseReq.declutter?.placementKeepPreviousAnchor,
        placementInvalidateWhen: baseReq.declutter?.placementInvalidateWhen,
        worldId: baseReq.worldId,
        displayMode: baseReq.displayMode,
        geometrySignature: baseReq.geometrySignature,
      }) ?? item.placementCache;

    const cachedPlacement = placementCache.get(placementCacheConfig);

    const sortedCandidates = normalizeCandidates({ ...baseReq, text }, measured, {
      ...params,
      viewportPaddingPx: item.viewportPaddingPx,
    })
      .slice(0, params.maxCandidatesPerLabel)
      .sort((c1, c2) => (c2.score ?? 0) - (c1.score ?? 0));

    const candidates = isStructureCenterLabelRequest(baseReq)
      ? moveCenterBeforeCachedStructureCandidate(
          sortedCandidates,
          cachedPlacement?.candidateName,
          !!placementCacheConfig?.keepPreviousCandidate,
        )
      : movePreferredCandidateFirst(
          sortedCandidates,
          cachedPlacement?.candidateName,
          !!placementCacheConfig?.keepPreviousCandidate,
        );

    const anchorCandidates: AnchorLayoutCandidate[] = [
      {
        px: item.anchorPx,
        rotateDeg:
          typeof baseReq.rotateDeg === "number" ? baseReq.rotateDeg : undefined,
        index: 0,
        candidateId: baseReq.anchorCandidateIds?.[0],
        sourceIndex: baseReq.anchorCandidateSourceIndexes?.[0],
        displayOrder: baseReq.anchorCandidateDisplayOrders?.[0],
      },
    ];
    if (
      Array.isArray(baseReq.anchorCandidatesLatLng) &&
      baseReq.anchorCandidatesLatLng.length
    ) {
      const rotArr = Array.isArray((baseReq as any).rotateDegCandidates)
        ? (baseReq as any).rotateDegCandidates
        : [];
      for (let i = 0; i < baseReq.anchorCandidatesLatLng.length; i++) {
        const ll = baseReq.anchorCandidatesLatLng[i];
        try {
          const candPx = map.latLngToContainerPoint(ll);
          const candRot =
            typeof rotArr?.[i] === "number" ? Number(rotArr[i]) : undefined;
          anchorCandidates.push({
            px: candPx,
            rotateDeg: candRot,
            index: i + 1,
            candidateId: baseReq.anchorCandidateIds?.[i + 1],
            sourceIndex: baseReq.anchorCandidateSourceIndexes?.[i + 1],
            displayOrder: baseReq.anchorCandidateDisplayOrders?.[i + 1],
          });
        } catch {
          // ignore invalid candidate
        }
      }
    }

    const chainagePlaced = tryPlaceLineTextWithChainageSearch(
      item,
      text,
      measured,
      anchorCandidates,
    );
    if (chainagePlaced) return chainagePlaced;

    // 依次尝试不同 anchor（例如沿线其它点），每个 anchor 再尝试 candidates。
    // RB_SLU_7: 若缓存中的 anchor 仍可放置，则优先沿用，避免轻微移动导致 label 大规模跳位。
    const preferCachedAnchor =
      !!placementCacheConfig?.keepPreviousAnchor &&
      shouldPreferCachedAnchor(
        baseReq,
        cachedPlacement?.anchorIndex,
        cachedPlacement?.anchorId,
      );
    const orderedAnchorCandidates = movePreferredAnchorFirst(
      anchorCandidates,
      cachedPlacement?.anchorIndex,
      preferCachedAnchor,
      cachedPlacement?.anchorId,
    );

    for (const ac of orderedAnchorCandidates) {
      const anchorPxCand = ac.px;
      const baseDeltaX = anchorPxCand.x - item.anchorPx.x;
      const baseDeltaY = anchorPxCand.y - item.anchorPx.y;

      for (const c of candidates) {
        const dx = (c.dx ?? 0) + baseDeltaX;
        const dy = (c.dy ?? 0) + baseDeltaY;

        if (baseReq.acceptsAnchor && !baseReq.acceptsAnchor(anchorPxCand)) continue;
        const trial = rectForCandidate(item, measured, anchorPxCand, c);
        const textPathMetrics = maybeTextPathMetrics(item, text, ac);
        const rect = textPathMetrics?.metrics?.collisionRect ? adjustedCollisionRect(textPathMetrics.metrics.collisionRect,baseReq.collisionBoundsAdjustment) : trial.rect;
        const auditCandidate: PolygonLayoutCandidateAudit | undefined =
          polygonAuditEnabled
            ? {
                index: polygonLayoutCandidates.length,
                name: c.name,
                offsetPx: { x: dx, y: dy },
                anchorPx: pointToAudit(anchorPxCand),
                labelRect: rectToAudit(rect),
                rectInsideViewport:
                  params.allowOutsideViewport ||
                  inViewport(rect, size, item.viewportPaddingPx),
              }
            : undefined;

        if (
          !params.allowOutsideViewport &&
          !inViewport(rect, size, item.viewportPaddingPx)
        ) {
          item.lastFailureReason = "viewport";
          if (auditCandidate) {
            auditCandidate.rejected = true;
            auditCandidate.rejectedReason = "viewport";
            polygonLayoutCandidates.push(auditCandidate);
          }
          continue;
        }

        const expanded = inflateRect(rect, item.minSpacingPx);
        const hits = index.query(expanded);
        let ok = true;
        let collisionBlockedBy: PolygonLayoutCandidateAudit["collisionBlockedBy"] | undefined;
        for (const h of hits) {
          // 忽略“自己的点图标占用区”，否则 near label 会必然撞到自己
          if (h.ownerUid && h.ownerUid === (baseReq.collisionOwnerUid ?? baseReq.featureUid)) continue;

          if (rectIntersects(expanded, h) && shouldCollisionBlock(item, h)) {
            ok = false;
            item.lastFailureReason = collisionHiddenReason(h);
            collisionBlockedBy = [
              {
                uid: h.ownerUid,
                collisionRole: h.collisionRole,
                collisionGroup: h.collisionGroup,
                reason: collisionHiddenReason(h),
              },
            ];
            break;
          }
        }

        if (!ok) {
          if (auditCandidate) {
            auditCandidate.collisionPassed = false;
            auditCandidate.collisionBlockedBy = collisionBlockedBy;
            auditCandidate.rejected = true;
            auditCandidate.rejectedReason = item.lastFailureReason;
            polygonLayoutCandidates.push(auditCandidate);
          }
          continue;
        }
        if (auditCandidate) auditCandidate.collisionPassed = true;

        // group 限制
        if (item.groupKey && typeof item.maxPerScreen === "number") {
          const cur = groupCount.get(item.groupKey) ?? 0;
          if (cur >= item.maxPerScreen) {
            item.lastFailureReason = "groupLimit";
            if (auditCandidate) {
              auditCandidate.rejected = true;
              auditCandidate.rejectedReason = "groupLimit";
              polygonLayoutCandidates.push(auditCandidate);
            }
            continue;
          }
        }

        // RB_SLU_6：高密度网格限制。它发生在碰撞之后、真正写入 index 之前。
        // 这样 required/important 已按 priority 先占位，soft/optional 会自然降级。
        const densityInfo = densityAuditFor(densityLimiter, expanded, item.density);
        if (!densityLimiter.canPlace(expanded, item.density)) {
          item.lastFailureReason = "densityLimit";
          if (auditCandidate) {
            auditCandidate.densityPassed = false;
            auditCandidate.densityGridKey = densityInfo.key;
            auditCandidate.densityCountBefore = densityInfo.current;
            auditCandidate.densityMaxPerGrid = densityInfo.max;
            auditCandidate.densityBlockedReason = "densityLimit";
            auditCandidate.rejected = true;
            auditCandidate.rejectedReason = "densityLimit";
            polygonLayoutCandidates.push(auditCandidate);
          }
          continue;
        }
        if (auditCandidate) {
          auditCandidate.densityPassed = true;
          auditCandidate.densityGridKey = densityInfo.key;
          auditCandidate.densityCountBefore = densityInfo.current;
          auditCandidate.densityMaxPerGrid = densityInfo.max;
          auditCandidate.selected = true;
          polygonLayoutCandidates.push(auditCandidate);
        }

        index.add(indexedLabelRect(expanded, item));
        densityLimiter.commit(expanded, item.density);
        placementCache.commit(placementCacheConfig, {
          anchorIndex: ac.index,
          anchorId: ac.candidateId,
          candidateName: c.name,
        });

        if (item.groupKey && typeof item.maxPerScreen === "number") {
          groupCount.set(
            item.groupKey,
            (groupCount.get(item.groupKey) ?? 0) + 1,
          );
        }

        return {
          id: baseReq.id,
          featureUid: baseReq.featureUid,
          text,
          dx,
          dy,
          hidden: false,
          collisionRect: expanded,
          candidateName: c.name,
          anchorCandidateIndex: ac.index,
          anchorCandidateId: ac.candidateId,
          anchorCandidateSourceIndex: ac.sourceIndex,
          anchorCandidateDisplayOrder: ac.displayOrder,
          textPathBudgetStatus: (baseReq as any).textPathBudgetStatus,
          textPathFallbackReason: (baseReq as any).textPathFallbackReason,
          glyphPathStatus: (baseReq as any).glyphPathBudgetStatus,
          glyphPathFallbackReason: (baseReq as any).glyphPathFallbackReason,
          glyphPathGlyphCount: (baseReq as any).glyphPathGlyphCount,
          polygonLayoutCandidateName: polygonAuditEnabled ? c.name : undefined,
          polygonLayoutCandidateOffsetPx: polygonAuditEnabled ? { x: dx, y: dy } : undefined,
          polygonFinalLabelPx: polygonAuditEnabled
            ? { x: item.anchorPx.x + dx, y: item.anchorPx.y + dy }
            : undefined,
          polygonLayoutCandidates: polygonAuditEnabled
            ? polygonLayoutCandidates
            : undefined,
          densityEnabled: polygonAuditEnabled ? !!item.density?.enabled : undefined,
          densityPassed: polygonAuditEnabled ? true : undefined,
          densityGridKey: polygonAuditEnabled
            ? densityAuditFor(densityLimiter, expanded, item.density).key
            : undefined,
          densityGridSizePx: polygonAuditEnabled ? item.density?.gridSizePx : undefined,
          densityCountBefore: polygonAuditEnabled
            ? densityAuditFor(densityLimiter, expanded, item.density).current
            : undefined,
          densityMaxPerGrid: polygonAuditEnabled ? item.density?.maxLabelsPerGrid : undefined,
          collisionPassed: polygonAuditEnabled ? true : undefined,
          glyphPathUsed:
            textPathMetrics?.metrics?.status === "usedCjkGlyphPath" ||
            textPathMetrics?.metrics?.status === "usedCjkGlyphPathCompact",
          glyphPathCompactUsed: (textPathMetrics as any)?.glyphResult
            ?.compactUsed,
          glyphPathAdvanceScale: (textPathMetrics as any)?.glyphResult
            ?.advanceScale,
          glyphPathRenderable: !!textPathMetrics?.metrics,
          glyphPathFailureReason: (textPathMetrics as any)?.glyphResult
            ?.failureReason,
          collisionRole: item.collisionRole,
          collisionGroup: item.collisionGroup,
          priority: item.priority,
          rotateDeg:
            typeof ac.rotateDeg === "number" ? ac.rotateDeg : undefined,
          lineTextMode: baseReq.lineTextMode,
          textPathFallback: baseReq.textPathFallback,
          textPathStatus: textPathMetrics?.metrics?.status,
          candidateStaticWeight: getLineTextPathCandidate(baseReq, ac)
            ?.staticWeight,
          candidateScore: getLineTextPathCandidate(baseReq, ac)?.finalScore,
          candidateScoreParts: getLineTextPathCandidate(baseReq, ac)
            ?.scoreParts,
        };
      }
    }

    return null;
  };

  const forcePlace = (item: LayoutItem, text: string): PlacedLabel => {
    const baseReq = item.req;
    const font =
      baseReq.font ??
      "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const measured = measureText(text, font, !!baseReq.withDot, baseReq.dotAnchorMode);
    const candidates = normalizeCandidates({ ...baseReq, text }, measured, {
      ...params,
      viewportPaddingPx: item.viewportPaddingPx,
    })
      .slice(0, params.maxCandidatesPerLabel)
      .sort((c1, c2) => (c2.score ?? 0) - (c1.score ?? 0));

    const anchorCandidates: AnchorLayoutCandidate[] = [
      {
        px: item.anchorPx,
        rotateDeg:
          typeof baseReq.rotateDeg === "number" ? baseReq.rotateDeg : undefined,
        index: 0,
        candidateId: baseReq.anchorCandidateIds?.[0],
        sourceIndex: baseReq.anchorCandidateSourceIndexes?.[0],
        displayOrder: baseReq.anchorCandidateDisplayOrders?.[0],
      },
    ];
    if (
      Array.isArray(baseReq.anchorCandidatesLatLng) &&
      baseReq.anchorCandidatesLatLng.length
    ) {
      const rotArr = Array.isArray((baseReq as any).rotateDegCandidates)
        ? (baseReq as any).rotateDegCandidates
        : [];
      for (let i = 0; i < baseReq.anchorCandidatesLatLng.length; i++) {
        try {
          const candPx = map.latLngToContainerPoint(
            baseReq.anchorCandidatesLatLng[i],
          );
          const candRot =
            typeof rotArr?.[i] === "number" ? Number(rotArr[i]) : undefined;
          anchorCandidates.push({
            px: candPx,
            rotateDeg: candRot,
            index: i + 1,
            candidateId: baseReq.anchorCandidateIds?.[i + 1],
            sourceIndex: baseReq.anchorCandidateSourceIndexes?.[i + 1],
            displayOrder: baseReq.anchorCandidateDisplayOrders?.[i + 1],
          });
        } catch {
          // ignore invalid candidate
        }
      }
    }

    let fallback:
      | {
          rect: Rect;
          dx: number;
          dy: number;
          candidate: LabelCandidate;
          anchorIndex: number;
          anchorId?: string;
          sourceIndex?: number;
          displayOrder?: number;
          rotateDeg?: number;
          textPathStatus?: TextPathStatus;
        }
      | undefined;

    for (const ac of anchorCandidates) {
      for (const c of candidates) {
        if (baseReq.acceptsAnchor && !baseReq.acceptsAnchor(ac.px)) continue;
        const nextBase = rectForCandidate(item, measured, ac.px, c);
        const textPathMetrics = maybeTextPathMetrics(item, text, ac);
        const nextRect =
          textPathMetrics?.metrics?.collisionRect ? adjustedCollisionRect(textPathMetrics.metrics.collisionRect,baseReq.collisionBoundsAdjustment) : nextBase.rect;
        const next = { ...nextBase, rect: nextRect };
        const trial = {
          ...next,
          candidate: c,
          anchorIndex: ac.index,
          anchorId: ac.candidateId,
          sourceIndex: ac.sourceIndex,
          displayOrder: ac.displayOrder,
          rotateDeg: ac.rotateDeg,
          textPathStatus: textPathMetrics?.metrics?.status,
        };
        fallback = fallback ?? trial;
        if (
          params.allowOutsideViewport ||
          inViewport(next.rect, size, item.viewportPaddingPx)
        ) {
          fallback = trial;
          break;
        }
      }
      if (
        fallback &&
        (params.allowOutsideViewport ||
          inViewport(fallback.rect, size, item.viewportPaddingPx))
      )
        break;
    }

    if (!fallback && baseReq.acceptsAnchor) return { id: baseReq.id, hidden: true, text: baseReq.text, dx: 0, dy: 0, priority: item.priority, hiddenReason: 'collision' };
    if (!fallback) {
      const c = candidates[0] ?? {
        name: "C" as LabelCandidateName,
        dx: 0,
        dy: 0,
      };
      const next = rectForCandidate(item, measured, item.anchorPx, c);
      fallback = {
        ...next,
        candidate: c,
        anchorIndex: 0,
        rotateDeg: baseReq.rotateDeg,
      };
    }

    const expanded = inflateRect(fallback.rect, item.minSpacingPx);
    index.add(indexedLabelRect(expanded, item));
    densityLimiter.commit(expanded, item.density);

    if (item.groupKey && typeof item.maxPerScreen === "number") {
      groupCount.set(item.groupKey, (groupCount.get(item.groupKey) ?? 0) + 1);
    }

    return {
      id: baseReq.id,
      featureUid: baseReq.featureUid,
      text,
      dx: fallback.dx,
      dy: fallback.dy,
      hidden: false,
          collisionRect: expanded,
      hiddenReason: item.lastFailureReason ?? "hiddenByPolicy",
      candidateName: fallback.candidate.name,
      anchorCandidateIndex: fallback.anchorIndex,
      anchorCandidateId: fallback.anchorId,
      anchorCandidateSourceIndex: fallback.sourceIndex,
      anchorCandidateDisplayOrder: fallback.displayOrder,
      textPathBudgetStatus: (baseReq as any).textPathBudgetStatus,
      textPathFallbackReason: (baseReq as any).textPathFallbackReason,
      glyphPathStatus: (baseReq as any).glyphPathBudgetStatus,
      glyphPathFallbackReason: (baseReq as any).glyphPathFallbackReason,
      glyphPathGlyphCount: (baseReq as any).glyphPathGlyphCount,
      glyphPathUsed:
        fallback.textPathStatus === "usedCjkGlyphPath" ||
        fallback.textPathStatus === "usedCjkGlyphPathCompact",
      glyphPathCompactUsed:
        fallback.textPathStatus === "usedCjkGlyphPathCompact",
      glyphPathRenderable:
        fallback.textPathStatus === "usedCjkGlyphPath" ||
        fallback.textPathStatus === "usedCjkGlyphPathCompact",
      collisionRole: item.collisionRole,
      collisionGroup: item.collisionGroup,
      priority: item.priority,
      rotateDeg:
        typeof fallback.rotateDeg === "number" ? fallback.rotateDeg : undefined,
      lineTextMode: baseReq.lineTextMode,
      textPathFallback: baseReq.textPathFallback,
      textPathStatus: fallback.textPathStatus,
      candidateStaticWeight: getLineTextPathCandidate(baseReq, {
        index: fallback.anchorIndex,
        candidateId: fallback.anchorId,
      })?.staticWeight,
      candidateScore: getLineTextPathCandidate(baseReq, {
        index: fallback.anchorIndex,
        candidateId: fallback.anchorId,
      })?.finalScore,
      candidateScoreParts: getLineTextPathCandidate(baseReq, {
        index: fallback.anchorIndex,
        candidateId: fallback.anchorId,
      })?.scoreParts,
    };
  };

  for (const item of items) {
    // 先尝试原文
    let p = tryPlace(item, item.req.text);

    // Ordinary collision fallback remains separate from ordered density reduction.
    if (!p && item.lastFailureReason !== 'densityLimit' && item.allowAbbrev && item.abbrev) {
      const short = item.abbrev(item.req.text);
      if (short && short !== item.req.text) {
        p = tryPlace(item, short);
      }
    }

    let hideSymbol = false;
    let keepGeometry = item.hidePolicy === 'geometryOnly';
    let terminalDensityAction = false;
    const densityFailed = !p && item.lastFailureReason === 'densityLimit';
    const densityActionTrace: LabelDensityReduceStep[] = [];
    if (!p && item.lastFailureReason === 'densityLimit') for (const action of item.density?.reduceOrder ?? DEFAULT_LABEL_DENSITY_REDUCE_ORDER) {
      if (action === 'abbreviateOptionalLabels') {
        if (item.collisionRole !== 'optional' || !item.allowAbbrev || !item.abbrev) continue;
        densityActionTrace.push(action);
        const short = item.abbrev(item.req.text);
        if (short && short !== item.req.text) p = tryPlace(item, short);
        if (p) break;
      } else if (action === 'hideSoftLabels' && item.collisionRole === 'soft' || action === 'hideOptionalLabels' && item.collisionRole === 'optional') {
        densityActionTrace.push(action); terminalDensityAction = true; break;
      } else if (action === 'hideSymbols') {
        densityActionTrace.push(action); hideSymbol = true;
      } else if (action === 'geometryOnly') {
        densityActionTrace.push(action); keepGeometry = true; hideSymbol = false; terminalDensityAction = true; break;
      }
    }

    if (!p && !terminalDensityAction && shouldForceShow(item) && item.lastFailureReason !== 'densityLimit') {
      p = forcePlace(item, item.req.text);
    }

    if (p) {
      p.densityActionTrace = densityActionTrace.length ? densityActionTrace : undefined;
      if (hideSymbol) p.hideSymbol = true;
      placed.push(p);
      continue;
    }

    // 放不下
    getDefaultLabelPlacementCache().noteFailure(item.placementCache, item.lastFailureReason);
    placed.push({
      id: item.req.id,
      featureUid: item.req.featureUid,
      text: item.req.text,
      dx: 0,
      dy: 0,
      hidden: item.allowHide || densityFailed || item.lastFailureReason === 'densityLimit',
      densityActionTrace: densityActionTrace.length ? densityActionTrace : undefined,
      hideSymbol,
      keepGeometry,
      hiddenReason: item.lastFailureReason ?? "notPlaced",
      collisionRole: item.collisionRole,
      collisionGroup: item.collisionGroup,
      priority: item.priority,
      lineTextMode: item.req.lineTextMode,
      textPathFallback: item.req.textPathFallback,
      textPathStatus: "fallbackCollision",
      textPathBudgetStatus: (item.req as any).textPathBudgetStatus,
      textPathFallbackReason: (item.req as any).textPathFallbackReason,
      glyphPathStatus: (item.req as any).glyphPathBudgetStatus,
      glyphPathFallbackReason: (item.req as any).glyphPathFallbackReason,
      glyphPathGlyphCount: (item.req as any).glyphPathGlyphCount,
      glyphPathUsed: false,
      polygonLayoutCandidates: isPolygonAuditRequest(item.req)
        ? ((item as any).polygonLayoutCandidates ?? undefined)
        : undefined,
      densityEnabled: isPolygonAuditRequest(item.req) ? !!item.density?.enabled : undefined,
      densityPassed: isPolygonAuditRequest(item.req)
        ? item.lastFailureReason !== "densityLimit"
        : undefined,
      densityGridSizePx: isPolygonAuditRequest(item.req) ? item.density?.gridSizePx : undefined,
      densityMaxPerGrid: isPolygonAuditRequest(item.req)
        ? item.density?.maxLabelsPerGrid
        : undefined,
      densityBlockedReason:
        isPolygonAuditRequest(item.req) && item.lastFailureReason === "densityLimit"
          ? "densityLimit"
          : undefined,
      collisionPassed: isPolygonAuditRequest(item.req)
        ? !String(item.lastFailureReason ?? "").startsWith("collision")
        : undefined,
    });
  }

  return placed;
}
