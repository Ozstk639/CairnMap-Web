import { useEffect, useMemo, useRef, useState } from "react";

import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { DynmapProjection } from "@/lib/DynmapProjection";

import { FeatureStore } from "@/components/Rules/data/featureStore";
import {
  DEFAULT_FLOOR_VIEW,
  buildFeatureMeta,
  findFirstRule,
  toZoomLevel,
  type FeatureRecord,
  type GeoType,
  type RenderContext,
} from "@/components/Rules/rendering/renderRules";
import {
  layoutLabelsOnMap,
  type LabelRequest,
  type AvoidRectPx,
} from "@/components/Rules/rendering/labelLayout";
import AppButton from "@/components/ui/AppButton";
import AppCard from "@/components/ui/AppCard";
import SmallDraggablePanel from "@/components/DraggablePanel/SmallDraggablePanel";

import { resolveFeatureCardComponent } from "@/components/Rules/cardrules/featureCardRegistry";
import type { CardFeatureLinkTarget } from "@/components/Rules/cardrules/cardInteractions";
import {
  getStructureAreaPriorityBonus,
  isPriorityStructureLabelFeature,
  STRUCTURE_LABEL_PRIORITY,
} from "@/components/Rules/priority/structureLabelPriority";
import {
  compareFloorDisplayOrder,
  formatFloorDisplayLabel,
} from "@/components/Rules/rendering/order/floorDisplayOrder";
import { makeLabelDivIcon } from "@/components/Rules/rendering/labelStyles";
import {
  createHighlightLayerForFeature,
  makeClickableLabelMarker,
  type LabelClickPlan,
} from "@/components/Rules/rendering/labelClickInteraction";
import {
  resolveFeatureDisplayPlan,
  shouldRenderByDisplayPlan,
} from "@/components/Rules/rendering/display/displayRuleResolver";
import {
  createRuleDisplayDiagnostic,
  emitRuleDisplayDiagnostics,
  isDisplayDiagnosticsEnabled,
  type DisplayInteractionReason,
  type RuleDisplayDiagnostic,
} from "@/components/Rules/rendering/display/displayDiagnostics";
import type {
  DisplayAnchorConfig,
  FeatureDisplayPlan,
} from "@/components/Rules/rendering/display/displayTypes";
import { mergeDisplayCollisionIntoLabelRequest } from "@/components/Rules/rendering/label/labelCollision";
import { makeTextPathLabelMarkerResult } from "@/components/Rules/rendering/label/labelTextPathLayer";
import { makeCjkGlyphPathLabelMarkerResult } from "@/components/Rules/rendering/label/labelGlyphPathLayer";
import { isLineTextMarker } from "@/components/Rules/rendering/label/labelLineTextGeometry";
import { isMostlyCjkText } from "@/components/Rules/rendering/label/labelTextPath";
import {
  downloadLineLabelAuditTxt,
  downloadLineLabelViewportAuditTxt,
  printLineLabelAudit,
  printLineLabelViewportAudit,
  type LineLabelAuditBlockedStep,
  type LineLabelAuditRenderMode,
  type LineLabelAuditRow,
  type LineLabelAuditSnapshot,
} from "@/components/Rules/debug/lineLabelAudit";
import {
  downloadPolygonLabelAuditTxt,
  printPolygonLabelAudit,
  type PolygonGeoCandidateAudit,
  type PolygonLabelAuditOptions,
  type PolygonLabelAuditRow,
  type PolygonLabelAuditSnapshot,
} from "@/components/Rules/debug/polygonLabelAudit";
import { setTempMountedPictureEntries, type FeaturePictureEntry } from "@/components/Rules/cardrules/pictureRules";
import {
  viewportWorldRectXZFromBounds,
  resolveLabelAnchorForFeature,
  type WorldRectXZ,
} from "@/components/Rules/rendering/label/labelAnchor";
import {
  captureLabelViewportSnapshot,
  type LabelViewportSnapshot,
} from "@/components/Rules/rendering/label/labelViewportStability";
import {
  createLabelLayoutWindow,
  getLabelLayoutViewportPaddingPx,
  type LabelLayoutWindowState,
} from "@/components/Rules/rendering/label/labelLayoutWindow";
import { firstMultipartCoordinate, flattenMultipartCoordinates, geometryTypeFromFeatureType, readMultipartGeometry } from "@/core/geometry/multipartGeometry";

import { filterRecordsByRuleButtons } from "@/components/Rules/ButtonRule/buttonRuleFilter";
import { setRuleSearchPool } from "@/components/Rules/search/ruleSearchRegistry";
import { useRuleDataStore } from "@/store/ruleDataStore";
import { useLoadingStore } from "@/store/loadingStore";

const FLOOR_VIEW_MIN_LEVEL = Math.max(0, DEFAULT_FLOOR_VIEW.minLevel);

type Props = {
  mapReady: boolean;
  map: L.Map;
  projection: DynmapProjection;
  worldId: string;
  visible: boolean;
  /**
   * 规则图层“分组开关”激活列表：
   * - 由外部 UI（Rules/ButtonRule）控制
   * - 用于从预加载池中挑选需要进入渲染/索引的要素子集
   */
  activeButtonIds?: string[];
};

const Y_FOR_DISPLAY = -64;

type LayerBundle = {
  main: L.Layer;
  label?: L.Layer;
  hitProxy?: L.Layer;

  /** 新增：用于 declutter label 复用，避免 refresh 每次重建 marker */
  labelKey?: string;

  kind: "marker" | "circleMarker" | "path";
  iconUrl?: string;
  pane?: string;
  /** Present only when a Point feature owns multiple independently rendered markers. */
  pointSignature?: string;
};

type LineAuditMutableRow = LineLabelAuditRow & {
  _bounds?: L.LatLngBounds;
};

type PolygonAuditMutableRow = PolygonLabelAuditRow & {
  _bounds?: L.LatLngBounds;
};

function stringValue(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return s || undefined;
}

function getFeatureAuditId(r: FeatureRecord): string | undefined {
  return stringValue(
    r.meta?.idValue ??
      (r.featureInfo as any)?.ID ??
      (r.featureInfo as any)?.id ??
      (r.featureInfo as any)?.lineID ??
      r.uid,
  );
}

function getFeatureAuditName(r: FeatureRecord): string | undefined {
  return stringValue(
    (r.featureInfo as any)?.Name ??
      (r.featureInfo as any)?.name ??
      (r.featureInfo as any)?.Title ??
      (r.featureInfo as any)?.title ??
      (r.featureInfo as any)?.label,
  );
}

function getLineAuditBounds(
  r: FeatureRecord,
  projection: DynmapProjection,
): L.LatLngBounds | null {
  if (r.type !== "Polyline" || !Array.isArray(r.coords3) || !r.coords3.length)
    return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of r.coords3) {
    const ll = projection.locationToLatLng(p.x, p.y, p.z);
    minLat = Math.min(minLat, ll.lat);
    minLng = Math.min(minLng, ll.lng);
    maxLat = Math.max(maxLat, ll.lat);
    maxLng = Math.max(maxLng, ll.lng);
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) return null;
  return L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
}

function buildBaseLineAuditRow(args: {
  record: FeatureRecord;
  index: number;
  zoom: number;
  realBounds: L.LatLngBounds;
  layoutBounds: L.LatLngBounds;
  projection: DynmapProjection;
}): LineAuditMutableRow | null {
  const bounds = getLineAuditBounds(args.record, args.projection);
  if (!bounds) return null;
  const inRealViewport = args.realBounds.intersects(bounds);
  if (!inRealViewport) return null;
  const fi: any = args.record.featureInfo ?? {};
  return {
    index: args.index,
    uid: args.record.uid,
    id: getFeatureAuditId(args.record),
    name: getFeatureAuditName(args.record),
    classCode: stringValue(args.record.meta?.Class ?? fi.Class),
    kind: stringValue(fi.Kind ?? args.record.meta?.sig?.Kind),
    skind: stringValue(fi.SKind ?? args.record.meta?.sig?.SKind),
    skind2: stringValue(fi.SKind2 ?? args.record.meta?.sig?.SKind2),
    world: stringValue(fi.World ?? args.record.meta?.World),
    zoom: args.zoom,
    inRealViewport,
    inLayoutViewport: args.layoutBounds.intersects(bounds),
    expectedInViewport: inRealViewport,
    expectedLabel: false,
    displayed: false,
    blockedStep: "feature-filter",
    blockedReason: "not processed by render loop",
    renderMode: "none",
    _bounds: bounds,
  };
}

function resolveLabelTextForAudit(
  r: FeatureRecord,
  labelPlan: any,
  ctx: RenderContext,
  store: FeatureStore,
): string {
  if (!labelPlan) return "";
  if (typeof labelPlan.textFrom === "function") {
    return String(labelPlan.textFrom(r, ctx, store) ?? "").trim();
  }
  if (typeof labelPlan.textFrom === "string") {
    return String((r.featureInfo as any)?.[labelPlan.textFrom] ?? "").trim();
  }
  return "";
}

function updateLineAuditBlocked(
  row: LineAuditMutableRow | undefined,
  step: LineLabelAuditBlockedStep,
  reason?: string,
): void {
  if (!row || row.displayed) return;
  row.blockedStep = step;
  row.blockedReason = reason;
}

function mapHiddenReasonToAuditStep(
  reason: unknown,
): LineLabelAuditBlockedStep {
  const r = String(reason ?? "");
  if (r === "viewport") return "viewport";
  if (r === "densityLimit" || r === "groupLimit") return "layout";
  if (r.startsWith("collision")) return "collision";
  if (r === "collisionSymbol") return "collision";
  if (r === "notPlaced") return "layout";
  return "unknown";
}

function inferLineRenderMode(args: {
  glyphPathMarker?: L.Marker | null;
  textPathMarker?: L.Marker | null;
  strictChainageSearch?: boolean;
  b?: LayerBundle | null;
}): LineLabelAuditRenderMode {
  if (args.glyphPathMarker) return "glyphPath";
  if (args.textPathMarker) return "textPath";
  if (args.b?.label instanceof L.Marker && isLineTextMarker(args.b.label)) {
    return "textPath";
  }
  if (args.strictChainageSearch) return "hidden";
  return "simpleLineLabel";
}

function finalizeLineAuditSnapshot(args: {
  rows: Map<string, LineAuditMutableRow>;
  worldId: string;
  zoom: number;
  zoomLevel: number;
  reason: string;
  map: L.Map;
  root: L.LayerGroup;
  cache: Map<string, LayerBundle>;
}): LineLabelAuditSnapshot {
  const out = Array.from(args.rows.values()).map((row, i) => {
    const bundle = args.cache.get(row.uid);
    if (bundle?.label && args.root.hasLayer(bundle.label)) {
      row.displayed = true;
      row.blockedStep = "none";
      row.blockedReason = undefined;
      if (
        !row.renderMode ||
        row.renderMode === "none" ||
        row.renderMode === "hidden"
      ) {
        row.renderMode =
          bundle.label instanceof L.Marker && isLineTextMarker(bundle.label)
            ? "textPath"
            : "normalLabel";
      }
    }
    const { _bounds, ...clean } = row;
    return { ...clean, index: i + 1 } as LineLabelAuditRow;
  });
  out.sort((a, b) => {
    const ac = String(a.classCode ?? "");
    const bc = String(b.classCode ?? "");
    if (ac !== bc) return ac.localeCompare(bc);
    return String(a.name ?? a.id ?? a.uid).localeCompare(
      String(b.name ?? b.id ?? b.uid),
    );
  });
  out.forEach((row, i) => (row.index = i + 1));
  const b = args.map.getBounds();
  return {
    worldId: args.worldId,
    zoom: args.zoom,
    zoomLevel: args.zoomLevel,
    generatedAt: Date.now(),
    reason: args.reason,
    viewport: {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    },
    rows: out,
  };
}


function getPolygonAuditBounds(
  r: FeatureRecord,
  projection: DynmapProjection,
): L.LatLngBounds | null {
  if (r.type !== "Polygon" || !Array.isArray(r.coords3) || r.coords3.length < 3)
    return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of r.coords3) {
    const ll = projection.locationToLatLng(p.x, p.y, p.z);
    minLat = Math.min(minLat, ll.lat);
    minLng = Math.min(minLng, ll.lng);
    maxLat = Math.max(maxLat, ll.lat);
    maxLng = Math.max(maxLng, ll.lng);
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) return null;
  return L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
}

function getPolygonScreenInfo(
  r: FeatureRecord,
  projection: DynmapProjection,
  map: L.Map,
): {
  boundsPx?: { x: number; y: number; w: number; h: number };
  centerPx?: { x: number; y: number };
  areaPx?: number;
} {
  if (r.type !== "Polygon" || !Array.isArray(r.coords3) || r.coords3.length < 3)
    return {};
  const pts: L.Point[] = [];
  for (const p of r.coords3) {
    try {
      pts.push(map.latLngToContainerPoint(projection.locationToLatLng(p.x, p.y, p.z)));
    } catch {
      // ignore invalid point
    }
  }
  if (pts.length < 3) return {};
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j];
    const b = pts[i];
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x);
    maxY = Math.max(maxY, b.y);
    area += a.x * b.y - b.x * a.y;
  }
  return {
    boundsPx: { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) },
    centerPx: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    areaPx: Math.abs(area) / 2,
  };
}

function buildBasePolygonAuditRow(args: {
  record: FeatureRecord;
  index: number;
  zoom: number;
  zoomLevel: number;
  realBounds: L.LatLngBounds;
  layoutBounds: L.LatLngBounds;
  projection: DynmapProjection;
  map: L.Map;
}): PolygonAuditMutableRow | null {
  const bounds = getPolygonAuditBounds(args.record, args.projection);
  if (!bounds) return null;
  const inRealViewport = args.realBounds.intersects(bounds);
  if (!inRealViewport) return null;
  const fi: any = args.record.featureInfo ?? {};
  const screen = getPolygonScreenInfo(args.record, args.projection, args.map);
  return {
    index: args.index,
    uid: args.record.uid,
    id: getFeatureAuditId(args.record),
    name: getFeatureAuditName(args.record),
    classCode: stringValue(args.record.meta?.Class ?? fi.Class),
    kind: stringValue(fi.Kind ?? args.record.meta?.sig?.Kind),
    skind: stringValue(fi.SKind ?? args.record.meta?.sig?.SKind),
    skind2: stringValue(fi.SKind2 ?? args.record.meta?.sig?.SKind2),
    world: stringValue(fi.World ?? args.record.meta?.World),
    zoom: args.zoom,
    zoomLevel: args.zoomLevel,
    inRealViewport,
    inLayoutViewport: args.layoutBounds.intersects(bounds),
    expectedInViewport: inRealViewport,
    expectedLabel: false,
    displayed: false,
    blockedStep: "feature-filter",
    blockedReason: "not processed by render loop",
    renderMode: "none",
    geometryKind: "Polygon",
    polygonPartCount: 1,
    polygonAreaPx: screen.areaPx,
    polygonBoundsPx: screen.boundsPx,
    polygonCenterPx: screen.centerPx,
    _bounds: bounds,
    _recordCoords3: (args.record.coords3 ?? []).map((p) => ({ x: p.x, z: p.z })),
  } as PolygonAuditMutableRow;
}

function updatePolygonAuditBlocked(
  row: PolygonAuditMutableRow | undefined,
  step: PolygonLabelAuditRow["blockedStep"],
  reason?: string,
): void {
  if (!row || row.displayed) return;
  row.blockedStep = step;
  row.blockedReason = reason;
}

function mapHiddenReasonToPolygonAuditStep(
  reason: unknown,
): PolygonLabelAuditRow["blockedStep"] {
  const r = String(reason ?? "");
  if (r === "viewport") return "viewport";
  if (r === "densityLimit") return "density";
  if (r === "groupLimit") return "layout";
  if (r.startsWith("collision")) return "collision";
  if (r === "collisionSymbol") return "collision";
  if (r === "notPlaced") return "layout";
  return "unknown";
}

function applyGeoAnchorDebugToPolygonRow(
  row: PolygonAuditMutableRow | undefined,
  req: LabelRequest | null | undefined,
  map: L.Map,
  projection: DynmapProjection,
): void {
  if (!row || !req) return;
  const debug: any = (req as any).geoAnchorDebug;
  if (!debug || typeof debug !== "object") return;
  row.geoAnchorKind = stringValue(debug.strategy);
  row.geoAnchorCandidateKind = stringValue(debug.selectedCandidateKind);
  row.geoAnchorCandidateId = stringValue(debug.selectedCandidateId);
  row.previousGeoCandidateUsed = !!debug.previousCandidateUsed;
  row.previousGeoCandidateId = stringValue(debug.previousCandidateId);
  row.candidateSwitchBlockedByThreshold = !!debug.switchBlockedByThreshold;
  row.switchBlocked = !!debug.switchBlockedByThreshold;
  row.candidateSwitchScoreDelta = Number.isFinite(Number(debug.switchScoreDelta))
    ? Number(debug.switchScoreDelta)
    : undefined;
  row.candidateSwitchThreshold = Number.isFinite(Number(debug.switchThreshold))
    ? Number(debug.switchThreshold)
    : undefined;
  row.switchThreshold = row.candidateSwitchThreshold;
  try {
    const px = map.latLngToContainerPoint(req.anchorLatLng);
    row.geoAnchorPx = { x: px.x, y: px.y };
    const center = row.polygonCenterPx;
    if (center) row.geoAnchorDistanceToPolygonCenterPx = Math.hypot(px.x - center.x, px.y - center.y);
    const size = map.getSize();
    row.geoAnchorDistanceToViewportCenterPx = Math.hypot(px.x - size.x / 2, px.y - size.y / 2);
  } catch {
    // ignore
  }
  try {
    const ll = req.anchorLatLng;
    row.geoAnchorLatLng = { lat: ll.lat, lng: ll.lng };
    const loc = projection.latLngToLocation(ll, Y_FOR_DISPLAY);
    row.geoAnchorWorldXZ = { x: loc.x, z: loc.z };
    const poly = ((row as any)._recordCoords3 ?? []) as Array<{ x: number; z: number }>;
    if (Array.isArray(poly) && poly.length >= 3) {
      row.geoAnchorInsidePolygon = pointInPolygonXZ(row.geoAnchorWorldXZ, poly);
    }
  } catch {
    // ignore
  }
  const candidates = Array.isArray(debug.candidates) ? debug.candidates : [];
  row.geoCandidates = candidates.map((c: any, i: number): PolygonGeoCandidateAudit => {
    let px: { x: number; y: number } | undefined;
    let latLng: { lat: number; lng: number } | undefined;
    try {
      if (c.worldXZ) {
        const ll = projection.locationToLatLng(Number(c.worldXZ.x), Y_FOR_DISPLAY, Number(c.worldXZ.z));
        latLng = { lat: ll.lat, lng: ll.lng };
        const p = map.latLngToContainerPoint(ll);
        px = { x: p.x, y: p.y };
      }
    } catch {
      // ignore
    }
    return {
      index: i,
      candidateId: stringValue(c.candidateId),
      kind: stringValue(c.kind),
      worldXZ: c.worldXZ,
      latLng,
      px,
      insidePolygon: !!c.insidePolygon,
      inRealViewport: !!c.inRealViewport,
      inLayoutViewport: !!c.inLayoutViewport,
      score: Number.isFinite(Number(c.score)) ? Number(c.score) : undefined,
      scoreParts: c.scoreParts,
      isPrevious: !!c.isPrevious,
      isSelected: !!c.isSelected,
      rejectedReason: stringValue(c.rejectedReason),
    };
  });
}

