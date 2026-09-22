import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatGridNumber, snapWorldPointByMode } from '@/components/Mapping/tools/GridSnapModeSwitch';
import type { DynmapProjection } from '@/lib/DynmapProjection';
import { DraggablePanel } from '@/components/DraggablePanel/DraggablePanel';
import { Pencil, Plus, Save, Undo2, Redo2, X, ArrowLeftRight, Trash2 } from 'lucide-react';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';

export type WorldPoint = { x: number; z: number; y?: number };

export type ControlPointsTHandle = {
  /** 主控件可用于判断是否需要屏蔽绘制区 click */
  isBusy: () => boolean;
  /** 当前工作模式 */
  getMode: () => 'none' | 'edit' | 'add' | 'delete';
  /** Safely close any active transaction; false means the user kept unsaved work. */
  requestCloseAndClear: () => boolean;
};

type ControlPointsTProps = {
  mapReady: boolean;
  leafletMapRef: MutableRefObject<L.Map | null>;
  projectionRef: MutableRefObject<DynmapProjection | null>;

  /**
   * 当前正在绘制/编辑的要素上下文（仅处理当前要素）
   * - mode 为 point/none 时按钮应禁用
   * - coords 通常对接 MeasuringModule 的 tempPoints
   */
  activeMode: 'none' | 'point' | 'polyline' | 'polygon';
  activeColor: string;
  activeCoords: WorldPoint[];

  /**
   * 保存（应用）按钮：把 ControlPointsT 的“已保存结果”写回当前要素
   *（例如：setTempPoints(newCoords)）
   */
  onApplyActiveCoords?: (coords: WorldPoint[]) => void;

  /** Reject a proposed active ring before it reaches the draft. */
  validateCandidateCoords?: (coords: WorldPoint[]) => string | undefined;

  /** Lets the multipart selector lock itself while this tool owns a session. */
  onSessionStateChange?: (state: { busy: boolean; mode: 'none' | 'edit' | 'add' | 'delete' | 'array' }) => void;

  /**
   * 当控制点修改/添加窗口开启时，主控件应当屏蔽“绘制区 click 加点”
   *（因为 Leaflet 多监听无法可靠 stop 其他监听器）
   */
  onSetDrawClickSuppressed?: (suppressed: boolean) => void;

  /**
   * “显示控制点”强制开启且不可关闭：对接 MeasuringModule 的开关
   * - 进入 edit/add：强制 enabled=true, locked=true
   * - 退出 edit/add：恢复进入前的状态
   */
  showControlPointsEnabled?: boolean;
  showControlPointsLocked?: boolean;
  setShowControlPointsEnabled?: (v: boolean) => void;
  setShowControlPointsLocked?: (v: boolean) => void;

  /**
   * 参考线（辅助线）过滤：修改模式下，map click 获取坐标后必须先经过参考线过滤
   * - 输入：世界坐标（x,z）
   * - 输出：过滤后的世界坐标（可能被阈值贴附，也可能不变）
   */
  filterWorldPointByAssistLine?: (p: WorldPoint) => WorldPoint;

  /**
   * 控制点添加模式：需要“先关闭当前参考线，再以当前要素为目标启用‘选择要素’模式，并阈值=50”
   * 由于 AssistLineTools 当前未必暴露编程接口，这里用回调交由主控件实现。
   * 若你暂时不接入，文件内部仍会用“当前要素最近点插入（阈值 50）”实现核心效果。
   */
  onEnterAddModeConfigureAssistLine?: () => void;
  onExitAddModeRestoreAssistLine?: () => void;
};

const Y_FOR_DISPLAY = -64;
const ADD_SNAP_MAX_DIST = 50;

type GeometryTypeForArrayEditor = 'point' | 'polyline' | 'polygon';

type ParsedArrayCoords = {
  coords: WorldPoint[];
  geometryType: GeometryTypeForArrayEditor;
  defaultY: number;
};

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function samePoint(a: WorldPoint, b: WorldPoint, eps = 1e-9) {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.z - b.z) <= eps;
}

function closestPointOnSegment(p: WorldPoint, a: WorldPoint, b: WorldPoint) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apz = p.z - a.z;
  const denom = abx * abx + abz * abz;

  if (!Number.isFinite(denom) || denom <= 1e-12) {
    return { point: { ...a }, t: 0, dist: Math.hypot(p.x - a.x, p.z - a.z) };
  }

  const t = clamp01((apx * abx + apz * abz) / denom);
  const q = { x: a.x + abx * t, z: a.z + abz * t };
  const d = Math.hypot(p.x - q.x, p.z - q.z);
  return { point: q, t, dist: d };
}

type GeometryRings = {
  rings: WorldPoint[][];
  closed: boolean[];
};

function normalizeRingsForPolygonLike(coords: WorldPoint[], isPolygon: boolean): GeometryRings {
  const ring = coords.slice();
  if (ring.length >= 2 && samePoint(ring[0], ring[ring.length - 1])) {
    ring.pop();
  }
  return { rings: [ring], closed: [isPolygon] };
}

function closestPointOnRings(p: WorldPoint, geom: GeometryRings) {
  let best = {
    point: null as WorldPoint | null,
    dist: Number.POSITIVE_INFINITY,
    ringIndex: -1,
    segIndex: -1,
    t: 0,
  };

  for (let r = 0; r < geom.rings.length; r++) {
    const ring = geom.rings[r];
    const closed = geom.closed[r];
    if (!Array.isArray(ring) || ring.length < 2) continue;

    const n = ring.length;
    const lastSeg = closed ? n : n - 1;

    for (let i = 0; i < lastSeg; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const cand = closestPointOnSegment(p, a, b);
      if (cand.dist < best.dist) {
        best = {
          point: cand.point,
          dist: cand.dist,
          ringIndex: r,
          segIndex: i,
          t: cand.t,
        };
      }
    }
  }

  return best;
}

type EditAction =
  | {
      kind: 'move';
      index: number;
      from: WorldPoint;
      to: WorldPoint;
    }
  | {
      kind: 'insert';
      index: number;
      point: WorldPoint;
    }
  | {
      kind: 'delete';
      index: number;
      point: WorldPoint;
    };

function getGeometryTypeForArrayEditor(activeMode: ControlPointsTProps['activeMode']): GeometryTypeForArrayEditor | null {
  if (activeMode === 'point' || activeMode === 'polyline' || activeMode === 'polygon') return activeMode;
  return null;
}

function getMinimumCountForGeometryType(type: GeometryTypeForArrayEditor) {
  if (type === 'point') return 1;
  if (type === 'polyline') return 2;
  return 3;
}

function inferDefaultY(coords: WorldPoint[]) {
  const y = coords.find((p) => typeof p.y === 'number' && Number.isFinite(p.y))?.y;
  return typeof y === 'number' ? y : 0;
}

function buildArrayEditorCoords(coords: WorldPoint[], defaultY?: number): WorldPoint[] {
  const yFallback = Number.isFinite(defaultY ?? NaN) ? Number(defaultY) : inferDefaultY(coords);
  return coords.map((p) => ({ x: p.x, y: typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : yFallback, z: p.z }));
}

