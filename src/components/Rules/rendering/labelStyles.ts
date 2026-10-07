import { labelPlacementTransform, labelScreenOffset, type LabelPlacement } from './labelPlacement';
export type { LabelPlacement } from './labelPlacement';
import * as L from 'leaflet';

/**
 * Label 视觉样式集中管理（便于维护与扩展）。
 *
 * 设计原则：
 * - 不依赖外部 CSS（全部 inline style），避免打包/样式作用域导致丢失。
 * - 通过 styleKey 调用，后续新增样式只改这里。
 */

/**
 * Label 样式 key。
 *
 * 说明：
 * - 兼容旧 key（如 gm-bw-15 / bubble-dark-13）。
 * - 支持可扩展尺寸系统：gm-bw-xx / gm-wtb-xx / bubble-dark-xx。
 */
export type LabelStyleKey =
  | 'bubble-dark'
  | `bubble-dark-${number}`
  | 'gm-outline'
  | 'gm-outline-bold'
  | `gm-outline-${number}`
  | `gm-outline-bold-${number}`
  | 'structure-label'
  | `structure-label-${number}`
  | `gm-bw-${number}`
  | `gm-wtb-${number}`
  | `rle-line-${number}`
  | `rle-pill-${number}`;

/**
 * 允许 styleKey 传入对象以承载“动态颜色/旋转”等运行时样式。
 * - key: 样式名（如 rle-line-13 / rle-pill-13）
 * - color: 线路主色
 * - rotateDeg: 旋转角（用于沿线文字）
 */
export type LabelStyleKeyInput =
  | LabelStyleKey
  | {
      key: LabelStyleKey;
      color?: string;
      rotateDeg?: number;
      writingMode?: 'horizontal' | 'vertical';
      /** Only honoured by text-only GM/structure families. */
      italic?: boolean;
      underline?: boolean;
    };


export type LabelRenderOptions = {
  placement: LabelPlacement;
  withDot?: boolean;
  dotAnchorMode?: 'inline' | 'anchorRight';
  offsetY?: number;
  offsetX?: number;
  screenOffsets?: boolean;
  /** 是否允许交互（用于“点击 label”模式） */
  interactive?: boolean;
};

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[<>&"]/g, (m) => {
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '&') return '&amp;';
    if (m === '"') return '&quot;';
    return m;
  });
}

function dotHtml(): string {
  return `
    <span style="
      display:inline-block;
      width:6px;height:6px;
      border-radius:999px;
      background:#fff;
      margin-right:6px;
      box-shadow:0 0 0 3px rgba(0,0,0,0.85);
      flex:0 0 auto;
    "></span>
  `;
}

function anchoredDotHtml(): string {
  return `
    <span style="
      display:inline-block;
      width:6px;height:6px;
      border-radius:999px;
      background:#fff;
      margin-left:-3px;
      margin-right:8px;
      box-shadow:0 0 0 3px rgba(0,0,0,0.85);
      flex:0 0 auto;
    "></span>
  `;
}

/**
 * 渲染 label HTML。
 * 注意：此处不做 DOM 操作，返回 HTML 字符串，用于 Leaflet.divIcon。
 */