function applyPlacedPolygonAudit(
  row: PolygonAuditMutableRow | undefined,
  p: any,
): void {
  if (!row || !p) return;
  row.layoutCandidateName = stringValue(p.candidateName ?? p.polygonLayoutCandidateName);
  if (p.polygonLayoutCandidateOffsetPx) row.layoutCandidateOffsetPx = p.polygonLayoutCandidateOffsetPx;
  if (p.polygonFinalLabelPx) row.finalLabelPx = p.polygonFinalLabelPx;
  row.layoutCandidates = Array.isArray(p.polygonLayoutCandidates) ? p.polygonLayoutCandidates : row.layoutCandidates;
  row.layoutCandidatesTried = row.layoutCandidates?.map((c) => c.name);
  row.densityEnabled = !!p.densityEnabled;
  row.densityPassed = p.densityPassed;
  row.densityGridKey = p.densityGridKey;
  row.densityGridSizePx = p.densityGridSizePx;
  row.densityCountBefore = p.densityCountBefore;
  row.densityMaxPerGrid = p.densityMaxPerGrid;
  row.densityBlockedReason = p.densityBlockedReason;
  row.collisionPassed = p.collisionPassed;
  row.collisionBlockedBy = p.collisionBlockedBy;
  row.collisionRole = stringValue(p.collisionRole ?? row.collisionRole);
  row.collisionGroup = stringValue(p.collisionGroup ?? row.collisionGroup);
  row.priority = typeof p.priority === "number" ? Number(p.priority) : row.priority;
  if (p.hidden) {
    const step = mapHiddenReasonToPolygonAuditStep(p.hiddenReason);
    updatePolygonAuditBlocked(row, step, p.hiddenReason ?? "hidden by layout");
    row.renderMode = "hidden";
  } else {
    row.blockedStep = "render";
    row.blockedReason = "layout placed label; waiting for render marker";
  }
}

function finalizePolygonAuditSnapshot(args: {
  rows: Map<string, PolygonAuditMutableRow>;
  worldId: string;
  zoom: number;
  zoomLevel: number;
  reason: string;
  map: L.Map;
  root: L.LayerGroup;
  cache: Map<string, LayerBundle>;
}): PolygonLabelAuditSnapshot {
  const out = Array.from(args.rows.values()).map((row, i) => {
    const bundle = args.cache.get(row.uid);
    if (bundle?.label && args.root.hasLayer(bundle.label)) {
      row.displayed = true;
      row.blockedStep = "none";
      row.blockedReason = undefined;
      row.renderMode = "normalLabel";
      if (row.collisionPassed === undefined) row.collisionPassed = true;
      if (row.densityEnabled && row.densityPassed === undefined) row.densityPassed = true;
    }
    const { _bounds, ...clean } = row as any;
    delete clean._recordCoords3;
    return { ...clean, index: i + 1 } as PolygonLabelAuditRow;
  });
  out.sort((a, b) => {
    const ac = String(a.classCode ?? "");
    const bc = String(b.classCode ?? "");
    if (ac !== bc) return ac.localeCompare(bc);
    return String(a.name ?? a.id ?? a.uid).localeCompare(String(b.name ?? b.id ?? b.uid));
  });
  out.forEach((row, i) => (row.index = i + 1));
  const b = args.map.getBounds();
  return {
    worldId: args.worldId,
    zoom: args.zoom,
    zoomLevel: args.zoomLevel,
    generatedAt: Date.now(),
    reason: args.reason,
    viewport: {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    },
    rows: out,
  };
}

function bindAssistPickFeature(layer: L.Layer, r: FeatureRecord) {
  if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
    (layer as any).__riaAssistRuleFeature = r;
  }
}

function isAssistPickTargetFeature(r: FeatureRecord): boolean {
  return r.type === "Polyline" || r.type === "Polygon";
}

function isDeletePickTargetFeature(r: FeatureRecord): boolean {
  return r.type === "Points" || r.type === "Polyline" || r.type === "Polygon";
}

function dispatchAssistPickFeature(r: FeatureRecord) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ria:assist-pick-feature", { detail: { feature: r } }),
  );
}

function dispatchDeletePickFeature(r: FeatureRecord) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ria:delete-pick-feature", { detail: { feature: r } }),
  );
}

function bindDeletePick(layer: L.Layer, r: FeatureRecord) {
  (layer as any).off?.("click");
  (layer as any).on?.("click", (e: L.LeafletMouseEvent) => {
    (e as any)?.originalEvent?.stopPropagation?.();
    (e as any)?.originalEvent?.preventDefault?.();
    dispatchDeletePickFeature(r);
  });
}

function createDeletePickPointHitProxy(latlng: L.LatLng): L.CircleMarker {
  return L.circleMarker(latlng, {
    pane: "ria-overlay-top",
    radius: 12,
    weight: 0,
    opacity: 0,
    fillOpacity: 0,
    interactive: true,
  });
}

function pointInPolygonXZ(
  p: { x: number; z: number },
  poly: Array<{ x: number; z: number }>,
) {
  // ray-casting
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;

    const intersect =
      zi > p.z !== zj > p.z &&
      p.x < ((xj - xi) * (p.z - zi)) / (zj - zi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// RB_SLU_8: label anchor calculation has moved to rendering/label/labelAnchor.ts.

// ======================= 楼层激活/保持：中心范围阈值（可调） =======================
const FLOOR_PICK_ACTIVATE_PX = 70; // “接近中心即可激活”的半径（像素）
const FLOOR_PICK_KEEP_PX = 120; // “保持楼层菜单”的半径（像素，建议 > ACTIVATE）
const FLOOR_PICK_VIEW_PAD = 0.25; // 预筛选：视野 bounds 的 padding，减少遍历成本

// RB_SLU_24：moveend 必须重新刷新 line labels，避免旧视窗 line label 状态污染。
const LABEL_FADE_MS = 140;
const LABEL_ZOOM_SETTLE_DELAY_MS = 160;

// RB_SLU_21: cap expensive SVG/textPath work during first dense label reveal.
const MAX_ADVANCED_LINE_TEXT_LABELS = 120;
const MAX_ADVANCED_LINE_CANDIDATES_PER_PASS = 300;
const MAX_CJK_GLYPH_PATH_LABELS = 80;
const MAX_TOTAL_CJK_GLYPHS = 800;

// RB_SLU_15：轻量 pseudo-tile label layout window。
// 先在当前视口外预留一圈 label 布局缓冲；只要拖动仍在该窗口内，就复用上一轮布局。
const LABEL_LAYOUT_WINDOW_PADDING_RATIO = 0.45;
const LABEL_LAYOUT_WINDOW_MIN_PADDING_PX = 240;
const LABEL_LAYOUT_WINDOW_MAX_REUSE_MS = 2500;
const LABEL_LAYOUT_WINDOW_REFRESH_EDGE_RATIO = 0.18;

type AdvancedLineTextBudgetState = {
  labelsUsed: number;
  candidatesUsed: number;
  glyphLabelsUsed: number;
  glyphsUsed: number;
};

function countLineTextPathCandidates(req: LabelRequest): number {
  return Array.isArray((req as any).lineTextPathCandidates)
    ? (req as any).lineTextPathCandidates.length
    : 0;
}

function countRenderableGlyphs(text: string): number {
  return Array.from(String(text ?? "")).filter((ch) => /\S/.test(ch)).length;
}

function disableAdvancedLineText(
  req: LabelRequest,
  reason: string,
): LabelRequest {
  return {
    ...req,
    lineTextMode: "rotatedLabel",
    textPathFallback: "rotatedLabel",
    displayAnchor: {
      ...(req.displayAnchor ?? {}),
      lineTextMode: "rotatedLabel",
      textPathFallback: "rotatedLabel",
      advancedLineTextEnabled: false,
    },
    textPathBudgetStatus:
      reason === "budgetExceeded" || reason === "cjkGlyphBudgetExceeded"
        ? "budgetExceeded"
        : "disabled",
    textPathFallbackReason: reason,
    glyphPathBudgetStatus:
      reason === "cjkGlyphBudgetExceeded" ? "budgetExceeded" : undefined,
    glyphPathFallbackReason:
      reason === "cjkGlyphBudgetExceeded" ? reason : undefined,
    textPathStatus:
      reason === "budgetExceeded"
        ? "fallbackBudgetExceeded"
        : reason === "cjkGlyphBudgetExceeded"
          ? "fallbackCjkGlyphBudgetExceeded"
          : "fallbackAdvancedTextDisabled",
  } as LabelRequest;
}

function applyAdvancedLineTextBudget(
  req: LabelRequest,
  displayPlan: FeatureDisplayPlan | null | undefined,
  budget: AdvancedLineTextBudgetState,
): LabelRequest {
  const mode = req.lineTextMode;
  if (mode !== "auto" && mode !== "textPath") return req;

  const anchor = displayPlan?.anchor ?? req.displayAnchor ?? ({} as any);
  const group = (anchor as any).advancedLineTextBudgetGroup ?? "network";
  if ((anchor as any).advancedLineTextEnabled === false || group === "none") {
    return disableAdvancedLineText(req, "advancedTextDisabled");
  }

  if ((anchor as any).lineTextRepositionMode === "chainageSearch") {
    const cjkGlyphPathMode = (anchor as any).cjkGlyphPathMode ?? "auto";
    const glyphCount = countRenderableGlyphs(req.text);
    const wantsCjkGlyphPath =
      isMostlyCjkText(req.text) && cjkGlyphPathMode !== "off" && glyphCount > 0;
    return {
      ...req,
      textPathBudgetStatus: "allowed",
      glyphPathBudgetStatus: wantsCjkGlyphPath ? "allowed" : undefined,
      glyphPathGlyphCount: wantsCjkGlyphPath ? glyphCount : undefined,
    } as LabelRequest;
  }

  const candidateCount = Math.max(1, countLineTextPathCandidates(req));
  const maxLabels = Number.isFinite(
    Number((anchor as any).advancedLineTextMaxLabels),
  )
    ? Math.max(0, Number((anchor as any).advancedLineTextMaxLabels))
    : MAX_ADVANCED_LINE_TEXT_LABELS;
  const maxCandidates = Number.isFinite(
    Number((anchor as any).advancedLineTextMaxCandidatesPerPass),
  )
    ? Math.max(0, Number((anchor as any).advancedLineTextMaxCandidatesPerPass))
    : MAX_ADVANCED_LINE_CANDIDATES_PER_PASS;

  if (
    budget.labelsUsed + 1 > maxLabels ||
    budget.candidatesUsed + candidateCount > maxCandidates
  ) {
    return disableAdvancedLineText(req, "budgetExceeded");
  }

  const cjkGlyphPathMode = (anchor as any).cjkGlyphPathMode ?? "auto";
  const glyphCount = countRenderableGlyphs(req.text);
  const wantsCjkGlyphPath =
    isMostlyCjkText(req.text) && cjkGlyphPathMode !== "off" && glyphCount > 0;
  const glyphMaxCount = Number.isFinite(
    Number((anchor as any).cjkGlyphMaxCount),
  )
    ? Math.max(1, Number((anchor as any).cjkGlyphMaxCount))
    : 16;

  if (wantsCjkGlyphPath) {
    if (
      glyphCount > glyphMaxCount ||
      budget.glyphLabelsUsed + 1 > MAX_CJK_GLYPH_PATH_LABELS ||
      budget.glyphsUsed + glyphCount > MAX_TOTAL_CJK_GLYPHS
    ) {
      return disableAdvancedLineText(req, "cjkGlyphBudgetExceeded");
    }
    budget.glyphLabelsUsed += 1;
    budget.glyphsUsed += glyphCount;
  }

  budget.labelsUsed += 1;
  budget.candidatesUsed += candidateCount;
  return {
    ...req,
    textPathBudgetStatus: "allowed",
    glyphPathBudgetStatus: wantsCjkGlyphPath ? "allowed" : undefined,
    glyphPathGlyphCount: wantsCjkGlyphPath ? glyphCount : undefined,
  } as LabelRequest;
}

function findLineTextPathCandidate(
  req: LabelRequest,
  anchorIndex: number,
  anchorId?: string,
) {
  const candidates = Array.isArray((req as any).lineTextPathCandidates)
    ? ((req as any).lineTextPathCandidates as any[])
    : [];
  if (anchorId) {
    const byId = candidates.find((c) => c?.candidateId === anchorId);
    if (byId) return byId;
  }
  return candidates[anchorIndex] ?? null;
}

// ======================= 楼层关联：向上索引 + 向下补全（可拆卸） =======================
const FLOOR_BUILDING_CLASSES = ["STB", "SBP", "BUD"] as const;
const FLOOR_FLOOR_CLASSES = ["STF", "FLR"] as const;

type FloorBuildingClass = (typeof FLOOR_BUILDING_CLASSES)[number];
type FloorClass = (typeof FLOOR_FLOOR_CLASSES)[number];

function getBuildingIdCandidatesForFloorView(b: FeatureRecord): Set<string> {
  const fi: any = b.featureInfo;
  const cls = String(b.meta?.Class ?? "").trim() as FloorBuildingClass;
  const vals: string[] = [];

  if (cls === "STB") {
    vals.push(fi?.ID, fi?.ID);
  } else if (cls === "SBP") {
    vals.push(fi?.ID, fi?.staBuildingPointId, fi?.ID, fi?.ID);
  } else if (cls === "BUD") {
    vals.push(fi?.BuildingID, fi?.ID);
  } else {
    vals.push(fi?.ID);
  }

  const out = new Set<string>();
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) out.add(s);
  }
  return out;
}

function getFloorIdForFloorView(f: FeatureRecord): string {
  const fi: any = f.featureInfo;
  const cls = String(f.meta?.Class ?? "").trim() as FloorClass;
  if (cls === "STF") return String(fi?.ID ?? fi?.ID ?? "").trim();
  if (cls === "FLR") return String(fi?.ID ?? fi?.ID ?? "").trim();
  return String(fi?.ID ?? "").trim();
}

function getFloorParentIdForFloorView(f: FeatureRecord): string {
  const fi: any = f.featureInfo;
  const cls = String(f.meta?.Class ?? "").trim() as FloorClass;
  if (cls === "STF") return String(fi?.ID ?? "").trim();
  if (cls === "FLR") return String(fi?.BuildingID ?? "").trim();
  return "";
}

function extractDownwardFloorRefsFromBuilding(b: FeatureRecord): string[] {
  const fi: any = b.featureInfo;
  const arr = Array.isArray(fi?.Floors) ? fi.Floors : [];
  const out: string[] = [];
  for (const it of arr) {
    const ref = String(
      (it as any)?.[DEFAULT_FLOOR_VIEW.buildingFloorRefField] ?? "",
    ).trim();
    if (ref) out.push(ref);
  }
  return out;
}

function supplementFloorIdsByDownwardRefs(
  b: FeatureRecord,
  floorsById: Map<string, FeatureRecord>,
  floorIdSet: Set<string>,
) {
  // 模块化：后续若要性能优化，可直接跳过该补全步骤
  const refs = extractDownwardFloorRefsFromBuilding(b);
  for (const ref of refs) {
    if (floorIdSet.has(ref)) continue;
    if (floorsById.has(ref)) floorIdSet.add(ref);
  }
}

type FloorOption = { value: string; label: string };

type FloorViewBuildingData = {
  floorIdSet: Set<string>;
  options: FloorOption[];
};

function getFloorSelectorForSearchFocus(r: FeatureRecord): string {
  const cls = String(r.meta?.Class ?? '').trim();
  if (cls !== 'FLR' && cls !== 'STF') return '';

  return String(
    (r.featureInfo as any)?.[DEFAULT_FLOOR_VIEW.floorSelectorField] ?? '',
  ).trim();
}

function buildFloorViewDataForBuilding(
  store: FeatureStore,
  building: FeatureRecord,
): FloorViewBuildingData | null {
  const floors: FeatureRecord[] = (
    FLOOR_FLOOR_CLASSES as readonly string[]
  ).flatMap((c) => store.byClass[c] ?? []);

  const floorsById = new Map<string, FeatureRecord>();
  for (const f of floors) {
    const fid = getFloorIdForFloorView(f);
    if (fid) floorsById.set(fid, f);
  }

  const buildingIds = getBuildingIdCandidatesForFloorView(building);
  const floorIdSet = new Set<string>();

  if (buildingIds.size) {
    for (const f of floors) {
      const parent = getFloorParentIdForFloorView(f);
      if (!parent || !buildingIds.has(parent)) continue;
      const fid = getFloorIdForFloorView(f);
      if (fid) floorIdSet.add(fid);
    }
  }

  supplementFloorIdsByDownwardRefs(building, floorsById, floorIdSet);

  if (floorIdSet.size === 0) return null;

  const selectorSet = new Set<string>();
  for (const fid of floorIdSet) {
    const f = floorsById.get(fid);
    if (!f) continue;
    const selector = String(
      (f.featureInfo as any)?.[DEFAULT_FLOOR_VIEW.floorSelectorField] ?? '',
    ).trim();
    if (selector) selectorSet.add(selector);
  }

  const values = Array.from(selectorSet);
  values.sort(compareFloorDisplayOrder);

  return {
    floorIdSet,
    options: values.map((v) => ({
      value: v,
      label: formatFloorDisplayLabel(v),
    })),
  };
}

function resolveBuildingForFloorFeature(
  store: FeatureStore,
  floorFeature: FeatureRecord,
): { building: FeatureRecord; options: FloorOption[] } | null {
  const floorSelector = getFloorSelectorForSearchFocus(floorFeature);
  if (!floorSelector) return null;

  const floorId = getFloorIdForFloorView(floorFeature);
  const parentId = getFloorParentIdForFloorView(floorFeature);
  if (!floorId && !parentId) return null;

  const buildings: FeatureRecord[] = (
    FLOOR_BUILDING_CLASSES as readonly string[]
  ).flatMap((c) => store.byClass[c] ?? []);

  for (const building of buildings) {
    const data = buildFloorViewDataForBuilding(store, building);
    if (!data) continue;

    const buildingIds = getBuildingIdCandidatesForFloorView(building);
    const parentMatches = !!parentId && buildingIds.has(parentId);
    const floorMatches = !!floorId && data.floorIdSet.has(floorId);
    const floorOptionMatches = data.options.some(
      (opt) => opt.value === floorSelector,
    );

    if ((parentMatches || floorMatches) && floorOptionMatches) {
      return { building, options: data.options };
    }
  }

  return null;
}

function distanceFromViewportCenterToBoundsPx(
  map: L.Map,
  bounds: L.LatLngBounds,
): number {
  const size = map.getSize();
  const c = L.point(size.x / 2, size.y / 2);

  const nw = map.latLngToContainerPoint(bounds.getNorthWest());
  const se = map.latLngToContainerPoint(bounds.getSouthEast());

  const minX = Math.min(nw.x, se.x);
  const maxX = Math.max(nw.x, se.x);
  const minY = Math.min(nw.y, se.y);
  const maxY = Math.max(nw.y, se.y);

  const dx = c.x < minX ? minX - c.x : c.x > maxX ? c.x - maxX : 0;
  const dy = c.y < minY ? minY - c.y : c.y > maxY ? c.y - maxY : 0;

  return Math.hypot(dx, dy);
}

function getFeatureBoundsLatLng(
  projection: any,
  coords3: Array<{ x: number; z: number }>,
  y: number,
): L.LatLngBounds | null {
  if (!coords3?.length) return null;

  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const pt of coords3) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minZ = Math.min(minZ, pt.z);
    maxZ = Math.max(maxZ, pt.z);
  }

  const ll1 = projection.locationToLatLng(minX, y, minZ);
  const ll2 = projection.locationToLatLng(minX, y, maxZ);
  const ll3 = projection.locationToLatLng(maxX, y, minZ);
  const ll4 = projection.locationToLatLng(maxX, y, maxZ);

  const minLat = Math.min(ll1.lat, ll2.lat, ll3.lat, ll4.lat);
  const maxLat = Math.max(ll1.lat, ll2.lat, ll3.lat, ll4.lat);
  const minLng = Math.min(ll1.lng, ll2.lng, ll3.lng, ll4.lng);
  const maxLng = Math.max(ll1.lng, ll2.lng, ll3.lng, ll4.lng);

  return L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
}

function makeLabelMarker(
  latlng: L.LatLng,
  text: string,
  placement: "center" | "near",
  withDot?: boolean,
  offsetY?: number,
  styleKey?: any, // string key; 类型由 labelStyles 维护
  dotAnchorMode?: "inline" | "anchorRight",
) {
  const icon = makeLabelDivIcon(
    (styleKey ?? "bubble-dark") as any,
    String(text ?? ""),
    {
      placement,
      withDot: !!withDot,
      dotAnchorMode,
      offsetY,
      interactive: false,
    },
  );

  return L.marker(latlng, {
    interactive: false,
    pane: "ria-label",
    icon,
  });
}