function stringifyArrayEditorCoords(coords: WorldPoint[]) {
  const lines = coords.map((p) => `  [${p.x},${typeof p.y === 'number' ? p.y : 0},${p.z}]`);
  if (!lines.length) return '[]';
  return `[\n${lines.join(',\n')}\n]`;
}

function parseArrayEditorCoords(
  rawText: string,
  geometryType: GeometryTypeForArrayEditor,
  defaultY: number
): ParsedArrayCoords {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('当前内容不是合法 JSON，请检查中括号、逗号和数字格式。');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('当前内容必须是 JSON 数组，格式应为 [[x,y,z],[x,y,z]]。');
  }

  const coords: WorldPoint[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!Array.isArray(item) || item.length !== 3) {
      throw new Error(`第 ${i + 1} 个坐标必须严格为 [x,y,z] 三元数组。`);
    }
    const [x, y, z] = item;
    if (![x, y, z].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new Error(`第 ${i + 1} 个坐标存在非法数值，x / y / z 都必须是有限数字。`);
    }
    coords.push({ x, y, z });
  }

  const minCount = getMinimumCountForGeometryType(geometryType);
  if (coords.length < minCount) {
    const name = geometryType === 'point' ? '点' : geometryType === 'polyline' ? '线' : '面';
    throw new Error(`${name}要素至少需要 ${minCount} 个控制点，当前仅有 ${coords.length} 个。`);
  }

  return { coords, geometryType, defaultY: Number.isFinite(defaultY) ? defaultY : 0 };
}