export function renderLabelHtml(styleKey: LabelStyleKeyInput, text: string, opts: LabelRenderOptions): string {
  const keyObj = typeof styleKey === 'object' && styleKey ? (styleKey as any) : null;
  const styleKeyStr: string = keyObj ? String(keyObj.key ?? '') : String(styleKey);
  const themeColor = keyObj ? String(keyObj.color ?? '') : '';
  const rotateDeg = keyObj && Number.isFinite(Number(keyObj.rotateDeg)) ? Number(keyObj.rotateDeg) : 0;
  const writingMode: 'horizontal' | 'vertical' = keyObj && (keyObj as any).writingMode === 'vertical' ? 'vertical' : 'horizontal';
  const italic = Boolean(keyObj?.italic);
  const underline = Boolean(keyObj?.underline);

  const rawText = String(text ?? '');
  const labelWhiteSpace = writingMode === 'vertical' ? 'normal' : rawText.includes('\n') ? 'pre-line' : 'nowrap';

  const buildVerticalTokensHtml = (s: string): string => {
    // 规则：连续 >=4 个英文/数字字符视为一个整体（横置显示），其他字符逐字竖排。
    const parts: Array<{ t: string; kind: 'latin' | 'other' }> = [];
    let i = 0;
    while (i < s.length) {
      const rest = s.slice(i);
      const m = rest.match(/^[A-Za-z0-9]{4,}/);
      if (m && m[0]) {
        parts.push({ t: m[0], kind: 'latin' });
        i += m[0].length;
        continue;
      }
      parts.push({ t: s[i], kind: 'other' });
      i += 1;
    }

    return parts
      .map((p) => {
        const safe = escapeHtml(p.t);
        if (p.kind === 'latin') {
          return `<span style="display:inline-block; writing-mode:horizontal-tb; transform:rotate(90deg); transform-origin:center;">${safe}</span>`;
        }
        return `<span>${safe}</span>`;
      })
      .join('<br/>');
  };

  const safe = writingMode === 'vertical' ? buildVerticalTokensHtml(rawText) : escapeHtml(rawText);

  const placement = opts.placement ?? 'center';
  const anchorRight = !!opts.withDot && opts.dotAnchorMode === 'anchorRight';
  const baseTransform = anchorRight ? 'translate(0, -50%)' : labelPlacementTransform(placement);
  const transform = anchorRight
    ? baseTransform
    : writingMode === 'vertical'
      ? baseTransform
      : (rotateDeg ? `${baseTransform} rotate(${rotateDeg}deg)` : baseTransform);
  const offset = labelScreenOffset(placement, opts.offsetX, opts.offsetY, opts.screenOffsets === true);
  const extraMarginTop = offset.y;
  const extraMarginLeft = offset.x;
  const originStyle = opts.screenOffsets ? 'position:absolute;left:0;top:0;' : '';

  const dot = opts.withDot ? (anchorRight ? anchoredDotHtml() : dotHtml()) : '';
  const pe = opts.interactive ? 'auto' : 'none';
  const cursor = opts.interactive ? 'pointer' : 'default';

  // Google Map 风格：描边字（webkit-text-stroke + text-shadow 双保险）
  // 固定格式 + 可扩展尺寸系统：gm-bw-xx / gm-wtb-xx
  const roundTo = (v: number, step: number) => {
    const s = Number(step) || 0;
    if (!s || !Number.isFinite(v)) return v;
    return Math.round(v / s) * s;
  };

  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

  const parseSizeSuffix = (key: string, prefix: string): number | null => {
    if (!key.startsWith(prefix)) return null;
    const s = key.slice(prefix.length);
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const GM_STATIC: Record<string, { fontSize: number; strokeW: number; fill: string; stroke: string; fontWeight: number }> = {
    // `gm-outline` is the road/network family: black glyph fill with a
    // white outline.  It is intentionally distinct from `gm-bw`, the
    // common white-fill / black-outline surface family.
    'gm-outline': { fontSize: 17, strokeW: 0.5, fill: '#111827', stroke: '#ffffff', fontWeight: 700 },
    'gm-outline-bold': { fontSize: 17, strokeW: 0.7, fill: '#111827', stroke: '#ffffff', fontWeight: 800 },
    // 保留旧 key 的显式覆盖（避免未来有人调整比例导致历史样式漂移）
    'gm-bw-15': { fontSize: 15, strokeW: 0.5, fill: '#ffffff', stroke: '#000000', fontWeight: 700 },
    'gm-bw-9': { fontSize: 9, strokeW: 0.3, fill: '#ffffff', stroke: '#000000', fontWeight: 700 },
    'gm-wtb-15': { fontSize: 15, strokeW: 0.5, fill: '#dbeafe', stroke: '#1d4ed8', fontWeight: 700 },
  };

  const gmStatic = GM_STATIC[String(styleKeyStr)];
  const GM_STROKE_RATIO = 1 / 30; // 与旧值保持一致：15->0.5, 9->0.3

  const tryBuildGmDerived = (key: string): { fontSize: number; strokeW: number; fill: string; stroke: string; fontWeight: number } | null => {
    // gm-bw-xx：黑描边白填充
    const bw = parseSizeSuffix(key, 'gm-bw-');
    if (bw !== null) {
      return {
        fontSize: bw,
        strokeW: roundTo(bw * GM_STROKE_RATIO, 0.05),
        fill: '#ffffff',
        stroke: '#000000',
        fontWeight: 700,
      };
    }
    // gm-wtb-xx：淡天蓝填充 + 深蓝描边
    const wtb = parseSizeSuffix(key, 'gm-wtb-');
    if (wtb !== null) {
      return {
        fontSize: wtb,
        strokeW: roundTo(wtb * GM_STROKE_RATIO, 0.05),
        fill: '#dbeafe',
        stroke: '#1d4ed8',
        fontWeight: 700,
      };
    }
    // gm-outline(-bold)-xx：道路/网络的黑字白描边家族；字号保持为
    // V3.2 可编辑值，而不再与 gm-bw 的地物面字体混淆。
    const outline = key.match(/^gm-outline-(bold-)?(\d+(?:\.\d+)?)$/);
    if (outline) {
      const size = Number(outline[2]);
      if (Number.isFinite(size) && size > 0) {
        return {
          fontSize: size,
          strokeW: roundTo(size * GM_STROKE_RATIO, 0.05),
          fill: '#111827',
          stroke: '#ffffff',
          fontWeight: outline[1] ? 800 : 700,
        };
      }
    }
    return null;
  };

  const gm = gmStatic ?? tryBuildGmDerived(String(styleKeyStr));
  if (gm) {
    // 说明：
    // - 过去使用 `-webkit-text-stroke` + 一组 0px text-shadow 的“双保险”，
    //   在部分浏览器/设备上会出现字形内部异常黑线（抗锯齿/缩放导致的渲染瑕疵）。
    // - 这里改为“仅使用多方向 text-shadow 描边”，跨浏览器更稳定。
    const o = Math.max(1, Math.round(gm.strokeW * 2));
    const shadow = [
      `${o}px 0 0 ${gm.stroke}`,
      `-${o}px 0 0 ${gm.stroke}`,
      `0 ${o}px 0 ${gm.stroke}`,
      `0 -${o}px 0 ${gm.stroke}`,
      `${o}px ${o}px 0 ${gm.stroke}`,
      `${o}px -${o}px 0 ${gm.stroke}`,
      `-${o}px ${o}px 0 ${gm.stroke}`,
      `-${o}px -${o}px 0 ${gm.stroke}`,
    ].join(',');

    return `
      <div style="
        ${originStyle}
        transform:${transform};
        margin-top:${extraMarginTop}px; margin-left:${extraMarginLeft}px;
        white-space:${labelWhiteSpace};
        pointer-events:${pe};
        cursor:${cursor};
        display:inline-flex;
        align-items:center;
        background:transparent;
        padding:0;
      ">
        ${dot}
        <span style="
          color:${gm.fill};
          font-weight:${gm.fontWeight};
          font-size:${gm.fontSize}px;
          line-height:1.1;
          text-shadow:${shadow};
          font-style:${italic ? 'italic' : 'normal'};
          text-decoration:${underline ? 'underline' : 'none'};
          -webkit-font-smoothing:antialiased;
          text-rendering:geometricPrecision;
        ">${safe}</span>
      </div>
    `;
  }

  // ===================== RLE：沿线文字 / 线路“药丸牌” =====================
  // rle-line-xx：文字沿线（可旋转），文字颜色=线路色，白色粗描边
  // rle-pill-xx：屏幕朝向的圆角矩形牌子（背景=线路色，白字）

  const parseSizeSuffixAny = (key: string, prefix: string): number | null => {
    if (!key.startsWith(prefix)) return null;
    const s = key.slice(prefix.length);
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const rleLineSize = parseSizeSuffixAny(styleKeyStr, 'rle-line-');
  if (rleLineSize !== null) {
    const c = themeColor || '#2563eb';

    // 与 gm-bw-xx 使用同一套“多方向 text-shadow 描边”组装方式，仅填充色随线路色变化。
    // 描边宽度按字号等比缩放（与 GM 系统保持一致）。
    const GM_STROKE_RATIO = 1 / 30; // 15->0.5, 9->0.3
    const strokeW = roundTo(rleLineSize * GM_STROKE_RATIO, 0.05);
    const o = Math.max(1, Math.round(strokeW * 2));
    const shadow = [
      `${o}px 0 0 #ffffff`,
      `-${o}px 0 0 #ffffff`,
      `0 ${o}px 0 #ffffff`,
      `0 -${o}px 0 #ffffff`,
      `${o}px ${o}px 0 #ffffff`,
      `${o}px -${o}px 0 #ffffff`,
      `-${o}px ${o}px 0 #ffffff`,
      `-${o}px -${o}px 0 #ffffff`,
    ].join(',');

    return `
      <div style="
        ${originStyle}
        transform:${transform};
        margin-top:${extraMarginTop}px; margin-left:${extraMarginLeft}px;
        white-space:${labelWhiteSpace};
        pointer-events:${pe};
        cursor:${cursor};
        display:inline-flex;
        align-items:center;
        background:transparent;
        padding:0;
      ">
        <span style="
          color:${c};
          font-weight:700;
          font-size:${rleLineSize}px;
          line-height:1.1;
          text-shadow:${shadow};
          -webkit-font-smoothing:antialiased;
          text-rendering:geometricPrecision;
        ">${safe}</span>
      </div>
    `;
  }

  const rlePillSize = parseSizeSuffixAny(styleKeyStr, 'rle-pill-');
  if (rlePillSize !== null) {
    const c = themeColor || '#2563eb';
    // 以当前 13px 下的视觉参数为基准，按比例缩放（类似 bubble-dark）。
    // 13px（原逻辑）对应：padY=3, padX=7, radius=8。
    const PILL_PADY_RATIO = 3 / 13;
    const PILL_PADX_RATIO = 7 / 13;
    const PILL_RADIUS_RATIO = 8 / 13;

    const padY = Math.max(2, Math.round(rlePillSize * PILL_PADY_RATIO));
    const padX = Math.max(6, Math.round(rlePillSize * PILL_PADX_RATIO));
    const radius = Math.max(6, Math.round(rlePillSize * PILL_RADIUS_RATIO));
    return `
      <div style="
        ${originStyle}
        transform:${transform};
        margin-top:${extraMarginTop}px; margin-left:${extraMarginLeft}px;
        white-space:${labelWhiteSpace};
        pointer-events:${pe};
        cursor:${cursor};
        display:inline-flex;
        align-items:center;
        background:${c};
        color:#ffffff;
        padding:${padY}px ${padX}px;
        border-radius:${radius}px;
        font-weight:700;
        font-size:${rlePillSize}px;
        line-height:1;
      ">${safe}</div>
    `;
  }

  // structure-label(-xx)：建筑/站房结构名。无底色、黑字 + 白色 halo。
  // 采用“双层文字”结构：底层只负责白色 halo，上层只负责黑色主体，避免小字号下白边吞掉黑字。
  const structureSize =
    String(styleKeyStr) === 'structure-label'
      ? 12
      : parseSizeSuffix(String(styleKeyStr), 'structure-label-');

  if (structureSize !== null) {
    const fontWeight = 700;
    const haloOffset = roundTo(clamp(structureSize * 0.105, 1.05, 1.7), 0.05);
    const haloBlur = roundTo(clamp(structureSize * 0.055, 0.55, 1.05), 0.05);
    const halo = '#ffffff';
    const diagonalOffset = roundTo(haloOffset * 0.72, 0.05);

    const haloShadow = [
      `0 0 ${haloBlur}px #ffffff`,
      `${haloOffset}px 0 0 #ffffff`,
      `-${haloOffset}px 0 0 #ffffff`,
      `0 ${haloOffset}px 0 #ffffff`,
      `0 -${haloOffset}px 0 #ffffff`,
      `${diagonalOffset}px ${diagonalOffset}px 0 #ffffff`,
      `-${diagonalOffset}px ${diagonalOffset}px 0 #ffffff`,
      `${diagonalOffset}px -${diagonalOffset}px 0 #ffffff`,
      `-${diagonalOffset}px -${diagonalOffset}px 0 #ffffff`,
    ].join(', ');

    return `
      <div style="
        ${originStyle}
        transform:${transform};
        margin-top:${extraMarginTop}px; margin-left:${extraMarginLeft}px;
        white-space:${labelWhiteSpace};
        pointer-events:${pe};
        cursor:${cursor};
        display:inline-flex;
        align-items:center;
        background:transparent;
        padding:0;
      ">
        ${dot}
        <span style="
          position:relative;
          display:inline-block;
          color:#0f172a;
          font-weight:${fontWeight};
          font-size:${structureSize}px;
          line-height:1.05;
          letter-spacing:0.01em;
          font-style:${italic ? 'italic' : 'normal'};
          text-decoration:${underline ? 'underline' : 'none'};
          -webkit-font-smoothing:antialiased;
          text-rendering:geometricPrecision;
        ">
          <span aria-hidden="true" style="
            position:absolute;
            inset:0;
            display:inline-block;
            color:${halo};
            text-shadow:${haloShadow};
            pointer-events:none;
            user-select:none;
          ">${safe}</span>
          <span style="
            position:relative;
            display:inline-block;
            color:#0f172a;
            pointer-events:none;
            user-select:none;
          ">${safe}</span>
        </span>
      </div>
    `;
  }

  // bubble-dark(-xx)：黑底半透明圆角气泡（参考 STA 的现有风格）
  // 需求：dot（若启用）应独立在气泡外部，气泡仅包裹文字。
  // 可扩展尺寸系统：bubble-dark-xx
  const bubbleSize =
    String(styleKeyStr) === 'bubble-dark'
      ? 12
      : parseSizeSuffix(String(styleKeyStr), 'bubble-dark-') ?? 12;

  // 与旧值保持一致（bubble-dark-13：paddingY=2, paddingX=6, radius=6）
  const BUBBLE_PADY_RATIO = 2 / 13;
  const BUBBLE_PADX_RATIO = 6 / 13;
  const BUBBLE_RADIUS_RATIO = 6 / 13;

  const bubblePadY = Math.max(1, Math.round(bubbleSize * BUBBLE_PADY_RATIO));
  const bubblePadX = Math.max(2, Math.round(bubbleSize * BUBBLE_PADX_RATIO));
  const bubbleRadius = Math.max(3, Math.round(bubbleSize * BUBBLE_RADIUS_RATIO));
  const bubbleSpan = `
    <span style="
      background: rgba(0,0,0,0.65);
      color: #fff;
      padding: ${bubblePadY}px ${bubblePadX}px;
      border-radius: ${bubbleRadius}px;
      font-size: ${bubbleSize}px;
      white-space: ${labelWhiteSpace};
      line-height: 1;
    ">${safe}</span>
  `;

  return `
    <div style="
      ${originStyle}
      transform: ${transform};
      margin-top: ${extraMarginTop}px; margin-left: ${extraMarginLeft}px;
      pointer-events: ${pe};
      cursor: ${cursor};
      display: inline-flex;
      align-items: center;
      white-space: ${labelWhiteSpace};
      background: transparent;
      padding: 0;
    ">${dot}${bubbleSpan}</div>
  `;
}

export function makeLabelDivIcon(styleKey: LabelStyleKeyInput, text: string, opts: LabelRenderOptions): L.DivIcon {
  const html = renderLabelHtml(styleKey, text, opts);
  return L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] });
}