function normalizeLabelAngleForWritingMode(angle: number): number {
  let a = Number(angle) || 0;
  while (a > 180) a -= 360;
  while (a <= -180) a += 360;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

function isLineLabelStyleKey(styleKey: any): boolean {
  const k =
    styleKey && typeof styleKey === "object"
      ? String((styleKey as any).key ?? "")
      : String(styleKey ?? "");
  return (
    k.startsWith("rle-line-") ||
    /^gm-bw-\d+$/.test(k) ||
    /^gm-wtb-\d+$/.test(k) ||
    k.startsWith("gm-outline")
  );
}

function applyLineLabelOrientationStyle(
  styleKey: any,
  _text: string,
  rotateDeg: number,
): any {
  if (!isLineLabelStyleKey(styleKey)) {
    return styleKey && typeof styleKey === "object"
      ? { ...(styleKey as any), rotateDeg: 0 }
      : styleKey;
  }
  const baseObj =
    styleKey && typeof styleKey === "object"
      ? { ...(styleKey as any) }
      : { key: String(styleKey ?? "") };
  const a = normalizeLabelAngleForWritingMode(rotateDeg);
  // RB_SLU_21: do not turn an entire CJK line label into a vertical text
  // block. True per-glyph upright-on-path handling is reserved for RB_SLU_22;
  // this recovery patch keeps the label body attached to the line.
  return { ...baseObj, rotateDeg: a, writingMode: "horizontal" };
}

function getLayerElement(
  layer: L.Layer | undefined | null,
): HTMLElement | null {
  const fn = (layer as any)?.getElement;
  if (typeof fn !== "function") return null;
  const el = fn.call(layer);
  return el instanceof HTMLElement ? el : null;
}

function fadeInLabelLayer(layer: L.Layer | undefined | null) {
  if (!layer || typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const el = getLayerElement(layer);
    if (!el) return;
    el.style.transition = `opacity ${LABEL_FADE_MS}ms ease`;
    el.style.willChange = "opacity";
    if ((el as any).dataset?.riaLabelFadeReady === "1") {
      el.style.opacity = "1";
      return;
    }
    el.style.opacity = "0";
    (el as any).dataset.riaLabelFadeReady = "1";
    window.requestAnimationFrame(() => {
      const nextEl = getLayerElement(layer);
      if (!nextEl) return;
      nextEl.style.opacity = "1";
    });
  });
}

function fadeRemoveLabelLayer(
  root: L.LayerGroup,
  layer: L.Layer | undefined | null,
  immediate: boolean = false,
) {
  if (!layer) return;
  if (immediate || typeof window === "undefined") {
    if (root.hasLayer(layer)) root.removeLayer(layer);
    return;
  }
  const el = getLayerElement(layer);
  if (!el) {
    if (root.hasLayer(layer)) root.removeLayer(layer);
    return;
  }
  el.style.transition = `opacity ${LABEL_FADE_MS}ms ease`;
  el.style.opacity = "0";
  window.setTimeout(() => {
    if (root.hasLayer(layer)) root.removeLayer(layer);
  }, LABEL_FADE_MS + 30);
}

function clearBundleLabel(
  bundle: LayerBundle,
  root: L.LayerGroup,
  immediate: boolean = false,
) {
  if (bundle.label) fadeRemoveLabelLayer(root, bundle.label, immediate);
  bundle.label = undefined;
  bundle.labelKey = undefined;
}

function detectGeoType(featureInfo: any): GeoType | null {
  const t = String((featureInfo as any)?.Type ?? "").trim();
  if (t === "Points" || t === "Polyline" || t === "Polygon")
    return t as GeoType;
  // 兜底：按字段猜
  if (Array.isArray((featureInfo as any)?.CoordP) || (featureInfo as any)?.coordinate) return "Points";
  if (
    Array.isArray((featureInfo as any)?.CoordL) ||
    Array.isArray((featureInfo as any)?.PLpoints) ||
    Array.isArray((featureInfo as any)?.Linepoints)
  )
    return "Polyline";
  if (
    Array.isArray((featureInfo as any)?.CoordG) ||
    Array.isArray((featureInfo as any)?.Conpoints) ||
    Array.isArray((featureInfo as any)?.Flrpoints)
  )
    return "Polygon";
  return null;
}

function buildRecordsFromJson(
  items: any[],
  sourceFile: string,
  opts?: { excludeIds?: Set<string> },
): FeatureRecord[] {
  const out: FeatureRecord[] = [];
  let uidSeq = 1;

  for (const item of items) {
    const cls = String((item as any)?.Class ?? "").trim();
    if (!cls) continue;
    const type = detectGeoType(item);
    if (!type) continue;

    const uid = `${sourceFile}#${uidSeq++}`;
    const meta = buildFeatureMeta(item, cls, type, sourceFile);

    // 若指定了 “excludeIds”，则屏蔽固定数据源中被覆盖的同 ID 要素
    if (
      opts?.excludeIds &&
      opts.excludeIds.has(String(meta.idValue ?? "").trim())
    ) {
      continue;
    }

    const r: FeatureRecord = {
      uid,
      meta,
      featureInfo: item,
      type,
    };

    const geometryType = geometryTypeFromFeatureType(type);
    if (!geometryType) continue;
    const geometryRead = readMultipartGeometry(item, geometryType);
    if (!geometryRead.geometry) {
      if (geometryRead.error) console.warn('[multipart-geometry]', geometryRead.error, sourceFile, item);
      continue;
    }
    r.multipartGeometry = geometryRead.geometry;
    const representative = firstMultipartCoordinate(geometryRead.geometry);
    if (!representative) continue;
    if (type === "Points") {
      r.p3 = representative;
    } else if (type === "Polyline") {
      const allParts = geometryRead.geometry.type === 'LineString' ? geometryRead.geometry.parts : [];
      if (!allParts.length || allParts.some((part) => part.length < 2)) continue;
      r.coords3 = flattenMultipartCoordinates(geometryRead.geometry);
    } else if (type === "Polygon") {
      const allParts = geometryRead.geometry.type === 'Polygon' ? geometryRead.geometry.parts : [];
      if (!allParts.length || allParts.some((part) => (part[0]?.length ?? 0) < 3)) continue;
      r.coords3 = flattenMultipartCoordinates(geometryRead.geometry);
    }

    out.push(r);
  }
  return out;
}