export default forwardRef<ControlPointsTHandle, ControlPointsTProps>(function ControlPointsT(props, ref) {
  const {
    mapReady,
    leafletMapRef,
    projectionRef,
    activeMode,
    activeColor,
    activeCoords,
    onApplyActiveCoords,
    validateCandidateCoords,
    onSessionStateChange,
    onSetDrawClickSuppressed,

    showControlPointsEnabled,
    showControlPointsLocked,
    setShowControlPointsEnabled,
    setShowControlPointsLocked,

    filterWorldPointByAssistLine,
    onEnterAddModeConfigureAssistLine,
    onExitAddModeRestoreAssistLine,
  } = props;

  // Kept solely for backwards-compatible imperative closes. No visible entry
  // opens this legacy container; all user actions are now the inline command bar.
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
  const [editEnabled, setEditEnabled] = useState(false);
  const [addEnabled, setAddEnabled] = useState(false);
  const [deleteEnabled, setDeleteEnabled] = useState(false);

  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [deletePanelOpen, setDeletePanelOpen] = useState(false);
  const [arrayEditorOpen, setArrayEditorOpen] = useState(false);

  const [statusText, setStatusText] = useState<string>('');

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // 当前会话的工作坐标（未保存）
  const [workingCoords, setWorkingCoords] = useState<WorldPoint[] | null>(null);

  // 撤回/恢复
  const [undoStack, setUndoStack] = useState<EditAction[]>([]);
  const [redoStack, setRedoStack] = useState<EditAction[]>([]);

  // 数组编辑：文本会话与独立撤回/恢复
  const [arrayText, setArrayText] = useState('');
  const [arrayUndoStack, setArrayUndoStack] = useState<string[]>([]);
  const [arrayRedoStack, setArrayRedoStack] = useState<string[]>([]);
  const [arrayValidated, setArrayValidated] = useState(false);
  const [arrayValidatedCoords, setArrayValidatedCoords] = useState<WorldPoint[] | null>(null);
  const [arrayAppliedText, setArrayAppliedText] = useState('');
  const [arrayDefaultY, setArrayDefaultY] = useState(0);

  // 进入工具前的“显示控制点”状态，用于退出后恢复
  const prevShowStateRef = useRef<{ enabled: boolean; locked: boolean } | null>(null);

  // Leaflet overlay
  const vertexGroupRef = useRef<L.LayerGroup | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);

  const projToWorld = useCallback(
    (latlng: L.LatLng): WorldPoint | null => {
      const proj = projectionRef.current;
      if (!proj) return null;
      const loc = proj.latLngToLocation(latlng, Y_FOR_DISPLAY);
      return { x: loc.x, z: loc.z };
    },
    [projectionRef]
  );

  const fmt = useCallback((p: WorldPoint) => `${formatGridNumber(p.x)}, ${formatGridNumber(p.z)}`, []);

  const modeOk = useMemo(() => activeMode === 'polyline' || activeMode === 'polygon', [activeMode]);
  const arrayGeometryType = useMemo(() => getGeometryTypeForArrayEditor(activeMode), [activeMode]);

  const sessionCoords = useMemo<WorldPoint[]>(() => {
    // workingCoords 优先（用于预览与控制点渲染）
    return workingCoords ?? activeCoords;
  }, [workingCoords, activeCoords]);

  const dirty = useMemo(() => undoStack.length > 0, [undoStack.length]);
  const arrayDirty = useMemo(() => arrayText !== arrayAppliedText, [arrayText, arrayAppliedText]);

  const forceShowControlPointsOn = useCallback(() => {
    if (!setShowControlPointsEnabled || !setShowControlPointsLocked) return;

    // 记录进入前状态（只记录一次）
    if (!prevShowStateRef.current) {
      prevShowStateRef.current = {
        enabled: Boolean(showControlPointsEnabled),
        locked: Boolean(showControlPointsLocked),
      };
    }

    setShowControlPointsEnabled(true);
    setShowControlPointsLocked(true);
  }, [
    setShowControlPointsEnabled,
    setShowControlPointsLocked,
    showControlPointsEnabled,
    showControlPointsLocked,
  ]);

  const restoreShowControlPoints = useCallback(() => {
    if (!setShowControlPointsEnabled || !setShowControlPointsLocked) {
      prevShowStateRef.current = null;
      return;
    }
    const prev = prevShowStateRef.current;
    if (!prev) return;

    setShowControlPointsEnabled(prev.enabled);
    setShowControlPointsLocked(prev.locked);
    prevShowStateRef.current = null;
  }, [setShowControlPointsEnabled, setShowControlPointsLocked]);

  const clearSession = useCallback(() => {
    setSelectedIndex(null);
    setWorkingCoords(null);
    setUndoStack([]);
    setRedoStack([]);
    setStatusText('');
  }, []);

  const resetArrayEditorState = useCallback(() => {
    setArrayEditorOpen(false);
    setArrayText('');
    setArrayUndoStack([]);
    setArrayRedoStack([]);
    setArrayValidated(false);
    setArrayValidatedCoords(null);
    setArrayAppliedText('');
  }, []);

  const endAllModes = useCallback(
    (opts?: { restoreAssistLine?: boolean }) => {
      setEditEnabled(false);
      setAddEnabled(false);
      setDeleteEnabled(false);
      setEditPanelOpen(false);
      setAddPanelOpen(false);
      setDeletePanelOpen(false);
      setSelectedIndex(null);
      setWorkingCoords(null);
      setUndoStack([]);
      setRedoStack([]);
      setArrayEditorOpen(false);
      setArrayText('');
      setArrayUndoStack([]);
      setArrayRedoStack([]);
      setArrayValidated(false);
      setArrayValidatedCoords(null);
      setArrayAppliedText('');
      setStatusText('');

      onSetDrawClickSuppressed?.(false);
      restoreShowControlPoints();

      if (opts?.restoreAssistLine) {
        onExitAddModeRestoreAssistLine?.();
      }
    },
    [onSetDrawClickSuppressed, restoreShowControlPoints, onExitAddModeRestoreAssistLine]
  );

  // -------- Leaflet 容器挂载/卸载 --------
  useEffect(() => {
    if (!mapReady) return;
    const map = leafletMapRef.current;
    if (!map) return;

    // 专用 pane：保证控制点点/虚线预览总在更上层，避免被其它 overlay 吃点击
    const PANE = 'controlPointsT-pane';
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE);
      pane.style.zIndex = '650';
    }

    if (!vertexGroupRef.current) vertexGroupRef.current = L.layerGroup();
    if (!overlayGroupRef.current) overlayGroupRef.current = L.layerGroup();

    if (!map.hasLayer(vertexGroupRef.current)) vertexGroupRef.current.addTo(map);
    if (!map.hasLayer(overlayGroupRef.current)) overlayGroupRef.current.addTo(map);

    return () => {
      if (vertexGroupRef.current && map.hasLayer(vertexGroupRef.current)) map.removeLayer(vertexGroupRef.current);
      if (overlayGroupRef.current && map.hasLayer(overlayGroupRef.current)) map.removeLayer(overlayGroupRef.current);
    };
  }, [mapReady, leafletMapRef]);

  // -------- overlay：预览未保存几何（虚线）--------
  useEffect(() => {
    const proj = projectionRef.current;
    const overlay = overlayGroupRef.current;
    if (!proj || !overlay) return;

    overlay.clearLayers();

    // 仅在当前控制点事务启用且 dirty 时显示预览
    if (!(editEnabled || addEnabled || deleteEnabled)) return;
    if (!dirty) return;
    if (!modeOk) return;

    const latlngs = sessionCoords
      .map((p) => proj.locationToLatLng(p.x, Y_FOR_DISPLAY, p.z))
      .filter(Boolean) as L.LatLng[];

    if (latlngs.length < 1) return;

    if (activeMode === 'polyline') {
      if (latlngs.length < 2) return;
      L.polyline(latlngs, {
        color: activeColor,
        weight: 3,
        dashArray: '6 6',
        opacity: 0.9,
      }).addTo(overlay);
      return;
    }

    if (activeMode === 'polygon') {
      if (latlngs.length < 3) return;
      L.polygon(latlngs, {
        color: activeColor,
        weight: 3,
        dashArray: '6 6',
        fill: false,
        opacity: 0.9,
      }).addTo(overlay);
    }
  }, [editEnabled, addEnabled, deleteEnabled, dirty, modeOk, sessionCoords, activeMode, activeColor, projectionRef]);

  // -------- vertex：渲染控制点（仅当前要素）--------
  useEffect(() => {
    const proj = projectionRef.current;
    const vg = vertexGroupRef.current;
    if (!proj || !vg) return;

    vg.clearLayers();

    // 只有控制点事务启动时才显示（符合“强制显示控制点”需求）
    if (!(editEnabled || addEnabled || deleteEnabled)) {
      return;
    }

    if (!modeOk) {
      setSelectedIndex(null);
      return;
    }

    const coords = sessionCoords;
    if (!Array.isArray(coords) || coords.length === 0) return;

    coords.forEach((p, idx) => {
      const ll = proj.locationToLatLng(p.x, Y_FOR_DISPLAY, p.z);
      const isSelected = editEnabled && selectedIndex === idx;

      const marker = L.circleMarker(ll, {
        pane: 'controlPointsT-pane',
        bubblingMouseEvents: false,
        radius: isSelected ? 7 : 5,
        color: activeColor,
        fillColor: activeColor,
        fillOpacity: 0.7,
        weight: isSelected ? 3 : 2,
        opacity: 0.95,
      });

      marker.bindTooltip(fmt(p), {
        direction: 'top',
        offset: L.point(0, -6),
        opacity: 0.9,
        sticky: true,
      });

      marker.on('click', (e: any) => {
        if (e?.originalEvent) {
          L.DomEvent.stop(e.originalEvent);
        }

        if (deleteEnabled) {
          const minimum = activeMode === 'polygon' ? 3 : activeMode === 'polyline' ? 2 : 1;
          if (coords.length <= minimum) {
            setStatusText(`控制点删除：${activeMode === 'polygon' ? '面' : '线'}至少保留 ${minimum} 个控制点`);
            return;
          }
          setWorkingCoords((prev) => {
            const base = (prev ?? activeCoords).slice();
            const removed = base[idx];
            if (!removed) return base;
            const next = base.slice();
            next.splice(idx, 1);
            const error = validateCandidateCoords?.(next);
            if (error) {
              setStatusText(`未删除：${error}`);
              return base;
            }
            setUndoStack((stack) => [...stack, { kind: 'delete', index: idx, point: removed }]);
            setRedoStack([]);
            setStatusText(`已删除控制点 #${idx + 1}`);
            return next;
          });
          return;
        }

        if (!editEnabled) return;

        setSelectedIndex(idx);
        setStatusText(`已选择控制点 #${idx + 1}，请点击地图设置新位置（参考线过滤将先执行）`);
      });

      vg.addLayer(marker);
    });
  }, [editEnabled, addEnabled, deleteEnabled, modeOk, sessionCoords, activeColor, selectedIndex, fmt, projectionRef, activeMode, activeCoords, validateCandidateCoords]);

  // -------- map click：修改模式“选点后下一次点击移动”--------
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (!editEnabled) return;
      if (!editPanelOpen) return;
      if (!modeOk) return;
      if (selectedIndex === null) return;

      const w0 = projToWorld(e.latlng);
      if (!w0) return;

      const wFiltered = filterWorldPointByAssistLine ? filterWorldPointByAssistLine(w0) : w0;
      const wSnapped = snapWorldPointByMode(wFiltered);

      setWorkingCoords((prev) => {
        const base = (prev ?? activeCoords).slice();
        if (selectedIndex < 0 || selectedIndex >= base.length) return prev ?? activeCoords;

        const from = base[selectedIndex];
        const to: WorldPoint = { ...wSnapped, y: from?.y };
        base[selectedIndex] = to;

        const error = validateCandidateCoords?.(base);
        if (error) {
          setStatusText(`未修改：${error}`);
          return prev ?? activeCoords;
        }

        setUndoStack((u) => [...u, { kind: 'move', index: selectedIndex, from, to }]);
        setRedoStack([]);

        setStatusText(`已修改控制点 #${selectedIndex + 1} -> ${fmt(to)}`);
        return base;
      });
    };

    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [
    leafletMapRef,
    editEnabled,
    editPanelOpen,
    modeOk,
    selectedIndex,
    projToWorld,
    activeCoords,
    filterWorldPointByAssistLine,
    fmt,
    validateCandidateCoords,
  ]);

  // -------- map click：添加模式“点击插入（阈值 50）”--------
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (!addEnabled) return;
      if (!addPanelOpen) return;
      if (!modeOk) return;

      const w = projToWorld(e.latlng);
      if (!w) return;

      setWorkingCoords((prev) => {
        const baseRaw = prev ?? activeCoords;
        const isPolygon = activeMode === 'polygon';

        const geom = normalizeRingsForPolygonLike(baseRaw, isPolygon);
        const coords = geom.rings[0];

        if (coords.length < 2) {
          setStatusText('控制点添加：当前要素控制点不足 2 个，无法插入');
          return prev ?? activeCoords;
        }

        const best = closestPointOnRings(w, geom);
        if (!best.point || !Number.isFinite(best.dist)) return prev ?? activeCoords;

        if (best.dist > ADD_SNAP_MAX_DIST) {
          setStatusText(`未插入：距离当前要素超过 ${ADD_SNAP_MAX_DIST} 格`);
          return prev ?? activeCoords;
        }

        const segIndex = best.segIndex;
        const n = coords.length;

        const insertIndex = (() => {
          if (isPolygon) {
            if (segIndex >= n - 1) return n;
            return segIndex + 1;
          }
          if (segIndex < 0) return n;
          return Math.min(segIndex + 1, n);
        })();

        const next = coords.slice();

        const segA = coords[segIndex];
        const segB = coords[(segIndex + 1) % n];
        const yInterp =
          typeof segA?.y === 'number' && typeof segB?.y === 'number'
            ? segA.y + (segB.y - segA.y) * (best.t ?? 0)
            : undefined;

        const snapped = snapWorldPointByMode(best.point);
        const inserted: WorldPoint = { ...snapped, y: yInterp };

        next.splice(insertIndex, 0, inserted);

        const error = validateCandidateCoords?.(next);
        if (error) {
          setStatusText(`未插入：${error}`);
          return prev ?? activeCoords;
        }

        setUndoStack((u) => [...u, { kind: 'insert', index: insertIndex, point: inserted }]);
        setRedoStack([]);

        setStatusText(`已插入控制点：${fmt(inserted)}（阈值 ${ADD_SNAP_MAX_DIST}）`);
        return next;
      });
    };

    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [leafletMapRef, addEnabled, addPanelOpen, modeOk, projToWorld, activeCoords, activeMode, fmt, validateCandidateCoords]);

  // -------- 撤回/恢复 --------
  const doUndo = useCallback(() => {
    setUndoStack((u) => {
      if (!u.length) return u;
      const last = u[u.length - 1];

      setWorkingCoords((prev) => {
        const base = (prev ?? activeCoords).slice();

        if (last.kind === 'move') {
          if (last.index >= 0 && last.index < base.length) {
            base[last.index] = last.from;
          }
        } else if (last.kind === 'insert') {
          if (last.index >= 0 && last.index < base.length) {
            base.splice(last.index, 1);
          }
        } else if (last.kind === 'delete') {
          const index = Math.max(0, Math.min(last.index, base.length));
          base.splice(index, 0, last.point);
        }
        return base;
      });

      setRedoStack((r) => [...r, last]);
      return u.slice(0, u.length - 1);
    });
  }, [activeCoords]);

  const doRedo = useCallback(() => {
    setRedoStack((r) => {
      if (!r.length) return r;
      const last = r[r.length - 1];

      setWorkingCoords((prev) => {
        const base = (prev ?? activeCoords).slice();

        if (last.kind === 'move') {
          if (last.index >= 0 && last.index < base.length) {
            base[last.index] = last.to;
          }
        } else if (last.kind === 'insert') {
          const idx = Math.max(0, Math.min(last.index, base.length));
          base.splice(idx, 0, last.point);
        } else if (last.kind === 'delete') {
          if (last.index >= 0 && last.index < base.length) base.splice(last.index, 1);
        }

        return base;
      });

      setUndoStack((u) => [...u, last]);
      return r.slice(0, r.length - 1);
    });
  }, [activeCoords]);

  // -------- 保存（应用到当前要素，并关闭窗口）--------
  const commitAndClose = useCallback(
    (mode: 'edit' | 'add' | 'delete') => {
      const coords = (workingCoords ?? activeCoords).slice();

      onApplyActiveCoords?.(coords);

      endAllModes({ restoreAssistLine: mode === 'add' });
    },
    [workingCoords, activeCoords, onApplyActiveCoords, endAllModes]
  );

  const tryClosePanelDiscard = useCallback(
    (mode: 'edit' | 'add' | 'delete') => {
      if (undoStack.length > 0) {
        const ok = window.confirm('修改未保存，确定关闭并丢弃本次修改吗？');
        if (!ok) return false;
      }

      if (mode === 'add') {
        onExitAddModeRestoreAssistLine?.();
      }
      endAllModes({ restoreAssistLine: mode === 'add' });
      return true;
    },
    [undoStack.length, endAllModes, onExitAddModeRestoreAssistLine]
  );

  const recordArrayTextChange = useCallback((nextText: string) => {
    setArrayText((current) => {
      if (nextText === current) return current;
      setArrayUndoStack((u) => [...u, current]);
      setArrayRedoStack([]);
      setArrayValidated(false);
      setArrayValidatedCoords(null);
      return nextText;
    });
  }, []);

  const openArrayEditor = useCallback(() => {
    if (arrayEditorOpen) return;
    if (!arrayGeometryType) {
      setStatusText('数组编辑：当前没有可编辑的要素类型');
      return;
    }
    if (editEnabled || addEnabled || deleteEnabled) {
      setStatusText('数组编辑开启前，请先结束控制点修改、添加或删除');
      return;
    }
    if (!activeCoords.length) {
      setStatusText('数组编辑：当前没有可导入的控制点');
      return;
    }

    const defaultY = inferDefaultY(activeCoords);
    const importedCoords = buildArrayEditorCoords(activeCoords, defaultY);
    const importedText = stringifyArrayEditorCoords(importedCoords);

    setArrayDefaultY(defaultY);
    setArrayText(importedText);
    setArrayAppliedText(importedText);
    setArrayUndoStack([]);
    setArrayRedoStack([]);
    setArrayValidated(true);
    setArrayValidatedCoords(importedCoords);
    setArrayEditorOpen(true);
    onSetDrawClickSuppressed?.(true);
    setStatusText('数组编辑已开启：当前控制点数组已导入并标记为“已校验”');
  }, [arrayEditorOpen, arrayGeometryType, editEnabled, addEnabled, deleteEnabled, activeCoords, onSetDrawClickSuppressed]);

  const closeArrayEditorNow = useCallback(() => {
    resetArrayEditorState();
    if (!(editEnabled || addEnabled || deleteEnabled)) {
      onSetDrawClickSuppressed?.(false);
    }
  }, [resetArrayEditorState, editEnabled, addEnabled, deleteEnabled, onSetDrawClickSuppressed]);

  const tryCloseArrayEditor = useCallback(() => {
    if (arrayDirty) {
      const ok = window.confirm('数组编辑中存在未应用的修改，确定关闭并放弃这些修改吗？');
      if (!ok) return false;
    }
    closeArrayEditorNow();
    return true;
  }, [arrayDirty, closeArrayEditorNow]);

  const validateArrayEditor = useCallback(() => {
    if (!arrayGeometryType) {
      window.alert('当前没有可校验的要素类型。');
      return;
    }

    try {
      const parsed = parseArrayEditorCoords(arrayText, arrayGeometryType, arrayDefaultY);
      const error = validateCandidateCoords?.(parsed.coords);
      if (error) throw new Error(error);
      setArrayValidated(true);
      setArrayValidatedCoords(parsed.coords);
      setStatusText(`数组校验通过：当前控制点数 ${parsed.coords.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '数组校验失败';
      setArrayValidated(false);
      setArrayValidatedCoords(null);
      window.alert(message);
    }
  }, [arrayGeometryType, arrayText, arrayDefaultY, validateCandidateCoords]);

  const applyArrayEditorToDraft = useCallback(() => {
    if (!arrayValidated || !arrayValidatedCoords) return false;

    const applied = arrayValidatedCoords.map((p) => ({ ...p }));
    const error = validateCandidateCoords?.(applied);
    if (error) {
      setStatusText(`数组未应用：${error}`);
      return false;
    }
    onApplyActiveCoords?.(applied);
    setWorkingCoords(applied);
    setSelectedIndex(null);
    setArrayAppliedText(arrayText);
    setStatusText(`已应用数组编辑结果：当前控制点数 ${applied.length}`);
    return true;
  }, [arrayValidated, arrayValidatedCoords, onApplyActiveCoords, arrayText, validateCandidateCoords]);

  const finishArrayEditor = useCallback(() => {
    if (!arrayValidated) return;
    if (arrayDirty) {
      const ok = applyArrayEditorToDraft();
      if (!ok) return;
    }
    closeArrayEditorNow();
  }, [arrayValidated, arrayDirty, applyArrayEditorToDraft, closeArrayEditorNow]);

  const doArrayUndo = useCallback(() => {
    setArrayUndoStack((u) => {
      if (!u.length) return u;
      const last = u[u.length - 1];
      setArrayText((current) => {
        setArrayRedoStack((r) => [...r, current]);
        return last;
      });
      setArrayValidated(false);
      setArrayValidatedCoords(null);
      return u.slice(0, u.length - 1);
    });
  }, []);

  const doArrayRedo = useCallback(() => {
    setArrayRedoStack((r) => {
      if (!r.length) return r;
      const last = r[r.length - 1];
      setArrayText((current) => {
        setArrayUndoStack((u) => [...u, current]);
        return last;
      });
      setArrayValidated(false);
      setArrayValidatedCoords(null);
      return r.slice(0, r.length - 1);
    });
  }, []);

  const canArrayReverse = useMemo(() => {
    return Boolean(arrayValidated && arrayValidatedCoords && arrayValidatedCoords.length >= 2);
  }, [arrayValidated, arrayValidatedCoords]);

  const doArrayReverse = useCallback(() => {
    if (!canArrayReverse || !arrayValidatedCoords) return;
    const reversed = arrayValidatedCoords.slice().reverse();
    setArrayUndoStack((u) => [...u, arrayText]);
    setArrayRedoStack([]);
    setArrayText(stringifyArrayEditorCoords(reversed));
    setArrayValidated(false);
    setArrayValidatedCoords(null);
    setStatusText('数组编辑：已执行反转，请重新校验后再应用');
  }, [canArrayReverse, arrayValidatedCoords, arrayText]);

  const tryCloseToolPanel = useCallback(() => {
    if (arrayEditorOpen && !tryCloseArrayEditor()) return;
    if (editEnabled && editPanelOpen && !tryClosePanelDiscard('edit')) return;
    if (addEnabled && addPanelOpen && !tryClosePanelDiscard('add')) return;
    if (deleteEnabled && deletePanelOpen && !tryClosePanelDiscard('delete')) return;
    setToolPanelOpen(false);
    setStatusText('');
  }, [arrayEditorOpen, tryCloseArrayEditor, editEnabled, editPanelOpen, addEnabled, addPanelOpen, deleteEnabled, deletePanelOpen, tryClosePanelDiscard]);

  // -------- 互斥开关：控制点修改 / 添加 / 删除 --------
  const toggleEdit = useCallback(() => {
    if (arrayEditorOpen) {
      setStatusText('数组编辑开启中，其他控制点功能已锁定');
      return;
    }

    if (addEnabled || addPanelOpen) {
      const closed = tryClosePanelDiscard('add');
      if (!closed) return;
    }
    if (deleteEnabled || deletePanelOpen) {
      const closed = tryClosePanelDiscard('delete');
      if (!closed) return;
    }

    if (editEnabled) {
      tryClosePanelDiscard('edit');
      return;
    }

    if (!modeOk) {
      setStatusText('控制点修改仅支持线/面要素');
      return;
    }

    setAddEnabled(false);
    setAddPanelOpen(false);
    setDeleteEnabled(false);
    setDeletePanelOpen(false);

    setEditEnabled(true);
    setEditPanelOpen(true);
    setSelectedIndex(null);
    setWorkingCoords(activeCoords.slice());
    setUndoStack([]);
    setRedoStack([]);

    forceShowControlPointsOn();
    onSetDrawClickSuppressed?.(true);

    setStatusText('控制点修改已开启：点击控制点后，再点击地图设置新位置');
  }, [
    arrayEditorOpen,
    addEnabled,
    addPanelOpen,
    deleteEnabled,
    deletePanelOpen,
    tryClosePanelDiscard,
    editEnabled,
    modeOk,
    activeCoords,
    forceShowControlPointsOn,
    onSetDrawClickSuppressed,
  ]);

  const toggleAdd = useCallback(() => {
    if (arrayEditorOpen) {
      setStatusText('数组编辑开启中，其他控制点功能已锁定');
      return;
    }

    if (editEnabled || editPanelOpen) {
      const closed = tryClosePanelDiscard('edit');
      if (!closed) return;
    }
    if (deleteEnabled || deletePanelOpen) {
      const closed = tryClosePanelDiscard('delete');
      if (!closed) return;
    }

    if (addEnabled) {
      tryClosePanelDiscard('add');
      return;
    }

    if (!modeOk) {
      setStatusText('控制点添加仅支持线/面要素');
      return;
    }

    setEditEnabled(false);
    setEditPanelOpen(false);
    setDeleteEnabled(false);
    setDeletePanelOpen(false);
    setSelectedIndex(null);

    setAddEnabled(true);
    setAddPanelOpen(true);
    setWorkingCoords(activeCoords.slice());
    setUndoStack([]);
    setRedoStack([]);

    forceShowControlPointsOn();
    onSetDrawClickSuppressed?.(true);
    onEnterAddModeConfigureAssistLine?.();

    setStatusText(`控制点添加已开启：点击地图将按最近点插入（阈值 ${ADD_SNAP_MAX_DIST}）`);
  }, [
    arrayEditorOpen,
    editEnabled,
    editPanelOpen,
    deleteEnabled,
    deletePanelOpen,
    tryClosePanelDiscard,
    addEnabled,
    modeOk,
    activeCoords,
    forceShowControlPointsOn,
    onSetDrawClickSuppressed,
    onEnterAddModeConfigureAssistLine,
  ]);

  const canDelete = useMemo(() => modeOk && activeCoords.length > (activeMode === 'polygon' ? 3 : 2), [modeOk, activeCoords.length, activeMode]);

  const toggleDelete = useCallback(() => {
    if (arrayEditorOpen) {
      setStatusText('数组编辑开启中，控制点删除已锁定');
      return;
    }
    if (editEnabled || editPanelOpen) {
      const closed = tryClosePanelDiscard('edit');
      if (!closed) return;
    }
    if (addEnabled || addPanelOpen) {
      const closed = tryClosePanelDiscard('add');
      if (!closed) return;
    }
    if (deleteEnabled) {
      tryClosePanelDiscard('delete');
      return;
    }
    if (!canDelete) {
      setStatusText('控制点删除：线至少保留 2 点，面至少保留 3 点');
      return;
    }
    setEditEnabled(false);
    setEditPanelOpen(false);
    setAddEnabled(false);
    setAddPanelOpen(false);
    setDeleteEnabled(true);
    setDeletePanelOpen(true);
    setSelectedIndex(null);
    setWorkingCoords(activeCoords.slice());
    setUndoStack([]);
    setRedoStack([]);
    forceShowControlPointsOn();
    onSetDrawClickSuppressed?.(true);
    setStatusText('控制点删除已开启：点击要删除的控制点，再保存本次修改');
  }, [arrayEditorOpen, editEnabled, editPanelOpen, addEnabled, addPanelOpen, deleteEnabled, tryClosePanelDiscard, canDelete, activeCoords, forceShowControlPointsOn, onSetDrawClickSuppressed]);

  // -------- 关闭时清理 overlay/markers --------
  useEffect(() => {
    if (editEnabled || addEnabled || deleteEnabled) return;

    vertexGroupRef.current?.clearLayers();
    overlayGroupRef.current?.clearLayers();
    clearSession();
    if (!arrayEditorOpen) {
      onSetDrawClickSuppressed?.(false);
    }
    restoreShowControlPoints();
  }, [editEnabled, addEnabled, deleteEnabled, arrayEditorOpen, clearSession, onSetDrawClickSuppressed, restoreShowControlPoints]);

  useEffect(() => {
    return () => {
      onSetDrawClickSuppressed?.(false);
      onExitAddModeRestoreAssistLine?.();
    };
  }, [onSetDrawClickSuppressed, onExitAddModeRestoreAssistLine]);

  useImperativeHandle(
    ref,
    () => ({
      isBusy: () => Boolean(editEnabled || addEnabled || deleteEnabled || arrayEditorOpen),
      getMode: () => (editEnabled ? 'edit' : addEnabled ? 'add' : deleteEnabled ? 'delete' : 'none'),
      requestCloseAndClear: () => {
        if (arrayEditorOpen && !tryCloseArrayEditor()) return false;
        if (editEnabled && editPanelOpen && !tryClosePanelDiscard('edit')) return false;
        if (addEnabled && addPanelOpen && !tryClosePanelDiscard('add')) return false;
        if (deleteEnabled && deletePanelOpen && !tryClosePanelDiscard('delete')) return false;
        return true;
      },
    }),
    [editEnabled, addEnabled, deleteEnabled, arrayEditorOpen, editPanelOpen, addPanelOpen, deletePanelOpen, tryCloseArrayEditor, tryClosePanelDiscard]
  );

  useEffect(() => {
    const mode = editEnabled ? 'edit' : addEnabled ? 'add' : deleteEnabled ? 'delete' : arrayEditorOpen ? 'array' : 'none';
    onSessionStateChange?.({ busy: mode !== 'none', mode });
  }, [editEnabled, addEnabled, deleteEnabled, arrayEditorOpen, onSessionStateChange]);

  const canEdit = useMemo(() => modeOk && activeCoords.length >= 1, [modeOk, activeCoords.length]);
  const canAdd = useMemo(() => modeOk && activeCoords.length >= 2, [modeOk, activeCoords.length]);
  const canArrayEdit = useMemo(() => Boolean(arrayGeometryType) && activeCoords.length >= 1, [arrayGeometryType, activeCoords.length]);

  const busy = useMemo(() => Boolean(editEnabled || addEnabled || deleteEnabled), [editEnabled, addEnabled, deleteEnabled]);

  const canReverse = useMemo(() => {
    if (!modeOk) return false;
    if (activeCoords.length <= 1) return false;
    if (busy) return false;
    if (arrayEditorOpen) return false;
    if (!onApplyActiveCoords) return false;
    return true;
  }, [modeOk, activeCoords.length, busy, arrayEditorOpen, onApplyActiveCoords]);

  const doReverse = useCallback(() => {
    if (!canReverse) return;

    const base = activeCoords.slice();

    if (activeMode === 'polygon' && base.length >= 2 && samePoint(base[0], base[base.length - 1])) {
      base.pop();
    }

    const reversed = base.slice().reverse();

    onApplyActiveCoords?.(reversed);
    setStatusText('已执行：控制点顺序反转');
  }, [canReverse, activeCoords, activeMode, onApplyActiveCoords]);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-1 rounded text-xs border bg-slate-100 text-slate-700 flex items-center gap-1 select-none" aria-label="控制点工具">
          <Pencil size={14} />
          控制点工具
        </span>
        <AppButton type="button" className={`px-2 py-1 rounded text-xs border ${editEnabled ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300'} ${canEdit && !arrayEditorOpen ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={toggleEdit} disabled={!canEdit || arrayEditorOpen}>修改</AppButton>
        <AppButton type="button" className={`px-2 py-1 rounded text-xs border ${addEnabled ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300'} ${canAdd && !arrayEditorOpen ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={toggleAdd} disabled={!canAdd || arrayEditorOpen}>添加</AppButton>
        <AppButton type="button" className={`px-2 py-1 rounded text-xs border flex items-center gap-1 ${deleteEnabled ? 'bg-rose-600 text-white border-rose-700' : 'bg-white text-gray-800 border-gray-300'} ${canDelete && !arrayEditorOpen ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={toggleDelete} disabled={!canDelete || arrayEditorOpen}><Trash2 size={13} />删除</AppButton>
        <AppButton type="button" className={`px-2 py-1 rounded text-xs border ${canReverse ? 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50' : 'opacity-50 cursor-not-allowed bg-white text-gray-800 border-gray-300'}`} onClick={doReverse} disabled={!canReverse}>反转</AppButton>
        <AppButton type="button" className={`px-2 py-1 rounded text-xs border ${arrayEditorOpen ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300'} ${canArrayEdit && !busy ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={() => arrayEditorOpen ? tryCloseArrayEditor() : openArrayEditor()} disabled={!arrayEditorOpen && (!canArrayEdit || busy)}>数组编辑</AppButton>
      </div>
      {(editEnabled || addEnabled || deleteEnabled) && dirty && <div className="mt-1 text-xs text-orange-700">未保存修改</div>}
      {arrayEditorOpen && <div className="mt-1 text-xs text-blue-700">数组编辑开启中，部件选择与其他控制点功能已锁定</div>}
      {statusText && <div className="mt-1 text-xs text-gray-700">{statusText}</div>}

      {toolPanelOpen && (
        <DraggablePanel id="cpT-main-panel" defaultPosition={{ x: 16, y: 320 }} zIndex={1840}>
          <AppCard className="w-[360px] overflow-hidden border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-800">控制点工具</h3>
              <AppButton
                onClick={tryCloseToolPanel}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                aria-label="关闭"
                title="关闭"
                type="button"
              >
                <X className="w-4 h-4" />
              </AppButton>
            </div>

            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <AppButton
                  type="button"
                  className={`px-2 py-2 rounded text-sm border flex items-center justify-center gap-1 ${
                    editEnabled ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300'
                  } ${canEdit && !arrayEditorOpen ? '' : 'opacity-50 cursor-not-allowed'}`}
                  onClick={() => {
                    if (arrayEditorOpen) {
                      setStatusText('数组编辑开启中，控制点修改已锁定');
                      return;
                    }
                    if (!canEdit) {
                      setStatusText('控制点修改：需要线/面要素且至少 1 个控制点');
                      return;
                    }
                    toggleEdit();
                  }}
                  title="控制点修改"
                >
                  <Pencil size={14} />
                  控制点修改
                </AppButton>

                <AppButton
                  type="button"
                  className={`px-2 py-2 rounded text-sm border flex items-center justify-center gap-1 ${
                    addEnabled ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300'
                  } ${canAdd && !arrayEditorOpen ? '' : 'opacity-50 cursor-not-allowed'}`}
                  onClick={() => {
                    if (arrayEditorOpen) {
                      setStatusText('数组编辑开启中，控制点添加已锁定');
                      return;
                    }
                    if (!canAdd) {
                      setStatusText('控制点添加：需要线/面要素且至少 2 个控制点');
                      return;
                    }
                    toggleAdd();
                  }}
                  title="控制点添加"
                >
                  <Plus size={14} />
                  控制点添加
                </AppButton>

                <AppButton
                  type="button"
                  className={`px-2 py-2 rounded text-sm border flex items-center justify-center gap-1 ${
                    canReverse ? 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50' : 'opacity-50 cursor-not-allowed bg-white text-gray-800 border-gray-300'
                  }`}
                  onClick={() => {
                    if (arrayEditorOpen) {
                      setStatusText('数组编辑开启中，控制点反转已锁定');
                      return;
                    }
                    if (!canReverse) {
                      if (busy) {
                        setStatusText('控制点反转：控制点修改/添加启动中，为避免冲突已禁用');
                        return;
                      }
                      setStatusText('控制点反转：需要线/面要素且控制点数 ≥ 2');
                      return;
                    }
                    doReverse();
                  }}
                  disabled={!canReverse}
                  title="控制点反转"
                >
                  <ArrowLeftRight size={14} />
                  控制点反转
                </AppButton>

                <AppButton
                  type="button"
                  className={`px-2 py-2 rounded text-sm border flex items-center justify-center gap-1 ${
                    arrayEditorOpen ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300'
                  } ${canArrayEdit && !busy ? '' : 'opacity-50 cursor-not-allowed'}`}
                  onClick={() => {
                    if (busy) {
                      setStatusText('请先结束控制点修改或控制点添加，再进入数组编辑');
                      return;
                    }
                    if (!canArrayEdit) {
                      setStatusText('数组编辑：当前没有可导入的控制点');
                      return;
                    }
                    if (arrayEditorOpen) {
                      tryCloseArrayEditor();
                      return;
                    }
                    openArrayEditor();
                  }}
                  title="数组编辑"
                >
                  数组编辑
                </AppButton>
              </div>

              {(editEnabled || addEnabled) && dirty && <div className="text-xs text-orange-700">未保存修改</div>}
              {arrayEditorOpen && <div className="text-xs text-blue-700">数组编辑开启中，其他控制点功能已锁定</div>}
              {statusText && <div className="text-xs text-gray-700">{statusText}</div>}
            </div>
          </AppCard>
        </DraggablePanel>
      )}

      {editEnabled && editPanelOpen && (
        <DraggablePanel id="cpT-edit-panel" defaultPosition={{ x: 16, y: 470 }} zIndex={1850}>
          <AppCard className="w-80 overflow-hidden border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-800">控制点修改</h3>
              <AppButton
                onClick={() => tryClosePanelDiscard('edit')}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                aria-label="关闭"
                title="关闭"
                type="button"
              >
                <X className="w-4 h-4" />
              </AppButton>
            </div>

            <div className="p-3 space-y-2">
              <div className="text-xs text-gray-600">
                点击任意控制点进入选择状态，然后点击地图设置新坐标。
                <div className="mt-1">该坐标会先经过“参考线(辅助线)”过滤后再应用。</div>
              </div>

              <div className="flex gap-2">
                <AppButton
                  className={`flex-1 px-2 py-2 rounded-lg text-sm bg-yellow-400 text-white flex items-center justify-center gap-2 ${
                    undoStack.length ? '' : 'opacity-50 cursor-not-allowed'
                  }`}
                  onClick={doUndo}
                  disabled={!undoStack.length}
                  type="button"
                >
                  <Undo2 className="w-4 h-4" />
                  撤回
                </AppButton>

                <AppButton
                  className={`flex-1 px-2 py-2 rounded-lg text-sm bg-orange-400 text-white flex items-center justify-center gap-2 ${
                    redoStack.length ? '' : 'opacity-50 cursor-not-allowed'
                  }`}
                  onClick={doRedo}
                  disabled={!redoStack.length}
                  type="button"
                >
                  <Redo2 className="w-4 h-4" />
                  恢复
                </AppButton>

                <AppButton
                  className="flex-1 px-2 py-2 rounded-lg text-sm bg-green-600 text-white flex items-center justify-center gap-2"
                  onClick={() => commitAndClose('edit')}
                  type="button"
                >
                  <Save className="w-4 h-4" />
                  保存
                </AppButton>
              </div>

              <div className="text-[11px] text-gray-500">
                当前控制点数：{sessionCoords.length}；{selectedIndex === null ? '未选择控制点' : `已选 #${selectedIndex + 1}`}
              </div>
            </div>
          </AppCard>
        </DraggablePanel>
      )}

      {addEnabled && addPanelOpen && (
        <DraggablePanel id="cpT-add-panel" defaultPosition={{ x: 16, y: 470 }} zIndex={1850}>
          <AppCard className="w-80 overflow-hidden border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-800">控制点添加</h3>
              <AppButton
                onClick={() => tryClosePanelDiscard('add')}
                className="text-gray-400 hover:text-gray-600"
                aria-label="关闭"
                type="button"
              >
                <X className="w-5 h-5" />
              </AppButton>
            </div>

            <div className="p-3 space-y-2">
              <div className="text-xs text-gray-600">
                点击地图将根据当前要素的最近线段插入控制点。
                <div className="mt-1">阈值：{ADD_SNAP_MAX_DIST} 格，超出阈值不插入。</div>
                <div className="mt-1">进入本模式时会请求主控件重置/配置参考线为“当前要素目标 + 阈值 50”。</div>
              </div>

              <div className="flex gap-2">
                <AppButton
                  className={`flex-1 px-2 py-2 rounded-lg text-sm bg-yellow-400 text-white flex items-center justify-center gap-2 ${
                    undoStack.length ? '' : 'opacity-50 cursor-not-allowed'
                  }`}
                  onClick={doUndo}
                  disabled={!undoStack.length}
                  type="button"
                >
                  <Undo2 className="w-4 h-4" />
                  撤回
                </AppButton>

                <AppButton
                  className={`flex-1 px-2 py-2 rounded-lg text-sm bg-orange-400 text-white flex items-center justify-center gap-2 ${
                    redoStack.length ? '' : 'opacity-50 cursor-not-allowed'
                  }`}
                  onClick={doRedo}
                  disabled={!redoStack.length}
                  type="button"
                >
                  <Redo2 className="w-4 h-4" />
                  恢复
                </AppButton>

                <AppButton
                  className="flex-1 px-2 py-2 rounded-lg text-sm bg-green-600 text-white flex items-center justify-center gap-2"
                  onClick={() => commitAndClose('add')}
                  type="button"
                >
                  <Save className="w-4 h-4" />
                  保存
                </AppButton>
              </div>

              <div className="text-[11px] text-gray-500">当前控制点数：{sessionCoords.length}</div>
            </div>
          </AppCard>
        </DraggablePanel>
      )}

      {deleteEnabled && deletePanelOpen && (
        <DraggablePanel id="cpT-delete-panel" defaultPosition={{ x: 16, y: 470 }} zIndex={1850}>
          <AppCard className="w-80 overflow-hidden border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-800">控制点删除</h3>
              <AppButton onClick={() => tryClosePanelDiscard('delete')} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" aria-label="关闭" title="关闭" type="button">
                <X className="w-4 h-4" />
              </AppButton>
            </div>
            <div className="p-3 space-y-2">
              <div className="text-xs text-gray-600">点击要删除的控制点。线至少保留 2 点，面至少保留 3 点；删除可撤销。</div>
              <div className="flex gap-2">
                <AppButton className={`flex-1 px-2 py-2 rounded-lg text-sm bg-yellow-400 text-white flex items-center justify-center gap-2 ${undoStack.length ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={doUndo} disabled={!undoStack.length} type="button"><Undo2 className="w-4 h-4" />撤回</AppButton>
                <AppButton className={`flex-1 px-2 py-2 rounded-lg text-sm bg-orange-400 text-white flex items-center justify-center gap-2 ${redoStack.length ? '' : 'opacity-50 cursor-not-allowed'}`} onClick={doRedo} disabled={!redoStack.length} type="button"><Redo2 className="w-4 h-4" />恢复</AppButton>
                <AppButton className="flex-1 px-2 py-2 rounded-lg text-sm bg-green-600 text-white flex items-center justify-center gap-2" onClick={() => commitAndClose('delete')} type="button"><Save className="w-4 h-4" />保存</AppButton>
              </div>
              <div className="text-[11px] text-gray-500">当前控制点数：{sessionCoords.length}</div>
            </div>
          </AppCard>
        </DraggablePanel>
      )}

      {arrayEditorOpen && (
        <DraggablePanel id="cpT-array-editor-panel" defaultPosition={{ x: 392, y: 320 }} zIndex={1860}>
          <AppCard className="w-[420px] overflow-hidden border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-800">数组编辑</h3>
                {arrayValidated && <span className="text-[11px] px-2 py-0.5 rounded bg-green-100 text-green-700">已校验</span>}
              </div>
              <AppButton
                onClick={tryCloseArrayEditor}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                aria-label="关闭"
                title="关闭"
                type="button"
              >
                <X className="w-4 h-4" />
              </AppButton>
            </div>

            <div className="p-3 space-y-3">
              <AppButton
                type="button"
                className={`px-3 py-2 rounded text-sm border flex items-center justify-center gap-1 ${
                  canArrayReverse ? 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50' : 'opacity-50 cursor-not-allowed bg-white text-gray-800 border-gray-300'
                }`}
                onClick={() => {
                  if (!canArrayReverse) return;
                  doArrayReverse();
                }}
                disabled={!canArrayReverse}
                title="反转"
              >
                <ArrowLeftRight size={14} />
                反转
              </AppButton>

              <textarea
                value={arrayText}
                onChange={(e) => recordArrayTextChange(e.target.value)}
                className="w-full h-56 px-3 py-2 border rounded text-sm font-mono"
                placeholder="请输入严格 JSON 数组，例如：[[1,-64,2],[3,-64,4]]"
              />

              <div className="flex gap-2">
                <AppButton
                  className={`flex-1 px-2 py-2 rounded-lg text-sm bg-yellow-400 text-white flex items-center justify-center gap-2 ${
                    arrayUndoStack.length ? '' : 'opacity-50 cursor-not-allowed'
                  }`}
                  onClick={doArrayUndo}
                  disabled={!arrayUndoStack.length}
                  type="button"
                >
                  <Undo2 className="w-4 h-4" />
                  撤回
                </AppButton>

                <AppButton
                  className={`flex-1 px-2 py-2 rounded-lg text-sm bg-orange-400 text-white flex items-center justify-center gap-2 ${
                    arrayRedoStack.length ? '' : 'opacity-50 cursor-not-allowed'
                  }`}
                  onClick={doArrayRedo}
                  disabled={!arrayRedoStack.length}
                  type="button"
                >
                  <Redo2 className="w-4 h-4" />
                  恢复
                </AppButton>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <AppButton
                  className={`px-2 py-2 rounded-lg text-sm ${arrayValidated ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white'}`}
                  onClick={validateArrayEditor}
                  disabled={arrayValidated}
                  type="button"
                >
                  校验
                </AppButton>

                <AppButton
                  className={`px-2 py-2 rounded-lg text-sm ${arrayValidated ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                  onClick={applyArrayEditorToDraft}
                  disabled={!arrayValidated}
                  type="button"
                >
                  应用
                </AppButton>

                <AppButton
                  className={`px-2 py-2 rounded-lg text-sm ${arrayValidated ? 'bg-emerald-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                  onClick={finishArrayEditor}
                  disabled={!arrayValidated}
                  type="button"
                >
                  完成
                </AppButton>
              </div>

              <div className="text-[11px] text-gray-500">
                仅支持严格 [x,y,z] JSON 数组；点/线/面的最小控制点数会在校验时检查。
              </div>
            </div>
          </AppCard>
        </DraggablePanel>
      )}
    </div>
  );
});
