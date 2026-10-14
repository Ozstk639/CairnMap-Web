import * as L from "leaflet";
import { buildCjkGlyphPathPlanResult } from "@/components/Rules/rendering/label/labelGlyphPath";
import {
  escapeHtml,
  lineTextStyleFromStyleKey,
} from "@/components/Rules/rendering/label/labelLineTextStyle";
import { markLineTextMarker } from "@/components/Rules/rendering/label/labelLineTextGeometry";
import type {
  DisplayAnchorConfig,
  TextPathStatus,
} from "@/components/Rules/rendering/display/displayTypes";

export type CjkGlyphPathLabelMarkerResult = {
  marker: L.Marker | null;
  status: TextPathStatus;
  failureReason?: string;
  compactUsed?: boolean;
  glyphCount?: number;
  planKey?: string;
  markerLatLng?: L.LatLng;
};

type MarkerOptions = {
  map: L.Map;
  latlng: L.LatLng;
  text: string;
  pathLatLngs: L.LatLng[];
  anchor?: Partial<DisplayAnchorConfig> | null;
  styleKey?: any;
  rotateDeg?: number;
  onClick?: () => void;
  cacheKeyHint?: string;
  offsetX?: number;
  offsetY?: number;
};

export function makeCjkGlyphPathLabelMarkerResult(
  options: MarkerOptions,
): CjkGlyphPathLabelMarkerResult {
  const style = lineTextStyleFromStyleKey(options.styleKey);
  const built = buildCjkGlyphPathPlanResult({
    map: options.map,
    text: options.text,
    pathLatLngs: options.pathLatLngs,
    anchor: options.anchor ?? null,
    fontSizePx: style.fontSize,
    cacheKeyHint: options.cacheKeyHint,
  });
  const plan = built.plan;
  if (!plan || !plan.glyphs.length) {
    return {
      marker: null,
      status: built.status ?? "fallbackCjkGlyphPathRenderFailed",
      failureReason: built.failureReason,
      compactUsed: built.compactUsed,
      glyphCount: built.metrics?.glyphCount,
      planKey: built.cacheKey,
    };
  }

  const markerLatLng = options.map.containerPointToLatLng(
    L.point(plan.markerContainerPoint.x + (options.offsetX ?? 0), plan.markerContainerPoint.y + (options.offsetY ?? 0)),
  );
  const safeStroke = escapeHtml(style.stroke);
  const safeFill = escapeHtml(style.fill);
  const glyphBody = plan.glyphs
    .map((g) => {
      const x = Math.round(g.x * 100) / 100;
      const y = Math.round(g.y * 100) / 100;
      const r = Math.round(g.rotateDeg * 100) / 100;
      return `<text class="${style.className}" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" transform="rotate(${r} ${x} ${y})">${escapeHtml(g.char)}</text>`;
    })
    .join("");

  const html = `
    <svg class="ria-line-textpath-svg ria-line-glyphpath-svg" width="${plan.width}" height="${plan.height}" viewBox="${plan.viewBox}" aria-hidden="true" style="overflow:visible;pointer-events:auto">
      <style>
        .ria-line-textpath{font:${style.fontWeight} ${style.fontSize}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;fill:${safeFill};stroke:${safeStroke};stroke-width:${style.strokeWidth}px;paint-order:stroke;stroke-linejoin:round;dominant-baseline:central;pointer-events:auto;cursor:pointer;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;}
      </style>
      <rect x="0" y="0" width="${plan.width}" height="${plan.height}" fill="transparent" pointer-events="all" />
      <g>${glyphBody}</g>
    </svg>`;

  const icon = L.divIcon({
    className: "ria-line-textpath-icon ria-line-glyphpath-icon",
    html,
    iconSize: [plan.width, plan.height],
    iconAnchor: [plan.width / 2, plan.height / 2],
  });

  const marker = L.marker(markerLatLng, {
    icon,
    pane: "ria-label",
    zIndexOffset: 1000,
    interactive: true,
    keyboard: false,
    bubblingMouseEvents: false,
  });
  if (options.onClick) marker.on("click", options.onClick);
  const planKey = built.cacheKey ?? options.cacheKeyHint ?? "";
  markLineTextMarker(marker, {
    kind: "glyphPath",
    markerLatLng,
    planKey,
  });
  return {
    marker,
    status: plan.status ?? built.status ?? "usedCjkGlyphPath",
    compactUsed: plan.compactUsed ?? built.compactUsed,
    glyphCount: plan.glyphs.length,
    planKey,
    markerLatLng,
  };
}

export function makeCjkGlyphPathLabelMarker(
  options: MarkerOptions,
): L.Marker | null {
  return makeCjkGlyphPathLabelMarkerResult(options).marker;
}