export default function RuleDrivenLayer(props: Props) {
  const {
    mapReady,
    map,
    projection,
    worldId,
    visible,
    activeButtonIds = [],
  } = props;

  const worldDataset = useRuleDataStore((s) => s.datasets[worldId] ?? null);
  const ensureWorldLoaded = useRuleDataStore((s) => s.ensureWorldLoaded);

  const rootRef = useRef<L.LayerGroup | null>(null);
  const highlightGroupRef = useRef<L.LayerGroup | null>(null);

  const [selectedFeature, setSelectedFeature] = useState<FeatureRecord | null>(
    null,
  );
  const [featureCardOpen, setFeatureCardOpen] = useState(false);
  const [assistPickActive, setAssistPickActive] = useState(false);
  const [deletePickActive, setDeletePickActive] = useState(false);
  const [featureInteractionSuppressed, setFeatureInteractionSuppressed] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!(window as any).__riaFeatureInteractionSuppressed;
  });

  useEffect(() => {
    const handler = (ev: Event) => {
      const active = !!(ev as CustomEvent<any>)?.detail?.active;
      setFeatureInteractionSuppressed(active);
    };
    window.addEventListener("ria:feature-interaction-suppression", handler as EventListener);
    setFeatureInteractionSuppressed(!!(window as any).__riaFeatureInteractionSuppressed);
    return () => {
      window.removeEventListener("ria:feature-interaction-suppression", handler as EventListener);
    };
  }, []);

  const cacheRef = useRef<Map<string, LayerBundle>>(new Map());
  const allRecordsRef = useRef<FeatureRecord[]>([]);
  const recordsRef = useRef<FeatureRecord[]>([]);
  const storeRef = useRef<FeatureStore | null>(null);
  const pendingRuleFirstPaintWorldRef = useRef<string | null>(null);
  const pendingRuleFirstPaintFlowRef = useRef<string | null>(null);
  const renderCompletionScheduledRef = useRef(false);
  const labelViewportSnapshotRef = useRef<LabelViewportSnapshot | null>(null);
  const labelLayoutWindowRef = useRef<LabelLayoutWindowState | null>(null);
  const lineLabelAuditSnapshotRef = useRef<LineLabelAuditSnapshot | null>(null);
  const polygonLabelAuditSnapshotRef = useRef<PolygonLabelAuditSnapshot | null>(null);
  const labelZoomSettleTimerRef = useRef<number | null>(null);
  const labelZoomAnimatingRef = useRef(false);
  const pendingZoomRefreshReasonRef = useRef<
    "moveend" | "zoomend" | "state" | null
  >(null);

  // floor UI
  const [floorOptions, setFloorOptions] = useState<FloorOption[]>([]);
  const floorOptionsRef = useRef<FloorOption[]>([]);
  const [activeFloorIndex, setActiveFloorIndex] = useState<number>(0);
  const [activeBuildingUid, setActiveBuildingUid] = useState<string | null>(
    null,
  );
  const activeBuildingUidRef = useRef<string | null>(null);
  const [activeBuildingFloorRefSet, setActiveBuildingFloorRefSet] =
    useState<Set<string> | null>(null);
  const [activeBuildingName, setActiveBuildingName] = useState<string>("");
  const lastFloorSelectionRef = useRef<{
    buildingUid: string;
    floorValue: string;
  } | null>(null);
  const pendingFloorFocusRef = useRef<{
    sourceUid: string;
    floorSelector: string;
    buildingUid?: string;
  } | null>(null);

  useEffect(() => {
    floorOptionsRef.current = floorOptions;
  }, [floorOptions]);

  useEffect(() => {
    activeBuildingUidRef.current = activeBuildingUid;
  }, [activeBuildingUid]);

  const applyFloorIndexForBuilding = (
    buildingUid: string,
    idx: number,
    options: FloorOption[] = floorOptionsRef.current,
  ) => {
    const floorValue = options[idx]?.value;
    if (!buildingUid || !floorValue) return false;
    setActiveFloorIndex(idx);
    lastFloorSelectionRef.current = {
      buildingUid,
      floorValue,
    };
    return true;
  };

  const applyPendingFloorFocusForBuilding = (
    buildingUid: string,
    options: FloorOption[] = floorOptionsRef.current,
  ) => {
    const pending = pendingFloorFocusRef.current;
    if (!pending || pending.buildingUid !== buildingUid) return false;

    const pendingIndex = options.findIndex(
      (opt) => opt.value === pending.floorSelector,
    );
    if (pendingIndex < 0) {
      pendingFloorFocusRef.current = null;
      return false;
    }

    const applied = applyFloorIndexForBuilding(
      buildingUid,
      pendingIndex,
      options,
    );
    if (applied) pendingFloorFocusRef.current = null;
    return applied;
  };

  const setActiveFloorIndexAndRemember = (idx: number) => {
    const buildingUid = activeBuildingUidRef.current;
    if (!buildingUid) {
      setActiveFloorIndex(idx);
      return;
    }
    applyFloorIndexForBuilding(buildingUid, idx, floorOptionsRef.current);
  };

  // 让 React 能感知 Leaflet 的 zoom/move（否则 ctx/showFloorUI 可能停留在旧值）
  const [leafletZoomState, setLeafletZoomState] = useState<number>(() =>
    map.getZoom(),
  );

  // rawDataVersion：仅代表“预加载池(allRecordsRef)更新完成”，不直接驱动渲染。
  const [rawDataVersion, setRawDataVersion] = useState(0);
  // dataVersion：代表“进入渲染/索引的数据集(recordsRef/storeRef)更新完成”，驱动后续渲染/楼层逻辑。
  const [dataVersion, setDataVersion] = useState(0);

  // ======== 临时挂载数据源（来自 MeasuringModule，本地存储） ========
  const [tempSourceVersion, setTempSourceVersion] = useState(0);

  const TEMP_RULE_SOURCES_KEY = "ria_temp_rule_sources_v1";
  const TEMP_RULE_OVERRIDE_IDS_KEY = "ria_temp_rule_override_ids_v1";
  const TEMP_RULE_DELETE_IDS_KEY = "ria_temp_rule_delete_ids_v1";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as Window;
    const ria = (win.RIA ??= {});
    const debug = ((ria as any).debug ??= {});

    const lineLabels = () => {
      const snapshot = lineLabelAuditSnapshotRef.current;
      printLineLabelAudit(snapshot);
      return snapshot;
    };
    const lineLabelsTxt = () => {
      const snapshot = lineLabelAuditSnapshotRef.current;
      downloadLineLabelAuditTxt(snapshot);
      return snapshot;
    };
    const lineLabelsViewport = (options?: { allAttempts?: boolean }) => {
      const snapshot = lineLabelAuditSnapshotRef.current;
      printLineLabelViewportAudit(snapshot, options);
      return snapshot;
    };
    const lineLabelsViewportTxt = (options?: { allAttempts?: boolean }) => {
      const snapshot = lineLabelAuditSnapshotRef.current;
      downloadLineLabelViewportAuditTxt(snapshot, options);
      return snapshot;
    };
    const polygonLabels = (options?: PolygonLabelAuditOptions) => {
      const snapshot = polygonLabelAuditSnapshotRef.current;
      printPolygonLabelAudit(snapshot, options);
      return snapshot;
    };
    const polygonLabelsTxt = (options?: PolygonLabelAuditOptions) => {
      const snapshot = polygonLabelAuditSnapshotRef.current;
      downloadPolygonLabelAuditTxt(snapshot, options);
      return snapshot;
    };

    debug.lineLabels = lineLabels;
    debug.lineLabelsTxt = lineLabelsTxt;
    debug.lineLabelsViewport = lineLabelsViewport;
    debug.lineLabelsViewportTxt = lineLabelsViewportTxt;
    debug.polygonLabels = polygonLabels;
    debug.polygonLabelsTxt = polygonLabelsTxt;

    return () => {
      if (debug.lineLabels === lineLabels) delete debug.lineLabels;
      if (debug.lineLabelsTxt === lineLabelsTxt) delete debug.lineLabelsTxt;
      if (debug.lineLabelsViewport === lineLabelsViewport)
        delete debug.lineLabelsViewport;
      if (debug.lineLabelsViewportTxt === lineLabelsViewportTxt)
        delete debug.lineLabelsViewportTxt;
      if (debug.polygonLabels === polygonLabels) delete debug.polygonLabels;
      if (debug.polygonLabelsTxt === polygonLabelsTxt)
        delete debug.polygonLabelsTxt;
    };
  }, []);

  function isActiveRuleLoading(worldId: string, stageName?: string): boolean {
    const state = useLoadingStore.getState();
    if (!state.isRuleWorldFlow(worldId)) return false;
    return stageName ? state.hasStage(stageName) : true;
  }

  function updateRuleLoadingStage(
    worldId: string,
    name: string,
    status: "pending" | "loading" | "success" | "error",
    message?: string,
  ) {
    const state = useLoadingStore.getState();
    if (!state.isRuleWorldFlow(worldId) || !state.hasStage(name)) return;
    state.updateStage(name, status, message);
  }

  function finishRuleLoading(worldId: string, flowId?: string | null) {
    const state = useLoadingStore.getState();
    if (!state.isRuleWorldFlow(worldId)) return;
    if (flowId && state.activeFlowId !== flowId) return;
    state.finishLoadingByFlow(flowId);
  }

  type TempRuleSource = {
    uid: string;
    worldId: string;
    label?: string;
    enabled: boolean;
    items: any[];
    picturesById?: Record<string, FeaturePictureEntry[]>;
  };

  function readTempSources(worldId: string): TempRuleSource[] {
    try {
      const raw = localStorage.getItem(TEMP_RULE_SOURCES_KEY);
      if (!raw) return [];
      const obj = JSON.parse(raw);
      const list = (obj?.[worldId] ?? []) as any[];
      if (!Array.isArray(list)) return [];
      return list
        .filter((x) => x && typeof x === "object")
        .map((x) => {
          const rawPictures = (x as any).picturesById;
          const picturesById: Record<string, FeaturePictureEntry[]> = {};
          if (rawPictures && typeof rawPictures === "object") {
            for (const [id, list] of Object.entries(rawPictures as Record<string, any>)) {
              if (!Array.isArray(list)) continue;
              const entries = list
                .map((pic: any) => ({
                  source: pic?.source === "pub" || pic?.source === "dat" ? pic.source : "dat",
                  url: String(pic?.url ?? "").trim(),
                  filename: pic?.filename ? String(pic.filename) : undefined,
                  relativePath: pic?.relativePath ? String(pic.relativePath) : undefined,
                }))
                .filter((pic: FeaturePictureEntry) => Boolean(pic.url));
              if (entries.length > 0) picturesById[String(id)] = entries;
            }
          }
          return {
            uid: String((x as any).uid ?? ""),
            worldId: String((x as any).worldId ?? worldId),
            label: (x as any).label ? String((x as any).label) : undefined,
            enabled: Boolean((x as any).enabled),
            items: Array.isArray((x as any).items) ? (x as any).items : [],
            picturesById,
          };
        })
        .filter((x) => x.uid && x.worldId === worldId);
    } catch {
      return [];
    }
  }

  function readTempOverrideIds(worldId: string): Set<string> {
    try {
      const raw = localStorage.getItem(TEMP_RULE_OVERRIDE_IDS_KEY);
      if (!raw) return new Set();
      const obj = JSON.parse(raw);
      const list = (obj?.[worldId] ?? []) as any[];
      if (!Array.isArray(list)) return new Set();
      return new Set(list.map((x) => String(x ?? "").trim()).filter((s) => s));
    } catch {
      return new Set();
    }
  }
  function readTempDeleteIds(worldId: string): Set<string> {
    try {
      const raw = localStorage.getItem(TEMP_RULE_DELETE_IDS_KEY);
      if (!raw) return new Set();
      const obj = JSON.parse(raw);
      const list = (obj?.[worldId] ?? []) as any[];
      if (!Array.isArray(list)) return new Set();
      return new Set(list.map((x) => String(x ?? "").trim()).filter((s) => s));
    } catch {
      return new Set();
    }
  }

  useEffect(() => {
    if (!mapReady) return;

    const sync = () => setLeafletZoomState(map.getZoom());
    sync();

    map.on("zoomend", sync);
    map.on("moveend", sync);
    return () => {
      map.off("zoomend", sync);
      map.off("moveend", sync);
    };
  }, [mapReady, map]);

  // 监听 MeasuringModule 写入的“临时挂载源/覆盖屏蔽列表”变化
  useEffect(() => {
    if (!mapReady) return;
    const handler = (e: any) => {
      try {
        const wid = e?.detail?.worldId;
        if (!wid || String(wid) === String(worldId)) {
          setTempSourceVersion((v) => v + 1);
        }
      } catch {
        setTempSourceVersion((v) => v + 1);
      }
    };
    window.addEventListener("ria-temp-rule-sources-changed", handler);
    window.addEventListener("ria-temp-rule-overrides-changed", handler as any);
    window.addEventListener("ria-temp-rule-deletes-changed", handler as any);
    return () => {
      window.removeEventListener("ria-temp-rule-sources-changed", handler);
      window.removeEventListener(
        "ria-temp-rule-overrides-changed",
        handler as any,
      );
      window.removeEventListener(
        "ria-temp-rule-deletes-changed",
        handler as any,
      );
    };
  }, [mapReady, worldId]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const active = Boolean((ev as CustomEvent<any>)?.detail?.active);
      setAssistPickActive(active);
    };
    window.addEventListener("ria:assist-pick-mode", handler as EventListener);
    return () =>
      window.removeEventListener(
        "ria:assist-pick-mode",
        handler as EventListener,
      );
  }, []);

  useEffect(() => {
    const handler = (ev: Event) => {
      const active = Boolean((ev as CustomEvent<any>)?.detail?.active);
      setDeletePickActive(active);
    };
    window.addEventListener("ria:delete-pick-mode", handler as EventListener);
    return () =>
      window.removeEventListener(
        "ria:delete-pick-mode",
        handler as EventListener,
      );
  }, []);

  // (1) 加载数据（当前 world 数据集 + 临时挂载）
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!mapReady) return;

      let dataset = worldDataset;
      if (!dataset) {
        try {
          dataset = await ensureWorldLoaded(worldId);
        } catch (e) {
          console.warn("[RuleDrivenLayer] ensureWorldLoaded failed", e);
          return;
        }
      }

      updateRuleLoadingStage(worldId, "world-record-build", "loading");

      const all: FeatureRecord[] = [];

      // 覆盖屏蔽列表：仅当“临时挂载源”处于启用状态时才生效。
      const enabledTemps = readTempSources(worldId).filter((t) => t.enabled);
      const overrideIds =
        enabledTemps.length > 0
          ? readTempOverrideIds(worldId)
          : new Set<string>();
      const deleteIds =
        enabledTemps.length > 0
          ? readTempDeleteIds(worldId)
          : new Set<string>();
      const tempPicturesById: Record<string, FeaturePictureEntry[]> = {};
      for (const temp of enabledTemps) {
        const mapping = temp.picturesById ?? {};
        for (const [id, entries] of Object.entries(mapping)) {
          if (Array.isArray(entries) && entries.length > 0) tempPicturesById[id] = entries;
        }
      }
      setTempMountedPictureEntries(worldId, tempPicturesById);
      const excludeIds = new Set<string>([...overrideIds, ...deleteIds]);

      // (A) 当前 world 的 Rule 数据集（由 ruleDataStore 负责版本校验与缓存）
      const datasetItems = Array.isArray(dataset?.features)
        ? dataset.features
        : [];
      all.push(
        ...buildRecordsFromJson(
          datasetItems as any[],
          `rule-world:${worldId}`,
          { excludeIds },
        ),
      );

      // (B) 临时挂载数据源（来自 MeasuringModule，本地存储）
      try {
        for (const t of enabledTemps) {
          try {
            const label = t.label ?? t.uid;
            all.push(...buildRecordsFromJson(t.items, label));
          } catch (e) {
            console.warn(
              "[RuleDrivenLayer] failed to load temp source",
              t.uid,
              e,
            );
          }
        }
      } catch (e) {
        console.warn("[RuleDrivenLayer] readTempSources failed", e);
      }

      if (cancelled) return;

      allRecordsRef.current = all;
      setRuleSearchPool(worldId, all);
      if (isActiveRuleLoading(worldId)) {
        const loadingState = useLoadingStore.getState();
        pendingRuleFirstPaintWorldRef.current = worldId;
        pendingRuleFirstPaintFlowRef.current = loadingState.activeFlowId;
      }
      renderCompletionScheduledRef.current = false;
      updateRuleLoadingStage(
        worldId,
        "world-record-build",
        "success",
        `要素数 ${all.length}`,
      );
      setRawDataVersion((v) => v + 1);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [mapReady, worldId, worldDataset, ensureWorldLoaded, tempSourceVersion]);

  // =========================
  // SearchBar -> RuleDrivenLayer：按 uid 打开信息卡
  // - SearchBar/MapContainer 负责：聚焦/缩放/（必要时）打开对应分组开关
  // - RuleDrivenLayer 负责：在渲染池内找到目标 record 并打开/高亮
  // =========================
  const pendingOpenUidRef = useRef<string | null>(null);
  const ctxRef = useRef<RenderContext | null>(null);

  const tryOpenByUid = (uid: string) => {
    const key = String(uid ?? "").trim();
    if (!key) return false;
    const store = storeRef.current;
    if (!store) return false;
    const rr = store.all.find((r) => r.uid === key);
    if (!rr) return false;

    const focusFloorSelector = getFloorSelectorForSearchFocus(rr);
    if (focusFloorSelector) {
      const floorBuilding = resolveBuildingForFloorFeature(store, rr);
      if (floorBuilding) {
        const buildingUid = floorBuilding.building.uid;
        pendingFloorFocusRef.current = {
          sourceUid: rr.uid,
          floorSelector: focusFloorSelector,
          buildingUid,
        };

        const optionIndex = floorBuilding.options.findIndex(
          (opt) => opt.value === focusFloorSelector,
        );
        if (optionIndex >= 0) {
          lastFloorSelectionRef.current = {
            buildingUid,
            floorValue: focusFloorSelector,
          };

          if (activeBuildingUidRef.current === buildingUid) {
            applyFloorIndexForBuilding(
              buildingUid,
              optionIndex,
              floorBuilding.options,
            );
            pendingFloorFocusRef.current = null;
          }
        }
      } else {
        pendingFloorFocusRef.current = null;
      }
    }

    // 尽量复用“label click”规则（如果有），保证交互一致；否则仅打开信息卡。
    const curCtx = ctxRef.current;
    const rule = findFirstRule(rr);
    const rawClick = (rule as any)?.symbol?.labelClick;
    if (rawClick) {
      // 若尚未拿到 RenderContext（例如按钮刚被打开、effect 还未同步），则跳过 labelClick 复用逻辑。
      if (curCtx) {
        const clickPlan: any =
          typeof rawClick === "function"
            ? rawClick(rr, curCtx, store)
            : rawClick;
        if (clickPlan && clickPlan.enabled) {
          handleLabelClick(rr, clickPlan as any);
          return true;
        }
      }
    }

    // fallback：仅打开信息卡（高亮逻辑保持为空）
    setSelectedFeature(rr);
    setFeatureCardOpen(true);
    return true;
  };

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<any>)?.detail;
      const uid = String(detail?.uid ?? "").trim();
      if (!uid) return;

      // 先尝试立即打开；若当前未在渲染池（可能因为分组开关尚未打开），记录为 pending。
      if (!tryOpenByUid(uid)) {
        pendingOpenUidRef.current = uid;
      }
    };

    window.addEventListener("ria:ruleFeatureSelect", handler as any);
    return () =>
      window.removeEventListener("ria:ruleFeatureSelect", handler as any);
    // worldId 切换时会卸载/重挂载 listener，避免跨世界误开。
  }, [worldId]);

  useEffect(() => {
    const handler = () => {
      highlightGroupRef.current?.clearLayers();
      setFeatureCardOpen(false);
      setSelectedFeature(null);
    };

    window.addEventListener("ria:ruleFeatureCardClose", handler as any);
    return () =>
      window.removeEventListener("ria:ruleFeatureCardClose", handler as any);
  }, []);

  // (2) “分组开关”筛选：将预加载池(allRecordsRef) → 渲染池(recordsRef/storeRef)
  // - 支持多个开关并集
  // - 交叉命中不会重复加载（最终只是一次 filter 得到的唯一 record 列表）
  // - 关闭某一开关时，仅移除其独占贡献，交叉区域若仍被其它开关覆盖则保留
  useEffect(() => {
    if (!mapReady) return;

    updateRuleLoadingStage(worldId, "world-filter-apply", "loading");

    const all = allRecordsRef.current;
    const filtered = filterRecordsByRuleButtons(all, activeButtonIds);

    recordsRef.current = filtered;
    const store = new FeatureStore(filtered);
    storeRef.current = store;

    // 重复 key 排查：Class|idField=idValue（仅对“进入渲染池”的集合做报告）
    const dups = store.buildDuplicateKeyReport();
    if (dups.length) {
      console.warn(
        "[RuleDrivenLayer] duplicate Class+ID keys detected:",
        dups.map((d) => d.dupKey),
      );
      for (const d of dups) console.warn("[RuleDrivenLayer] dupKey detail:", d);
    }

    // 新的筛选结果 → 清空缓存，让渲染逻辑重新建 layer（避免旧 layer 残留）
    cacheRef.current.clear();
    rootRef.current?.clearLayers();

    // ✅ 保持高亮图层组始终挂载（clearLayers 会移除它）
    if (rootRef.current) {
      if (!highlightGroupRef.current)
        highlightGroupRef.current = L.layerGroup();
      rootRef.current.addLayer(highlightGroupRef.current);
    }

    // 选中项若被筛掉，主动清空（避免信息卡指向不存在的要素）
    if (
      selectedFeature &&
      !filtered.some((r) => r.uid === selectedFeature.uid)
    ) {
      highlightGroupRef.current?.clearLayers();
      setFeatureCardOpen(false);
      setSelectedFeature(null);
    }

    // 重置楼层态（筛选变化可能影响可用楼层/建筑）
    setFloorOptions([]);
    setActiveBuildingUid(null);
    setActiveBuildingFloorRefSet(null);
    setActiveBuildingName("");
    setActiveFloorIndex(0);

    // 若 SearchBar 触发“打开某个 uid”的事件，但当时未在渲染池（分组开关尚未开启），
    // 则在筛选结果更新后再尝试一次。
    if (pendingOpenUidRef.current) {
      const uid = pendingOpenUidRef.current;
      if (tryOpenByUid(uid)) pendingOpenUidRef.current = null;
    }

    // ✅ 关键：告诉 React “进入渲染池的数据已更新”
    updateRuleLoadingStage(
      worldId,
      "world-filter-apply",
      "success",
      `渲染池 ${filtered.length}`,
    );
    setDataVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, worldId, rawDataVersion, JSON.stringify(activeButtonIds)]);

  // (3) 总开关：挂载/卸载 root layerGroup
  useEffect(() => {
    if (!mapReady) return;
    if (!rootRef.current) {
      rootRef.current = L.layerGroup();
      if (!highlightGroupRef.current)
        highlightGroupRef.current = L.layerGroup();
      rootRef.current.addLayer(highlightGroupRef.current);
    }

    if (!visible) {
      if (map.hasLayer(rootRef.current)) map.removeLayer(rootRef.current);
      return;
    }
    if (!map.hasLayer(rootRef.current)) rootRef.current.addTo(map);

    return () => {
      if (rootRef.current && map.hasLayer(rootRef.current))
        map.removeLayer(rootRef.current);
    };
  }, [mapReady, map, visible]);

  const ctx: RenderContext = useMemo(() => {
    const leafletZoom = leafletZoomState;
    const zoomLevel = toZoomLevel(leafletZoom);
    return {
      worldId,
      leafletZoom,
      zoomLevel,
      //inFloorView: zoomLevel >= DEFAULT_FLOOR_VIEW.minLevel,
      inFloorView: zoomLevel >= FLOOR_VIEW_MIN_LEVEL,
      activeBuildingUid,
      activeFloorSelector: floorOptions[activeFloorIndex]?.value ?? null,
      activeBuildingFloorRefSet,
    };
  }, [
    worldId,
    leafletZoomState,
    activeBuildingUid,
    activeBuildingFloorRefSet,
    floorOptions,
    activeFloorIndex,
  ]);

  // 供 SearchBar/MapContainer 的“外部打开信息卡”事件复用 labelClick 逻辑使用。
  // 注意：必须放在 ctx 声明之后，避免出现 “ctx used before declaration”。
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  const handleLabelClick = (r: FeatureRecord, plan: LabelClickPlan) => {
    if (assistPickActive || deletePickActive) return;
    if (!highlightGroupRef.current) highlightGroupRef.current = L.layerGroup();
    highlightGroupRef.current.clearLayers();

    const hl = createHighlightLayerForFeature({
      r,
      projection,
      highlightStyleKey: (plan as any)?.highlightStyleKey,
      pointPinStyleKey: (plan as any)?.pointPinStyleKey,
    });
    if (hl) highlightGroupRef.current.addLayer(hl);

    if ((plan as any)?.openCard) {
      setSelectedFeature(r);
      setFeatureCardOpen(true);
    }
  };

  /**
   * ✅ 选中/高亮 与 通用信息框绑定：
   * 当用户关闭信息框时，同时清空当前选中要素的点击高亮效果。
   * 这更符合主流网络地图的交互逻辑：关闭详情 = 取消选中。
   */
  const clearSelection = () => {
    highlightGroupRef.current?.clearLayers();
    setFeatureCardOpen(false);
    setSelectedFeature(null);
  };

  // =========================
  // 信息卡“要素跳转”支持：
  // - resolveFeatureById：用于在信息卡中将 id 映射为目标要素（显示 Name）
  // - onTryTriggerLabelClickById：点击时尝试触发目标要素的 labelClick（若无则静默无反应）
  // =========================
  // NOTE: FeatureInteractionCard expects `undefined` for “not found”.
  const getFeatureValueByPath = (
    record: FeatureRecord,
    path: string,
  ): unknown => {
    const normalizedPath = String(path || "ID").trim();
    if (!normalizedPath || normalizedPath === "ID")
      return record?.meta?.idValue ?? record?.featureInfo?.ID;
    return normalizedPath.split(".").reduce<unknown>((acc, key) => {
      if (acc == null || typeof acc !== "object") return undefined;
      return (acc as Record<string, unknown>)[key];
    }, record?.featureInfo ?? {});
  };

  const resolveFeatureById = (
    id: string,
    linkTarget?: CardFeatureLinkTarget,
  ): FeatureRecord | undefined => {
    const key = String(id ?? "").trim();
    if (!key) return undefined;
    const store = storeRef.current;
    if (!store) return undefined;

    const targetClass = String(linkTarget?.classCode ?? "").trim();
    const matchField = String(linkTarget?.matchField ?? "ID").trim() || "ID";
    const kind = String(linkTarget?.kind ?? "").trim();
    const skind = String(linkTarget?.skind ?? "").trim();
    const skind2 = String(linkTarget?.skind2 ?? "").trim();

    const candidates: FeatureRecord[] = targetClass
      ? Object.values(store.byClassId?.[targetClass] ?? {}).flat()
      : store.all;

    const matchRecord = (r: FeatureRecord): boolean => {
      if (targetClass && String(r?.meta?.Class ?? "").trim() !== targetClass)
        return false;
      const fi: any = r?.featureInfo ?? {};
      if (kind && String(fi?.Kind ?? "").trim() !== kind) return false;
      if (skind && String(fi?.SKind ?? "").trim() !== skind) return false;
      if (skind2 && String(fi?.SKind2 ?? "").trim() !== skind2) return false;
      const value = getFeatureValueByPath(r, matchField);
      return String(value ?? "").trim() === key;
    };

    const constrained = candidates.find(matchRecord);
    if (constrained) return constrained;

    // 有 linkTarget 时，约束匹配失败即视为未找到，避免跨类型误跳。
    if (linkTarget) return undefined;

    // 无约束旧逻辑：优先走 byClassId 索引（跨 Class 扫一次 key）
    for (const cls of Object.keys(store.byClassId)) {
      const hit = store.byClassId[cls]?.[key];
      if (hit && hit.length > 0) return hit[0];
    }

    // 兜底：线性扫描（可读性优先）
    return store.all.find((r) => String(r?.meta?.idValue ?? "").trim() === key);
  };

  const onTryTriggerLabelClickById = (
    id: string,
    linkTarget?: CardFeatureLinkTarget,
  ) => {
    const rr = resolveFeatureById(id, linkTarget);
    if (!rr) return;

    const store = storeRef.current;
    if (!store) return;

    const rule = findFirstRule(rr);
    const rawClick = (rule as any)?.symbol?.labelClick;
    if (!rawClick) return;

    const clickPlan: any =
      typeof rawClick === "function" ? rawClick(rr, ctx, store) : rawClick;
    if (!clickPlan || !clickPlan.enabled) return;

    handleLabelClick(rr, clickPlan as any);
  };

  // ✅ 跨世界切换时，清理选中态与高亮，避免“跨世界残留高亮/信息框”。
  // 触发时机：worldId 变化（WorldSwitcher / 外部世界切换）。
  useEffect(() => {
    highlightGroupRef.current?.clearLayers();
    setFeatureCardOpen(false);
    setSelectedFeature(null);
  }, [worldId]);

  const hasMultipleFloorOptions = floorOptions.length > 1;
  const mobileFloorVisible =
    ctx.inFloorView &&
    !!activeBuildingUid &&
    hasMultipleFloorOptions &&
    visible;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ria:ruleFeatureCardState", {
        detail: {
          open: featureCardOpen,
          feature: selectedFeature,
          classCode:
            selectedFeature?.meta?.Class ??
            selectedFeature?.featureInfo?.Class ??
            null,
          resolveFeatureById,
          onTryTriggerLabelClickById,
        },
      }),
    );
  }, [
    featureCardOpen,
    selectedFeature,
    resolveFeatureById,
    onTryTriggerLabelClickById,
  ]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ index?: number }>).detail ?? {};
      const idx = Number(detail.index);
      if (!Number.isInteger(idx)) return;
      if (idx < 0 || idx >= floorOptions.length) return;
      setActiveFloorIndexAndRemember(idx);
    };

    window.addEventListener("ria:mobileFloorSelect", handler as EventListener);
    return () =>
      window.removeEventListener(
        "ria:mobileFloorSelect",
        handler as EventListener,
      );
  }, [floorOptions.length, activeBuildingUid, floorOptions]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ria:mobileFloorPanelState", {
        detail: {
          visible: mobileFloorVisible,
          buildingName: activeBuildingName,
          floorOptions,
          activeFloorIndex,
        },
      }),
    );
  }, [mobileFloorVisible, activeBuildingName, floorOptions, activeFloorIndex]);

  // (3.5) 初始化自定义 panes：用于稳定控制遮挡顺序（避免“读入顺序导致覆盖”）
  useEffect(() => {
    if (!mapReady) return;

    const ensurePane = (name: string, z: number) => {
      let p = map.getPane(name);
      if (!p) p = map.createPane(name);
      p.style.zIndex = String(z);
    };

    // 线/面默认层（接近 Leaflet overlayPane 的 400）
    ensurePane("ria-overlay", 410);

    // 高亮线/面（在 overlay 之上、点之下）
    ensurePane("ria-overlay-top", 640);

    // 点层：永远在面/线之上
    ensurePane("ria-point", 650);

    // 更“顶”的点层（你可以在规则里指定把某些点强制压到最上）
    ensurePane("ria-point-top", 660);

    // label 层：比点再高一点
    ensurePane("ria-label", 670);
  }, [mapReady, map]);

  // (4) 选择“当前激活建筑” + 生成楼层 options
  useEffect(() => {
    if (!mapReady) return;
    const store = storeRef.current;
    if (!store) return;

    const updateActiveBuilding = () => {
      const leafletZoom = map.getZoom();
      const zoomLevel = toZoomLevel(leafletZoom);
      //const inFloorView = zoomLevel >= DEFAULT_FLOOR_VIEW.minLevel;
      const inFloorView = zoomLevel >= FLOOR_VIEW_MIN_LEVEL;

      if (!inFloorView) {
        setActiveBuildingUid(null);
        activeBuildingUidRef.current = null;
        setActiveBuildingFloorRefSet(null);
        setActiveBuildingName("");
        setFloorOptions([]);
        floorOptionsRef.current = [];
        setActiveFloorIndex(0);
        return;
      }

      const center = map.getCenter();
      const loc = (projection as any).latLngToLocation?.(center, Y_FOR_DISPLAY);
      if (!loc) return;
      const p = { x: Number(loc.x), z: Number(loc.z) };

      // 以“中心点命中/接近建筑”为激活建筑（支持 STB/SBP/BUD）
      const buildings: FeatureRecord[] = (
        FLOOR_BUILDING_CLASSES as readonly string[]
      ).flatMap((c) => store.byClass[c] ?? []);
      let picked: FeatureRecord | null = null;

      // (1) 严格命中：中心点落入建筑面（Polygon）
      for (const b of buildings) {
        if (b.type !== "Polygon" || !b.coords3 || b.coords3.length < 3)
          continue;
        const poly = b.coords3.map((pt) => ({ x: pt.x, z: pt.z }));
        if (pointInPolygonXZ(p, poly)) {
          picked = b;
          break;
        }
      }

      // (2) 非严格命中：中心点在一定像素范围内“接近”建筑（Polygon 用 bounds；Point 用点距）
      if (!picked) {
        const paddedView = map.getBounds().pad(FLOOR_PICK_VIEW_PAD);
        let best: { b: FeatureRecord; dist: number } | null = null;

        const size = map.getSize();
        const centerPx = L.point(size.x / 2, size.y / 2);

        for (const b of buildings) {
          // Point building（SBP 等）
          if (b.type === "Points" && b.p3) {
            const ll = projection.locationToLatLng(b.p3.x, b.p3.y, b.p3.z);
            if (!paddedView.contains(ll)) continue;
            const pt = map.latLngToContainerPoint(ll);
            const d = Math.hypot(pt.x - centerPx.x, pt.y - centerPx.y);
            if (d <= FLOOR_PICK_ACTIVATE_PX && (!best || d < best.dist)) {
              best = { b, dist: d };
            }
            continue;
          }

          // Polygon building（STB/BUD 等）
          if (!b.coords3?.length) continue;
          const bBounds = getFeatureBoundsLatLng(
            projection,
            b.coords3 as any,
            Y_FOR_DISPLAY,
          );
          if (!bBounds) continue;
          if (!paddedView.intersects(bBounds)) continue;

          const d = distanceFromViewportCenterToBoundsPx(map, bBounds);
          if (d <= FLOOR_PICK_ACTIVATE_PX && (!best || d < best.dist)) {
            best = { b, dist: d };
          }
        }

        picked = best?.b ?? null;
      }

      const newUid = picked?.uid ?? null;

      // picked == null：只有当“上一次激活建筑”离开中心一定范围时才清空（避免闪烁）
      if (!picked) {
        if (activeBuildingUid) {
          const prev = buildings.find((b) => b.uid === activeBuildingUid);
          if (prev) {
            // Polygon：用 bounds
            if (prev.type === "Polygon" && prev.coords3?.length) {
              const prevBounds = getFeatureBoundsLatLng(
                projection,
                prev.coords3 as any,
                Y_FOR_DISPLAY,
              );
              if (prevBounds) {
                const d = distanceFromViewportCenterToBoundsPx(map, prevBounds);
                if (d <= FLOOR_PICK_KEEP_PX) return;
              }
            }
            // Point：用点距
            if (prev.type === "Points" && prev.p3) {
              const size = map.getSize();
              const centerPx = L.point(size.x / 2, size.y / 2);
              const ll = projection.locationToLatLng(
                prev.p3.x,
                prev.p3.y,
                prev.p3.z,
              );
              const pt = map.latLngToContainerPoint(ll);
              const d = Math.hypot(pt.x - centerPx.x, pt.y - centerPx.y);
              if (d <= FLOOR_PICK_KEEP_PX) return;
            }
          }
        }

        setActiveBuildingUid(null);
        setActiveBuildingFloorRefSet(null);
        setActiveBuildingName("");
        setFloorOptions([]);
        setActiveFloorIndex(0);
        return;
      }

      // picked 有值：如果还是同一栋建筑，可提前 return；但搜索/分享 FLR/STF 时仍允许切换目标楼层。
      if (newUid === activeBuildingUid) {
        if (newUid) applyPendingFloorFocusForBuilding(newUid, floorOptionsRef.current);
        return;
      }

      // 切换到新的建筑
      setActiveBuildingUid(newUid);
      activeBuildingUidRef.current = newUid;

      // 建筑名兼容：STB/SBP/BUD
      const bfi: any = picked.featureInfo;
      const bName = String(
        bfi?.Name ?? bfi?.Name ?? bfi?.BuildingName ?? bfi?.name ?? "",
      ).trim();
      setActiveBuildingName(bName);

      // 楼层关联：优先 STF/FLR 向上索引建筑；再用建筑 Floors[] 向下补全
      const floorData = buildFloorViewDataForBuilding(store, picked);

      // 若仍无任何楼层，则不进入楼层视角（避免“任何建筑都出楼层条”）
      if (!floorData || floorData.floorIdSet.size === 0) {
        if (pendingFloorFocusRef.current?.buildingUid === newUid) {
          pendingFloorFocusRef.current = null;
        }
        setActiveBuildingUid(null);
        activeBuildingUidRef.current = null;
        setActiveBuildingFloorRefSet(null);
        setActiveBuildingName('');
        setFloorOptions([]);
        floorOptionsRef.current = [];
        setActiveFloorIndex(0);
        return;
      }

      setActiveBuildingFloorRefSet(floorData.floorIdSet);

      const opts = floorData.options;

      const pending = pendingFloorFocusRef.current;
      const pendingIndex =
        pending?.buildingUid === newUid
          ? opts.findIndex((opt) => opt.value === pending.floorSelector)
          : -1;

      const remembered = lastFloorSelectionRef.current;
      const rememberedIndex =
        remembered?.buildingUid === newUid
          ? opts.findIndex((opt) => opt.value === remembered.floorValue)
          : -1;

      const nextIndex =
        pendingIndex >= 0
          ? pendingIndex
          : rememberedIndex >= 0
            ? rememberedIndex
            : 0;

      setFloorOptions(opts);
      floorOptionsRef.current = opts;
      setActiveFloorIndex(nextIndex);
      if (newUid && opts[nextIndex]?.value) {
        lastFloorSelectionRef.current = {
          buildingUid: newUid,
          floorValue: opts[nextIndex].value,
        };
      }
      if (pendingIndex >= 0) {
        pendingFloorFocusRef.current = null;
      }
    };

    updateActiveBuilding();
    map.on("moveend", updateActiveBuilding);
    map.on("zoomend", updateActiveBuilding);
    return () => {
      map.off("moveend", updateActiveBuilding);
      map.off("zoomend", updateActiveBuilding);
    };
  }, [mapReady, map, projection, activeBuildingUid, dataVersion]);

  // (5) 渲染：根据规则 + zoom + bounds + floor context 进行增量 add/remove
  useEffect(() => {
    if (!mapReady) return;
    if (!visible) {
      if (pendingRuleFirstPaintWorldRef.current === worldId) {
        updateRuleLoadingStage(
          worldId,
          "world-layer-render",
          "success",
          "图层不可见，跳过首帧等待",
        );
        updateRuleLoadingStage(
          worldId,
          "world-first-paint",
          "success",
          "图层当前不可见",
        );
        const doneFlowId = pendingRuleFirstPaintFlowRef.current;
        pendingRuleFirstPaintWorldRef.current = null;
        pendingRuleFirstPaintFlowRef.current = null;
        renderCompletionScheduledRef.current = false;
        finishRuleLoading(worldId, doneFlowId);
      }
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const store = storeRef.current;
    if (!store) return;

    const refresh = (
      reason: "initial" | "moveend" | "zoomend" | "state" = "state",
    ) => {
      const waitingFirstPaint =
        pendingRuleFirstPaintWorldRef.current === worldId &&
        isActiveRuleLoading(worldId) &&
        (!pendingRuleFirstPaintFlowRef.current ||
          useLoadingStore.getState().activeFlowId ===
            pendingRuleFirstPaintFlowRef.current);
      const stabilitySignature = [
        worldId,
        dataVersion,
        activeBuildingUid ?? "",
        floorOptions[activeFloorIndex]?.value ?? "",
        activeBuildingFloorRefSet
          ? Array.from(activeBuildingFloorRefSet).sort().join(",")
          : "",
        assistPickActive ? "assist" : "",
        deletePickActive ? "delete" : "",
        selectedFeature?.uid ?? "",
      ].join("|");

      if (labelZoomAnimatingRef.current && reason !== "initial") {
        pendingZoomRefreshReasonRef.current = reason;
        return;
      }

      // RB_SLU_24: do not skip moveend refreshes. Line labels depend on the
      // current visible path segment, collision field and container geometry;
      // reusing a previous layout window after pan can leave stale labels and
      // prevent labels in the new viewport from appearing.

      if (waitingFirstPaint) {
        updateRuleLoadingStage(worldId, "world-layer-render", "loading");
        updateRuleLoadingStage(
          worldId,
          "world-first-paint",
          "loading",
          "等待地图首帧显示",
        );
      }
      const leafletZoom = map.getZoom();
      const zoomLevel = toZoomLevel(leafletZoom);
      const inFloorView = zoomLevel >= DEFAULT_FLOOR_VIEW.minLevel;

      const context: RenderContext = {
        worldId,
        leafletZoom,
        zoomLevel,
        inFloorView,
        activeBuildingUid,
        activeFloorSelector: floorOptions[activeFloorIndex]?.value ?? null,
        activeBuildingFloorRefSet,
      };

      const layoutWindow = createLabelLayoutWindow(map, stabilitySignature, {
        paddingRatio: LABEL_LAYOUT_WINDOW_PADDING_RATIO,
        minPaddingPx: LABEL_LAYOUT_WINDOW_MIN_PADDING_PX,
        maxReuseMs: LABEL_LAYOUT_WINDOW_MAX_REUSE_MS,
        refreshEdgeRatio: LABEL_LAYOUT_WINDOW_REFRESH_EDGE_RATIO,
      });
      const layoutBounds = layoutWindow.paddedBounds;
      const labelLayoutViewportPaddingPx =
        getLabelLayoutViewportPaddingPx(layoutWindow);
      const realViewportWorldRectXZ = viewportWorldRectXZFromBounds(
        map.getBounds(),
        projection,
        Y_FOR_DISPLAY,
      );
      const layoutViewportWorldRectXZ = viewportWorldRectXZFromBounds(
        layoutBounds,
        projection,
        Y_FOR_DISPLAY,
      );
      const viewportWorldRectXZ = layoutViewportWorldRectXZ;
      const records = recordsRef.current;
      const realBounds = map.getBounds();
      const lineAuditRows = new Map<string, LineAuditMutableRow>();
      const polygonAuditRows = new Map<string, PolygonAuditMutableRow>();
      for (const r of records) {
        const row = buildBaseLineAuditRow({
          record: r,
          index: lineAuditRows.size + 1,
          zoom: leafletZoom,
          realBounds,
          layoutBounds,
          projection,
        });
        if (row) lineAuditRows.set(r.uid, row);
        const polyRow = buildBasePolygonAuditRow({
          record: r,
          index: polygonAuditRows.size + 1,
          zoom: leafletZoom,
          zoomLevel,
          realBounds,
          layoutBounds,
          projection,
          map,
        });
        if (polyRow) polygonAuditRows.set(r.uid, polyRow);
      }

      // declutter labels：先收集 request，后统一跑布局，再回写到各个 bundle.label
      const declutterLabelRequests: LabelRequest[] = [];
      const advancedLineTextBudget: AdvancedLineTextBudgetState = {
        labelsUsed: 0,
        candidatesUsed: 0,
        glyphLabelsUsed: 0,
        glyphsUsed: 0,
      };
      const declutterLabelMeta = new Map<
        string,
        { styleKey: any; plan: LabelClickPlan | null; deletePick: boolean }
      >();

      const diagnosticsEnabled = isDisplayDiagnosticsEnabled();
      const displayDiagnosticMeta = new Map<
        string,
        {
          feature: FeatureRecord;
          plan: FeatureDisplayPlan;
          interactions: DisplayInteractionReason[];
        }
      >();

      // ✅ 新增：点图标避让矩形（屏幕像素）
      const avoidRectsPx: AvoidRectPx[] = [];

      const shouldShow = new Set<string>();

      for (const r of records) {
        const auditRow = lineAuditRows.get(r.uid);
        const polygonAuditRow = polygonAuditRows.get(r.uid);
        if (auditRow)
          updateLineAuditBlocked(
            auditRow,
            "feature-filter",
            "entered render loop",
          );
        if (polygonAuditRow)
          updatePolygonAuditBlocked(
            polygonAuditRow,
            "feature-filter",
            "entered render loop",
          );

        const rule = findFirstRule(r);
        if (!rule) {
          updateLineAuditBlocked(
            auditRow,
            "feature-filter",
            "no matching render rule",
          );
          updatePolygonAuditBlocked(
            polygonAuditRow,
            "feature-filter",
            "no matching render rule",
          );
          continue;
        }

        if (rule.zoom) {
          const [min, max] = rule.zoom;
          if (zoomLevel < min || zoomLevel > max) {
            updateLineAuditBlocked(
              auditRow,
              "zoom-rule",
              `render rule zoom ${min}-${max}, current ${zoomLevel}`,
            );
            updatePolygonAuditBlocked(
              polygonAuditRow,
              "zoom-rule",
              `render rule zoom ${min}-${max}, current ${zoomLevel}`,
            );
            continue;
          }
        }

        const interactionReasons: DisplayInteractionReason[] = [];
        const isSelectedFeature = selectedFeature?.uid === r.uid;
        const isSearchFocus = pendingOpenUidRef.current === r.uid;
        if (isSelectedFeature) interactionReasons.push("selected");
        if (isSearchFocus) interactionReasons.push("searchResult");

        const baseDisplayPlan = resolveFeatureDisplayPlan(r, rule, context, store, {
          selected: isSelectedFeature,
          searchResult: isSearchFocus,
        });
        const displayPlan = resolveStructureLabelDisplayPlanForContext(
          r,
          baseDisplayPlan,
          context,
        );
        if (!shouldRenderByDisplayPlan(displayPlan, context)) {
          updateLineAuditBlocked(
            auditRow,
            "feature-filter",
            "display plan hidden by current context",
          );
          updatePolygonAuditBlocked(
            polygonAuditRow,
            "feature-filter",
            "display plan hidden by current context",
          );
          continue;
        }

        if (diagnosticsEnabled) {
          displayDiagnosticMeta.set(r.uid, {
            feature: r,
            plan: displayPlan,
            interactions: interactionReasons,
          });
        }

        // 可见性条件（楼层选择/存在性等）
        // 声明式：若同 idValue 的目标 Class 存在，则隐藏当前要素（用于“若存在则不渲染”）
        if (rule.hideIfSameIdExistsInClasses && r.meta.idValue) {
          let blocked = false;
          for (const c of rule.hideIfSameIdExistsInClasses) {
            if (store.hasSameIdInClass(c, r.meta.idValue)) {
              blocked = true;
              break;
            }
          }
          if (blocked) {
            updateLineAuditBlocked(
              auditRow,
              "feature-filter",
              "hidden by same-id rule",
            );
            continue;
          }
        }
        if (rule.visible && !rule.visible(r, context, store)) {
          updateLineAuditBlocked(
            auditRow,
            "feature-filter",
            "rule.visible returned false",
          );
          continue;
        }

        const rawClick = (rule.symbol as any)?.labelClick;
        const clickPlan: LabelClickPlan | null = rawClick
          ? typeof rawClick === "function"
            ? rawClick(r, context, store)
            : rawClick
          : null;
        const labelOnly = !!(
          clickPlan &&
          (clickPlan as any).enabled &&
          (clickPlan as any).mode === "labelOnly"
        );
        const pickModeActive = assistPickActive || deletePickActive;
        const normalFeatureClickSuppressed = featureInteractionSuppressed && !pickModeActive;
        const effectiveFeatureClickPlan: LabelClickPlan | null =
          !pickModeActive &&
          !normalFeatureClickSuppressed &&
          clickPlan &&
          (clickPlan as any).enabled
            ? clickPlan
            : null;

        // 屏幕范围裁剪（点/线/面统一用 padded layoutBounds 预加载）
        let pointLatLng: L.LatLng | undefined;
        if (r.type === "Points" && r.p3) {
          const pointCoords = r.multipartGeometry?.type === 'Point'
            ? r.multipartGeometry.parts
            : [r.p3];
          const visiblePoint = pointCoords
            .map((point) => projection.locationToLatLng(point.x, point.y, point.z))
            .find((candidate) => layoutBounds.contains(candidate));
          if (!visiblePoint) continue;
          pointLatLng = visiblePoint;
        } else if (r.coords3 && r.coords3.length) {
          // 用 bbox 做快速裁剪（可读性优先）
          let minLat = Infinity,
            minLng = Infinity,
            maxLat = -Infinity,
            maxLng = -Infinity;
          for (const p of r.coords3) {
            const ll = projection.locationToLatLng(p.x, p.y, p.z);
            minLat = Math.min(minLat, ll.lat);
            minLng = Math.min(minLng, ll.lng);
            maxLat = Math.max(maxLat, ll.lat);
            maxLng = Math.max(maxLng, ll.lng);
          }
          const b = L.latLngBounds(
            L.latLng(minLat, minLng),
            L.latLng(maxLat, maxLng),
          );
          if (!layoutBounds.intersects(b)) {
            updateLineAuditBlocked(
              auditRow,
              "viewport",
              "outside padded layout viewport",
            );
            continue;
          }
        }

        // ✅ 新增：把点符号当作“硬占用区”，用于 label 避让
        if (r.type === "Points" && pointLatLng && !labelOnly) {
          const pt = map.latLngToContainerPoint(pointLatLng);

          const sym = rule.symbol;
          const pointPlan =
            typeof sym?.point === "function"
              ? sym.point(r, context, store)
              : sym?.point;

          // 默认占用尺寸（可按视觉调）
          let w = 28;
          let h = 28;

          // circleMarker：radius 是 CircleMarkerOptions 才有，类型上用 any 取值即可（不改类型定义）
          if (pointPlan?.kind === "circle") {
            const radius = Number(
              (pointPlan as any)?.radius ??
                (pointPlan as any)?.style?.radius ??
                6,
            );
            const weight = Number((pointPlan as any)?.style?.weight ?? 0);
            const half = Math.max(4, radius + weight + 2);
            w = half * 2;
            h = half * 2;
          }

          // icon marker：avoidSizePx 不是你现有类型字段，用 any 读取；没有就退回 iconSize
          if (pointPlan?.kind === "icon") {
            const sz =
              (pointPlan as any)?.avoidSizePx ?? (pointPlan as any)?.iconSize;
            if (Array.isArray(sz) && sz.length >= 2) {
              w = Math.max(4, Number(sz[0]));
              h = Math.max(4, Number(sz[1]));
            } else {
              w = 32;
              h = 32;
            }
          }

          avoidRectsPx.push({
            x: pt.x - w / 2,
            y: pt.y - h / 2,
            w,
            h,
            ownerUid: r.uid,
          });
        }

        shouldShow.add(r.uid);
        updateLineAuditBlocked(
          auditRow,
          "request-build",
          "main geometry visible; label request not built yet",
        );
        updatePolygonAuditBlocked(
          polygonAuditRow,
          "request-build",
          "main geometry visible; label request not built yet",
        );

        // labelOnly：主几何不显示且不可交互（交互只发生在 label 上）
        const hiddenSymbol = labelOnly
          ? ({
              ...(rule.symbol as any),
              pathStyle: () => ({
                opacity: 0,
                weight: 0,
                fillOpacity: 0,
                interactive: false,
                pane: (rule.symbol as any)?.pane ?? "ria-overlay",
              }),
              point: () => ({
                kind: "circle",
                radius: 1,
                style: {
                  opacity: 0,
                  fillOpacity: 0,
                  weight: 0,
                  interactive: false,
                },
                pane: (rule.symbol as any)?.pane ?? "ria-point",
              }),
            } as any)
          : (rule.symbol as any);

        // 确保 layer 存在
        const existing = cacheRef.current.get(r.uid);
        if (!existing) {
          const bundle = createLayerBundle(
            r,
            hiddenSymbol,
            context,
            store,
            projection,
            handleLabelClick,
            viewportWorldRectXZ,
            assistPickActive,
            deletePickActive,
            displayPlan,
            featureInteractionSuppressed,
          );
          if (!bundle) continue;
          cacheRef.current.set(r.uid, bundle);
          root.addLayer(bundle.main);
          if (bundle.hitProxy) root.addLayer(bundle.hitProxy);
          if (bundle.label) {
            root.addLayer(bundle.label);
            fadeInLabelLayer(bundle.label);
          }
        } else {
          // 更新样式（动态色/透明度/楼层淡化）
          updateLayerBundle(
            existing,
            r,
            hiddenSymbol,
            context,
            store,
            projection,
            root,
            handleLabelClick,
            viewportWorldRectXZ,
            assistPickActive,
            deletePickActive,
            displayPlan,
            featureInteractionSuppressed,
          );
          if (!root.hasLayer(existing.main)) root.addLayer(existing.main);
          if (existing.hitProxy && !root.hasLayer(existing.hitProxy))
            root.addLayer(existing.hitProxy);
          if (existing.label && !root.hasLayer(existing.label)) {
            root.addLayer(existing.label);
            fadeInLabelLayer(existing.label);
          }
        }

        // LabelLayout：仅对声明了 labelPlan.declutter 的规则生效；其余 label 走旧逻辑
        const rawLabelPlan = rule.symbol?.label;
        const labelPlan =
          typeof rawLabelPlan === "function"
            ? rawLabelPlan(r, context, store)
            : rawLabelPlan;
        if (auditRow) {
          const labelText = resolveLabelTextForAudit(
            r,
            labelPlan,
            context,
            store,
          );
          if (labelText) auditRow.labelText = labelText;
          if (!labelPlan?.enabled) {
            updateLineAuditBlocked(
              auditRow,
              "request-build",
              "label plan disabled or missing",
            );
          } else if (
            labelPlan.minLevel !== undefined &&
            zoomLevel < labelPlan.minLevel
          ) {
            updateLineAuditBlocked(
              auditRow,
              "zoom-rule",
              `label minLevel ${labelPlan.minLevel}, current ${zoomLevel}`,
            );
          } else if (!labelText) {
            updateLineAuditBlocked(
              auditRow,
              "no-label-text",
              "label text is empty",
            );
          } else if (!labelPlan.declutter) {
            updateLineAuditBlocked(
              auditRow,
              "request-build",
              "label plan is not managed by declutter layout",
            );
          }
        }
        if (polygonAuditRow) {
          const labelText = resolveLabelTextForAudit(
            r,
            labelPlan,
            context,
            store,
          );
          if (labelText) polygonAuditRow.labelText = labelText;
          if (!labelPlan?.enabled) {
            updatePolygonAuditBlocked(
              polygonAuditRow,
              "request-build",
              "label plan disabled or missing",
            );
          } else if (
            labelPlan.minLevel !== undefined &&
            zoomLevel < labelPlan.minLevel
          ) {
            updatePolygonAuditBlocked(
              polygonAuditRow,
              "zoom-rule",
              `label minLevel ${labelPlan.minLevel}, current ${zoomLevel}`,
            );
          } else if (!labelText) {
            updatePolygonAuditBlocked(
              polygonAuditRow,
              "no-label-text",
              "label text is empty",
            );
          } else if (!labelPlan.declutter) {
            updatePolygonAuditBlocked(
              polygonAuditRow,
              "request-build",
              "label plan is not managed by declutter layout",
            );
          }
        }
        if (labelPlan?.enabled && labelPlan.declutter) {
          const rawReq = buildLabelRequest(
            r,
            labelPlan,
            context,
            store,
            projection,
            pointLatLng,
            effectiveFeatureClickPlan,
            realViewportWorldRectXZ,
            layoutViewportWorldRectXZ,
            displayPlan,
          );
          const req = rawReq
            ? applyAdvancedLineTextBudget(
                mergeDisplayCollisionIntoLabelRequest(rawReq, displayPlan),
                displayPlan,
                advancedLineTextBudget,
              )
            : null;
          if (req) {
            if (auditRow) {
              auditRow.expectedLabel = true;
              auditRow.labelText = req.text;
              auditRow.collisionRole = String(
                (req.declutter as any)?.collisionRole ?? "",
              );
              auditRow.collisionGroup = String(
                (req.declutter as any)?.collisionGroup ?? "",
              );
              auditRow.priority = Number((req.declutter as any)?.priority ?? 0);
              auditRow.repositionMode = String(
                (req.displayAnchor as any)?.lineTextRepositionMode ?? "",
              );
              if (
                req.textPathBudgetStatus === "budgetExceeded" ||
                req.glyphPathBudgetStatus === "budgetExceeded"
              ) {
                updateLineAuditBlocked(
                  auditRow,
                  "advanced-budget",
                  req.textPathFallbackReason ??
                    req.glyphPathFallbackReason ??
                    "advanced line text budget exceeded",
                );
              } else {
                updateLineAuditBlocked(
                  auditRow,
                  "layout",
                  "label request entered layout",
                );
              }
            }
            if (polygonAuditRow) {
              polygonAuditRow.expectedLabel = true;
              polygonAuditRow.labelText = req.text;
              polygonAuditRow.collisionRole = String(
                (req.declutter as any)?.collisionRole ?? "",
              ) || undefined;
              polygonAuditRow.collisionGroup = String(
                (req.declutter as any)?.collisionGroup ?? "",
              ) || undefined;
              polygonAuditRow.priority = Number((req.declutter as any)?.priority ?? 0);
              polygonAuditRow.densityEnabled = !!(req.declutter as any)?.densityEnabled;
              polygonAuditRow.densityGridSizePx = Number((req.declutter as any)?.densityGridSizePx ?? NaN) || undefined;
              polygonAuditRow.densityMaxPerGrid = Number((req.declutter as any)?.densityMaxLabelsPerGrid ?? NaN) || undefined;
              applyGeoAnchorDebugToPolygonRow(polygonAuditRow, req, map, projection);
              updatePolygonAuditBlocked(
                polygonAuditRow,
                "layout",
                "label request entered layout",
              );
            }
            declutterLabelRequests.push(req);
            let styleKey: any =
              (labelPlan as any)?.styleKey ??
              (clickPlan as any)?.labelStyleKey ??
              "bubble-dark";

            // Polyline：若 request 给了 rotateDeg，则对“沿线文字类样式”注入旋转角。
            // - rle-line-xx：铁路沿线字（需要旋转）
            // - gm-bw-xx / gm-wtb-xx / gm-outline*：道路沿线字（需要旋转）
            // 同时：以 45° 为界，>45° 时改为竖排（中文逐字竖排，英文连续>=4字符横置）。
            const reqRotateDeg = Number((req as any).rotateDeg ?? 0) || 0;
            styleKey = applyLineLabelOrientationStyle(
              styleKey,
              req.text,
              reqRotateDeg,
            );
            declutterLabelMeta.set(req.id, {
              styleKey,
              plan: effectiveFeatureClickPlan,
              deletePick: !!(deletePickActive && isDeletePickTargetFeature(r)),
            });
          } else {
            updateLineAuditBlocked(
              auditRow,
              "anchor-resolve",
              "label request was not created",
            );
            if (polygonAuditRow?.blockedStep !== "no-label-text") {
              updatePolygonAuditBlocked(
                polygonAuditRow,
                "geo-anchor",
                "label request was not created",
              );
            }
            // 该要素当前不应显示 label（minLevel/text 空等）→ 移除旧 label
            const b = cacheRef.current.get(r.uid);
            if (b?.label) {
              clearBundleLabel(b, root);
            }
          }
        }
      }

      // 统一计算 declutter label 的摆放（避免重叠）
      if (declutterLabelRequests.length) {
        const placed = layoutLabelsOnMap(map, declutterLabelRequests, {
          preferNearCenter: true,
          avoidRectsPx,
          // 可选：给点图标再留一圈缓冲（像素）
          avoidSpacingPx: 1,
          // RB_SLU_15：在 padded layout window 中提前布局视口外 label。
          viewportPaddingPx: labelLayoutViewportPaddingPx,
        });

        const placedById = new Map<string, (typeof placed)[number]>();
        for (const p of placed) placedById.set(p.id, p);

        for (const req of declutterLabelRequests) {
          const row = lineAuditRows.get(req.featureUid ?? "");
          if (!row) continue;
          const p = placedById.get(req.id);
          row.expectedLabel = true;
          row.labelText = req.text;
          if (!p) {
            updateLineAuditBlocked(
              row,
              "layout",
              "layout returned no placed label",
            );
            continue;
          }
          row.candidateId = (p as any).anchorCandidateId;
          row.repositionMode = (p as any).lineTextRepositionMode;
          row.repositionShiftIndex = (p as any).lineTextRepositionShiftIndex;
          row.repositionAttempts = (p as any).lineTextRepositionAttempts;
          row.repositionFailureReason = (
            p as any
          ).lineTextRepositionFailureReason;
          row.textPathStatus = (p as any).textPathStatus;
          row.glyphPathStatus =
            String((p as any).glyphPathStatus ?? "") || undefined;
          row.glyphPathFallbackReason =
            (p as any).glyphPathFallbackReason ??
            (p as any).glyphPathFailureReason;
          row.textPathFallbackReason = (p as any).textPathFallbackReason;
          row.viewportFailureSubtype = (
            p as any
          ).lineTextViewportFailureSubtype;
          row.viewportFailureSummary = (
            p as any
          ).lineTextViewportFailureSummary;
          row.viewportBufferPx = (p as any).lineTextViewportBufferPx;
          row.viewportSizePx = (p as any).lineTextViewportSizePx;
          row.viewportAttempts = (p as any).lineTextViewportAttempts;
          row.viewportBestAttempt = (p as any).lineTextViewportBestAttempt;
          row.anyAttemptAnchorInsideViewport = (
            p as any
          ).lineTextAnyAttemptAnchorInsideViewport;
          row.anyAttemptRectInsideViewport = (
            p as any
          ).lineTextAnyAttemptRectInsideViewport;
          row.anyAttemptRectOversized = (
            p as any
          ).lineTextAnyAttemptRectOversized;
          row.sourcePathKind = (p as any).lineTextSourcePathKind;
          row.sourcePathPointCount = (p as any).lineTextSourcePathPointCount;
          row.sourcePathLengthPx = (p as any).lineTextSourcePathLengthPx;
          row.estimatedLabelSpanPx = (p as any).lineTextEstimatedLabelSpanPx;
          row.effectiveStepPx = (p as any).lineTextEffectiveStepPx;
          row.viewportRectSource = (p as any).lineTextRectSource;
          row.viewportRawRectImplausible = (p as any).lineTextRawRectImplausible;
          row.viewportRawRectCenterDistancePx = (p as any).lineTextRawRectCenterDistancePx;
          row.viewportTempBase = (p as any).lineTextViewportTempBase;
          row.viewportLocalIntervalIndex = (p as any).lineTextViewportLocalIntervalIndex;
          row.viewportLocalIntervalLengthPx = (p as any).lineTextViewportLocalIntervalLengthPx;
          row.collisionRole =
            String((p as any).collisionRole ?? row.collisionRole ?? "") ||
            undefined;
          row.collisionGroup =
            String((p as any).collisionGroup ?? row.collisionGroup ?? "") ||
            undefined;
          row.priority =
            typeof (p as any).priority === "number"
              ? Number((p as any).priority)
              : row.priority;
          if (p.hidden) {
            const step =
              (p as any).lineTextRepositionMode === "chainageSearch"
                ? (p as any).lineTextRepositionFailureReason === "viewport"
                  ? "viewport"
                  : String(
                        (p as any).lineTextRepositionFailureReason ?? "",
                      ).includes("svg")
                    ? "svg-eligibility"
                    : String(
                          (p as any).lineTextRepositionFailureReason ?? "",
                        ).startsWith("collision")
                      ? "collision"
                      : "chainage-search"
                : mapHiddenReasonToAuditStep(p.hiddenReason);
            updateLineAuditBlocked(
              row,
              step as LineLabelAuditBlockedStep,
              (p as any).lineTextRepositionFailureReason ??
                p.hiddenReason ??
                "hidden by layout",
            );
            row.renderMode = "hidden";
          } else {
            updateLineAuditBlocked(
              row,
              "render",
              "layout placed label; waiting for render marker",
            );
          }
        }

        for (const req of declutterLabelRequests) {
          const row = polygonAuditRows.get(req.featureUid ?? "");
          if (!row) continue;
          const p = placedById.get(req.id) as any;
          row.expectedLabel = true;
          row.labelText = req.text;
          applyGeoAnchorDebugToPolygonRow(row, req, map, projection);
          if (!p) {
            updatePolygonAuditBlocked(
              row,
              "layout",
              "layout returned no placed label",
            );
            continue;
          }
          applyPlacedPolygonAudit(row, p);
        }

        if (diagnosticsEnabled) {
          const diagnostics: RuleDisplayDiagnostic[] = [];
          for (const req of declutterLabelRequests) {
            const featureUid = req.featureUid ?? "";
            const meta = displayDiagnosticMeta.get(featureUid);
            if (!meta) continue;
            diagnostics.push(
              createRuleDisplayDiagnostic({
                feature: meta.feature,
                plan: meta.plan,
                placedLabel: placedById.get(req.id) ?? null,
                interactions: meta.interactions,
              }),
            );
          }
          emitRuleDisplayDiagnostics(diagnostics);
        }

        for (const req of declutterLabelRequests) {
          const p = placedById.get(req.id);
          const b = cacheRef.current.get(req.featureUid ?? "");
          if (!b) continue;

          // 不可放置/被隐藏 → 移除
          if (!p || p.hidden) {
            const row = lineAuditRows.get(req.featureUid ?? "");
            const polygonRow = polygonAuditRows.get(req.featureUid ?? "");
            if (row && p?.hidden) {
              row.displayed = false;
              row.renderMode = "hidden";
              row.blockedStep =
                row.blockedStep === "render"
                  ? mapHiddenReasonToAuditStep(p.hiddenReason)
                  : row.blockedStep;
              row.blockedReason =
                row.blockedReason ??
                String(
                  (p as any).lineTextRepositionFailureReason ??
                    p.hiddenReason ??
                    "hidden",
                );
            }
            if (polygonRow && p?.hidden) {
              polygonRow.displayed = false;
              polygonRow.renderMode = "hidden";
              polygonRow.blockedStep = mapHiddenReasonToPolygonAuditStep(p.hiddenReason);
              polygonRow.blockedReason = String(p.hiddenReason ?? "hidden");
            }
            if (b.label) {
              clearBundleLabel(b, root);
            }
            continue;
          }

          // 计算“偏移后的 latlng”，保持 makeLabelMarker 的样式不变
          const anchorPx = map.latLngToContainerPoint(req.anchorLatLng);
          const shifted = L.point(anchorPx.x + p.dx, anchorPx.y + p.dy);
          const ll = map.containerPointToLatLng(shifted);

          const meta = declutterLabelMeta.get(req.id);
          const plan = meta?.plan ?? null;
          const deletePick = !!meta?.deletePick;
          let styleKey = meta?.styleKey ?? "bubble-dark";

          // Polyline：沿线文字的旋转角以“最终放置点对应的 anchor”优先。
          // 中文在近竖向路径上保持 upright vertical；英文继续底部贴线/旋转。
          const finalRotateDeg =
            typeof (p as any)?.rotateDeg === "number"
              ? Number((p as any).rotateDeg)
              : Number((req as any).rotateDeg ?? 0) || 0;
          styleKey = applyLineLabelOrientationStyle(
            styleKey,
            p.text,
            finalRotateDeg,
          );

          const styleKeyCache =
            typeof styleKey === "string"
              ? styleKey
              : styleKey && typeof styleKey === "object"
                ? `${String((styleKey as any).key ?? "")}@${String((styleKey as any).color ?? "")}@${String((styleKey as any).rotateDeg ?? "")}`
                : String(styleKey);

          const lineTextMode =
            (p as any).lineTextMode ?? (req as any).lineTextMode;
          const anchorIndex =
            typeof (p as any).anchorCandidateIndex === "number"
              ? Number((p as any).anchorCandidateIndex)
              : 0;
          const anchorCandidateId =
            typeof (p as any).anchorCandidateId === "string"
              ? String((p as any).anchorCandidateId)
              : undefined;
          const placedLineTextPathLatLngs = Array.isArray(
            (p as any).lineTextPathLatLngs,
          )
            ? ((p as any).lineTextPathLatLngs as L.LatLng[])
            : null;
          const textPathCandidate = placedLineTextPathLatLngs
            ? {
                pathLatLngs: placedLineTextPathLatLngs,
                candidateId: anchorCandidateId,
              }
            : findLineTextPathCandidate(req, anchorIndex, anchorCandidateId);
          const textPathFallback =
            (p as any).textPathFallback ??
            (req as any).textPathFallback ??
            (req as any).displayAnchor?.textPathFallback ??
            "rotatedLabel";
          const hasLineTextPathCandidate =
            !!textPathCandidate &&
            Array.isArray(textPathCandidate.pathLatLngs) &&
            textPathCandidate.pathLatLngs.length >= 2;
          const advancedTextAllowed =
            ((p as any).textPathBudgetStatus ??
              (req as any).textPathBudgetStatus) !== "budgetExceeded" &&
            (lineTextMode === "textPath" || lineTextMode === "auto") &&
            hasLineTextPathCandidate;
          const displayAnchor = (req as any).displayAnchor ?? {};
          const cjkGlyphPathMode = displayAnchor.cjkGlyphPathMode ?? "auto";
          const glyphBudgetStatus =
            (p as any).glyphPathStatus ?? (req as any).glyphPathBudgetStatus;
          const wantsGlyphPath =
            advancedTextAllowed &&
            glyphBudgetStatus === "allowed" &&
            cjkGlyphPathMode !== "off" &&
            isMostlyCjkText(p.text);
          const cjkGlyphFallbackMode =
            displayAnchor.cjkGlyphFallbackMode ??
            (displayAnchor.cjkGlyphAllowTextPathFallback === true
              ? "textPathIfAllowed"
              : "simpleLineLabel");
          const strictChainageSearch =
            ((p as any).lineTextRepositionMode ??
              displayAnchor.lineTextRepositionMode) === "chainageSearch" &&
            ((p as any).lineTextStrictSvgRequired ??
              displayAnchor.lineTextRepositionStrictSvg ??
              true) !== false;
          const allowCjkTextPathFallback =
            strictChainageSearch ||
            cjkGlyphFallbackMode === "textPathIfAllowed" ||
            cjkGlyphFallbackMode === "simpleLineLabel" ||
            displayAnchor.cjkGlyphAllowTextPathFallback === true;
          const wantsTextPath =
            advancedTextAllowed &&
            (!wantsGlyphPath || allowCjkTextPathFallback);
          const renderSessionKey = `rbslu25|${req.featureUid ?? ""}|${anchorCandidateId ?? anchorIndex}|${p.text}|${Math.round(map.getZoom() * 100) / 100}`;
          const onLineTextClick = deletePick
            ? () => {
                const uid = req.featureUid ?? "";
                const rr = recordsRef.current.find((x) => x.uid === uid);
                if (rr) dispatchDeletePickFeature(rr);
              }
            : plan
              ? () => {
                  const uid = req.featureUid ?? "";
                  const rr = recordsRef.current.find((x) => x.uid === uid);
                  if (rr) handleLabelClick(rr, plan);
                }
              : undefined;

          const glyphResult = wantsGlyphPath
            ? makeCjkGlyphPathLabelMarkerResult({
                map,
                latlng: ll,
                text: p.text,
                pathLatLngs: textPathCandidate.pathLatLngs,
                anchor: displayAnchor,
                styleKey,
                rotateDeg:
                  typeof (p as any).rotateDeg === "number"
                    ? Number((p as any).rotateDeg)
                    : Number((req as any).rotateDeg ?? 0) || 0,
                onClick: onLineTextClick,
                cacheKeyHint: renderSessionKey,
              })
            : null;
          const glyphPathMarker = glyphResult?.marker ?? null;

          const shouldHideFailedCjkGlyph =
            wantsGlyphPath &&
            !glyphPathMarker &&
            !strictChainageSearch &&
            cjkGlyphFallbackMode === "hide";
          if (shouldHideFailedCjkGlyph) {
            const row = lineAuditRows.get(req.featureUid ?? "");
            if (row) {
              row.displayed = false;
              row.renderMode = "hidden";
              row.blockedStep = "svg-eligibility";
              row.blockedReason =
                glyphResult?.failureReason ??
                "glyphPath failed and fallback mode is hide";
            }
            if (b.label) clearBundleLabel(b, root);
            continue;
          }

          const textPathResult =
            !glyphPathMarker && wantsTextPath
              ? makeTextPathLabelMarkerResult({
                  map,
                  latlng: ll,
                  text: p.text,
                  pathLatLngs: textPathCandidate.pathLatLngs,
                  anchor: displayAnchor,
                  styleKey,
                  fallback: textPathFallback,
                  rotateDeg:
                    typeof (p as any).rotateDeg === "number"
                      ? Number((p as any).rotateDeg)
                      : Number((req as any).rotateDeg ?? 0) || 0,
                  onClick: onLineTextClick,
                  cacheKeyHint: renderSessionKey,
                })
              : null;
          const textPathMarker = textPathResult?.marker ?? null;

          if (strictChainageSearch && !glyphPathMarker && !textPathMarker) {
            const row = lineAuditRows.get(req.featureUid ?? "");
            if (row) {
              row.displayed = false;
              row.renderMode = "hidden";
              row.blockedStep = "render";
              row.blockedReason =
                glyphResult?.failureReason ??
                textPathResult?.status ??
                "strict chainageSearch produced no SVG marker";
            }
            if (b.label) clearBundleLabel(b, root);
            continue;
          }

          const renderModeKey = glyphPathMarker
            ? `glyphPath:${anchorCandidateId ?? anchorIndex}`
            : textPathMarker
              ? `textPath:${anchorCandidateId ?? anchorIndex}`
              : `simpleLine:${anchorCandidateId ?? anchorIndex}`;
          const labelKey = `${p.text}|${req.placement}|${req.withDot ? 1 : 0}|${req.dotAnchorMode ?? "inline"}|${Number(req.offsetY ?? 0)}|${styleKeyCache}|${plan ? 1 : 0}|${renderModeKey}`;

          // RB_SLU_24: advanced line-text markers (glyphPath/textPath) are
          // viewport-container geometry. They must be rebuilt every refresh;
          // only ordinary div label markers may be reused with setLatLng(ll).
          const existingIsLineTextMarker =
            b.label instanceof L.Marker && isLineTextMarker(b.label);
          if (
            b.label &&
            b.label instanceof L.Marker &&
            b.labelKey === labelKey &&
            !existingIsLineTextMarker
          ) {
            b.label.setLatLng(ll);
          } else {
            if (b.label) clearBundleLabel(b, root);
            if (glyphPathMarker) {
              b.label = glyphPathMarker;
            } else if (textPathMarker) {
              b.label = textPathMarker;
            } else if (deletePick) {
              b.label = makeClickableLabelMarker({
                latlng: ll,
                text: p.text,
                placement: req.placement,
                withDot: !!req.withDot,
                dotAnchorMode: req.dotAnchorMode,
                offsetY: req.offsetY,
                styleKey: styleKey as any,
                onClick: () => {
                  const uid = req.featureUid ?? "";
                  const rr = recordsRef.current.find((x) => x.uid === uid);
                  if (rr) dispatchDeletePickFeature(rr);
                },
              });
            } else if (plan) {
              b.label = makeClickableLabelMarker({
                latlng: ll,
                text: p.text,
                placement: req.placement,
                withDot: !!req.withDot,
                dotAnchorMode: req.dotAnchorMode,
                offsetY: req.offsetY,
                styleKey: styleKey as any,
                onClick: () => {
                  const uid = req.featureUid ?? "";
                  const rr = recordsRef.current.find((x) => x.uid === uid);
                  if (rr) handleLabelClick(rr, plan);
                },
              });
            } else {
              b.label = makeLabelMarker(
                ll,
                p.text,
                req.placement,
                !!req.withDot,
                req.offsetY,
                styleKey,
                req.dotAnchorMode,
              );
            }
            b.labelKey = labelKey;
          }

          if (b.label && !root.hasLayer(b.label)) {
            root.addLayer(b.label);
            fadeInLabelLayer(b.label);
          }
          const row = lineAuditRows.get(req.featureUid ?? "");
          if (row && b.label && root.hasLayer(b.label)) {
            row.displayed = true;
            row.blockedStep = "none";
            row.blockedReason = undefined;
            row.renderMode = inferLineRenderMode({
              glyphPathMarker,
              textPathMarker,
              strictChainageSearch,
              b,
            });
            row.glyphPathStatus = glyphResult?.status ?? row.glyphPathStatus;
            row.textPathStatus = textPathResult?.status ?? row.textPathStatus;
          }
        }
      }

      if (
        diagnosticsEnabled &&
        declutterLabelRequests.length === 0 &&
        displayDiagnosticMeta.size > 0
      ) {
        const diagnostics: RuleDisplayDiagnostic[] = [];
        for (const meta of displayDiagnosticMeta.values()) {
          diagnostics.push(
            createRuleDisplayDiagnostic({
              feature: meta.feature,
              plan: meta.plan,
              placedLabel: null,
              interactions: meta.interactions,
            }),
          );
        }
        emitRuleDisplayDiagnostics(diagnostics);
      }

      // 移除不应显示的
      for (const [uid, bundle] of cacheRef.current.entries()) {
        if (shouldShow.has(uid)) continue;
        if (root.hasLayer(bundle.main)) root.removeLayer(bundle.main);
        if (bundle.hitProxy && root.hasLayer(bundle.hitProxy))
          root.removeLayer(bundle.hitProxy);
        if (bundle.label && root.hasLayer(bundle.label))
          fadeRemoveLabelLayer(root, bundle.label);
      }

      if (waitingFirstPaint && !renderCompletionScheduledRef.current) {
        renderCompletionScheduledRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            updateRuleLoadingStage(
              worldId,
              "world-layer-render",
              "success",
              `图层数 ${shouldShow.size}`,
            );
            updateRuleLoadingStage(
              worldId,
              "world-first-paint",
              "success",
              "地图已显示",
            );
            const doneFlowId = pendingRuleFirstPaintFlowRef.current;
            pendingRuleFirstPaintWorldRef.current = null;
            pendingRuleFirstPaintFlowRef.current = null;
            renderCompletionScheduledRef.current = false;
            finishRuleLoading(worldId, doneFlowId);
          });
        });
      }

      lineLabelAuditSnapshotRef.current = finalizeLineAuditSnapshot({
        rows: lineAuditRows,
        worldId,
        zoom: leafletZoom,
        zoomLevel,
        reason,
        map,
        root,
        cache: cacheRef.current,
      });
      polygonLabelAuditSnapshotRef.current = finalizePolygonAuditSnapshot({
        rows: polygonAuditRows,
        worldId,
        zoom: leafletZoom,
        zoomLevel,
        reason,
        map,
        root,
        cache: cacheRef.current,
      });

      labelLayoutWindowRef.current = layoutWindow;
      labelViewportSnapshotRef.current = captureLabelViewportSnapshot(
        map,
        stabilitySignature,
      );
    };

    refresh("initial");
    const refreshOnMoveEnd = () => refresh("moveend");
    const refreshOnZoomStart = () => {
      labelZoomAnimatingRef.current = true;
      pendingZoomRefreshReasonRef.current = "zoomend";
      if (
        labelZoomSettleTimerRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(labelZoomSettleTimerRef.current);
        labelZoomSettleTimerRef.current = null;
      }
    };
    const refreshOnZoomEnd = () => {
      pendingZoomRefreshReasonRef.current =
        pendingZoomRefreshReasonRef.current ?? "zoomend";
      if (
        labelZoomSettleTimerRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(labelZoomSettleTimerRef.current);
        labelZoomSettleTimerRef.current = null;
      }
      const settle = () => {
        labelZoomSettleTimerRef.current = null;
        const pending = pendingZoomRefreshReasonRef.current ?? "zoomend";
        pendingZoomRefreshReasonRef.current = null;
        labelZoomAnimatingRef.current = false;
        refresh(pending === "moveend" ? "zoomend" : pending);
      };
      if (typeof window === "undefined") {
        settle();
        return;
      }
      labelZoomSettleTimerRef.current = window.setTimeout(
        settle,
        LABEL_ZOOM_SETTLE_DELAY_MS,
      );
    };
    map.on("moveend", refreshOnMoveEnd);
    map.on("zoomstart", refreshOnZoomStart);
    map.on("zoomend", refreshOnZoomEnd);
    return () => {
      if (
        labelZoomSettleTimerRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(labelZoomSettleTimerRef.current);
        labelZoomSettleTimerRef.current = null;
      }
      labelZoomAnimatingRef.current = false;
      pendingZoomRefreshReasonRef.current = null;
      map.off("moveend", refreshOnMoveEnd);
      map.off("zoomstart", refreshOnZoomStart);
      map.off("zoomend", refreshOnZoomEnd);
    };
  }, [
    mapReady,
    visible,
    map,
    projection,
    worldId,
    activeBuildingUid,
    activeBuildingFloorRefSet,
    floorOptions,
    activeFloorIndex,
    dataVersion,
    assistPickActive,
    deletePickActive,
    featureInteractionSuppressed,
    selectedFeature?.uid,
  ]);

  const showFloorUI = mobileFloorVisible;

  return (
    <>
      {showFloorUI && (
        <div className="hidden sm:block">
          <SmallDraggablePanel
            id="desktop-floor-view-selector"
            title="拖动楼层视角面板"
            defaultPosition={{ x: Math.max(16, window.innerWidth - 152), y: 160 }}
            zIndex={2147483647}
            dragHandleSelector="[data-small-drag-handle]"
          >
            <AppCard className="bg-white/90 border border-gray-200 p-2 w-28">
              <div data-small-drag-handle className="select-none">
                <div className="text-xs font-semibold text-gray-800 mb-1">
                  楼层视角
                </div>
                <div className="text-[11px] text-gray-600 mb-2 truncate">
                  {activeBuildingName || "（未命名建筑）"}
                </div>
              </div>

              <div data-no-drag className="flex flex-col gap-1 max-h-[60vh] overflow-auto">
                {floorOptions.map((opt, idx) => {
                  const on = idx === activeFloorIndex;
                  return (
                    <AppButton
                      key={opt.value}
                      type="button"
                      onClick={() => setActiveFloorIndexAndRemember(idx)}
                      className={`w-full text-left px-2 py-1 rounded text-xs border transition-colors ${
                        on
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {opt.label}
                    </AppButton>
                  );
                })}
              </div>
            </AppCard>
          </SmallDraggablePanel>
        </div>
      )}
      <div className="hidden sm:block">
        {(() => {
          const cls =
            selectedFeature?.meta?.Class ?? selectedFeature?.featureInfo?.Class;
          const Card = resolveFeatureCardComponent(cls);
          return (
            <Card
              open={featureCardOpen}
              feature={selectedFeature}
              onClose={clearSelection}
              resolveFeatureById={resolveFeatureById}
              onTryTriggerLabelClickById={onTryTriggerLabelClickById}
            />
          );
        })()}
      </div>
    </>
  );
}

function createLayerBundle(
  r: FeatureRecord,
  symbol: any,
  ctx: RenderContext,
  store: FeatureStore,
  projection: DynmapProjection,
  onLabelClick?: (r: FeatureRecord, plan: LabelClickPlan) => void,
  viewportWorldRectXZ?: WorldRectXZ | null,
  assistPickActive: boolean = false,
  deletePickActive: boolean = false,
  displayPlan?: FeatureDisplayPlan | null,
  featureInteractionSuppressed: boolean = false,
): LayerBundle | null {
  const resolvedLabelPlan =
    typeof (symbol as any)?.label === "function"
      ? (symbol as any).label(r, ctx, store)
      : (symbol as any)?.label;

  const rawClick = (symbol as any)?.labelClick;
  const clickPlan: LabelClickPlan | null = rawClick
    ? typeof rawClick === "function"
      ? rawClick(r, ctx, store)
      : rawClick
    : null;
  const clickEnabled = !!(clickPlan && (clickPlan as any).enabled);
  const assistPickTarget = !!(assistPickActive && isAssistPickTargetFeature(r));
  const deletePickTarget = !!(deletePickActive && isDeletePickTargetFeature(r));
  const pickModeActive = assistPickActive || deletePickActive;
  const normalClickSuppressed = featureInteractionSuppressed && !pickModeActive;
  const effectiveClickPlan = pickModeActive || normalClickSuppressed ? null : clickPlan;

  // 【新增】几何点击扩展（最小入侵）：在规则的 labelClick.geom 开启后，点击主几何也触发与 label 点击一致的效果。
  // - 仅在 mode === 'normal' 时生效；labelOnly 下主几何被隐藏且不可交互。
  const geomAllowed = !!(clickEnabled && (clickPlan as any)?.mode === "normal");
  const geomPointEnabled =
    !pickModeActive && !normalClickSuppressed && !!(geomAllowed && (clickPlan as any)?.geom?.point);
  const geomPathEnabled =
    !pickModeActive && !normalClickSuppressed && !!(geomAllowed && (clickPlan as any)?.geom?.path);

  const labelStyleKey = ((resolvedLabelPlan as any)?.styleKey ??
    (clickPlan as any)?.labelStyleKey ??
    "bubble-dark") as any;
  const onClick =
    effectiveClickPlan && onLabelClick
      ? () => onLabelClick(r, effectiveClickPlan as any)
      : undefined;

  // 点
  if (r.type === "Points" && r.p3) {
    const latlng = projection.locationToLatLng(r.p3.x, r.p3.y, r.p3.z);

    const plan =
      typeof symbol.point === "function"
        ? symbol.point(r, ctx, store)
        : symbol.point;

    // ✅ pane 解析优先级：pointPlan.pane > symbol.pane > 默认 ria-point
    const mainPane = (plan as any)?.pane ?? symbol?.pane ?? "ria-point";
    const multipartPoints = r.multipartGeometry?.type === 'Point'
      ? r.multipartGeometry.parts
      : [r.p3];

    if (multipartPoints.length > 1) {
      const mainLayers = multipartPoints.map((point) => {
        const pointLatLng = projection.locationToLatLng(point.x, point.y, point.z);
        if (plan && plan.kind === 'icon') {
          const iconUrl = plan.iconUrl ?? (plan.iconUrlFrom ? String((r.featureInfo as any)?.[plan.iconUrlFrom] ?? '').trim() : undefined);
          if (iconUrl) {
            return L.marker(pointLatLng, {
              pane: mainPane,
              icon: L.icon({ iconUrl, iconSize: plan.iconSize ?? [24, 24], iconAnchor: plan.iconAnchor ?? [12, 12] }),
              interactive: deletePickTarget ? true : geomPointEnabled,
              zIndexOffset: (plan as any)?.zIndexOffset ?? 0,
            });
          }
        }
        return L.circleMarker(pointLatLng, {
          pane: mainPane,
          radius: plan?.radius ?? 5,
          interactive: deletePickTarget ? true : undefined,
          ...(plan?.style ?? { color: '#111827', weight: 2, opacity: 0.9, fillOpacity: 0.6, fillColor: '#f97316' }),
        });
      });
      const main = L.featureGroup(mainLayers);
      if (deletePickTarget) bindDeletePick(main, r);
      else if (geomPointEnabled && clickEnabled && onLabelClick) {
        main.on('click', (event: L.LeafletMouseEvent) => {
          (event as any)?.originalEvent?.stopPropagation?.();
          onLabelClick(r, effectiveClickPlan as any);
        });
      }
      const labelLayer = buildLabelLayer(
        r, resolvedLabelPlan, ctx, store, projection, latlng, labelStyleKey,
        effectiveClickPlan && clickEnabled ? (effectiveClickPlan as any) : null,
        onClick, viewportWorldRectXZ, deletePickTarget,
        deletePickTarget ? () => dispatchDeletePickFeature(r) : null, displayPlan,
      );
      return {
        main,
        label: labelLayer ?? undefined,
        kind: plan?.kind === 'icon' ? 'marker' : 'circleMarker',
        iconUrl: plan?.kind === 'icon' ? (plan.iconUrl ?? (plan.iconUrlFrom ? String((r.featureInfo as any)?.[plan.iconUrlFrom] ?? '').trim() : undefined)) : undefined,
        pane: mainPane,
        pointSignature: JSON.stringify(multipartPoints.map((point) => [point.x, point.y, point.z])),
      };
    }

    let main: L.Layer;
    let kind: LayerBundle["kind"] = "marker";
    let iconUrl: string | undefined;

    if (plan && plan.kind === "icon") {
      iconUrl =
        plan.iconUrl ??
        (plan.iconUrlFrom
          ? String((r.featureInfo as any)?.[plan.iconUrlFrom] ?? "").trim()
          : undefined);
      if (!iconUrl) {
        // fallback circle
        const cm = L.circleMarker(latlng, {
          pane: mainPane,
          radius: 5,
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.6,
        });
        main = cm;
        kind = "circleMarker";
      } else {
        const icon = L.icon({
          iconUrl,
          iconSize: plan.iconSize ?? [24, 24],
          iconAnchor: plan.iconAnchor ?? [12, 12],
        });
        main = L.marker(latlng, {
          pane: mainPane,
          icon,
          // 仅在开启 geom.point / 删除选择 时让 marker 可点击；默认保持不可交互，避免影响其他逻辑。
          interactive: deletePickTarget ? true : geomPointEnabled,
          zIndexOffset: (plan as any)?.zIndexOffset ?? 0,
        });
        kind = "marker";
      }
    } else {
      const cm = L.circleMarker(latlng, {
        pane: mainPane,
        radius: plan?.radius ?? 5,
        interactive: deletePickTarget ? true : undefined,
        ...(plan?.style ?? {
          color: "#111827",
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.6,
          fillColor: "#f97316",
        }),
      });
      main = cm;
      kind = "circleMarker";
    }

    // 【新增】几何点击：点要素本体点击（marker / circleMarker）
    let hitProxy: L.Layer | undefined;
    if (deletePickTarget) {
      bindDeletePick(main, r);
      hitProxy = createDeletePickPointHitProxy(latlng);
      bindDeletePick(hitProxy, r);
    } else if (geomPointEnabled && clickEnabled && onLabelClick) {
      (main as any).off?.("click");
      (main as any).on?.("click", (e: L.LeafletMouseEvent) => {
        (e as any)?.originalEvent?.stopPropagation?.();
        onLabelClick(r, effectiveClickPlan as any);
      });
    }

    // label
    const labelLayer = buildLabelLayer(
      r,
      resolvedLabelPlan,
      ctx,
      store,
      projection,
      latlng,
      labelStyleKey,
      effectiveClickPlan && clickEnabled ? (effectiveClickPlan as any) : null,
      onClick,
      viewportWorldRectXZ,
      deletePickTarget,
      deletePickTarget ? () => dispatchDeletePickFeature(r) : null,
      displayPlan,
    );
    return {
      main,
      label: labelLayer ?? undefined,
      hitProxy,
      kind,
      iconUrl,
      pane: mainPane,
    };
  }

  // 线/面
  if (r.coords3 && r.coords3.length) {
    const fallbackLatLngs = r.coords3.map((p) => projection.locationToLatLng(p.x, p.y, p.z));
    const lineLatLngs = r.multipartGeometry?.type === 'LineString'
      ? r.multipartGeometry.parts.map((part) => part.map((p) => projection.locationToLatLng(p.x, p.y, p.z)))
      : fallbackLatLngs;
    const polygonLatLngs = r.multipartGeometry?.type === 'Polygon'
      ? r.multipartGeometry.parts.map((part) => part.map((ring) => ring.map((p) => projection.locationToLatLng(p.x, p.y, p.z))))
      : fallbackLatLngs;

    const style: L.PathOptions =
      typeof symbol.pathStyle === "function"
        ? symbol.pathStyle(r, ctx, store)
        : symbol.pathStyle;

    // pane：symbol.pane > 默认 ria-overlay
    const mainPane = symbol?.pane ?? "ria-overlay";

    const main =
      r.type === "Polyline"
        ? L.polyline(lineLatLngs as L.LatLngExpression[], {
            ...(style ?? {}),
            pane: mainPane,
            interactive:
              assistPickTarget || deletePickTarget
                ? true
                : geomPathEnabled
                  ? true
                  : (style as any)?.interactive,
          })
        : L.polygon(polygonLatLngs as L.LatLngExpression[], {
            ...(style ?? {}),
            pane: mainPane,
            interactive:
              assistPickTarget || deletePickTarget
                ? true
                : geomPathEnabled
                  ? true
                  : (style as any)?.interactive,
          });

    // 【新增】几何点击：线/面要素本体点击 / 辅助线专用拾取
    (main as any).off?.("click");
    if (deletePickTarget) {
      bindDeletePick(main, r);
    } else if (assistPickTarget) {
      (main as any).on?.("click", (e: L.LeafletMouseEvent) => {
        (e as any)?.originalEvent?.stopPropagation?.();
        (e as any)?.originalEvent?.preventDefault?.();
        dispatchAssistPickFeature(r);
      });
    } else if (geomPathEnabled && clickEnabled && onLabelClick) {
      (main as any).on?.("click", (e: L.LeafletMouseEvent) => {
        (e as any)?.originalEvent?.stopPropagation?.();
        onLabelClick(r, effectiveClickPlan as any);
      });
    }

    bindAssistPickFeature(main, r);
    const labelLayer = buildLabelLayer(
      r,
      resolvedLabelPlan,
      ctx,
      store,
      projection,
      undefined,
      labelStyleKey,
      effectiveClickPlan && clickEnabled ? (effectiveClickPlan as any) : null,
      onClick,
      viewportWorldRectXZ,
      deletePickTarget,
      deletePickTarget ? () => dispatchDeletePickFeature(r) : null,
      displayPlan,
    );
    return {
      main,
      label: labelLayer ?? undefined,
      kind: "path",
      pane: mainPane,
    };
  }

  return null;
}

function updateLayerBundle(
  bundle: LayerBundle,
  r: FeatureRecord,
  symbol: any,
  ctx: RenderContext,
  store: FeatureStore,
  projection: DynmapProjection,
  root: L.LayerGroup,
  onLabelClick?: (r: FeatureRecord, plan: LabelClickPlan) => void,
  viewportWorldRectXZ?: WorldRectXZ | null,
  assistPickActive: boolean = false,
  deletePickActive: boolean = false,
  displayPlan?: FeatureDisplayPlan | null,
  featureInteractionSuppressed: boolean = false,
) {
  const resolvedLabelPlan =
    typeof (symbol as any)?.label === "function"
      ? (symbol as any).label(r, ctx, store)
      : (symbol as any)?.label;

  const rawClick = (symbol as any)?.labelClick;
  const clickPlan: LabelClickPlan | null = rawClick
    ? typeof rawClick === "function"
      ? rawClick(r, ctx, store)
      : rawClick
    : null;
  const clickEnabled = !!(clickPlan && (clickPlan as any).enabled);
  const assistPickTarget = !!(assistPickActive && isAssistPickTargetFeature(r));
  const deletePickTarget = !!(deletePickActive && isDeletePickTargetFeature(r));
  const pickModeActive = assistPickActive || deletePickActive;
  const normalClickSuppressed = featureInteractionSuppressed && !pickModeActive;
  const effectiveClickPlan = pickModeActive || normalClickSuppressed ? null : clickPlan;

  const geomAllowed = !!(clickEnabled && (clickPlan as any)?.mode === "normal");
  const geomPointEnabled =
    !pickModeActive && !normalClickSuppressed && !!(geomAllowed && (clickPlan as any)?.geom?.point);
  const geomPathEnabled =
    !pickModeActive && !normalClickSuppressed && !!(geomAllowed && (clickPlan as any)?.geom?.path);

  const labelStyleKey = ((resolvedLabelPlan as any)?.styleKey ??
    (clickPlan as any)?.labelStyleKey ??
    "bubble-dark") as any;
  const onClick =
    effectiveClickPlan && onLabelClick
      ? () => onLabelClick(r, effectiveClickPlan as any)
      : undefined;
  // 点：若 iconUrl 变化，重建
  if (r.type === "Points" && r.p3) {
    const latlng = projection.locationToLatLng(r.p3.x, r.p3.y, r.p3.z);
    const nextPointSignature = r.multipartGeometry?.type === 'Point' && r.multipartGeometry.parts.length > 1
      ? JSON.stringify(r.multipartGeometry.parts.map((point) => [point.x, point.y, point.z]))
      : undefined;
    const plan =
      typeof symbol.point === "function"
        ? symbol.point(r, ctx, store)
        : symbol.point;
    let nextKind: LayerBundle["kind"] = bundle.kind;
    let nextIconUrl = bundle.iconUrl;

    if (plan && plan.kind === "icon") {
      const url =
        plan.iconUrl ??
        (plan.iconUrlFrom
          ? String((r.featureInfo as any)?.[plan.iconUrlFrom] ?? "").trim()
          : undefined);
      nextIconUrl = url || undefined;
      nextKind = url ? "marker" : "circleMarker";
    } else {
      nextKind = "circleMarker";
      nextIconUrl = undefined;
    }

    // marker 的 interactive 不能可靠地原地切换；若 geom.point 开关或删除命中代理变化，直接重建最稳。
    const nextMarkerInteractive = deletePickTarget ? true : geomPointEnabled;
    const curMarkerInteractive =
      bundle.kind === "marker"
        ? !!(bundle.main as any)?.options?.interactive
        : undefined;
    const curHasHitProxy = !!bundle.hitProxy;
    const nextHasHitProxy = !!deletePickTarget;

    if (
      nextKind !== bundle.kind ||
      nextPointSignature !== bundle.pointSignature ||
      nextIconUrl !== bundle.iconUrl ||
      (bundle.kind === "marker" &&
        curMarkerInteractive !== nextMarkerInteractive) ||
      curHasHitProxy !== nextHasHitProxy
    ) {
      // remove old
      if (root.hasLayer(bundle.main)) root.removeLayer(bundle.main);
      if (bundle.label && root.hasLayer(bundle.label))
        fadeRemoveLabelLayer(root, bundle.label, true);
      if (bundle.hitProxy && root.hasLayer(bundle.hitProxy))
        root.removeLayer(bundle.hitProxy);

      const newBundle = createLayerBundle(
        r,
        symbol,
        ctx,
        store,
        projection,
        onLabelClick,
        viewportWorldRectXZ,
        assistPickActive,
        deletePickActive,
        displayPlan,
        featureInteractionSuppressed,
      );
      if (!newBundle) return;
      bundle.main = newBundle.main;
      bundle.label = newBundle.label;
      bundle.kind = newBundle.kind;
      bundle.iconUrl = newBundle.iconUrl;
      bundle.hitProxy = newBundle.hitProxy;
      bundle.pointSignature = newBundle.pointSignature;
      return;
    }

    // circleMarker style refresh
    if (
      bundle.kind === "circleMarker" &&
      bundle.main instanceof L.CircleMarker
    ) {
      const style = plan?.kind === "circle" ? (plan.style ?? {}) : {};
      if (style) bundle.main.setStyle(style);
      bundle.main.setLatLng(latlng);
    }

    if (bundle.kind === "marker" && bundle.main instanceof L.Marker) {
      bundle.main.setLatLng(latlng);
    }
    if (bundle.hitProxy && bundle.hitProxy instanceof L.CircleMarker) {
      bundle.hitProxy.setLatLng(latlng);
    }

    // 【新增】几何点击：点要素（更新时重绑）
    (bundle.main as any).off?.("click");
    if (bundle.hitProxy) (bundle.hitProxy as any).off?.("click");
    if (deletePickTarget) {
      bindDeletePick(bundle.main, r);
      if (bundle.hitProxy) bindDeletePick(bundle.hitProxy, r);
    } else if (geomPointEnabled && clickEnabled && onLabelClick) {
      (bundle.main as any).on?.("click", (e: L.LeafletMouseEvent) => {
        (e as any)?.originalEvent?.stopPropagation?.();
        onLabelClick(r, effectiveClickPlan as any);
      });
    }

    // label refresh
    // - 若使用 declutter：不在这里动 label，交由 refresh() 的统一布局阶段处理（避免闪烁/卡顿）
    if ((resolvedLabelPlan as any)?.declutter) return;
    if (bundle.label) clearBundleLabel(bundle, root);
    const labelLayer = buildLabelLayer(
      r,
      resolvedLabelPlan,
      ctx,
      store,
      projection,
      latlng,
      labelStyleKey,
      effectiveClickPlan && clickEnabled ? (effectiveClickPlan as any) : null,
      onClick,
      viewportWorldRectXZ,
      deletePickTarget,
      deletePickTarget ? () => dispatchDeletePickFeature(r) : null,
      displayPlan,
    );
    if (labelLayer) {
      bundle.label = labelLayer;
      root.addLayer(bundle.label);
      fadeInLabelLayer(bundle.label);
    }
    return;
  }

  const nextPathInteractive =
    assistPickTarget || deletePickTarget ? true : geomPathEnabled;
  const curPathInteractive = !!(bundle.main as any)?.options?.interactive;
  if (curPathInteractive !== nextPathInteractive) {
    if (root.hasLayer(bundle.main)) root.removeLayer(bundle.main);
    if (bundle.hitProxy && root.hasLayer(bundle.hitProxy))
      root.removeLayer(bundle.hitProxy);
    if (bundle.label && root.hasLayer(bundle.label))
      root.removeLayer(bundle.label);

    const newBundle = createLayerBundle(
      r,
      symbol,
      ctx,
      store,
      projection,
      onLabelClick,
      viewportWorldRectXZ,
      assistPickActive,
      deletePickActive,
      displayPlan,
      featureInteractionSuppressed,
    );
    if (!newBundle) return;
    bundle.main = newBundle.main;
    bundle.label = newBundle.label;
    bundle.kind = newBundle.kind;
    bundle.iconUrl = newBundle.iconUrl;
    bundle.hitProxy = newBundle.hitProxy;
    return;
  }

  // 线/面：更新 style
  if (bundle.main instanceof L.Path) {
    const style: L.PathOptions =
      typeof symbol.pathStyle === "function"
        ? symbol.pathStyle(r, ctx, store)
        : symbol.pathStyle;
    if (style) bundle.main.setStyle(style);
  }

  // 【新增】几何点击：线/面（更新时重绑）
  (bundle.main as any).off?.("click");
  bindAssistPickFeature(bundle.main, r);
  if (deletePickTarget) {
    bindDeletePick(bundle.main, r);
  } else if (assistPickTarget) {
    (bundle.main as any).on?.("click", (e: L.LeafletMouseEvent) => {
      (e as any)?.originalEvent?.stopPropagation?.();
      (e as any)?.originalEvent?.preventDefault?.();
      dispatchAssistPickFeature(r);
    });
  } else if (geomPathEnabled && clickEnabled && onLabelClick) {
    (bundle.main as any).on?.("click", (e: L.LeafletMouseEvent) => {
      (e as any)?.originalEvent?.stopPropagation?.();
      onLabelClick(r, effectiveClickPlan as any);
    });
  }

  // label refresh
  // - 若使用 declutter：不在这里动 label，交由 refresh() 的统一布局阶段处理
  if (!(resolvedLabelPlan as any)?.declutter) {
    if (bundle.label) clearBundleLabel(bundle, root);
    const labelLayer = buildLabelLayer(
      r,
      resolvedLabelPlan,
      ctx,
      store,
      projection,
      undefined,
      labelStyleKey,
      effectiveClickPlan && clickEnabled ? (effectiveClickPlan as any) : null,
      onClick,
      viewportWorldRectXZ,
      deletePickTarget,
      deletePickTarget ? () => dispatchDeletePickFeature(r) : null,
      displayPlan,
    );
    if (labelLayer) {
      bundle.label = labelLayer;
      root.addLayer(bundle.label);
      fadeInLabelLayer(bundle.label);
    }
  }
}

function resolveEffectiveDisplayAnchor(
  displayPlan: FeatureDisplayPlan | null | undefined,
  labelPlan: any,
): DisplayAnchorConfig | undefined {
  const baseAnchor = displayPlan?.anchor ?? undefined;
  const override = ((labelPlan as any)?.displayAnchor ??
    (labelPlan as any)?.anchor) as Partial<DisplayAnchorConfig> | undefined;

  if (!override) return baseAnchor;
  if (baseAnchor) {
    return { ...baseAnchor, ...override };
  }
  if (override.strategy) {
    return override as DisplayAnchorConfig;
  }
  return undefined;
}

function getStructureZoomModeForPlan(ctx: RenderContext): "hidden" | "lowPoint" | "highPolygon" {
  const z = Number((ctx as any)?.zoomLevel ?? 0);
  if (z < 3) return "hidden";
  if (z <= 5) return "lowPoint";
  return "highPolygon";
}

function isStructureBuildingPolygon(r: FeatureRecord): boolean {
  const cls = String(r.meta?.Class ?? r.featureInfo?.Class ?? "").trim();
  return r.type === "Polygon" && (cls === "BUD" || cls === "STB");
}

function resolveStructureLabelDisplayPlanForContext(
  r: FeatureRecord,
  plan: FeatureDisplayPlan,
  ctx: RenderContext,
): FeatureDisplayPlan {
  if (!isStructureBuildingPolygon(r)) return plan;

  const mode = getStructureZoomModeForPlan(ctx);
  const priorityFeature = isPriorityStructureLabelFeature(r);
  const areaPriorityBonus = priorityFeature ? 0 : getStructureAreaPriorityBonus(r);

  if (mode === "lowPoint") {
    return {
      ...plan,
      anchor: {
        ...plan.anchor,
        candidates: priorityFeature ? ["C", "N", "S", "E", "W"] : ["C"],
      },
      collision: {
        ...plan.collision,
        role: priorityFeature ? "important" : "optional",
        priority: priorityFeature
          ? STRUCTURE_LABEL_PRIORITY.lowZoomPriority
          : STRUCTURE_LABEL_PRIORITY.lowZoomNormal + areaPriorityBonus,
        group: "structureLabel",
        allowHide: true,
        paddingPx: priorityFeature ? 4 : 3,
        hidePolicy: "abbreviateThenHide",
      },
      density: {
        ...plan.density,
        enabled: true,
        gridSizePx: plan.density.gridSizePx ?? 104,
        maxLabelsPerGrid: priorityFeature ? 3 : 2,
        reduceOrder: ["abbreviateOptionalLabels", "hideOptionalLabels"],
        preserveSelected: true,
        preserveRequired: true,
      },
    };
  }

  if (mode === "highPolygon") {
    return {
      ...plan,
      anchor: {
        ...plan.anchor,
        candidates: ["C", "N", "S", "E", "W"],
      },
      collision: {
        ...plan.collision,
        role: "important",
        priority: STRUCTURE_LABEL_PRIORITY.highZoom + areaPriorityBonus,
        group: "structureLabel",
        allowHide: true,
        paddingPx: 4,
        hidePolicy: "abbreviateThenHide",
      },
      density: {
        ...plan.density,
        enabled: true,
        gridSizePx: plan.density.gridSizePx ?? 104,
        maxLabelsPerGrid: 3,
        reduceOrder: ["abbreviateOptionalLabels", "hideOptionalLabels"],
        preserveSelected: true,
        preserveRequired: true,
      },
    };
  }

  return plan;
}

// ======================= LabelLayout：从单要素提取 LabelRequest =======================
function buildLabelRequest(
  r: FeatureRecord,
  labelPlan: any,
  ctx: RenderContext,
  store: FeatureStore,
  projection: DynmapProjection,
  pointLatLng?: L.LatLng,
  clickPlan?: LabelClickPlan | null,
  realViewportWorldRectXZ?: WorldRectXZ | null,
  layoutViewportWorldRectXZ?: WorldRectXZ | null,
  displayPlan?: FeatureDisplayPlan | null,
): LabelRequest | null {
  if (!labelPlan || !labelPlan.enabled) return null;
  if (!labelPlan.declutter) return null;
  if (labelPlan.minLevel !== undefined && ctx.zoomLevel < labelPlan.minLevel)
    return null;

  let text = "";
  if (typeof labelPlan.textFrom === "function") {
    text = String(labelPlan.textFrom(r, ctx, store) ?? "").trim();
  } else if (typeof labelPlan.textFrom === "string") {
    text = String((r.featureInfo as any)?.[labelPlan.textFrom] ?? "").trim();
  }
  if (!text) return null;

  const effectivePlacement =
    r.type === "Points" && labelPlan.placement === "center"
      ? (clickPlan as any)?.mode === "labelOnly"
        ? "center"
        : "near"
      : (labelPlan.placement ?? (r.type === "Points" ? "near" : "center"));

  const effectiveDisplayAnchor = resolveEffectiveDisplayAnchor(
    displayPlan,
    labelPlan,
  );

  const resolvedAnchor =
    r.type === "Points" && pointLatLng
      ? { anchorLatLng: pointLatLng }
      : resolveLabelAnchorForFeature({
          feature: r,
          projection,
          y: Y_FOR_DISPLAY,
          viewportWorldRectXZ:
            layoutViewportWorldRectXZ ?? realViewportWorldRectXZ ?? null,
          realViewportWorldRectXZ: realViewportWorldRectXZ ?? null,
          layoutViewportWorldRectXZ: layoutViewportWorldRectXZ ?? null,
          displayAnchor: effectiveDisplayAnchor,
          legacyDeclutter: labelPlan.declutter,
        });

  if (!resolvedAnchor) return null;

  return {
    id: `${r.uid}#label`,
    featureUid: r.uid,
    anchorLatLng: resolvedAnchor.anchorLatLng,
    anchorCandidatesLatLng: resolvedAnchor.anchorCandidatesLatLng,
    rotateDeg: resolvedAnchor.rotateDeg,
    rotateDegCandidates: resolvedAnchor.rotateDegCandidates,
    anchorCandidateIds: resolvedAnchor.anchorCandidateIds,
    anchorCandidateSourceIndexes: resolvedAnchor.anchorCandidateSourceIndexes,
    anchorCandidateDisplayOrders: resolvedAnchor.anchorCandidateDisplayOrders,
    lineTextPathCandidates: resolvedAnchor.lineTextPathCandidates,
    geoAnchorDebug: resolvedAnchor.geoAnchorDebug,
    lineTextMode: effectiveDisplayAnchor?.lineTextMode,
    textPathFallback: effectiveDisplayAnchor?.textPathFallback,
    displayAnchor: effectiveDisplayAnchor,
    text,
    placement: effectivePlacement,
    withDot: !!labelPlan.withDot,
    dotAnchorMode: labelPlan.dotAnchorMode,
    offsetY: Number(labelPlan.offsetY ?? 0),
    declutter: labelPlan.declutter,
  };
}

function buildLabelLayer(
  r: FeatureRecord,
  labelPlan: any,
  ctx: RenderContext,
  store: FeatureStore,
  projection: DynmapProjection,
  pointLatLng?: L.LatLng,
  styleKey?: any,
  clickPlan?: LabelClickPlan | null,
  onClick?: (() => void) | null,
  viewportWorldRectXZ?: WorldRectXZ | null,
  deletePickActive: boolean = false,
  onDeletePickClick?: (() => void) | null,
  displayPlan?: FeatureDisplayPlan | null,
): L.Layer | null {
  if (!labelPlan || !labelPlan.enabled) return null;

  if (labelPlan.declutter) return null;
  if (labelPlan.minLevel !== undefined && ctx.zoomLevel < labelPlan.minLevel)
    return null;

  let text = "";
  if (typeof labelPlan.textFrom === "function") {
    text = String(labelPlan.textFrom(r, ctx, store) ?? "").trim();
  } else if (typeof labelPlan.textFrom === "string") {
    text = String((r.featureInfo as any)?.[labelPlan.textFrom] ?? "").trim();
  }
  if (!text) return null;

  const placement = labelPlan.placement ?? "center";
  const withDot = !!labelPlan.withDot;
  const dotAnchorMode = labelPlan.dotAnchorMode as "inline" | "anchorRight" | undefined;
  const effectivePlacement =
    r.type === "Points" && placement === "center"
      ? (clickPlan as any)?.mode === "labelOnly"
        ? "center"
        : "near"
      : placement;

  const effectiveDisplayAnchor = resolveEffectiveDisplayAnchor(
    displayPlan,
    labelPlan,
  );

  const resolvedAnchor =
    r.type === "Points" && pointLatLng
      ? { anchorLatLng: pointLatLng }
      : resolveLabelAnchorForFeature({
          feature: r,
          projection,
          y: Y_FOR_DISPLAY,
          viewportWorldRectXZ,
          displayAnchor: effectiveDisplayAnchor,
          legacyDeclutter: labelPlan.declutter,
        });

  if (!resolvedAnchor) return null;
  const ll = resolvedAnchor.anchorLatLng;

  if (deletePickActive && onDeletePickClick) {
    return makeClickableLabelMarker({
      latlng: ll,
      text,
      placement: effectivePlacement,
      withDot,
      dotAnchorMode,
      offsetY: labelPlan.offsetY,
      styleKey: (styleKey ?? "bubble-dark") as any,
      onClick: onDeletePickClick,
    });
  }

  if (clickPlan && (clickPlan as any).enabled && onClick) {
    return makeClickableLabelMarker({
      latlng: ll,
      text,
      placement: effectivePlacement,
      withDot,
      dotAnchorMode,
      offsetY: labelPlan.offsetY,
      styleKey: (styleKey ??
        (clickPlan as any).labelStyleKey ??
        "bubble-dark") as any,
      onClick,
    });
  }

  return makeLabelMarker(
    ll,
    text,
    effectivePlacement,
    withDot,
    labelPlan.offsetY,
    styleKey,
    dotAnchorMode,
  );
}
