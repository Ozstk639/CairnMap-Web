import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';


import {
  FORMAT_REGISTRY,
  WORKFLOW_FEATURE_CATALOG,
  getSubTypeOptions,
  layerToJsonText,
  validateImportItemDetailed,
  validateRequiredDetailed,
  formatMissingEntries,
  TAG_KEY_OTHER,
  TAG_KEY_OPTIONS,
  EXT_VALUE_TYPE_TEXT,
  EXT_VALUE_TYPE_NULL,
  EXT_VALUE_TYPE_OPTIONS,
  type FeatureKey,
  type DrawMode,
} from '@/components/Common/featureFormats';
import {
  projectRegistryScene,
  resolveWorkflowEditorSchema,
  type ProjectedRegistryScene,
} from '@/components/Common/workflowEditorRegistry';
import {
  mergeEditorDraftIntoFeatureInfo,
  mergeUnparsedEntriesIntoFeatureInfo,
  parseFeatureInfoByRegistry,
  type WorkflowEditorDraftValues,
  type WorkflowEditorUnparsedEntry,
} from '@/components/Common/workflowEditorParser';

import TRPTradeEditor, { type TradeGroup as TRPTradeGroup } from '@/components/Mapping/SpecialInput/TRPTradeEditor';
import WorkflowStyleEditPanel from '@/components/Mapping/Editor/WorkflowStyleEditPanel';


import type { DynmapProjection } from '@/lib/DynmapProjection';
import { DraggablePanel } from '@/components/DraggablePanel/DraggablePanel';
import { useDesktopWindowStackLayer } from '@/components/DraggablePanel/desktopWindowStack';
import { EyeOff, MousePointerClick, Pencil, Upload, Trash2, X } from 'lucide-react';
import ToolIconButton from '@/components/Toolbar/ToolIconButton';

import { buildZipStore } from '@/lib/zipStore';
import { stringifyFeatureJson, stringifyFeatureJsonArray } from '@/components/Common/featureJsonSerializer';
import {
  countActiveRelayPictures,
  createEmptyRelayPackageDraft,
  relayDraftShowsMeta,
  relayDraftStatusLabel,
  type RelayPackageDraft,
  type RelayPackageDraftStatus,
} from '@/components/Mapping/core/relayPackageDraft';
import { buildRelayPackageZip } from '@/components/Mapping/core/relayPackageSerializer';
import { parseRelayPackageZip } from '@/components/Mapping/core/relayPackageParser';
import type { MinimalFeatureEditPackage } from '@/components/Mapping/core/minimalFeatureEditPackage';
import RelayPackageExportPanel from '@/components/Mapping/panels/RelayPackageExportPanel';
import DeleteFeatureSelectionPanel, { type DeletePanelItem } from '@/components/Mapping/panels/DeleteFeatureSelectionPanel';
import DeleteFeaturePickPanel from '@/components/Mapping/panels/DeleteFeaturePickPanel';
import FeaturePictureBindingPanel from '@/components/Mapping/panels/FeaturePictureBindingPanel';
import { pickIdFieldValue, type FeatureRecord } from '@/components/Rules/rendering/renderRules';
import { rebuildRoadGraphCacheForWorld } from '@/components/Navigation/Navigation_Road';
import { rebuildRailNewIndexCacheForWorld } from '@/components/Navigation/railNewIndex';
import { rebuildRailNewNavigationCacheForWorld } from '@/components/Navigation/Navigation_RailNewIntegrated';
import { rebuildTeleportNewCacheForWorld } from '@/components/Navigation/Navigation_TeleportNewIntegrated';
import { bumpTempRuleDeleteIdsRevision, bumpTempRuleOverrideIdsRevision, bumpTempRuleSourcesRevision } from '@/components/Rules/data/effectiveRuleItems';

import ControlPointsT, { type ControlPointsTHandle } from '@/components/Mapping/tools/ControlPointsT';


import AssistLineTools, {
  type AssistLineToolsHandle,
} from '@/components/Mapping/tools/AssistLineTools';

import GridSnapModeSwitch, {
  formatGridNumber,
  snapWorldPointByMode,
} from '@/components/Mapping/tools/GridSnapModeSwitch';

import ManualPointInput from '@/components/Mapping/tools/ManualPointInput';

import CurveInputT, { type CurveInputTHandle } from '@/components/Mapping/tools/CurveInputT';

import MergePointPlatformStation, {
  type MergePointPlatformStationDraft,
} from '@/components/Mapping/Special/MergePointPlatformStation';

import MergePolygonOutlineBuilding, {
  type MergePolygonOutlineBuildingDraft,
} from '@/components/Mapping/Special/MergePolygonOutlineBuilding';

import RailwayDirectionReverseButton from '@/components/Mapping/Special/RailwayDirectionReverseButton';

import WorkflowHost, {
  type WorkflowBridge,
  type WorkflowCommitArgs,
  type WorkflowKey,
  type WorkflowPreviewKind,
  type WorkflowPreviewStyle,
  type WorkflowRegistry,
  type WorldPoint,
} from '@/components/Mapping/Workflow/WorkflowHost';
import { getConfigDrivenWorkflowRegistry, getConfigDrivenWorkflowSelectOptions, describeWorkflowRuntimeSelection } from '@/components/Mapping/Workflow/workflowConfigRuntimeBridge';
import RailwayWorkflow from '@/components/Mapping/Workflow/RailwayWorkflow';
import StationWorkflow from '@/components/Mapping/Workflow/StationWorkflow';
import NaturalLandWorkflow from '@/components/Mapping/Workflow/NaturalLandWorkflow';
import NaturalLandSurfaceWorkflow from '@/components/Mapping/Workflow/NaturalLandSurfaceWorkflow';
import RoadWorkflow from '@/components/Mapping/Workflow/RoadWorkflow';
import NaturalWaterbodyWorkflow from '@/components/Mapping/Workflow/NaturalWaterbodyWorkflow';
import NaturalWaterwayWorkflow from '@/components/Mapping/Workflow/NaturalWaterwayWorkflow';
import NaturalBoundaryWorkflow from '@/components/Mapping/Workflow/NaturalBoundaryWorkflow';
import SettlementBoundaryDeterminedWorkflow from '@/components/Mapping/Workflow/SettlementBoundaryDeterminedWorkflow';
import SettlementBoundaryPlannedWorkflow from '@/components/Mapping/Workflow/SettlementBoundaryPlannedWorkflow';
import SettlementBoundaryLineWorkflow from '@/components/Mapping/Workflow/SettlementBoundaryLineWorkflow';
import SpecialCulturalPointWorkflow from '@/components/Mapping/Workflow/SpecialCulturalPointWorkflow';
import BuildingWorkflow from '@/components/Mapping/Workflow/BuildingWorkflow';
import FloorUnitWorkflow from '@/components/Mapping/Workflow/FloorUnitWorkflow';
import TeleportPointWorkflow from '@/components/Mapping/Workflow/TeleportPointWorkflow';
import WarpPointWorkflow from '@/components/Mapping/Workflow/WarpPointWorkflow';
import TradePointWorkflow from '@/components/Mapping/Workflow/TradePointWorkflow';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';

import {
  checkTempMountIdConflictsDetailed,
  type TempLayerIdCandidate,
} from '@/components/Rules/data/globalIdIndex';



/**
 * 关键：把 MapContainer 里的引用对象（ref）当 props 传进来
 * 这属于 React 组件间通过 props 传值的常规做法。:contentReference[oaicite:1]{index=1}
 */
type MeasuringModuleProps = {
  mapReady: boolean;
  leafletMapRef: React.MutableRefObject<L.Map | null>;
  projectionRef: React.MutableRefObject<DynmapProjection | null>;

  // 当前世界（来自 MapContainer 的 currentWorld），用于自动写入 featureInfo.World
  currentWorldId: string;

  // 新增：外部强制关闭信号（MapContainer 递增）
  closeSignal?: number;

  /**
   * 外部请求打开入口下拉（用于分包首次加载后自动继续原操作）
   */
  openSignal?: number;

  // 新增：当本模块打开时通知 MapContainer 关闭别的面板
  onBecameActive?: () => void;

  // 可选：将启动按钮插入到外部工具栏
  launcherSlot?: (launcher: React.ReactNode) => React.ReactNode;
};


function sanitizeFilenamePart(value: string): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'unknown';
}

export type MeasuringModuleHandle = {
  /**
   * 在切换世界等场景下使用：若用户取消确认，则返回 false 并阻止上层继续执行。
   * 内部会负责：先关闭“临时挂载”，再清除测绘图层并退出测绘。
   */
  requestCloseAndClear: (actionLabel?: string) => boolean;
};

const MeasuringModule = forwardRef<MeasuringModuleHandle, MeasuringModuleProps>((props, ref) => {
  const { mapReady, leafletMapRef, projectionRef, currentWorldId, closeSignal, openSignal, onBecameActive, launcherSlot } = props;


// ---------- 测绘 & 图层管理状态 ------------
// ---------- 测绘 & 图层管理状态 ------------
const [measuringActive, setMeasuringActive] = useState(false); // 是否开启测绘控制UI
const [drawMode, setDrawMode] = useState<'none'|'point'|'polyline'|'polygon'>('none');
const drawModeRef = useRef<'none'|'point'|'polyline'|'polygon'>('none');
useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);

const [drawColor, setDrawColor] = useState('#ff0000');         // 当前颜色
const drawColorRef = useRef('#ff0000');
useEffect(() => { drawColorRef.current = drawColor; }, [drawColor]);

const [drawing, setDrawing] = useState(false);                  // 是否正在绘制中

// 测绘交互抑制：开关开启时，仅在实际绘图添点状态下抑制规则要素普通点击。
const [featureInteractionSuppressionEnabled, setFeatureInteractionSuppressionEnabled] = useState(true);
// 工具栏显示抑制：开关开启时，未进入绘图添点状态则仅隐藏辅助工具区，不清空工具状态。
const [toolPanelDisplaySuppressionEnabled, setToolPanelDisplaySuppressionEnabled] = useState(true);

const mapDraftInputActive = measuringActive && drawing && drawMode !== 'none';
const featureInteractionSuppressed = featureInteractionSuppressionEnabled && mapDraftInputActive;
const shouldShowDrawingToolPanel = !toolPanelDisplaySuppressionEnabled || mapDraftInputActive;

// 测绘入口模式：完整 / 快捷（工作流）
const [measuringVariant, setMeasuringVariant] = useState<'full'|'workflow'>('full');

// 工作流选择与运行态（快捷模式使用）
const [workflowKey, setWorkflowKey] = useState<WorkflowKey>('railway');
const [workflowRunning, setWorkflowRunning] = useState(false);


// 当前临时点集合（临时绘制的坐标）
// 说明：y 为可选（仅在部分 JSON 子类型需要输出 [x,y,z] 时使用；地图渲染仍使用固定 y=64）
const [tempPoints, setTempPoints] = useState<Array<{ x: number; z: number; y?: number }>>([]);

// 对外广播测绘激活态（用于禁用导航“图上选点”等交互）
useEffect(() => {
  if (typeof window !== 'undefined') {
    (window as any).__riaMeasuringActive = measuringActive;
    window.dispatchEvent(new CustomEvent('ria:measuringActiveChanged', { detail: { active: measuringActive, source: 'MeasuringModule' } }));
  }
}, [measuringActive]);

// 对外广播“要素交互抑制”状态。抑制只在实际绘图添点状态下生效；已有信息卡不会被强制关闭。
useEffect(() => {
  if (typeof window === 'undefined') return;

  const detail = {
    active: featureInteractionSuppressed,
    enabled: featureInteractionSuppressionEnabled,
    drawing: mapDraftInputActive,
    source: 'MeasuringModule',
  };
  (window as any).__riaFeatureInteractionSuppressed = featureInteractionSuppressed;
  window.dispatchEvent(new CustomEvent('ria:feature-interaction-suppression', { detail }));

  return () => {
    (window as any).__riaFeatureInteractionSuppressed = false;
    window.dispatchEvent(new CustomEvent('ria:feature-interaction-suppression', {
      detail: { active: false, enabled: featureInteractionSuppressionEnabled, drawing: false, source: 'MeasuringModule' },
    }));
  };
}, [featureInteractionSuppressed, featureInteractionSuppressionEnabled, mapDraftInputActive]);




// editingBackupCoordsRef 同样加 y?
const editingBackupCoordsRef = useRef<{ x: number; z: number; y?: number }[] | null>(null);




// 扩展 LayerType 定义（包含 jsonInfo）
// 扩展 LayerType 定义（包含 jsonInfo）
type LayerType = {
  id: number;
  mode: 'point' | 'polyline' | 'polygon';
  color: string;
  coords: { x: number; z: number; y?: number }[];
  visible: boolean;
  leafletGroup: L.LayerGroup;
  jsonInfo?: {
    subType: FeatureKey;
    featureInfo: any;
  };
};


// 所有固定图层
const [layers, setLayers] = useState<LayerType[]>([]);
const nextLayerId = useRef(1);

// 编辑模式下被编辑的图层ID
const [editingLayerId, setEditingLayerId] = useState<number|null>(null);

// 子类型选择
const [subType, setSubType] = useState<FeatureKey>('默认');

// 撤销/重做栈
const [redoStack, setRedoStack] = useState<Array<{ x: number; z: number; y?: number }>>([]);

// 当前 JSON 特征信息
const [featureInfo, setFeatureInfo] = useState<any>({});

// JSON 表单：动态 fields/groups（由 FORMAT_REGISTRY[subType] 驱动）
const [groupInfo, setGroupInfo] = useState<Record<string, any[]>>({});

// 图层管理编辑专用中间态：命中 workflowEditorRegistry 时使用 workflow-style editor。
const [editUiMode, setEditUiMode] = useState<'full-fallback' | 'workflow-style'>('full-fallback');
const [activeEditorView, setActiveEditorView] = useState<ProjectedRegistryScene | null>(null);
const [editorDraftValues, setEditorDraftValues] = useState<WorkflowEditorDraftValues>({});
const [editorDraftUnparsed, setEditorDraftUnparsed] = useState<WorkflowEditorUnparsedEntry[]>([]);

const resetWorkflowStyleEditorState = () => {
  setEditUiMode('full-fallback');
  setActiveEditorView(null);
  setEditorDraftValues({});
  setEditorDraftUnparsed([]);
};

// extensions Step A：按组分区编辑时用于新增 extGroup
const [newExtGroupInput, setNewExtGroupInput] = useState('');

// 编辑者ID：用于自动写入 CreateBy / ModifityBy（不直接作为附加字段输出）
const [editorIdInput, setEditorIdInput] = useState('');

// ======== 切换确认：附加信息不为空时提示可能丢失 ========
const [switchWarnOpen, setSwitchWarnOpen] = useState(false);
const pendingSwitchActionRef = useRef<null | (() => void)>(null);


// ======== 测绘进入/退出：要素类型选择状态复位（解决“附加信息面板残留”） ========
const resetFeatureSelectionState = () => {
  // 要素类型回到默认，附加信息回到空（避免下次进入测绘仍残留上次编辑的字段面板）
  setSubType('默认');
  const hydrated = FORMAT_REGISTRY['默认'].hydrate({});
  setFeatureInfo(hydrated.values ?? {});
  setGroupInfo(hydrated.groups ?? {});
  setNewExtGroupInput('');
  resetWorkflowStyleEditorState();
};

const isExtraInfoNonEmpty = () => {
  if (subType === '默认') return false;

  const hasNonEmptyValue = (obj: any) => {
    if (!obj || typeof obj !== 'object') return false;
    return Object.values(obj).some((v) => {
      if (v === null || v === undefined) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (typeof v === 'number') return true;
      if (typeof v === 'boolean') return v;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return Boolean(v);
    });
  };

  const hasGroups = (() => {
    if (!groupInfo || typeof groupInfo !== 'object') return false;
    return Object.values(groupInfo).some((v) => {
      if (v === null || v === undefined) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return Boolean(v);
    });
  })();

  return hasNonEmptyValue(featureInfo) || hasGroups;
};

const requestSwitchWithExtraWarn = (action: () => void) => {
  const hasActive = drawing || editingLayerId !== null;
  if (hasActive && isExtraInfoNonEmpty()) {
    pendingSwitchActionRef.current = action;
    setSwitchWarnOpen(true);
    return;
  }
  action();
};

const confirmExtraSwitch = () => {
  const act = pendingSwitchActionRef.current;
  pendingSwitchActionRef.current = null;
  setSwitchWarnOpen(false);
  act?.();
};

const cancelExtraSwitch = () => {
  pendingSwitchActionRef.current = null;
  setSwitchWarnOpen(false);
};


// ======== 结束测绘确认：任何触发“清空测绘图层 + 关闭测绘”的操作都必须二次确认 ========
const [endMeasuringWarnOpen, setEndMeasuringWarnOpen] = useState(false);

const endMeasuringNow = () => {
  // 1) 关闭 UI
  setMeasuringActive(false);

  // 复位要素类型/附加信息选择状态（避免下次进入测绘残留）
  resetFeatureSelectionState();

  // 2) 清空测绘图层（fixedRoot + 状态）
  clearAllLayers();

  // 3) 收起导入面板（可选）
  setImportPanelOpen(false);

  // 4) 退出绘制态
  setDrawing(false);
  setDrawMode('none');
  setTempPoints([]);
  setRedoStack([]);
  setEditingLayerId(null);

  // 5) 额外锁定/抑制归零
  setDrawClickSuppressed(false);
  setShowDraftControlPointsLocked(false);

  // 6) 关闭确认框
  setEndMeasuringWarnOpen(false);
};


const confirmEndMeasuring = () => {
  endMeasuringNow();
};

const cancelEndMeasuring = () => {
  setEndMeasuringWarnOpen(false);
};



// ---- 导入矢量数据相关状态 ----
const [importPanelOpen, setImportPanelOpen] = useState(false);
const [importText, setImportText] = useState('');
const importFileInputRef = useRef<HTMLInputElement | null>(null);
const [importFileBusy, setImportFileBusy] = useState(false);

// RelayPackage 草稿状态（导入/导出、删除标记、图片绑定均在此维护）
const [relayPackageDraft, setRelayPackageDraft] = useState<RelayPackageDraft>(() => createEmptyRelayPackageDraft());
const [relayPackageExportOpen, setRelayPackageExportOpen] = useState(false);
const [deletePanelOpen, setDeletePanelOpen] = useState(false);
const [deleteMapPickEnabled, setDeleteMapPickEnabled] = useState(false);
const [deletePickPanelOpen, setDeletePickPanelOpen] = useState(false);
const [deletePickCandidate, setDeletePickCandidate] = useState<DeletePanelItem | null>(null);
const [deletePickedCandidate, setDeletePickedCandidate] = useState<DeletePanelItem | null>(null);
const deletePickModeOwnedRef = useRef(false);
const [picturePanelOpen, setPicturePanelOpen] = useState(false);
const [picturePanelLayerId, setPicturePanelLayerId] = useState<number | null>(null);
const [expandedLayerToolbars, setExpandedLayerToolbars] = useState<Record<number, boolean>>({});


const randomColor = () => {
  const r = Math.floor(Math.random()*255);
  const g = Math.floor(Math.random()*255);
  const b = Math.floor(Math.random()*255);
  return `rgb(${r},${g},${b})`;
};

// 两个顶层容器：固定图层容器(2) + 编辑/绘制容器(1)
const fixedRootRef = useRef<L.LayerGroup | null>(null);
const draftRootRef = useRef<L.LayerGroup | null>(null);

// 工作流临时容器：用于快捷工作流过程中持久显示阶段性几何（中心线/上下行等）
const workflowRootRef = useRef<L.LayerGroup | null>(null);
// workflow 预览 key -> Leaflet layer（便于 upsert/clear）
const workflowPreviewMapRef = useRef<Map<string, L.Layer>>(new Map());


// ======== ControlPointsT：控制点修改/添加（替代旧 ControlPointTools） ========
const controlPointsTRef = useRef<ControlPointsTHandle | null>(null);

// ======== CurveInputT：曲线输入（独立临时容器） ========
const curveInputTRef = useRef<CurveInputTHandle | null>(null);

// CurveInputT 面板开启期间：完全冻结主绘制/编辑区交互（独立于 ControlPointsT 的抑制状态）
const [curveInputFrozen, setCurveInputFrozen] = useState(false);
const curveInputFrozenRef = useRef(false);
// 重要：冻结需要“立即生效”，避免刚打开面板就点击地图时主绘制抢先加点。
const setCurveInputFrozenImmediate = (v: boolean) => {
  curveInputFrozenRef.current = v;
  setCurveInputFrozen(v);
};

// ControlPointsT 开启修改/添加时：禁止绘制区 click 加点（避免与“控制点移动/插入”冲突）
const [drawClickSuppressed, setDrawClickSuppressed] = useState(false);

// ref 兜底：避免 Leaflet/React 严格模式下偶发的旧闭包导致 click 仍落入绘制逻辑
const drawClickSuppressedRef = useRef(false);
useEffect(() => {
  drawClickSuppressedRef.current = drawClickSuppressed;
}, [drawClickSuppressed]);


// ControlPointsT 开启时强制锁定“显示控制点”=true，且不可关闭
const [showDraftControlPointsLocked, setShowDraftControlPointsLocked] = useState(false);



// draft 内真正承载“当前正在编辑/绘制”的那一层（保证容器1永远只有一份图形）
const draftGeomRef = useRef<L.LayerGroup | null>(null);

// ======== 辅助线工具（通用高优先级贴线） ========
const assistLineToolsRef = useRef<AssistLineToolsHandle | null>(null);

// =====featureInfo=== draft 内额外覆盖层：最新点击端点 + 控制点预览 ========
const draftEndpointRef = useRef<L.LayerGroup | null>(null);
const draftVertexOverlayRef = useRef<L.LayerGroup | null>(null);

// ======== 绘制态光标：只在“本模块设置过”时才负责清理，避免干扰其它工具 ========
const drawCursorOwnedRef = useRef(false);

// ======== “显示控制点 / 显示控制点坐标”开关 ========
const [showDraftControlPoints, setShowDraftControlPoints] = useState(false);
const [showDraftControlPointCoords, setShowDraftControlPointCoords] = useState(false);

// 临时输出：默认关闭；仅 drawMode!=none 且 subType=默认 时允许展开
const [tempOutputOpen, setTempOutputOpen] = useState(false);

useEffect(() => {
  if (drawMode === 'none' || subType !== '默认') {
    setTempOutputOpen(false);
  }
}, [drawMode, subType]);


// ======== JSON 导出窗口（替代 alert/print） ========
const [jsonPanelOpen, setJsonPanelOpen] = useState(false);
const [jsonPanelText, setJsonPanelText] = useState('');
const [jsonExportSubType, setJsonExportSubType] = useState<string>('__ALL__');

// 临时挂载到 RuleDrivenLayer 的本地存储 key（与 RuleDrivenLayer 保持一致）
const TEMP_RULE_SOURCES_KEY = 'ria_temp_rule_sources_v1';
// 临时挂载：覆盖固定数据源中“同 ID 要素”的屏蔽列表（worldId -> string[]）
const TEMP_RULE_OVERRIDE_IDS_KEY = 'ria_temp_rule_override_ids_v1';
const TEMP_RULE_DELETE_IDS_KEY = 'ria_temp_rule_delete_ids_v1';

type TempRuleSource = {
  uid: string;
  worldId: string;
  label?: string;
  enabled: boolean;
  items: any[];
  picturesById?: Record<string, Array<{ source?: 'pub' | 'dat'; url?: string; filename?: string; relativePath?: string }>>;
};

// ======== “临时挂载(全局)”只读模式（模块化开关，便于后续移除） ========
const [tempMountAllActive, setTempMountAllActive] = useState(false);
const TEMP_MOUNT_READONLY_REASON = '临时挂载模式下仅可查看，无法编辑或保存。';
const isTempMountReadonly = tempMountAllActive;
const guardTempMountReadonly = () => {
  if (!isTempMountReadonly) return false;
  window.alert(TEMP_MOUNT_READONLY_REASON);
  return true;
};

// ======== 临时挂载：全局ID冲突检查遮罩（<1s 不显示） ========
const [tempMountIdCheckOpen, setTempMountIdCheckOpen] = useState(false);
const [tempMountIdCheckText, setTempMountIdCheckText] = useState('正在对比要素ID...');

// ======== 临时挂载：ID 冲突确认弹窗（替代 window.confirm，保证可用性与可控性） ========
const [tempMountConflictOpen, setTempMountConflictOpen] = useState(false);
const [tempMountConflictText, setTempMountConflictText] = useState<string>('');
const [tempMountConflictAllowOverride, setTempMountConflictAllowOverride] = useState(false);
const [tempMountPendingLayers, setTempMountPendingLayers] = useState<LayerType[] | null>(null);
const [tempMountPendingOverrideIds, setTempMountPendingOverrideIds] = useState<string[]>([]);


type SpecialDraftMode =
  | 'none'
  | 'merge-point-platform-station'
  | 'merge-polygon-outline-building';

const [specialDraftMode, setSpecialDraftMode] = useState<SpecialDraftMode>('none');

const [mergePointPSDraft, setMergePointPSDraft] = useState<MergePointPlatformStationDraft>({
  platforms: [],
  station: null,
});

const [mergePolygonOBDraft, setMergePolygonOBDraft] = useState<MergePolygonOutlineBuildingDraft>({
  outline: null,
  building: null,
});

const resetSpecialDrafts = () => {
  setSpecialDraftMode('none');
  setMergePointPSDraft({ platforms: [], station: null });
  setMergePolygonOBDraft({ outline: null, building: null });
};

const hasSpecialDraftData = () => {
  const hasBundleData = (b: any) => {
    if (!b) return false;
    const values = b.values ?? {};
    const groups = b.groups ?? {};
    const hasValues = Object.values(values).some((v: any) => {
      if (v === null || v === undefined) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (typeof v === 'number') return true;
      if (typeof v === 'boolean') return v;
      return Boolean(v);
    });
    const hasGroups = Object.values(groups).some((v: any) => Array.isArray(v) ? v.length > 0 : Boolean(v));
    return hasValues || hasGroups;
  };

  if (specialDraftMode === 'merge-point-platform-station') {
    if ((mergePointPSDraft.platforms ?? []).some(hasBundleData)) return true;
    if (hasBundleData(mergePointPSDraft.station)) return true;
  }
  if (specialDraftMode === 'merge-polygon-outline-building') {
    if (hasBundleData(mergePolygonOBDraft.outline)) return true;
    if (hasBundleData(mergePolygonOBDraft.building)) return true;
  }
  return false;
};

const requestExitSpecialDraftIfNeeded = (next: () => void) => {
  if (specialDraftMode !== 'none' && hasSpecialDraftData()) {
    if (!confirm('切换将退出“合一”模式并丢弃其中的附加信息，确定继续吗？')) return;
  }
  next();
};




// ===== 外部 closeSignal：视同“结束测绘” =====
// 关键点：
// 1) 忽略首次挂载（避免刷新时误触发）
// 2) 只有在“测绘已开启 或 当前存在测绘内容/编辑/绘制”时才确认
const closeSignalInitRef = useRef(false);
const lastCloseSignalRef = useRef<any>(undefined);

useEffect(() => {
  if (closeSignal === undefined) return;

  // 忽略首次挂载拿到的初始值（解决：刷新就弹）
  if (!closeSignalInitRef.current) {
    closeSignalInitRef.current = true;
    lastCloseSignalRef.current = closeSignal;
    return;
  }

  // 防重复：同一个 closeSignal 值不重复处理
  if (closeSignal === lastCloseSignalRef.current) return;
  lastCloseSignalRef.current = closeSignal;

  // 只有在“测绘开启/有内容”时才需要确认
  const hasMeasuringContent =
    measuringActive ||
    (layersRef.current?.length ?? 0) > 0 ||
    drawing ||
    editingLayerId !== null ||
    tempPoints.length > 0;

  if (!hasMeasuringContent) return;

  // 统一走同一个确认入口（避免你现在两套 confirm 文案/逻辑）
  confirmExitAndClear('结束测绘');
}, [closeSignal, measuringActive, drawing, editingLayerId, tempPoints.length]);



// 下拉菜单开关（仅再次点击“测绘”主按钮才收回）
const [measureDropdownOpen, setMeasureDropdownOpen] = useState(false);
const [measureDropdownDesktop, setMeasureDropdownDesktop] = useState(false);
const [measureDropdownRect, setMeasureDropdownRect] = useState<{ top: number; right: number } | null>(null);
const measureLauncherRef = useRef<HTMLDivElement | null>(null);
const lastOpenSignalRef = useRef(0);
const {
  portalRoot: measureDropdownPortalRoot,
  effectiveZIndex: measureDropdownZIndex,
  emitFocused: focusMeasureDropdown,
} = useDesktopWindowStackLayer({
  id: 'measuring-launcher-dropdown',
  enabled: measureDropdownDesktop && measureDropdownOpen,
  autoFocusOnEnable: false,
});

useEffect(() => {
  const checkDesktop = () => setMeasureDropdownDesktop(window.innerWidth >= 640);
  checkDesktop();
  window.addEventListener('resize', checkDesktop);
  return () => window.removeEventListener('resize', checkDesktop);
}, []);

const updateMeasureDropdownRect = () => {
  const rect = measureLauncherRef.current?.getBoundingClientRect();
  if (!rect) return;
  const width = 176;
  const margin = 8;
  const right = Math.max(8, window.innerWidth - rect.right);
  const top = Math.min(
    Math.max(8, rect.bottom + margin),
    Math.max(8, window.innerHeight - 8)
  );
  const maxRight = Math.max(8, window.innerWidth - width - 8);
  setMeasureDropdownRect({ top, right: Math.min(right, maxRight) });
};

useEffect(() => {
  if (!measureDropdownOpen || !measureDropdownDesktop) return;
  updateMeasureDropdownRect();
  focusMeasureDropdown();

  const handleViewportChange = () => updateMeasureDropdownRect();
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
  return () => {
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('scroll', handleViewportChange, true);
  };
}, [focusMeasureDropdown, measureDropdownDesktop, measureDropdownOpen]);

useEffect(() => {
  const next = openSignal ?? 0;
  if (next === lastOpenSignalRef.current) return;
  lastOpenSignalRef.current = next;
  setMeasureDropdownOpen(true);
}, [openSignal]);

const toggleMeasureDropdown = () => {
  setMeasureDropdownOpen((v) => {
    const next = !v;
    if (next) {
      window.setTimeout(() => {
        updateMeasureDropdownRect();
        focusMeasureDropdown();
      }, 0);
    }
    return next;
  });
};

const confirmExitAndClear = (actionLabel: string) => {
  // 统一二次确认：任何“退出测绘并清理图层”的入口都走这里
  const ok = window.confirm(`${actionLabel}将清除所有测绘图层，是否确认？`);
  if (!ok) return false;

  // 退出测绘时：若仍处于“临时挂载”模式，必须先关闭挂载（并触发规则图层重载）
  // 目标：避免退出测绘后仍残留挂载源，导致后续世界/数据处理混乱。
  try {
    const raw = localStorage.getItem(TEMP_RULE_SOURCES_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        const prev = Array.isArray((obj as any)?.[currentWorldId]) ? ((obj as any)[currentWorldId] as any[]) : [];
        const prefix = `${currentWorldId}::layer-`;
        const next = prev.filter((x) => {
          const uid = x && typeof x === 'object' ? String((x as any).uid ?? '') : '';
          return !uid.startsWith(prefix);
        });
        (obj as any)[currentWorldId] = next;
        writeTempRuleSources(obj as any);
      }
    }
  } catch {
    // ignore
  }
  clearTempRuleOverrideIdsForWorld();
  clearTempRuleDeleteIdsForWorld();
  setTempMountAllActive(false);

  // 退出测绘：强制关闭并清空“曲线输入”临时容器（避免残留与抑制状态遗留）
  curveInputTRef.current?.requestCloseAndClear?.();

  // 关闭测绘与面板
  setMeasuringActive(false);
  setMeasureDropdownOpen(false);
  setImportPanelOpen(false);

  // 退出测绘时：模式与工作流一并复位
  setMeasuringVariant('full');
  setWorkflowRunning(false);

  // 复位要素类型/附加信息选择状态（避免残留）
  resetFeatureSelectionState();

  // 清空测绘图层（fixed + draft）及状态
  clearAllLayers();

  // 额外确保草稿容器也清掉（避免残留）
  draftGeomRef.current?.clearLayers();

  // 退出绘制/编辑态（双保险）
  setDrawing(false);
  setDrawMode('none');
  setTempPoints([]);
  setRedoStack([]);
  setEditingLayerId(null);

  return true;
};

useImperativeHandle(ref, () => ({
  requestCloseAndClear: (actionLabel?: string) => {
    const label = (actionLabel ?? '关闭测绘').trim() || '关闭测绘';

    const hasMeasuringContent =
      measuringActive ||
      (layersRef.current?.length ?? 0) > 0 ||
      drawing ||
      editingLayerId !== null ||
      tempPoints.length > 0 ||
      tempMountAllActive;

    if (!hasMeasuringContent) return true;
    return confirmExitAndClear(label);
  },
}));

// ===== 模式切换（完整 <-> 快捷） =====
// 目标：
// 1) 测绘已开启时，允许在下拉菜单内切换另一种模式
// 2) 若存在“未完成编辑/未完成工作流/合一草稿”等临时内容，则提示确认
// 3) 模式切换仅清理临时容器（workflow + draft + 编辑/绘制态），不删除 fixed 图层与图层管理区内容

const hasUnsavedWorkForVariantSwitch = () => {
  // ① 编辑/绘制中的临时几何
  const hasFullTemp = drawing || editingLayerId !== null || tempPoints.length > 0;

  // ② 快捷工作流的运行态
  const hasWorkflowTemp = workflowRunning;

  // ③ “合一”草稿（内部有附加信息/未提交）
  const hasSpecial = specialDraftMode !== 'none' && hasSpecialDraftData();

  // ④ 兜底：若草稿容器仍有内容，也视为未完成（避免边界残留）
  const hasDraftLayers =
    (draftGeomRef.current?.getLayers?.().length ?? 0) > 0 ||
    (draftEndpointRef.current?.getLayers?.().length ?? 0) > 0 ||
    (draftVertexOverlayRef.current?.getLayers?.().length ?? 0) > 0;

  // ⑤ 兜底：快捷工作流预览容器仍有内容
  const hasWorkflowPreview = workflowPreviewMapRef.current.size > 0;

  return hasFullTemp || hasWorkflowTemp || hasSpecial || hasDraftLayers || hasWorkflowPreview;
};

const clearTemporaryForVariantSwitch = () => {
  // 仅清理临时容器：workflow + draft + 编辑/绘制态；不清 fixedRoot 与 layers
  workflowRootRef.current?.clearLayers();
  workflowPreviewMapRef.current.clear();
  clearDraftOverlays();

  // 曲线输入也属于临时容器
  curveInputTRef.current?.requestCloseAndClear?.();

  // 编辑/绘制态复位
  setTempPoints([]);
  setRedoStack([]);
  setEditingLayerId(null);
  setDrawing(false);
  setDrawMode('none');
  resetWorkflowStyleEditorState();

  // 工作流态复位
  setWorkflowRunning(false);

  // 控制点显示复位（避免切换后意外常显）
  setShowDraftControlPoints(false);
  setShowDraftControlPointCoords(false);
  setDrawClickSuppressed(false);
  setShowDraftControlPointsLocked(false);

  // 合一草稿复位
  if (specialDraftMode !== 'none') setSpecialDraftMode('none');
};

const switchMeasuringVariantFromMenu = (target: 'full' | 'workflow') => {
  if (!measuringActive) return;
  if (target === measuringVariant) {
    // 仍收起菜单，避免用户误以为没有响应
    setMeasureDropdownOpen(false);
    return;
  }

  const label = target === 'full' ? '完整模式' : '快捷模式';

  const doSwitch = () => {
    // 切换时建议关闭导入面板，避免 UI 残留
    setImportPanelOpen(false);
    clearTemporaryForVariantSwitch();
    setMeasuringVariant(target);
    setMeasureDropdownOpen(false);
  };

  // 若存在未完成内容：提示确认（文案与“关闭时”保持同类语义，但仅清理临时/切断工作流）
  if (hasUnsavedWorkForVariantSwitch()) {
    const ok = window.confirm(`切换到${label}将清除临时测绘图层并结束当前未完成的编辑/工作流，是否确认？`);
    if (!ok) return;
  }

  // “合一”模式需额外确认（其内部附加信息不应静默丢弃）
  requestExitSpecialDraftIfNeeded(doSwitch);
};

const startMeasuringFromMenu = (variant: 'full' | 'workflow') => {
  if (measuringActive) return;

  // 打开测绘时：通知外部关闭“测量工具”
  onBecameActive?.();

  // 进入测绘前清空
  clearAllLayers();

  // 复位要素类型/附加信息选择状态（避免上一次编辑残留）
  resetFeatureSelectionState();

  setMeasuringVariant(variant);
  setWorkflowRunning(false);
  setMeasuringActive(true);
};

const endMeasuringFromMenu = () => {
  // 结束测绘：必须二次确认 + 清理
  confirmExitAndClear('结束测绘');
};


const closeMeasuringUI = () => {
  // 右上角 X：也视同“退出测绘并清理”，必须二次确认
  confirmExitAndClear('退出测绘');
};






useEffect(() => {
  if (!leafletMapRef.current) return;
  const map = leafletMapRef.current;

  if (!fixedRootRef.current) {
    fixedRootRef.current = L.layerGroup().addTo(map);
  }
  if (!workflowRootRef.current) {
    // 置于 fixed 之上、draft 之下
    workflowRootRef.current = L.layerGroup().addTo(map);
  }
  if (!draftRootRef.current) {
    // 草稿层置于最上层
    draftRootRef.current = L.layerGroup().addTo(map);
  }


  // 1) 草稿几何（线/面/点）
  if (!draftGeomRef.current) {
    draftGeomRef.current = L.layerGroup();
    draftRootRef.current.addLayer(draftGeomRef.current);
  }

  // 2) 最新点击端点指示（只保留一个）
  if (!draftEndpointRef.current) {
    draftEndpointRef.current = L.layerGroup();
    draftRootRef.current.addLayer(draftEndpointRef.current);
  }

  // 3) 控制点预览（显示控制点/坐标）
  if (!draftVertexOverlayRef.current) {
    draftVertexOverlayRef.current = L.layerGroup();
    draftRootRef.current.addLayer(draftVertexOverlayRef.current);
  }
}, [mapReady]);



// ========= 地图点击监听（绘制模式） =========

// ========= 删除要素选择模式（Rules 专用命中链路） =========
const buildDeleteCandidateFromRuleFeature = (feature: FeatureRecord | null | undefined) => {
  const fi = feature?.featureInfo as any;
  const cls = String(fi?.Class ?? '').trim();
  const { idValue } = pickIdFieldValue(fi, cls);
  const id = String(idValue ?? '').trim();
  if (!id) return null;
  const name = String(fi?.Name ?? fi?.Label ?? '').trim() || id;
  return { ID: id, Name: name, className: cls };
};

useEffect(() => {
  const active = Boolean(deletePanelOpen && deletePickPanelOpen && deleteMapPickEnabled);
  if (typeof window === 'undefined') return;
  if (deletePickModeOwnedRef.current === active) return;
  deletePickModeOwnedRef.current = active;
  window.dispatchEvent(new CustomEvent('ria:delete-pick-mode', { detail: { active } }));
}, [deletePanelOpen, deletePickPanelOpen, deleteMapPickEnabled]);

useEffect(() => {
  return () => {
    if (typeof window === 'undefined') return;
    if (!deletePickModeOwnedRef.current) return;
    deletePickModeOwnedRef.current = false;
    window.dispatchEvent(new CustomEvent('ria:delete-pick-mode', { detail: { active: false } }));
  };
}, []);

useEffect(() => {
  if (typeof window === 'undefined') return;
  const active = Boolean(deletePanelOpen && deletePickPanelOpen && deleteMapPickEnabled);
  if (!active) return;

  const handler = (ev: Event) => {
    const feature = (ev as CustomEvent<any>)?.detail?.feature as FeatureRecord | undefined;
    const picked = buildDeleteCandidateFromRuleFeature(feature);
    if (!picked) return;
    const currentDeleteIds = new Set(relayPackageDraft.deleteMarks.map((x) => x.ID));
    if (currentDeleteIds.has(picked.ID)) return;
    setDeletePickCandidate({ ...picked });
  };

  window.addEventListener('ria:delete-pick-feature', handler as EventListener);
  return () => window.removeEventListener('ria:delete-pick-feature', handler as EventListener);
}, [deletePanelOpen, deletePickPanelOpen, deleteMapPickEnabled, relayPackageDraft.deleteMarks]);

useEffect(() => {
  const map = leafletMapRef.current;
  if (!map) return;

  const handleClick = (e: L.LeafletMouseEvent) => {
    // 曲线输入面板开启时：主绘制/编辑区完全冻结
    if (curveInputFrozenRef.current) return;

    // 关键：ControlPointsT 工作时，绘制监听器必须完全不执行
    // （否则同一次 click 会同时触发“移动控制点”和“绘制加点”，导致草稿线变长）
    if (controlPointsTRef.current?.isBusy?.()) return;

    if (!drawing || drawMode === 'none') return;

    // 兜底：你已有的 state/ref 抑制仍保留
    if (drawClickSuppressedRef.current) return;

    onMapDrawClick(e);
  };

  map.on('click', handleClick);
  return () => {
    map.off('click', handleClick);
  };
}, [drawing, drawMode]); 


 
 
useEffect(() => {
  const map = leafletMapRef.current;
  if (!map) return;

  const el = map.getContainer();
  const shouldShow = measuringActive && drawing && drawMode !== 'none';

  if (shouldShow) {
    // 只有在当前没有其它工具占用 cursor 时，才设置
    if (!el.style.cursor) {
      el.style.cursor = 'crosshair';
      drawCursorOwnedRef.current = true;
    }
    return;
  }

  // 仅当“本模块设置过”才清理，避免把其它模式的 cursor 清掉
  if (drawCursorOwnedRef.current) {
    el.style.cursor = '';
    drawCursorOwnedRef.current = false;
  }
}, [measuringActive, drawing, drawMode]);

 
const clearDraftOverlays = () => {
  draftGeomRef.current?.clearLayers();
  draftEndpointRef.current?.clearLayers();
  draftVertexOverlayRef.current?.clearLayers();
};

const updateLatestEndpointMarker = (p: { x: number; z: number }, color: string) => {
  const proj = projectionRef.current;
  const g = draftEndpointRef.current;
  if (!proj || !g) return;

  g.clearLayers();

  const ll = proj.locationToLatLng(p.x, 64, p.z);
  L.circleMarker(ll, {
    radius: 6,
    color: '#ffffff',
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
  }).addTo(g);
};



const onMapDrawClick = (e: L.LeafletMouseEvent) => {
  // 曲线输入面板开启时：主绘制/编辑区完全冻结
  if (curveInputFrozenRef.current) return;

  // 双保险：即使某些情况下旧 click handler 没卸载，这里也确保不加点
  if (controlPointsTRef.current?.isBusy?.()) return;
  if (drawClickSuppressedRef.current) return;

  const proj = projectionRef.current;
  if (!proj) return;

  const loc = proj.latLngToLocation(e.latlng, 64);
  let newPoint = { x: loc.x, z: loc.z };

  // ① 辅助线：高优先级贴线
  const assist = assistLineToolsRef.current;
  if (assist?.isEnabled?.()) {
    const r = assist.transformWorldPoint?.(newPoint);
    if (r?.point) newPoint = r.point;
  }

  // ② 网格化（整数 / 0.5 / 强制中心）：在“辅助线修正”之后立刻对点击坐标做修正
  newPoint = snapWorldPointByMode(newPoint);

  // ③ 常规 undo/redo：一旦新增点，redoStack 必须清空
  setRedoStack([]);

  setTempPoints((prev) => {
    const updated = [...prev, newPoint];
    drawDraftGeometry(updated, drawMode, drawColor);
    updateLatestEndpointMarker(newPoint, drawColor);
    return updated;
  });
};

const onManualPointSubmit = (v: { x: number; y: number; z: number }) => {
  if (!measuringActive || !drawing || drawMode === 'none') return;
  if (curveInputFrozenRef.current) return;
  if (controlPointsTRef.current?.isBusy?.()) return;
  if (drawClickSuppressedRef.current) return;

  // 点要素：若手动输入包含 y，则写入 tempPoints[0].y，并同步写入 featureInfo.elevation（兼容旧规范）。
  if (drawMode === 'point') {
    setFeatureInfo((prev: any) => ({ ...(prev ?? {}), elevation: v.y }));
  }

  const newPoint = ({ x: v.x, z: v.z, y: v.y } as { x: number; z: number; y: number });

  setRedoStack([]);

  setTempPoints((prev) => {
    const updated = [...prev, newPoint];
    drawDraftGeometry(updated, drawMode, drawColor);
    updateLatestEndpointMarker({ x: v.x, z: v.z }, drawColor);
    return updated;
  });
};



 // ========= 容器1：绘制/编辑专用 =========
 const drawDraftGeometry = (
   coords: { x: number; z: number }[],
   mode: 'none' | 'point' | 'polyline' | 'polygon',
   color: string
 ) => {
   const proj = projectionRef.current;
   const draft = draftGeomRef.current;
   if (!proj || !draft) return;
 
   draft.clearLayers();
 
   if (mode === 'none' || coords.length === 0) return;
 
   const latlngs = coords.map(p => proj.locationToLatLng(p.x, 64, p.z));
 
   if (mode === 'point') {
     latlngs.forEach(ll => {
       L.circleMarker(ll, { color, fillColor: color, radius: 6 }).addTo(draft);
     });
   } else if (mode === 'polyline') {
     L.polyline(latlngs, { color }).addTo(draft);
   } else if (mode === 'polygon') {
     if (latlngs.length > 2) L.polygon(latlngs, { color }).addTo(draft);
     else L.polyline(latlngs, { color }).addTo(draft);
   }
 };
 
// 颜色变化时：立即刷新草稿图形（避免“必须保存后颜色才变化”）
useEffect(() => {
  if (!measuringActive) return;
  if (!drawing || drawMode === 'none') return;

  drawDraftGeometry(tempPoints, drawMode, drawColor);

  // 端点临时点：仅在本来就存在时更新颜色（避免把“已清除的端点点”又画回来）
  const ep = draftEndpointRef.current;
  if (ep && ep.getLayers().length > 0 && tempPoints.length > 0) {
    updateLatestEndpointMarker(tempPoints[tempPoints.length - 1], drawColor);
  }
}, [drawColor, measuringActive, drawing, drawMode]);


useEffect(() => {
  const proj = projectionRef.current;
  const g = draftVertexOverlayRef.current;
  if (!proj || !g) return;

  g.clearLayers();

  // 仅限测绘栏绘制区（draft），且开关开启
  if (!measuringActive) return;
  if (!showDraftControlPoints) return;
  if (drawMode === 'none') return;
  if (!Array.isArray(tempPoints) || tempPoints.length === 0) return;

  const controlPointsTActive = drawClickSuppressed;

  // ControlPointsT 开启时：若不需要“坐标常显”，这里完全不画，避免挡点击
  if (controlPointsTActive && !showDraftControlPointCoords) return;

  for (const p of tempPoints) {
    const ll = proj.locationToLatLng(p.x, 64, p.z);
    const label = `${formatGridNumber(p.x)}, ${formatGridNumber(p.z)}`;

    const isInvisibleForLabelOnly = controlPointsTActive && showDraftControlPointCoords;

    const m = L.circleMarker(
      ll,
      isInvisibleForLabelOnly
        ? {
            radius: 0,
            color: 'transparent',
            weight: 0,
            opacity: 0,
            fillColor: 'transparent',
            fillOpacity: 0,
            // 关键：不参与交互，避免挡住 ControlPointsT 的控制点 marker
            interactive: false,
          }
        : {
            radius: 4,
            color: '#ffffff',
            weight: 2,
            fillColor: drawColor,
            fillOpacity: 1,
            interactive: false, // 仅展示用途
          }
    );

    m.bindTooltip(label, {
      direction: 'right',
      offset: [10, 0],
      opacity: 0.9,
      permanent: showDraftControlPointCoords,
      sticky: !showDraftControlPointCoords,
    });

    if (showDraftControlPointCoords) m.openTooltip();

    m.addTo(g);
  }
}, [
  mapReady,
  measuringActive,
  showDraftControlPoints,
  showDraftControlPointCoords,
  tempPoints,
  drawMode,
  drawColor,
  drawClickSuppressed,
]);



 
 // 让异步回调始终拿到最新 layers（避免 setTimeout / 事件回调拿旧闭包）
 const layersRef = useRef<LayerType[]>([]);
 useEffect(() => {
   layersRef.current = layers;
 }, [layers]);
 
 
 
 // 固定容器2：只由 fixedRootRef 统一管理显示，禁止再对 layer.leafletGroup.addTo(map) 做“绕过式挂载”
 const syncFixedRoot = (nextLayers: LayerType[], editingId: number | null) => {
   const root = fixedRootRef.current;
   if (!root) return;
 
   root.clearLayers();
 
   for (const l of nextLayers) {
     if (!l.visible) continue;
     if (editingId !== null && l.id === editingId) continue; // 编辑中的层交给 draftGeomRef
     root.addLayer(l.leafletGroup);
   }
 };
 
 



const finishLayer = () => {
  if (guardTempMountReadonly()) return;
  const map = leafletMapRef.current;
  const proj = projectionRef.current;
  if (!map || !proj) return;

  if (drawMode === 'none') return;

  // —— 关键：编辑态允许“未改坐标直接保存”，此时用备份 coords 兜底
  const backup = editingBackupCoordsRef.current ?? [];
  const finalCoords =
    tempPoints.length > 0 ? [...tempPoints] :
    (editingLayerId !== null ? [...backup] : []);

  if (editingLayerId === null && finalCoords.length === 0) return;
  if (editingLayerId !== null && finalCoords.length === 0) return;

  const makeLeafletGroup = (mode: DrawMode, coords: { x: number; z: number; y?: number }[], color: string) => {
    const g = L.layerGroup();
    const latlngs = coords.map(p => proj.locationToLatLng(p.x, 64, p.z));

    if (mode === 'point') {
      latlngs.forEach(ll => {
        L.circleMarker(ll, { color, fillColor: color, radius: 6 }).addTo(g);
      });
    } else if (mode === 'polyline') {
      L.polyline(latlngs, { color }).addTo(g);
    } else if (mode === 'polygon') {
      if (latlngs.length > 2) L.polygon(latlngs, { color }).addTo(g);
      else L.polyline(latlngs, { color }).addTo(g);
    }

    return g;
  };

  const cleanupAfterFinish = () => {
    draftGeomRef.current?.clearLayers();
    draftEndpointRef.current?.clearLayers();

    setTempPoints([]);
    setRedoStack([]);
    setEditingLayerId(null);
    editingBackupCoordsRef.current = null;

    setDrawing(false);
    setDrawMode('none');

    resetSpecialDrafts();

    setSubType('默认');
    const hydrated = FORMAT_REGISTRY['默认'].hydrate({});
    setFeatureInfo(hydrated.values ?? {});
    setGroupInfo(hydrated.groups ?? {});
    resetWorkflowStyleEditorState();
  };

  // =========================
  // Special：多点合一（站台+车站）
  // =========================
  if (specialDraftMode === 'merge-point-platform-station') {
    if (editingLayerId !== null) {
      alert('“多点合一”仅支持新建图层，不支持在编辑模式下保存。');
      return;
    }
    if (drawMode !== 'point') {
      alert('“多点合一”仅支持点要素。');
      return;
    }

    const p0 = finalCoords[finalCoords.length - 1];
    const pointCoords = [{ x: p0.x, z: p0.z, y: p0.y }];

    const outputs: LayerType[] = [];

    const addOne = (k: string, values: any, groups: any) => {
      const def: any = (FORMAT_REGISTRY as any)[k];
      if (!def) {
        alert(`缺少格式定义：${k}`);
        return false;
      }

      const req = validateRequiredDetailed(def, values ?? {}, groups ?? {});
      if (!req.ok) {
        const detail = formatMissingEntries(req.missing);
        alert(`无法保存，${k} 的必填附加信息为空：\n${detail}`);
        return false;
      }

      const featureInfoOut = def.buildFeatureInfo({
        op: 'create',
        mode: 'point',
        coords: pointCoords,
        values: values ?? {},
        groups: groups ?? {},
        worldId: currentWorldId,
        editorId: editorIdInput,
        prevFeatureInfo: undefined,
        now: new Date(),
      });

      const id = nextLayerId.current++;
      const newGroup = makeLeafletGroup('point', pointCoords, drawColor);

      outputs.push({
        id,
        mode: 'point',
        color: drawColor,
        coords: pointCoords,
        visible: true,
        leafletGroup: newGroup,
        jsonInfo: {
          subType: k as unknown as FeatureKey,
          featureInfo: featureInfoOut,
        },
      });

      return true;
    };

    const hasPlatforms = (mergePointPSDraft.platforms ?? []).length > 0;
    const hasStation = Boolean(mergePointPSDraft.station);

    if (!hasPlatforms && !hasStation) {
      alert('多点合一：请至少添加一个“站台”或一个“车站”。');
      return;
    }

    // 站台（多个）
    for (let i = 0; i < (mergePointPSDraft.platforms ?? []).length; i++) {
      const b = mergePointPSDraft.platforms[i];
      const ok = addOne('站台', b?.values, b?.groups);
      if (!ok) return;
    }

    // 车站（最多一个）
    if (mergePointPSDraft.station) {
      const ok = addOne('车站', mergePointPSDraft.station.values, mergePointPSDraft.station.groups);
      if (!ok) return;
    }

    setLayers(prev => {
      const next = [...prev, ...outputs];
      syncFixedRoot(next, null);
      return next;
    });

    cleanupAfterFinish();
    return;
  }

  // =========================
  // Special：多面合一（站台轮廓 + 车站建筑）
  // =========================
  if (specialDraftMode === 'merge-polygon-outline-building') {
    if (editingLayerId !== null) {
      alert('“多面合一”仅支持新建图层，不支持在编辑模式下保存。');
      return;
    }
    if (drawMode !== 'polygon') {
      alert('“多面合一”仅支持面要素。');
      return;
    }
    if (finalCoords.length < 3) {
      alert('面要素至少需要 3 个控制点。');
      return;
    }

    const outputs: LayerType[] = [];

    const addOnePolygon = (k: string, values: any, groups: any) => {
      const def: any = (FORMAT_REGISTRY as any)[k];
      if (!def) {
        alert(`缺少格式定义：${k}`);
        return false;
      }

      const req = validateRequiredDetailed(def, values ?? {}, groups ?? {});
      if (!req.ok) {
        const detail = formatMissingEntries(req.missing);
        alert(`无法保存，${k} 的必填附加信息为空：\n${detail}`);
        return false;
      }

      const featureInfoOut = def.buildFeatureInfo({
        op: 'create',
        mode: 'polygon',
        coords: finalCoords,
        values: values ?? {},
        groups: groups ?? {},
        worldId: currentWorldId,
        editorId: editorIdInput,
        prevFeatureInfo: undefined,
        now: new Date(),
      });

      const id = nextLayerId.current++;
      const newGroup = makeLeafletGroup('polygon', finalCoords, drawColor);

      outputs.push({
        id,
        mode: 'polygon',
        color: drawColor,
        coords: finalCoords,
        visible: true,
        leafletGroup: newGroup,
        jsonInfo: {
          subType: k as unknown as FeatureKey,
          featureInfo: featureInfoOut,
        },
      });

      return true;
    };

    const outlineKey = '站台轮廓';
    const buildingKey = '车站建筑';

    const hasOutline = Boolean(mergePolygonOBDraft.outline);
    const hasBuilding = Boolean(mergePolygonOBDraft.building);

    if (!hasOutline && !hasBuilding) {
      alert('多面合一：请至少添加一个“站台轮廓”或一个“车站建筑”。');
      return;
    }

    if (mergePolygonOBDraft.outline) {
      const ok = addOnePolygon(outlineKey, mergePolygonOBDraft.outline.values, mergePolygonOBDraft.outline.groups);
      if (!ok) return;
    }

    if (mergePolygonOBDraft.building) {
      const ok = addOnePolygon(buildingKey, mergePolygonOBDraft.building.values, mergePolygonOBDraft.building.groups);
      if (!ok) return;
    }

    setLayers(prev => {
      const next = [...prev, ...outputs];
      syncFixedRoot(next, null);
      return next;
    });

    cleanupAfterFinish();
    return;
  }

  // =========================
  // Normal：单图层保存
  // - 新建 / full fallback：沿用原 featureInfo + groupInfo
  // - workflow-style 编辑：先把 registry draft 合并回 raw featureInfo，再走现有 buildFeatureInfo
  // =========================
  const def = FORMAT_REGISTRY[subType] ?? FORMAT_REGISTRY['默认'];
  const op = editingLayerId !== null ? 'edit' : 'create';
  const prevFeatureInfo = editingLayerId !== null
    ? layersRef.current.find(l => l.id === editingLayerId)?.jsonInfo?.featureInfo
    : undefined;

  let finalFeatureInfo: any;

  const useWorkflowStyleEditor =
    editingLayerId !== null &&
    editUiMode === 'workflow-style' &&
    activeEditorView !== null;

  if (useWorkflowStyleEditor && activeEditorView) {
    const mergedDraftFeatureInfo = mergeEditorDraftIntoFeatureInfo({
      originalFeatureInfo: prevFeatureInfo ?? {},
      view: activeEditorView,
      draftValues: editorDraftValues,
    });

    const hydrated = def.hydrate(mergedDraftFeatureInfo);
    const nextValues = hydrated.values ?? {};
    const normalizedGroups = normalizeGroupInfoByDef(def, (hydrated.groups ?? {}) as any);
    const nextGroups = compactWorkflowStyleGroupInfoByDef(def, normalizedGroups);

    const req = validateRequiredDetailed(def, nextValues, nextGroups);
    if (!req.ok) {
      const detail = formatMissingEntries(req.missing);
      alert(`无法保存，部分必填的附加信息为空：\n${detail}`);
      return;
    }

    const builtFeatureInfo = def.buildFeatureInfo({
      op,
      mode: drawMode as DrawMode,
      coords: finalCoords,
      values: nextValues,
      groups: nextGroups,
      worldId: currentWorldId,
      editorId: editorIdInput,
      prevFeatureInfo,
      now: new Date(),
    });

    finalFeatureInfo = mergeUnparsedEntriesIntoFeatureInfo(builtFeatureInfo, editorDraftUnparsed);
  } else {
    const req = validateRequiredDetailed(def, featureInfo ?? {}, groupInfo ?? {});
    if (!req.ok) {
      const detail = formatMissingEntries(req.missing);
      alert(`无法保存，部分必填的附加信息为空：\n${detail}`);
      return;
    }

    finalFeatureInfo = def.buildFeatureInfo({
      op,
      mode: drawMode as DrawMode,
      coords: finalCoords,
      values: featureInfo ?? {},
      groups: groupInfo ?? {},
      worldId: currentWorldId,
      editorId: editorIdInput,
      prevFeatureInfo,
      now: new Date(),
    });
  }

  const newLayerId = editingLayerId ?? nextLayerId.current++;

  const newGroup = makeLeafletGroup(drawMode as DrawMode, finalCoords, drawColor);

  const layerObj: LayerType = {
    id: newLayerId,
    mode: drawMode,
    color: drawColor,
    coords: finalCoords,
    visible: true,
    leafletGroup: newGroup,
    jsonInfo: {
      subType,
      featureInfo: finalFeatureInfo,
    },
  };

  setLayers(prev => {
    let next: LayerType[];

    if (editingLayerId !== null) {
      const old = prev.find(l => l.id === editingLayerId);
      if (old) fixedRootRef.current?.removeLayer(old.leafletGroup);
      next = prev.map(l => (l.id === editingLayerId ? layerObj : l));
    } else {
      next = [...prev, layerObj];
    }

    syncFixedRoot(next, null);
    return next;
  });

  cleanupAfterFinish();
};


 
 
 
 
const getLayerJSONOutput = (layer: LayerType) => {
  return layerToJsonText(layer);
};


const getLayersJSONOutputBySubType = (target: FeatureKey | '__ALL__') => {
  const items = layers
    .filter((l) => Boolean(l?.jsonInfo?.featureInfo))
    .filter((l) => {
      if (target === '__ALL__') return true;
      return (l.jsonInfo?.subType as any) === target;
    })
    .map((l) => {
      try {
        const one = JSON.parse(layerToJsonText(l));
        if (Array.isArray(one) && one.length > 0) return one[0];
        return null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return stringifyFeatureJsonArray(items);
};

const getAvailableSubTypes = (): FeatureKey[] => {
  const set = new Set<string>();
  for (const l of layers) {
    const st = l.jsonInfo?.subType;
    if (st && typeof st === 'string' && st !== '默认') set.add(st);
  }
  return Array.from(set) as FeatureKey[];
};

// ======== JSON 导出：按 WORKFLOW_FEATURE_CATALOG 分划（更细粒度筛选） ========
type WorkflowCatalogExportKey = `__WF__:${string}`;

const readString1 = (obj: any, keys: string[]) => {
  for (const k of keys) {
    const s = String(obj?.[k] ?? '').trim();
    if (s) return s;
  }
  return '';
};

/**
 * 字段解析接口（导出筛选用 Kind/SKind/SKind2 三元组）
 *
 * 说明：通用要素集在不同几何类型下采用不同字段命名：
 * - 面（Polygon）：PGonKind / PGonSKind / PGonSKind2
 * - 线（Polyline，ISL）：PLineKind / PLineSKind / PLineSKind2
 * - 点（Point，ISP）：PointKind / PointSKind / PointSKind2
 * - 兼容旧/杂项：Kind / SKind / SKind2
 *
 * 后续如需新增来源字段，请在此处集中扩展。
 */
const extractKindTripletFromFeatureInfo = (fi: any): { Kind: string; SKind: string; SKind2: string } => {
  const Kind =
    readString1(fi, ['Kind', 'PGonKind', 'PLineKind', 'PointKind']) ||
    readString1(fi?.tags, ['Kind', 'PGonKind', 'PLineKind', 'PointKind']) ||
    readString1(fi, ['Class']) ||
    '';
  const SKind =
    readString1(fi, ['SKind', 'PGonSKind', 'PLineSKind', 'PointSKind']) ||
    readString1(fi?.tags, ['SKind', 'PGonSKind', 'PLineSKind', 'PointSKind']) ||
    '';
  const SKind2 =
    readString1(fi, ['SKind2', 'PGonSKind2', 'PLineSKind2', 'PointSKind2']) ||
    readString1(fi?.tags, ['SKind2', 'PGonSKind2', 'PLineSKind2', 'PointSKind2']) ||
    '';
  return { Kind, SKind, SKind2 };
};

const buildWorkflowCatalogKey = (triplet: { Kind: string; SKind: string; SKind2: string }): WorkflowCatalogExportKey =>
  (`__WF__:${triplet.Kind}/${triplet.SKind}/${triplet.SKind2}` as WorkflowCatalogExportKey);

const parseWorkflowCatalogKey = (key: string): { Kind: string; SKind: string; SKind2: string } | null => {
  const s = String(key ?? '');
  if (!s.startsWith('__WF__:')) return null;
  const rest = s.slice('__WF__:'.length);
  const parts = rest.split('/');
  return { Kind: parts[0] ?? '', SKind: parts[1] ?? '', SKind2: parts[2] ?? '' };
};

const getAvailableWorkflowCatalogKeys = (): Array<{ key: WorkflowCatalogExportKey; label: string }> => {
  const seen = new Set<string>();
  const out: Array<{ key: WorkflowCatalogExportKey; label: string }> = [];

  for (const l of layers) {
    const fi = l?.jsonInfo?.featureInfo ?? {};
    const t = extractKindTripletFromFeatureInfo(fi);
    if (!t.Kind) continue;

    // 仅列出注册表中存在的条目（避免按钮膨胀/无法解释）
    const hit = WORKFLOW_FEATURE_CATALOG.find((e) => e.kind === t.Kind && e.skind === t.SKind && e.skind2 === t.SKind2);
    if (!hit) continue;

    const k = buildWorkflowCatalogKey(t);
    if (seen.has(k)) continue;
    seen.add(k);

    // UI 按键仅显示 name，避免因承载过多字段导致按钮堆叠拥挤。
    out.push({ key: k, label: hit.name });
  }

  return out.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
};

const getLayersJSONOutputByWorkflowCatalogKey = (key: WorkflowCatalogExportKey): string => {
  const t = parseWorkflowCatalogKey(key);
  if (!t) return '[]';

  const filtered = layers.filter((l) => {
    const fi = l?.jsonInfo?.featureInfo ?? {};
    const k = extractKindTripletFromFeatureInfo(fi);
    return k.Kind === t.Kind && k.SKind === t.SKind && k.SKind2 === t.SKind2;
  });

  const items = filtered
    .map((l) => l?.jsonInfo?.featureInfo)
    .filter(Boolean);

  return stringifyFeatureJsonArray(items);
};


const getLayerDisplayTitle = (l: LayerType) => {
  const fi = l?.jsonInfo?.featureInfo;
  const st = l?.jsonInfo?.subType as FeatureKey | undefined;
  if (!fi || !st || !(FORMAT_REGISTRY as any)[st]) {
    return `#${l.id} ${l.mode}`;
  }
  const def = (FORMAT_REGISTRY as any)[st] as any;
  const pickIdKey = (featureKey: string, d: any, info: any): string | undefined => {
    const fields: any[] = Array.isArray(d?.fields) ? d.fields : [];
    const want = `${featureKey}ID`.toLowerCase();
    const want2 = `${featureKey}Id`.toLowerCase();

    // (1) 首选：与 ClassCode 强相关的 xxxID
    const exact = fields.find((f) => typeof f?.key === 'string' && String(f.key).toLowerCase() === want);
    if (exact?.key) return String(exact.key);
    const exact2 = fields.find((f) => typeof f?.key === 'string' && String(f.key).toLowerCase() === want2);
    if (exact2?.key) return String(exact2.key);

    // (2) 其次：选择“存在非空值”的 ID 字段（避免优先命中 LineID 等空字段导致候选缺失）
    for (const f of fields) {
      const k = f?.key;
      if (typeof k !== 'string') continue;
      const kk = String(k);
      if (!(kk.endsWith('ID') || kk.endsWith('Id') || kk.endsWith('id'))) continue;
      const v = (info as any)[kk];
      if (v != null && String(v).trim().length > 0) return kk;
    }

    // (3) 兜底：第一个 ID 字段
    const any = fields.find((f) => typeof f?.key === 'string' && (String(f.key).endsWith('ID') || String(f.key).endsWith('Id') || String(f.key).endsWith('id')));
    return any?.key ? String(any.key) : undefined;
  };

  const pickNameKey = (featureKey: string, d: any, info: any): string | undefined => {
    const fields: any[] = Array.isArray(d?.fields) ? d.fields : [];
    const want = `${featureKey}Name`.toLowerCase();

    const exact = fields.find((f) => typeof f?.key === 'string' && String(f.key).toLowerCase() === want);
    if (exact?.key) return String(exact.key);

    // 优先选择“存在非空值”的 Name
    for (const f of fields) {
      const k = f?.key;
      if (typeof k !== 'string') continue;
      const kk = String(k);
      if (!(kk.endsWith('Name') || kk.endsWith('name'))) continue;
      const v = (info as any)[kk];
      if (v != null && String(v).trim().length > 0) return kk;
    }

    const any = fields.find((f) => typeof f?.key === 'string' && (String(f.key).endsWith('Name') || String(f.key).endsWith('name')));
    return any?.key ? String(any.key) : undefined;
  };

  const idKey = pickIdKey(String(st), def, fi);
  const nameKey = pickNameKey(String(st), def, fi);

  const idVal = idKey ? String((fi as any)[idKey] ?? '').trim() : '';
  const nameVal = nameKey ? String((fi as any)[nameKey] ?? '').trim() : '';
  const head = idVal || `#${l.id}`;
  const mid = nameVal ? ` ${nameVal}` : '';
  return `${head}${mid}`;
};

// 图层主 ID（用于全局重复性检查/提示）：尽量与 getLayerDisplayTitle 保持一致的取值策略
const getLayerPrimaryIdValue = (l: LayerType): string => {
  const fi = l?.jsonInfo?.featureInfo;
  const st = l?.jsonInfo?.subType as FeatureKey | undefined;
  if (!fi || !st || !(FORMAT_REGISTRY as any)[st]) return '';
  const def = (FORMAT_REGISTRY as any)[st] as any;

  // 与 getLayerDisplayTitle 保持一致：优先 xxxID，其次“存在非空值”的 ID 字段
  const fields: any[] = Array.isArray(def?.fields) ? def.fields : [];
  const want = `${String(st)}ID`.toLowerCase();
  const want2 = `${String(st)}Id`.toLowerCase();
  const exact = fields.find((f) => typeof f?.key === 'string' && String(f.key).toLowerCase() === want);
  if (exact?.key) return String((fi as any)[String(exact.key)] ?? '').trim();
  const exact2 = fields.find((f) => typeof f?.key === 'string' && String(f.key).toLowerCase() === want2);
  if (exact2?.key) return String((fi as any)[String(exact2.key)] ?? '').trim();

  for (const f of fields) {
    const k = f?.key;
    if (typeof k !== 'string') continue;
    const kk = String(k);
    if (!(kk.endsWith('ID') || kk.endsWith('Id') || kk.endsWith('id'))) continue;
    const v = (fi as any)[kk];
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }

  const any = fields.find((f) => typeof f?.key === 'string' && (String(f.key).endsWith('ID') || String(f.key).endsWith('Id') || String(f.key).endsWith('id')));
  return any?.key ? String((fi as any)[String(any.key)] ?? '').trim() : '';
};

// 图层主 Name（用于简略CSV）：尽量与 getLayerDisplayTitle 保持一致的取值策略
const getLayerPrimaryNameValue = (l: LayerType): string => {
  const fi = l?.jsonInfo?.featureInfo;
  const st = l?.jsonInfo?.subType as FeatureKey | undefined;
  if (!fi || !st || !(FORMAT_REGISTRY as any)[st]) return '';
  const def = (FORMAT_REGISTRY as any)[st] as any;
  const fields: any[] = Array.isArray(def?.fields) ? def.fields : [];
  const want = `${String(st)}Name`.toLowerCase();
  const exact = fields.find((f) => typeof f?.key === 'string' && String(f.key).toLowerCase() === want);
  if (exact?.key) return String((fi as any)[String(exact.key)] ?? '').trim();

  for (const f of fields) {
    const k = f?.key;
    if (typeof k !== 'string') continue;
    const kk = String(k);
    if (!(kk.endsWith('Name') || kk.endsWith('name'))) continue;
    const v = (fi as any)[kk];
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }

  const any = fields.find((f) => typeof f?.key === 'string' && (String(f.key).endsWith('Name') || String(f.key).endsWith('name')));
  return any?.key ? String((fi as any)[String(any.key)] ?? '').trim() : '';
};

// ===== 简略 CSV 导出（Type,Class,World,ID,Name） =====
const csvEscape = (v: any) => {
  const s = v === null || v === undefined ? '' : String(v);

  // 额外处理少见“Unicode 换行符”，避免部分软件乱断行
  const normalized = s.replace(/\u2028|\u2029/g, ' ');

  const escaped = normalized.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
};

const buildBriefCsvFromLayers = (list: LayerType[], worldIdFallback: string) => {
  const header = ['Type', 'Class', 'World', 'ID', 'Name'];

  // Windows/Excel 更稳：用 CRLF
  const CRLF = '\r\n';

  const rows = list.map((l) => {
    const fi: any = l?.jsonInfo?.featureInfo ?? {};
    const cls = String((l?.jsonInfo?.subType ?? '默认') as any);

    const type =
      (fi?.Type ?? fi?.type) ??
      (l.mode === 'point' ? 'Point' : l.mode === 'polyline' ? 'Line' : 'Polygon');
    const world = (fi?.World ?? fi?.world ?? worldIdFallback) ?? '';
    const id = getLayerPrimaryIdValue(l);
    const name = getLayerPrimaryNameValue(l);

    return [type, cls, world, id, name].map(csvEscape).join(',');
  });

  // 加 BOM：Excel/WPS 双击打开更容易识别 UTF-8
  return `\uFEFF${header.join(',')}${CRLF}${rows.join(CRLF)}${CRLF}`;
};

const downloadTextFile = (text: string, filename: string, mime: string) => {
  try {
    // 这里 text 已含 BOM；如果你不想在 text 里加 BOM，也可以 Blob 前加 bytes
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
};

const readTempRuleSources = (): Record<string, TempRuleSource[]> => {
  try {
    const raw = localStorage.getItem(TEMP_RULE_SOURCES_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    return obj as any;
  } catch {
    return {};
  }
};

const readTempRuleOverrideIds = (): Record<string, string[]> => {
  try {
    const raw = localStorage.getItem(TEMP_RULE_OVERRIDE_IDS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    return obj as any;
  } catch {
    return {};
  }
};


const readTempRuleDeleteIds = (): Record<string, string[]> => {
  try {
    const raw = localStorage.getItem(TEMP_RULE_DELETE_IDS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    return obj as any;
  } catch {
    return {};
  }
};

const writeTempRuleDeleteIds = (all: Record<string, string[]>) => {
  try {
    localStorage.setItem(TEMP_RULE_DELETE_IDS_KEY, JSON.stringify(all));
    bumpTempRuleDeleteIdsRevision();
    window.dispatchEvent(
      new CustomEvent('ria-temp-rule-deletes-changed', { detail: { worldId: currentWorldId } }),
    );
    requestTempMountNavigationRebuild(currentWorldId);
  } catch {
    // ignore
  }
};

const clearTempRuleDeleteIdsForWorld = () => {
  const all = readTempRuleDeleteIds();
  if (all && typeof all === 'object' && (all as any)[currentWorldId]) {
    const next = { ...all } as any;
    delete next[currentWorldId];
    writeTempRuleDeleteIds(next);
  } else {
    window.dispatchEvent(
      new CustomEvent('ria-temp-rule-deletes-changed', { detail: { worldId: currentWorldId } }),
    );
  }
};

const syncTempRuleDeleteIdsForCurrentWorld = () => {
  const all = readTempRuleDeleteIds();
  const ids = relayPackageDraft.deleteMarks.map((x) => String(x.ID ?? '').trim()).filter(Boolean);
  if (ids.length > 0) writeTempRuleDeleteIds({ ...all, [currentWorldId]: Array.from(new Set(ids)) });
  else if ((all as any)[currentWorldId]) {
    const next = { ...all } as any;
    delete next[currentWorldId];
    writeTempRuleDeleteIds(next);
  } else {
    window.dispatchEvent(new CustomEvent('ria-temp-rule-deletes-changed', { detail: { worldId: currentWorldId } }));
  }
};

const requestTempMountNavigationRebuild = (worldId: string) => {
  const wid = String(worldId ?? '').trim();
  if (!wid) return;
  Promise.resolve().then(async () => {
    try {
      await rebuildRoadGraphCacheForWorld(wid);
    } catch {
      // ignore
    }
    try {
      await rebuildRailNewIndexCacheForWorld(wid);
    } catch {
      // ignore
    }
    try {
      await rebuildRailNewNavigationCacheForWorld(wid);
    } catch {
      // ignore
    }
    try {
      await rebuildTeleportNewCacheForWorld(wid);
    } catch {
      // ignore
    }
  });
};

const writeTempRuleOverrideIds = (all: Record<string, string[]>) => {
  try {
    localStorage.setItem(TEMP_RULE_OVERRIDE_IDS_KEY, JSON.stringify(all));
    bumpTempRuleOverrideIdsRevision();
    window.dispatchEvent(
      new CustomEvent('ria-temp-rule-overrides-changed', { detail: { worldId: currentWorldId } }),
    );
    requestTempMountNavigationRebuild(currentWorldId);
  } catch {
    // ignore
  }
};

const clearTempRuleOverrideIdsForWorld = () => {
  const all = readTempRuleOverrideIds();
  if (all && typeof all === 'object' && (all as any)[currentWorldId]) {
    const next = { ...all } as any;
    delete next[currentWorldId];
    writeTempRuleOverrideIds(next);
  } else {
    // 仍然发事件，确保 RuleDrivenLayer 刷新
    window.dispatchEvent(
      new CustomEvent('ria-temp-rule-overrides-changed', { detail: { worldId: currentWorldId } }),
    );
  }
};

const writeTempRuleSources = (all: Record<string, TempRuleSource[]>) => {
  try {
    localStorage.setItem(TEMP_RULE_SOURCES_KEY, JSON.stringify(all));
    bumpTempRuleSourcesRevision();
    window.dispatchEvent(new CustomEvent('ria-temp-rule-sources-changed', { detail: { worldId: currentWorldId } }));
    requestTempMountNavigationRebuild(currentWorldId);
  } catch {
    // ignore
  }
};

const [tempMountUiVersion, setTempMountUiVersion] = useState(0);

const getLayerTempUid = (layerId: number) => `${currentWorldId}::layer-${layerId}`;

const getTempMountedEntryByLayer = (layerId: number): TempRuleSource | undefined => {
  const uid = getLayerTempUid(layerId);
  const all = readTempRuleSources();
  const list = (all?.[currentWorldId] ?? []) as any[];
  if (!Array.isArray(list)) return undefined;
  const found = list.find((x) => x && typeof x === 'object' && String((x as any).uid) === uid);
  return found as any;
};

const setTempMountedEnabledForLayer = (layerId: number, enabled: boolean) => {
  const uid = getLayerTempUid(layerId);
  const all = readTempRuleSources();
  const prev = Array.isArray(all?.[currentWorldId]) ? (all[currentWorldId] as any[]) : [];
  const next = prev.map((x) => {
    if (x && typeof x === 'object' && String((x as any).uid) === uid) {
      return { ...(x as any), enabled: Boolean(enabled) };
    }
    return x;
  });
  writeTempRuleSources({ ...all, [currentWorldId]: next as any });
  setTempMountUiVersion((v) => v + 1);
};

const removeAllTempMountedLayersForWorld = (layerIds: number[]) => {
  const all = readTempRuleSources();
  const prev = Array.isArray(all?.[currentWorldId]) ? (all[currentWorldId] as any[]) : [];
  const uidSet = new Set(layerIds.map((id) => getLayerTempUid(id)));
  const next = prev.filter((x) => !(x && typeof x === 'object' && uidSet.has(String((x as any).uid))));
  writeTempRuleSources({ ...all, [currentWorldId]: next as any });
  setTempMountUiVersion((v) => v + 1);
};


const buildTempRulePicturesByIdForLayer = (layer: LayerType): TempRuleSource['picturesById'] | undefined => {
  const id = String(getLayerPrimaryIdValue(layer) ?? '').trim();
  if (!id) return undefined;
  const src = relayPackageDraft.picturesById[id] ?? [];
  const active = src
    .filter((pic) => !pic.deleted)
    .map((pic, idx) => ({ pic, idx }))
    .sort((a, b) => {
      const ao = Number(a.pic.order ?? a.idx + 1);
      const bo = Number(b.pic.order ?? b.idx + 1);
      return ao - bo || a.idx - b.idx;
    })
    .map(({ pic }) => {
      const source = pic.source === 'pub' || pic.source === 'dat' ? pic.source : 'dat';
      const url = String(pic.previewUrl ?? pic.relativePath ?? '').trim();
      return {
        source,
        url,
        filename: String(pic.originalName ?? '').trim() || undefined,
        relativePath: pic.relativePath,
      };
    })
    .filter((pic) => Boolean(pic.url || pic.relativePath));
  return active.length > 0 ? { [id]: active } : undefined;
};

const mountAllLayersToTempSources = (layerList: LayerType[]) => {
  const all = readTempRuleSources();
  const prev = Array.isArray(all?.[currentWorldId]) ? (all[currentWorldId] as any[]) : [];

  // 先移除同 uid 的旧条目（避免重复）
  const uidSet = new Set(layerList.map((l) => getLayerTempUid(l.id)));
  const kept = prev.filter((x) => !(x && typeof x === 'object' && uidSet.has(String((x as any).uid))));

  const nextEntries: TempRuleSource[] = [];
  for (const layer of layerList) {
    let items: any[] = [];
    try {
      const one = JSON.parse(layerToJsonText(layer));
      if (Array.isArray(one)) items = one;
    } catch {
      items = [];
    }
    if (!items.length) continue;
    const picturesById = buildTempRulePicturesByIdForLayer(layer);
    nextEntries.push({
      uid: getLayerTempUid(layer.id),
      worldId: currentWorldId,
      label: getLayerDisplayTitle(layer),
      enabled: Boolean(layer.visible),
      items,
      ...(picturesById ? { picturesById } : {}),
    });
  }

  writeTempRuleSources({ ...all, [currentWorldId]: [...kept, ...nextEntries] as any });
  setTempMountUiVersion((v) => v + 1);
};

//（单图层临时挂载按钮已被“全局临时挂载”替代，故移除相关逻辑）
// ======== 临时挂载(全局)状态同步：若当前 world 存在 layer-* 的临时源，则视为已进入挂载模式 ========
useEffect(() => {
  const sync = () => {
    const all = readTempRuleSources();
    const list = (all?.[currentWorldId] ?? []) as any[];
    const has = Array.isArray(list) && list.some((x) => {
      const uid = x && typeof x === 'object' ? String((x as any).uid ?? '') : '';
      return uid.startsWith(`${currentWorldId}::layer-`);
    });
    setTempMountAllActive(has);
  };

  sync();
  const handler = () => sync();
  window.addEventListener('ria-temp-rule-sources-changed', handler as any);
  return () => window.removeEventListener('ria-temp-rule-sources-changed', handler as any);
}, [currentWorldId]);

useEffect(() => {
  if (!tempMountAllActive) return;
  syncTempRuleDeleteIdsForCurrentWorld();
}, [tempMountAllActive, relayPackageDraft.deleteMarks, currentWorldId]);

// ======== 图层管理：顶部横向滚动条（始终可见）与内容区横向滚动同步 ========
const layerMgrTopXRef = useRef<HTMLDivElement | null>(null);
const layerMgrBodyRef = useRef<HTMLDivElement | null>(null);
const layerMgrSpacerRef = useRef<HTMLDivElement | null>(null);
const layerMgrSyncLockRef = useRef(false);
const layerMgrCardRef = useRef<HTMLDivElement | null>(null);
const [layerMgrListMaxHeight, setLayerMgrListMaxHeight] = useState(280);

useEffect(() => {
  const top = layerMgrTopXRef.current;
  const body = layerMgrBodyRef.current;
  const spacer = layerMgrSpacerRef.current;
  if (!top || !body || !spacer) return;

  const syncSpacerWidth = () => {
    spacer.style.width = `${body.scrollWidth}px`;
  };
  syncSpacerWidth();

  const onTopScroll = () => {
    if (layerMgrSyncLockRef.current) return;
    layerMgrSyncLockRef.current = true;
    body.scrollLeft = top.scrollLeft;
    layerMgrSyncLockRef.current = false;
  };
  const onBodyScroll = () => {
    if (layerMgrSyncLockRef.current) return;
    layerMgrSyncLockRef.current = true;
    top.scrollLeft = body.scrollLeft;
    layerMgrSyncLockRef.current = false;
  };

  top.addEventListener('scroll', onTopScroll);
  body.addEventListener('scroll', onBodyScroll);

  const ro = new ResizeObserver(syncSpacerWidth);
  ro.observe(body);

  return () => {
    top.removeEventListener('scroll', onTopScroll);
    body.removeEventListener('scroll', onBodyScroll);
    ro.disconnect();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [layers.length, tempMountAllActive, tempMountUiVersion, measuringActive, layerMgrListMaxHeight]);

useEffect(() => {
  if (!measuringActive) return;

  let frame = 0;
  const updateListMaxHeight = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const card = layerMgrCardRef.current;
      const body = layerMgrBodyRef.current;
      if (!card || !body) return;

      const panelMaxHeight = Math.floor(window.innerHeight * 0.7);
      const cardTop = card.getBoundingClientRect().top;
      const bodyTop = body.getBoundingClientRect().top;
      const fixedHeight = Math.max(0, bodyTop - cardTop);
      const next = Math.max(120, panelMaxHeight - fixedHeight - 12);
      setLayerMgrListMaxHeight((prev) =>
        Math.abs(prev - next) > 1 ? next : prev,
      );
    });
  };

  updateListMaxHeight();
  window.addEventListener('resize', updateListMaxHeight);

  const observer = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(updateListMaxHeight)
    : null;
  if (observer) {
    if (layerMgrCardRef.current) observer.observe(layerMgrCardRef.current);
    if (layerMgrTopXRef.current) observer.observe(layerMgrTopXRef.current);
  }

  return () => {
    window.removeEventListener('resize', updateListMaxHeight);
    observer?.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
  };
}, [
  measuringActive,
  layers.length,
  tempMountAllActive,
  tempMountUiVersion,
  relayPackageDraft.deleteMarks.length,
  relayPackageDraft.meta.draftStatus,
  relayPackageDraft.meta.operator,
  relayPackageDraft.meta.note,
  relayPackageDraft.meta.packageVersion,
  relayPackageDraft.meta.updatedAt,
]);

 
const handleUndo = () => {
  if (!tempPoints.length) return;

  const last = tempPoints[tempPoints.length - 1];
  setRedoStack((prev) => [...prev, last]);

  const updated = tempPoints.slice(0, tempPoints.length - 1);
  setTempPoints(updated);

  drawDraftGeometry(updated, drawMode, drawColor);

  if (updated.length === 0) draftEndpointRef.current?.clearLayers();
  else updateLatestEndpointMarker(updated[updated.length - 1], drawColor);
};

const handleRedo = () => {
  if (!redoStack.length) return;

  const redoPoint = redoStack[redoStack.length - 1];
  setRedoStack((prev) => prev.slice(0, prev.length - 1));

  const updated = [...tempPoints, redoPoint];
  setTempPoints(updated);

  drawDraftGeometry(updated, drawMode, drawColor);
  updateLatestEndpointMarker(redoPoint, drawColor);
};

 
 
 // ========= 清除所有图层 =========
const clearAllLayers = () => {
  // 1) 清空三个容器（fixed + workflow + draft）
  fixedRootRef.current?.clearLayers();
  workflowRootRef.current?.clearLayers();
  workflowPreviewMapRef.current.clear();
  clearDraftOverlays();

  // 2) 清空 state
  setLayers([]);

  // 3) 重置绘制/编辑态
  setTempPoints([]);
  setRedoStack([]);
  setEditingLayerId(null);
  setDrawing(false);
  setDrawMode('none');
  resetWorkflowStyleEditorState();

  // 4) 工作流态复位
  setWorkflowRunning(false);

  // 控制点显示也复位（避免下次进来直接常显）
  setShowDraftControlPoints(false);
  setShowDraftControlPointCoords(false);

  setDrawClickSuppressed(false);
  setShowDraftControlPointsLocked(false);
};




 
 
 const toggleLayerVisible = (id: number) => {
   setLayers(prev => {
     const next = prev.map(l => (l.id === id ? { ...l, visible: !l.visible } : l));
 
     // 编辑中的层：只改状态，不把它塞回 fixedRoot（否则会“编辑层 + 固定层”并存成幽灵）
     // 非编辑层：用 fixedRoot 统一重建，确保顺序/显隐与状态一致
     syncFixedRoot(next, editingLayerId);
 
     return next;
   });
 };
 
 
 
 const moveLayerUp = (id: number) => {
   setLayers(prev => {
     const idx = prev.findIndex(l => l.id === id);
     if (idx <= 0) return prev;
 
     const next = [...prev];
     [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
 
     syncFixedRoot(next, editingLayerId);
     return next;
   });
 };
 
 
 const moveLayerDown = (id: number) => {
   setLayers(prev => {
     const idx = prev.findIndex(l => l.id === id);
     if (idx < 0 || idx >= prev.length - 1) return prev;
 
     const next = [...prev];
     [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
 
     syncFixedRoot(next, editingLayerId);
     return next;
   });
 };
 
 
 // --------- 当前临时输出文本 ---------
const currentTempOutput = () => {
  if (tempPoints.length === 0 || drawMode === 'none') return '';

  const def = FORMAT_REGISTRY[subType];
  if (def?.hideTempOutput) return '';


  const pts = tempPoints.map((p) => `${formatGridNumber(p.x)},${formatGridNumber(p.z)}`);

  if (drawMode === 'point') return `<point:${pts.join(';')}>`;
  if (drawMode === 'polyline') return `<polyline:${pts.join(';')}>`;
  return `<polygon:${pts.join(';')}>`;
};

 
const editLayer = (id: number) => {
  if (guardTempMountReadonly()) return;
  const layer = layers.find(l => l.id === id);
  if (!layer) return;

  // 从固定容器移除（用 removeLayer 更稳）
  fixedRootRef.current?.removeLayer(layer.leafletGroup);

  // 备份原始坐标
  editingBackupCoordsRef.current = layer.coords;

  // 进入编辑态
  setEditingLayerId(id);
  setDrawing(true);
  setDrawMode(layer.mode);
  setDrawColor(layer.color);

  // 恢复坐标并画草稿
  setTempPoints(layer.coords);
  drawDraftGeometry(layer.coords, layer.mode, layer.color);

  resetWorkflowStyleEditorState();

  // 恢复 jsonInfo：默认仍通过 FORMAT_REGISTRY.hydrate；命中 registry 且标记可编辑时再切换到 workflow-style editor
  if (layer.jsonInfo) {
    const key = (layer.jsonInfo.subType ?? '默认') as FeatureKey;
    const def = FORMAT_REGISTRY[key] ?? FORMAT_REGISTRY['默认'];

    setSubType(key);

    const hydrated = def.hydrate(layer.jsonInfo.featureInfo ?? {});
    setFeatureInfo(hydrated.values ?? {});
    setGroupInfo(normalizeGroupInfoByDef(def, (hydrated.groups ?? {}) as any));

    const schema = resolveWorkflowEditorSchema({
      subType: key,
      featureInfo: layer.jsonInfo.featureInfo ?? {},
    });

    if (schema?.integrations?.editor === 'workflowStyleReady') {
      const view = projectRegistryScene(schema, 'editor');
      const draft = parseFeatureInfoByRegistry(layer.jsonInfo.featureInfo ?? {}, view);
      setEditUiMode('workflow-style');
      setActiveEditorView(view);
      setEditorDraftValues(draft.values);
      setEditorDraftUnparsed(draft.unparsedEntries);
    }
  } else {
    setSubType('默认');
    const hydrated = FORMAT_REGISTRY['默认'].hydrate({});
    setFeatureInfo(hydrated.values ?? {});
    setGroupInfo(hydrated.groups ?? {});
  }
};


 
 
 
 
 
 
 
 // ========= 删除图层 =========
 const deleteLayer = (id: number) => {
   setLayers(prev => {
     const target = prev.find(l => l.id === id);
 
     // 先从固定容器移除（不要只 target.leafletGroup.remove()，否则可能仍残留在父 group 里，后续会“复活”）:contentReference[oaicite:3]{index=3}
     if (target) {
       fixedRootRef.current?.removeLayer(target.leafletGroup);
     }
 
if (editingLayerId === id) {
  clearDraftOverlays();
  setTempPoints([]);
  setRedoStack([]);
  resetWorkflowStyleEditorState();
}

 
     const next = prev.filter(l => l.id !== id);
 
     syncFixedRoot(next, editingLayerId === id ? null : editingLayerId);
     return next;
   });
 };
 
 
 

 
// ---------- 批量导入（文本/文件）：只支持“新规范 JSON 条目” ----------
// ===== 批量导入：识别条目对应的格式定义（按 Class -> FORMAT_REGISTRY.classCode / key 兜底） =====
const detectImportItemDefinition = (item: any) => {
  const clsRaw = (item?.Class ?? item?.class ?? item?.featureInfo?.Class ?? item?.featureInfo?.class) as any;
  const cls = typeof clsRaw === 'string' ? clsRaw.trim() : '';
  if (!cls) return null;

  // 1) 按 classCode 精确匹配（新规范最可靠）
  for (const def of Object.values(FORMAT_REGISTRY)) {
    if (!def || (def as any).key === '默认') continue;
    const code = (def as any).classCode;
    if (code && String(code).trim() === cls) return def as any;
  }

  // 2) 兜底：允许 Class 直接写 FeatureKey
  const maybeKey = cls as FeatureKey;
  if ((FORMAT_REGISTRY as any)[maybeKey] && (FORMAT_REGISTRY as any)[maybeKey].key !== '默认') {
    return (FORMAT_REGISTRY as any)[maybeKey];
  }

  return null;
};

const runBatchImportFromText = (rawText: string, sourceLabel: string) => {
  const text = String(rawText ?? '').trim();
  if (!text) return;

  const proj = projectionRef.current;
  const fixedRoot = fixedRootRef.current;

  if (!proj || !fixedRoot) {
    alert('地图/固定图层容器尚未就绪，无法导入');
    return;
  }

  const tryParseFlexible = (raw: string): any => {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      // ignore
    }
    const normalized = t
      .replace(/\r\n/g, '\n')
      .replace(/\n+/g, '\n')
      .replace(/}\s*,\s*{/g, '},{')
      .replace(/}\s*\n\s*{/g, '},{')
      .trim()
      .replace(/,\s*$/g, '');
    const wrapped = `[${normalized}]`;
    try {
      return JSON.parse(wrapped);
    } catch {
      return null;
    }
  };

  const parsed = tryParseFlexible(text);
  if (!parsed) {
    alert(`${sourceLabel}：只支持合法 JSON（可为数组/对象/单对象，或多对象但外层未包 []）。`);
    return;
  }

  let items: any[] = [];
  if (Array.isArray(parsed)) items = parsed;
  else if (parsed && typeof parsed === 'object') {
    if (Array.isArray((parsed as any).items)) items = (parsed as any).items;
    else if (Array.isArray((parsed as any).features)) items = (parsed as any).features;
    else items = [parsed];
  }

  if (!items.length) {
    alert(`${sourceLabel}失败：未找到可导入条目（需要数组或包含 items/features 的对象）。`);
    return;
  }

  const errors: string[] = [];
  const newLayers: LayerType[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const def = detectImportItemDefinition(item);
    if (!def) {
      errors.push(`${sourceLabel} 第 ${i + 1} 条导入失败：无法识别条目类型（缺少 Type/Class/必要字段）。`);
      continue;
    }

    const v = validateImportItemDetailed(def, item, { worldId: currentWorldId, strictSystemFields: true });
    if (!v.ok) {
      const parts: string[] = [];
      if (v.missing.length > 0) parts.push(`必填缺失/为空：\n${formatMissingEntries(v.missing)}`);
      if (v.structuralErrors.length > 0) parts.push(`结构错误：${v.structuralErrors.join('；')}`);
      errors.push(`${sourceLabel} ${def.label} 第 ${i + 1} 条导入失败：\n${parts.join('\n')}`);
      continue;
    }

    const mode = v.mode;
    const coords = v.coords;
    const hydrated = v.hydrated ?? def.hydrate(item);
    const normGroups = normalizeGroupInfoByDef(def, (hydrated.groups ?? {}) as any);

    const featureInfoOut = def.buildFeatureInfo({
      op: 'import',
      mode,
      coords,
      values: hydrated.values ?? {},
      groups: normGroups,
      worldId: currentWorldId,
      prevFeatureInfo: item,
      now: new Date(),
    });

    const itemColor = randomColor();
    const group = L.layerGroup();

    const yForDisplay =
      Number.isFinite(Number((item as any)?.height)) ? Number((item as any).height)
      : Number.isFinite(Number((item as any)?.heightH)) ? Number((item as any).heightH)
      : 64;

    const latlngs = coords.map(p => proj.locationToLatLng(p.x, yForDisplay, p.z));

    if (mode === 'point') {
      latlngs.forEach(ll => {
        L.circleMarker(ll, { color: itemColor, fillColor: itemColor, radius: 6 }).addTo(group);
      });
    } else if (mode === 'polyline') {
      L.polyline(latlngs, { color: itemColor }).addTo(group);
    } else {
      L.polygon(latlngs, { color: itemColor }).addTo(group);
    }

    const id = nextLayerId.current++;
    newLayers.push({
      id,
      mode,
      color: itemColor,
      coords,
      visible: true,
      leafletGroup: group,
      jsonInfo: {
        subType: def.key,
        featureInfo: featureInfoOut,
      },
    });
  }

  if (errors.length) {
    alert(`批量导入部分失败：\n\n${errors.slice(0, 10).join('\n\n')}${errors.length > 10 ? `\n\n...(共 ${errors.length} 条错误)` : ''}`);
    return;
  }

  setLayers(prev => {
    const next = [...prev, ...newLayers];
    syncFixedRoot(next, editingLayerId);
    return next;
  });
};


const resolveMergedRelayDraftStatus = (
  base: RelayPackageDraft,
  incoming: RelayPackageDraft,
): RelayPackageDraftStatus => {
  const incomingStatus = incoming.meta.draftStatus;
  const baseStatus = base.meta.draftStatus;
  if (incomingStatus === 'imported_package') return 'imported_package';
  if (baseStatus === 'imported_package') return 'imported_package';
  if (baseStatus === 'exported_draft' || incomingStatus === 'exported_draft') return 'exported_draft';
  return 'new_draft';
};

const buildRelayPackageVersionStamp = (): string => {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `draft-${y}${m}${d}-${hh}${mm}${ss}`;
};

const mergeRelayPackageDrafts = (base: RelayPackageDraft, incoming: RelayPackageDraft): RelayPackageDraft => {
  const nextDeleteMarks = new Map<string, any>();
  for (const item of base.deleteMarks) nextDeleteMarks.set(item.ID, item);
  for (const item of incoming.deleteMarks) nextDeleteMarks.set(item.ID, item);

  const nextPicturesById = { ...base.picturesById };
  for (const [id, pictures] of Object.entries(incoming.picturesById ?? {})) {
    nextPicturesById[id] = pictures;
  }

  const nextStatus = resolveMergedRelayDraftStatus(base, incoming);
  const incomingVersion = incoming.meta.packageVersion;
  const baseVersion = base.meta.packageVersion;

  return {
    meta: {
      ...base.meta,
      operator: base.meta.operator || incoming.meta.operator,
      note: base.meta.note || incoming.meta.note,
      draftStatus: nextStatus,
      updatedAt: new Date().toISOString(),
      packageVersion: incomingVersion ?? baseVersion,
      schemaVersion: incoming.meta.schemaVersion || base.meta.schemaVersion,
    },
    deleteMarks: Array.from(nextDeleteMarks.values()),
    picturesById: nextPicturesById,
  };
};

const applyParsedRelayPackage = (parsed: { draft: RelayPackageDraft; jsonItems: any[] }) => {
  const incomingIdSet = new Set<string>();
  for (const item of parsed.jsonItems) {
    if (!item || typeof item !== 'object') continue;
    const cls = String((item as any)?.Class ?? '').trim();
    const { idValue } = pickIdFieldValue(item as any, cls);
    const id = String(idValue ?? '').trim();
    if (id) incomingIdSet.add(id);
  }

  if (incomingIdSet.size > 0) {
    setLayers((prev) => {
      const removed = prev.filter((l) => {
        const fi = l.jsonInfo?.featureInfo as any;
        const cls = String(fi?.Class ?? l.jsonInfo?.subType ?? '').trim();
        const { idValue } = pickIdFieldValue(fi, cls);
        const id = String(idValue ?? '').trim();
        return id && incomingIdSet.has(id);
      });
      for (const layer of removed) {
        fixedRootRef.current?.removeLayer(layer.leafletGroup);
      }
      const next = prev.filter((l) => {
        const fi = l.jsonInfo?.featureInfo as any;
        const cls = String(fi?.Class ?? l.jsonInfo?.subType ?? '').trim();
        const { idValue } = pickIdFieldValue(fi, cls);
        const id = String(idValue ?? '').trim();
        return !(id && incomingIdSet.has(id));
      });
      syncFixedRoot(next, editingLayerId);
      return next;
    });
  }

  setRelayPackageDraft((prev) => mergeRelayPackageDrafts(prev, parsed.draft));
  if (Array.isArray(parsed.jsonItems) && parsed.jsonItems.length > 0) {
    runBatchImportFromText(JSON.stringify(parsed.jsonItems, null, 2), '标准包导入');
  }
};


const applyMinimalFeatureEditPackage = (pkg: MinimalFeatureEditPackage) => {
  const item = (pkg?.feature ?? {}) as any;
  if (!item || typeof item !== 'object') return;

  const cls = String(item.Class ?? '').trim();
  const { idValue } = pickIdFieldValue(item, cls);
  const id = String(idValue ?? '').trim();
  if (!id) return;

  const incomingDraft: RelayPackageDraft = {
    ...createEmptyRelayPackageDraft(),
    picturesById: {
      [id]: (pkg.pictures ?? []).map((pic, idx) => ({
        uid: `${id}:${pic.filename ?? idx + 1}:${Date.now()}`,
        originalName: pic.filename || `${id}_${idx + 1}.png`,
        relativePath: pic.relativePath,
        previewUrl: pic.url,
        deleted: false,
        order: idx + 1,
        source: pic.source,
      })),
    },
    meta: {
      ...createEmptyRelayPackageDraft().meta,
      draftStatus: 'new_draft',
      updatedAt: new Date().toISOString(),
      packageVersion: undefined,
    },
  };

  applyParsedRelayPackage({ draft: incomingDraft, jsonItems: [item] });
};

useEffect(() => {
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent<MinimalFeatureEditPackage>).detail;
    if (!detail) return;
    const requestId = String((detail as any)?.__riaImportRequestId ?? '').trim();
    try {
      applyMinimalFeatureEditPackage(detail);
      if (!measuringActive) {
        setMeasuringActive(true);
      }
    } finally {
      if (requestId) {
        window.dispatchEvent(new CustomEvent('ria:importFeatureEditPackageDone', { detail: { requestId } }));
      }
    }
  };
  window.addEventListener('ria:importFeatureEditPackage', handler as EventListener);
  return () => window.removeEventListener('ria:importFeatureEditPackage', handler as EventListener);
}, [measuringActive, currentWorldId, layers, relayPackageDraft]);

const layerDeleteCandidateFromLayer = (layer: LayerType) => {
  const fi = layer.jsonInfo?.featureInfo as any;
  const cls = String(fi?.Class ?? layer.jsonInfo?.subType ?? '').trim();
  const { idValue } = pickIdFieldValue(fi, cls);
  const id = String(idValue ?? '').trim();
  if (!id) return null;
  return {
    ID: id,
    Name: String(fi?.Name ?? fi?.Label ?? '').trim() || getLayerDisplayTitle(layer),
    className: cls,
  };
};

const buildDeleteCandidatesFromLayers = (): DeletePanelItem[] => layers.reduce<DeletePanelItem[]>((acc, l) => {
  if (l.id === editingLayerId || !l.jsonInfo?.featureInfo) return acc;
  const candidate = layerDeleteCandidateFromLayer(l);
  if (candidate) acc.push(candidate);
  return acc;
}, []);

const getLayerPictureBindingContext = (layerId: number | null) => {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer || !layer.jsonInfo?.featureInfo) return null;
  const fi = layer.jsonInfo.featureInfo as any;
  const cls = String(fi?.Class ?? layer.jsonInfo.subType ?? '').trim();
  const { idValue } = pickIdFieldValue(fi, cls);
  const id = String(idValue ?? '').trim();
  if (!id) return null;
  const name = String(fi?.Name ?? fi?.Label ?? getLayerDisplayTitle(layer)).trim() || id;
  return {
    id,
    title: `${name} 图片绑定`,
    pictures: relayPackageDraft.picturesById[id] ?? [],
  };
};

const applyPictureBindingForLayer = (layerId: number | null, pictures: any[]) => {
  const ctx = getLayerPictureBindingContext(layerId);
  if (!ctx) return;
  setRelayPackageDraft((prev) => ({
    ...prev,
    picturesById: { ...prev.picturesById, [ctx.id]: pictures },
    meta: { ...prev.meta, updatedAt: new Date().toISOString() },
  }));
  setPicturePanelOpen(false);
};

const handleExportRelayPackage = async (operator: string, note: string): Promise<{ blob: Blob; filename: string }> => {
  const visibleList = layers.filter((l) => l.id !== editingLayerId);
  const packageVersion = buildRelayPackageVersionStamp();
  const nextMeta = {
    ...relayPackageDraft.meta,
    operator,
    note,
    draftStatus: 'exported_draft' as RelayPackageDraftStatus,
    packageVersion,
    updatedAt: new Date().toISOString(),
  };
  let blob: Blob;
  try {
    blob = await buildRelayPackageZip({
      layers: visibleList as any,
      currentWorldId,
      draft: {
        ...relayPackageDraft,
        meta: nextMeta,
      },
      operator,
      note,
    });
  } catch (error) {
    throw new Error(`标准包生成失败：${String((error as Error)?.message ?? error ?? '未知错误')}`);
  }
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const filename = `RelayPackage_${sanitizeFilenamePart(operator)}_${sanitizeFilenamePart(currentWorldId)}_${y}${m}${d}${hh}${mm}.zip`;
  setRelayPackageDraft((prev) => ({ ...prev, meta: { ...prev.meta, ...nextMeta } }));
  return { blob, filename };
};

const handleImport = () => {
  runBatchImportFromText(importText, '文本导入');
  setImportText('');
  setImportPanelOpen(false);
};

const handleUploadFileClick = () => {
  importFileInputRef.current?.click();
};

const handleImportFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // 允许重复选同一文件
  if (!file) return;
  setImportFileBusy(true);
  try {
    const name = file.name || '文件';
    const lower = name.toLowerCase();
    if (lower.endsWith('.json')) {
      const text = await file.text();
      runBatchImportFromText(text, `文件导入：${name}`);
      setImportPanelOpen(false);
      return;
    }
    if (!lower.endsWith('.zip')) {
      alert(`仅支持上传 .zip 或 .json 文件：${name}`);
      return;
    }

    // 先尝试按 RelayPackage 解析。
    // 若 ZIP 已具备 RelayPackage 结构，则不允许回退到旧 ZIP JSON 导入，避免 INDEX/Delete/Picture/Tool_Refresh 被误处理。
    try {
      const parsed = await parseRelayPackageZip(file);
      if (parsed.isRelayPackageLike) {
        if (
          (Array.isArray(parsed.jsonItems) && parsed.jsonItems.length > 0) ||
          parsed.parsedPictureCount > 0 ||
          parsed.parsedDeleteCount > 0
        ) {
          applyParsedRelayPackage(parsed);
          setImportPanelOpen(false);
          return;
        }

        alert(
          '标准包结构无法解析：检测到 RelayPackage 结构，但未找到可导入的 Data_Spilt 条目、图片或删除标记。请检查包内 INDEX.json / Data_Spilt / Picture / Delete.json 结构。'
        );
        return;
      }
    } catch (err: any) {
      alert(`标准包结构无法解析：${String(err?.message ?? err)}`);
      return;
    }

    // 非 RelayPackage ZIP：动态加载 jszip，回退旧 ZIP 批量 JSON 导入。
    // - 使用 @ts-ignore 避免在未安装依赖时直接 TypeScript 编译报错
    // - 运行时若缺失，会给出安装提示
    let JSZip: any = null;
    try {
      // @ts-ignore
      JSZip = (await import('jszip')).default;
    } catch {
      alert('无法解压 ZIP：缺少依赖 jszip。请先安装：npm i jszip');
      return;
    }

    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const errors: string[] = [];
    const jsonFiles: Array<{ path: string; text: string }> = [];

    const entries = Object.values(zip.files) as any[];
    for (const f of entries) {
      if (f.dir) continue;
      const p = String(f.name || '');
      if (!p.toLowerCase().endsWith('.json')) {
        errors.push(`ZIP 包含非 JSON 文件：${p}`);
        continue;
      }
      try {
        const t = await f.async('string');
        jsonFiles.push({ path: p, text: t });
      } catch (err: any) {
        errors.push(`读取 JSON 失败：${p}（${String(err?.message ?? err)}）`);
      }
    }

    if (!jsonFiles.length) {
      alert(`ZIP 内未找到 .json 文件。${errors.length ? `\n\n${errors.slice(0, 10).join('\n')}` : ''}`);
      return;
    }

    for (const jf of jsonFiles) {
      try {
        runBatchImportFromText(jf.text, `ZIP 导入：${jf.path}`);
      } catch (err: any) {
        errors.push(`导入失败：${jf.path}（${String(err?.message ?? err)}）`);
      }
    }

    if (errors.length) {
      alert(`上传导入完成，但存在问题：\n\n${errors.slice(0, 15).join('\n')}${errors.length > 15 ? `\n...(共 ${errors.length} 条)` : ''}`);
    }
    setImportPanelOpen(false);
  } finally {
    setImportFileBusy(false);
  }
};



 const subTypeOptions =
  drawMode === 'none'
    ? []
    : getSubTypeOptions(drawMode as DrawMode).filter(k => k !== '默认');

// ========= 动态附加信息渲染（由 FORMAT_REGISTRY[subType].fields/groups 驱动） =========
const activeDef = FORMAT_REGISTRY[subType];
const isWorkflowStyleEditing =
  editingLayerId !== null &&
  editUiMode === 'workflow-style' &&
  activeEditorView !== null;

const setEditorDraftValue = (path: string, value: unknown) => {
  setEditorDraftValues(prev => ({ ...prev, [path]: value }));
};

const setValue = (key: string, value: any) => {
  setFeatureInfo((prev: any) => ({ ...prev, [key]: value }));
};

const setGroupItems = (groupKey: string, items: any[]) => {
  setGroupInfo(prev => ({ ...prev, [groupKey]: items }));
};

const coerceSelectValue = (field: any, raw: string) => {
  const opt = field.options?.find((o: any) => String(o.value) === raw);
  return opt ? opt.value : raw;
};

const renderField = (field: any, value: any, onChange: (v: any) => void) => {
  const label = field.optional ? `${field.label}（可选）` : field.label;

  // ===== 特殊输入：TRP 交易列表（支持多级 group；允许删除交易条目但至少保留 1 条） =====
  if (subType === '交易点' && field.key === 'TradeJSON') {
    // 优先使用 values.Trade；否则回退解析 TradeJSON 文本
    let tradeArr: TRPTradeGroup[] | undefined = (featureInfo as any)?.Trade;
    if (!Array.isArray(tradeArr)) {
      const txt = String((featureInfo as any)?.TradeJSON ?? '').trim();
      if (txt) {
        try {
          const parsed = JSON.parse(txt);
          if (Array.isArray(parsed)) tradeArr = parsed;
        } catch {
          // ignore, keep undefined
        }
      }
    }

    return (
      <div key={field.key} className="mb-2">
        <TRPTradeEditor
          value={tradeArr}
          onChange={(arr) => {
            // 写入 values.Trade 供 buildFeatureInfo 直接输出
            setValue('Trade', arr);
            // 同时同步 TradeJSON 以兼容旧数据导出/导入
            onChange(JSON.stringify(arr, null, 2));
          }}
        />
      </div>
    );
  }

  if (field.type === 'select') {
    const current = value ?? (field.options?.[0]?.value ?? '');
    return (
      <div key={field.key} className="mb-2">
        <label className="block text-xs font-semibold mb-1">{label}</label>
        <select
          className="w-full border p-1 rounded"
          value={String(current)}
          onChange={(e) => onChange(coerceSelectValue(field, e.target.value))}
        >
          {(field.options ?? []).map((o: any) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div key={field.key} className="mb-2">
        <label className="block text-xs font-semibold mb-1">{label}</label>
        <input
          type="number"
          className="w-full border p-1 rounded"
          placeholder={field.placeholder ?? field.key}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)} // 保留 ''，由 buildFeatureInfo/pickByFields 决定是否输出
        />
      </div>
    );
  }

  if (field.type === 'bool') {
    return (
      <div key={field.key} className="mb-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label className="text-xs font-semibold">{label}</label>
      </div>
    );
  }

  // text
  return (
    <div key={field.key} className="mb-2">
      <label className="block text-xs font-semibold mb-1">{label}</label>
      <input
        type="text"
        className="w-full border p-1 rounded"
        placeholder={field.placeholder ?? field.key}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

const makeEmptyItem = (fields: any[]) => {
  const obj: Record<string, any> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) {
      obj[f.key] = f.defaultValue;
      continue;
    }
    if (f.type === 'select') obj[f.key] = f.options?.[0]?.value ?? '';
    else if (f.type === 'bool') obj[f.key] = false;
    else obj[f.key] = '';
  }
  return obj;
};

// 用于 tags UI：如果导入/历史数据里出现不在 TAG_KEY_OPTIONS 中的 tagKey，
// 则统一回显为：tagKey=其他，tagKeyOther=原始 key。
const TAG_KEY_VALUE_SET = new Set(TAG_KEY_OPTIONS.map((o) => o.value));

const normalizeGroupInfoByDef = (def: any, groups: Record<string, any[]>) => {
  if (!def?.groups || !groups) return groups;
  let changed = false;
  const next: Record<string, any[]> = { ...groups };

  // tags：未知 key -> 其他
  const hasTags = def.groups.some((g: any) => g.key === 'tags');
  if (hasTags) {
    const items = Array.isArray(groups.tags) ? groups.tags : [];
    const mapped = items.map((it: any) => {
      const rawKey = String(it?.tagKey ?? '').trim();
      if (!rawKey) return it;
      if (rawKey === TAG_KEY_OTHER) {
        const other = String(it?.tagKeyOther ?? '').trim();
        if (other !== String(it?.tagKeyOther ?? '')) {
          changed = true;
          return { ...it, tagKeyOther: other };
        }
        return it;
      }
      if (!TAG_KEY_VALUE_SET.has(rawKey)) {
        changed = true;
        return { ...it, tagKey: TAG_KEY_OTHER, tagKeyOther: rawKey };
      }
      return it;
    });
    if (mapped !== items) {
      next.tags = mapped;
    }
  }

  // extensions：确保 extType 缺省时有默认值；null 类型时清空 extValue
  const hasExt = def.groups.some((g: any) => g.key === 'extensions');
  if (hasExt) {
    const items = Array.isArray(groups.extensions) ? groups.extensions : [];
    const mapped = items.map((it: any) => {
      const t = (it?.extType ?? EXT_VALUE_TYPE_TEXT) as string;
      if (t !== it?.extType) {
        changed = true;
        return { ...it, extType: t, extValue: t === EXT_VALUE_TYPE_NULL ? '' : it?.extValue ?? '' };
      }
      if (t === EXT_VALUE_TYPE_NULL && String(it?.extValue ?? '').trim() !== '') {
        changed = true;
        return { ...it, extValue: '' };
      }
      return it;
    });
    if (mapped !== items) {
      next.extensions = mapped;
    }
  }

  return changed ? next : groups;
};


const isWorkflowEditorBlankValue = (value: any): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

const compactWorkflowStyleGroupInfoByDef = (def: any, groups: Record<string, any[]>): Record<string, any[]> => {
  if (!def?.groups || !groups) return groups;

  let changed = false;
  const next: Record<string, any[]> = { ...groups };

  for (const g of def.groups ?? []) {
    const key = g?.key;
    if (!key || !g?.optional) continue;
    const items = Array.isArray(next[key]) ? next[key] : [];

    const filtered = items.filter((it: any) => {
      if (!it || typeof it !== 'object') return !isWorkflowEditorBlankValue(it);

      if (key === 'tags') {
        return !isWorkflowEditorBlankValue(it.tagValue) || !isWorkflowEditorBlankValue(it.tagKeyOther);
      }

      if (key === 'extensions') {
        const extType = String(it.extType ?? EXT_VALUE_TYPE_TEXT);
        const extKey = String(it.extKey ?? '').trim();
        const extValue = it.extValue;
        if (!extKey) return false;
        if (extType === EXT_VALUE_TYPE_NULL) return true;
        return !isWorkflowEditorBlankValue(extValue);
      }

      if (key === 'ConnectL') {
        return !isWorkflowEditorBlankValue(it.tgt ?? it.Tgt);
      }

      if (key === 'Blacklist') {
        return !isWorkflowEditorBlankValue(it.tgt ?? it.ID ?? it.id);
      }

      if (key === 'Mode') {
        return !isWorkflowEditorBlankValue(it.code ?? it.tgt ?? it.ID ?? it.id);
      }

      return (g.fields ?? []).some((f: any) => !isWorkflowEditorBlankValue(it?.[f.key]));
    });

    if (filtered.length !== items.length) {
      changed = true;
      next[key] = filtered;
    }
  }

  return changed ? next : groups;
};

const renderDynamicExtraInfo = () => {
  const hasFields = Array.isArray(activeDef?.fields) && activeDef.fields.length > 0;
  const hasGroups = Array.isArray(activeDef?.groups) && activeDef.groups.length > 0;

  return (
    <div className="mt-2">
      {!hasFields && !hasGroups && (
        <div className="text-xs text-gray-500">该类型无附加字段</div>
      )}
      {hasFields && (
        <div className="mb-3">
          {activeDef.fields.map((f: any) =>
            renderField(f, featureInfo?.[f.key], (v) => setValue(f.key, v))
          )}
        </div>
      )}

      {hasGroups && (
        <div className="space-y-3">
          {activeDef.groups!.map((g: any) => {
            const items: any[] = (groupInfo?.[g.key] ?? []) as any[];
            const safeItems = items;

            // ---------- extensions Step A/B：按 extGroup 分区 + 值类型选择逻辑 ----------
            const renderExtensionsGroup = () => {
              const extItems: any[] = safeItems;
              const byGroup = new Map<string, any[]>();
              for (const it of extItems) {
                const gg = String(it?.extGroup ?? '').trim() || '未命名';
                if (!byGroup.has(gg)) byGroup.set(gg, []);
                byGroup.get(gg)!.push(it);
              }

              const addGroup = () => {
                const gg = newExtGroupInput.trim();
                if (!gg) return;
                const next = extItems.concat([
                  {
                    extGroup: gg,
                    extKey: '',
                    extType: EXT_VALUE_TYPE_TEXT,
                    extValue: '',
                  },
                ]);
                setGroupItems(g.key, next);
                setNewExtGroupInput('');
              };

              const addFieldToGroup = (gg: string) => {
                const next = extItems.concat([
                  {
                    extGroup: gg === '未命名' ? '' : gg,
                    extKey: '',
                    extType: EXT_VALUE_TYPE_TEXT,
                    extValue: '',
                  },
                ]);
                setGroupItems(g.key, next);
              };

              const deleteGroup = (gg: string) => {
                const next = extItems.filter((it) => {
                  const g2 = String(it?.extGroup ?? '').trim() || '未命名';
                  return g2 !== gg;
                });
                setGroupItems(g.key, next);
              };

              const updateItem = (idxInAll: number, patch: Record<string, any>) => {
                const next = extItems.slice();
                const cur = { ...(next[idxInAll] ?? {}) };
                const merged = { ...cur, ...patch };
                // Step B：extType==null 时清空并禁用 extValue（UI 禁用在渲染里做）
                if (merged.extType === EXT_VALUE_TYPE_NULL) merged.extValue = '';
                next[idxInAll] = merged;
                setGroupItems(g.key, next);
              };

              const removeItem = (idxInAll: number) => {
                setGroupItems(g.key, extItems.filter((_, i) => i !== idxInAll));
              };

              // 为了在 grouped 渲染里能定位到“全局数组索引”，我们建立一次映射
              const indexOfItem = new Map<any, number>();
              extItems.forEach((it, i) => indexOfItem.set(it, i));

              const sortedGroups = Array.from(byGroup.keys()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="flex-1 border p-1 rounded text-sm"
                      placeholder="新增扩展组 extGroup（例如 poi / note）"
                      value={newExtGroupInput}
                      onChange={(e) => setNewExtGroupInput(e.target.value)}
                    />
                    <AppButton
                      className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                      type="button"
                      onClick={addGroup}
                    >
                      新增组
                    </AppButton>
                  </div>

                  {sortedGroups.length === 0 ? (
                    <div className="text-xs text-gray-500">暂无条目</div>
                  ) : (
                    <div className="space-y-3">
                      {sortedGroups.map((gg) => {
                        const rows = byGroup.get(gg) ?? [];
                        return (
                          <div key={gg} className="border rounded p-2">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-semibold">{gg}</div>
                              <div className="flex items-center gap-2">
                                <AppButton
                                  className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                                  type="button"
                                  onClick={() => addFieldToGroup(gg)}
                                >
                                  添加字段
                                </AppButton>
                                <AppButton
                                  className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                                  type="button"
                                  onClick={() => deleteGroup(gg)}
                                >
                                  删除组
                                </AppButton>
                              </div>
                            </div>

                            {rows.length === 0 ? (
                              <div className="text-xs text-gray-500">暂无字段</div>
                            ) : (
                              <div className="space-y-2">
                                {rows.map((row) => {
                                  const idxAll = indexOfItem.get(row) ?? -1;
                                  const extType = String(row?.extType ?? EXT_VALUE_TYPE_TEXT);
                                  const valueDisabled = extType === EXT_VALUE_TYPE_NULL;
                                  return (
                                    <div key={idxAll} className="border rounded p-2">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="text-xs font-semibold">#{idxAll + 1}</div>
                                        <AppButton
                                          className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                                          type="button"
                                          onClick={() => removeItem(idxAll)}
                                        >
                                          删除
                                        </AppButton>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                        <div>
                                          <label className="block text-xs font-semibold mb-1">字段名(extKey)</label>
                                          <input
                                            type="text"
                                            className="w-full border p-1 rounded"
                                            value={row?.extKey ?? ''}
                                            onChange={(e) => updateItem(idxAll, { extKey: e.target.value })}
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-xs font-semibold mb-1">值类型</label>
                                          <select
                                            className="w-full border p-1 rounded"
                                            value={extType}
                                            onChange={(e) => updateItem(idxAll, { extType: e.target.value })}
                                          >
                                            {EXT_VALUE_TYPE_OPTIONS.map((o) => (
                                              <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                          </select>
                                        </div>

                                        <div className="sm:col-span-2">
                                          <label className="block text-xs font-semibold mb-1">值(extValue)</label>
                                          <input
                                            type="text"
                                            className={`w-full border p-1 rounded ${valueDisabled ? 'bg-gray-100 text-gray-400' : ''}`}
                                            disabled={valueDisabled}
                                            placeholder={valueDisabled ? 'null 类型无需填写' : '请输入'}
                                            value={row?.extValue ?? ''}
                                            onChange={(e) => updateItem(idxAll, { extValue: e.target.value })}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div key={g.key} className="border rounded p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">{g.label}</div>
                  {g.key === 'extensions' ? null : (
                    <AppButton
                      className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                      onClick={() => setGroupItems(g.key, [...safeItems, makeEmptyItem(g.fields)])}
                      type="button"
                    >
                      {g.addButtonText ?? '添加'}
                    </AppButton>
                  )}
                </div>

                {g.key === 'extensions' ? (
                  renderExtensionsGroup()
                ) : (
                  safeItems.length === 0 ? (
                    <div className="text-xs text-gray-500">暂无条目</div>
                  ) : (
                    <div className="space-y-2">
                      {safeItems.map((it, idx) => (
                        <div key={idx} className="border rounded p-2">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold">#{idx + 1}</div>
                            <AppButton
                              className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                              onClick={() => setGroupItems(g.key, safeItems.filter((_, i) => i !== idx))}
                              type="button"
                            >
                              删除
                            </AppButton>
                          </div>

                          <div>
                            {g.fields.map((f: any) => {
                              // tags：仅当字段名=其他时显示 tagKeyOther
                              if (g.key === 'tags' && f.key === 'tagKeyOther') {
                                const k = String(it?.tagKey ?? '').trim();
                                if (k !== TAG_KEY_OTHER) return null;
                              }

                              return renderField(
                                f,
                                it?.[f.key],
                                (v) => {
                                  const nextItems = safeItems.slice();
                                  const nextItem = { ...(nextItems[idx] ?? {}) };

                                  // tags：切换字段名时处理“其他字段名”联动
                                  if (g.key === 'tags' && f.key === 'tagKey') {
                                    const vv = String(v ?? '').trim();
                                    nextItem.tagKey = vv;
                                    if (vv !== TAG_KEY_OTHER) {
                                      // 非“其他”：清空 tagKeyOther，避免一直显示/残留
                                      nextItem.tagKeyOther = '';
                                    } else {
                                      // “其他”：如为空则保留用户已有输入
                                      nextItem.tagKeyOther = String(nextItem.tagKeyOther ?? '').trim();
                                    }
                                    nextItems[idx] = nextItem;
                                    setGroupItems(g.key, nextItems);
                                    return;
                                  }

                                  nextItem[f.key] = v;
                                  nextItems[idx] = nextItem;
                                  setGroupItems(g.key, nextItems);
                                },
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 编辑者ID：用于系统字段 CreateBy/ModifityBy 的自动写入 */}
      {subType !== '默认' && (
        <div className="mt-3 border-t pt-2">
          <label className="block text-xs font-semibold mb-1">编辑者ID</label>
          <input
            type="text"
            className="w-full border p-1 rounded"
            placeholder="可选：用于写入 CreateBy / ModifityBy"
            value={editorIdInput}
            onChange={(e) => setEditorIdInput(e.target.value)}
          />
          <div className="text-[11px] text-gray-500 mt-1">
            初次绘制完成时（非空）写入 CreateBy；编辑保存时（非空）写入 ModifityBy。
          </div>
        </div>
      )}
    </div>
  );
};

useEffect(() => {
  const mq = window.matchMedia('(max-width: 639px)'); // < sm
  const sync = () => {
    if (!mq.matches) return;

    // 进入移动端：强制关闭并停止所有绘制/编辑
    setMeasuringActive(false);
    setImportPanelOpen(false);

    setDrawing(false);
    setDrawMode('none');
    setTempPoints([]);
    setRedoStack([]);
    setEditingLayerId(null);

    clearDraftOverlays();
    setShowDraftControlPoints(false);
    setShowDraftControlPointCoords(false);

  };

  sync();
  mq.addEventListener('change', sync);
  return () => mq.removeEventListener('change', sync);
}, []);

const resetFeatureFormToDefault = () => {
  setSubType('默认');
  const hydrated = FORMAT_REGISTRY['默认'].hydrate({});
  setFeatureInfo(hydrated.values ?? {});
  setGroupInfo(hydrated.groups ?? {});
  resetWorkflowStyleEditorState();
};

const handleDrawModeButtonClick = (m: 'point' | 'polyline' | 'polygon') => {
  if (guardTempMountReadonly()) return;
  requestSwitchWithExtraWarn(() => {
    const sameMode = drawMode === m;

    // 二次点击同一模式：关闭回到 none
    if (sameMode) {
      // 只要会清空草稿/临时点，就做二次确认（与你“和 .5/.0 类似”的交互一致）
      if (tempPoints.length > 0) {
        if (!confirm('取消当前模式将清空当前临时图形？')) return;
      }

      // 统一清理草稿（避免端点/控制点残留）
      clearDraftOverlays();
      setTempPoints([]);
      setRedoStack([]);

      resetSpecialDrafts();

      setDrawMode('none');
      setDrawing(false);

      resetFeatureFormToDefault();
      return;
    }

    // 切换到另一模式
    if (tempPoints.length > 0 && drawMode !== 'none') {
      if (!confirm('切换模式将清空当前临时图形？')) return;

      // 统一清理草稿（避免端点/控制点残留）
      clearDraftOverlays();
      setTempPoints([]);
      setRedoStack([]);
    } else {
      // 即便没有 tempPoints，切换模式也应清理“最新端点指示”
      draftEndpointRef.current?.clearLayers();
    }
    resetSpecialDrafts();

    setDrawMode(m);
    setDrawing(true);

    resetFeatureFormToDefault();
  });
};

// =========================
// Workflow（快捷模式）桥接层
// =========================
const legacyWorkflowRegistry: WorkflowRegistry = {
  railway: RailwayWorkflow,
  station: StationWorkflow,
  tpp_point: TeleportPointWorkflow,
  wrp_point: WarpPointWorkflow,
  trp_point: TradePointWorkflow,
  rod_road: RoadWorkflow,
  ngf_land: NaturalLandWorkflow,
  ngf_lis: NaturalLandSurfaceWorkflow,
  ngf_wtb: NaturalWaterbodyWorkflow,
  ngf_wtr: NaturalWaterwayWorkflow,
  ngf_bod: NaturalBoundaryWorkflow,
  adm_dbz_set: SettlementBoundaryDeterminedWorkflow,
  adm_plz_plan: SettlementBoundaryPlannedWorkflow,
  adm_line_settlement: SettlementBoundaryLineWorkflow,
  adm_point_special: SpecialCulturalPointWorkflow,
  bud_building: BuildingWorkflow,
  flr_unit: FloorUnitWorkflow,
};


const LEGACY_WORKFLOW_SELECT_OPTIONS: Array<{ key: WorkflowKey; label: string; hidden?: boolean }> = [
  { key: 'railway', label: '铁路' },
  { key: 'station', label: '车站和站台' },
  { key: 'rod_road', label: '道路' },
  { key: 'bud_building', label: '建筑' },
  { key: 'flr_unit', label: '楼内单元' },
  { key: 'ngf_land', label: '自然要素-陆地' },
  { key: 'ngf_lis', label: '自然要素-陆面要素' },
  { key: 'ngf_wtb', label: '自然要素-水域' },
  { key: 'ngf_wtr', label: '自然要素-河道' },
  { key: 'adm_dbz_set', label: '聚落范围-确定范围' },
  { key: 'adm_plz_plan', label: '聚落范围-规划范围' },
  { key: 'tpp_point', label: '传送点' },
  { key: 'wrp_point', label: 'Warp点' },
  { key: 'trp_point', label: '交易点' },
  { key: 'ngf_bod', label: '自然要素-地理边界' },
  { key: 'adm_line_settlement', label: '聚落边界线要素' },
  { key: 'adm_point_special', label: '特殊人文点要素' },

];

const workflowRegistry: WorkflowRegistry = getConfigDrivenWorkflowRegistry(legacyWorkflowRegistry);
const WORKFLOW_SELECT_OPTIONS: Array<{ key: WorkflowKey; label: string; hidden?: boolean }> =
  getConfigDrivenWorkflowSelectOptions(LEGACY_WORKFLOW_SELECT_OPTIONS);


const stopWorkflowToSelector = () => {
  // 回到“工作流初始选择页面”（不退出测绘）
  setWorkflowRunning(false);

  // 清空草稿与预览（保留 fixed 图层不动）
  workflowRootRef.current?.clearLayers();
  workflowPreviewMapRef.current.clear();
  clearDraftOverlays();

  setTempPoints([]);
  setRedoStack([]);
  setDrawing(false);
  setDrawMode('none');
};

const startWorkflow = () => {
  if (guardTempMountReadonly()) return;
  if (workflowRunning) return;

  try {
    void describeWorkflowRuntimeSelection(workflowKey);
  } catch {
    // config-driven workflow diagnostics should never block legacy workflow startup
  }

  // 快捷模式下：开始工作流前重置草稿/临时输出（保持 fixed 不动）
  workflowRootRef.current?.clearLayers();
  workflowPreviewMapRef.current.clear();
  clearDraftOverlays();

  setTempPoints([]);
  setRedoStack([]);
  setDrawing(false);
  setDrawMode('none');

  // 为避免 UI 中残留的 subtype/附加信息影响（工作流运行中会隐藏这些区域），这里统一回到默认
  resetFeatureFormToDefault();

  setWorkflowRunning(true);
};

// 从 coords 生成 Leaflet 图形组（用于 fixed 图层保存）
const makeLeafletGroupForCoords = (mode: DrawMode, coords: { x: number; z: number }[], color: string) => {
  const proj = projectionRef.current;
  if (!proj) return L.layerGroup();

  const g = L.layerGroup();
  const latlngs = coords.map(p => proj.locationToLatLng(p.x, 64, p.z));

  if (mode === 'point') {
    latlngs.forEach(ll => {
      L.circleMarker(ll, { color, fillColor: color, radius: 6 }).addTo(g);
    });
  } else if (mode === 'polyline') {
    L.polyline(latlngs, { color }).addTo(g);
  } else if (mode === 'polygon') {
    if (latlngs.length > 2) L.polygon(latlngs, { color }).addTo(g);
    else L.polyline(latlngs, { color }).addTo(g);
  }
  return g;
};

const upsertWorkflowPreview = (
  key: string,
  kind: WorkflowPreviewKind,
  points: WorldPoint[],
  style?: WorkflowPreviewStyle
) => {
  const proj = projectionRef.current;
  const root = workflowRootRef.current;
  if (!proj || !root) return;

  // remove old
  const old = workflowPreviewMapRef.current.get(key);
  if (old) root.removeLayer(old);

  const color = style?.color ?? drawColorRef.current;
  const weight = style?.weight ?? 4;
  const dashArray = style?.dashArray;

  const latlngs = (points ?? []).map(p => proj.locationToLatLng(p.x, 64, p.z));

  let layer: L.Layer;
  if (kind === 'point') {
    if (latlngs.length === 0) return;
    layer = L.circleMarker(latlngs[0], { color, fillColor: color, radius: 6 });
  } else if (kind === 'polygon') {
    layer = L.polygon(latlngs, { color, weight, dashArray } as any);
  } else {
    layer = L.polyline(latlngs, { color, weight, dashArray } as any);
  }

  layer.addTo(root);
  workflowPreviewMapRef.current.set(key, layer);
};

const clearWorkflowPreview = (key?: string) => {
  const root = workflowRootRef.current;
  if (!root) return;

  if (!key) {
    workflowPreviewMapRef.current.forEach((layer) => root.removeLayer(layer));
    workflowPreviewMapRef.current.clear();
    return;
  }

  const old = workflowPreviewMapRef.current.get(key);
  if (old) {
    root.removeLayer(old);
    workflowPreviewMapRef.current.delete(key);
  }
};

const commitFeatureFromWorkflow = (args: WorkflowCommitArgs) => {
  const map = leafletMapRef.current;
  const proj = projectionRef.current;
  if (!map || !proj) return { ok: false as const, error: '地图未就绪' };

  const def = FORMAT_REGISTRY[args.subType] ?? FORMAT_REGISTRY['默认'];

  const req = validateRequiredDetailed(def, args.values ?? {}, args.groupInfo ?? {});
  if (!req.ok) {
    const detail = formatMissingEntries(req.missing);
    return { ok: false as const, error: `无法保存，部分必填的附加信息为空：\n${detail}` };
  }

  const now = new Date();
  const editorId = (args.editorId ?? editorIdInput ?? '').trim();

  const finalFeatureInfo = def.buildFeatureInfo({
    op: 'create',
    mode: args.mode as DrawMode,
    coords: args.coords,
    values: args.values ?? {},
    groups: args.groupInfo ?? {},
    worldId: currentWorldId,
    editorId,
    prevFeatureInfo: undefined,
    now,
  });

  const id = nextLayerId.current++;
  const color = args.color ?? drawColor;
  const newGroup = makeLeafletGroupForCoords(args.mode as DrawMode, args.coords, color);

  const layerObj: LayerType = {
    id,
    mode: args.mode as any,
    color,
    coords: args.coords,
    visible: true,
    leafletGroup: newGroup,
    jsonInfo: {
      subType: args.subType,
      featureInfo: finalFeatureInfo,
    },
  };

  setLayers(prev => {
    const next = [...prev, layerObj];
    syncFixedRoot(next, null);
    return next;
  });

  return { ok: true as const, layerId: id };
};

const workflowBridge: WorkflowBridge = {
  getCurrentWorldId: () => currentWorldId,
  getEditorId: () => editorIdInput,
  setEditorId: (id: string) => setEditorIdInput(id),

  setDrawMode: (mode: 'none' | DrawMode) => {
    // 工作流内部切换模式：不走 UI 确认弹窗
    if (mode === 'none') {
      clearDraftOverlays();
      setTempPoints([]);
      setRedoStack([]);
      setEditingLayerId(null);
      setDrawing(false);
      setDrawMode('none');
      drawModeRef.current = 'none';
      resetSpecialDrafts();
      return;
    }

    clearDraftOverlays();
    setRedoStack([]);
    setEditingLayerId(null);
    setDrawMode(mode);
    drawModeRef.current = mode as any;
    setDrawing(true);
    resetSpecialDrafts();
  },

  suspendDrawMode: () => {
    setEditingLayerId(null);
    setDrawing(false);
    setDrawMode('none');
    drawModeRef.current = 'none';
    resetSpecialDrafts();
  },

  setDrawColor: (hex: string) => setDrawColor(hex),

  getTempPoints: () => tempPoints,
  setTempPoints: (pts: WorldPoint[]) => {
    const next = (pts ?? []) as any;
    setTempPoints(next);
    // 同步草稿几何显示（避免 setState 异步导致绘制模式滞后）
    drawDraftGeometry(next, drawModeRef.current, drawColorRef.current);
  },
  clearTempPoints: () => {
    setTempPoints([]);
    clearDraftOverlays();
  },

  requestUndo: () => handleUndo(),
  requestRedo: () => handleRedo(),

  upsertWorkflowPreview,
  clearWorkflowPreview,

  commitFeature: commitFeatureFromWorkflow,

  getCommittedLayerJsonInfos: () => {
    return (layers ?? []).map((l: any) => l?.jsonInfo).filter(Boolean) as any;
  },

  getDeleteMarkedFeatureIds: () => {
    return (relayPackageDraft.deleteMarks ?? []).map((x) => String(x?.ID ?? '').trim()).filter(Boolean);
  },

  exitWorkflowToSelector: () => stopWorkflowToSelector(),
};

  const measureDropdownMenu = (
    <AppCard
      className={`w-44 border border-gray-200 py-1 transition-all duration-150 ${
        measureDropdownOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      onMouseDownCapture={() => focusMeasureDropdown()}
    >
      {/* 开始测绘（完整/快捷） 或 结束测绘 */}
      {!measuringActive ? (
        <>
          <AppButton
            onClick={() => startMeasuringFromMenu('full')}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors text-gray-700"
            type="button"
          >
            <Pencil className="w-4 h-4" />
            <span>开始测绘(完整)</span>
          </AppButton>

          <AppButton
            onClick={() => startMeasuringFromMenu('workflow')}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors text-gray-700"
            type="button"
          >
            <Pencil className="w-4 h-4" />
            <span>开始测绘(快捷)</span>
          </AppButton>
        </>
      ) : (
        <>
          <AppButton
            onClick={() => switchMeasuringVariantFromMenu('full')}
            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
              measuringVariant === 'full'
                ? 'text-gray-400 cursor-not-allowed'
                : 'hover:bg-gray-50 text-gray-700'
            }`}
            type="button"
            disabled={measuringVariant === 'full'}
            title={measuringVariant === 'full' ? '当前已是完整模式' : '切换到完整测绘模式'}
          >
            <Pencil className="w-4 h-4" />
            <span>切换到完整模式</span>
          </AppButton>

          <AppButton
            onClick={() => switchMeasuringVariantFromMenu('workflow')}
            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
              measuringVariant === 'workflow'
                ? 'text-gray-400 cursor-not-allowed'
                : 'hover:bg-gray-50 text-gray-700'
            }`}
            type="button"
            disabled={measuringVariant === 'workflow'}
            title={measuringVariant === 'workflow' ? '当前已是快捷模式' : '切换到快捷测绘模式'}
          >
            <Pencil className="w-4 h-4" />
            <span>切换到快捷模式</span>
          </AppButton>

          <AppButton
            onClick={endMeasuringFromMenu}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors text-gray-700"
            type="button"
          >
            <X className="w-4 h-4" />
            <span className="font-medium">结束测绘</span>
          </AppButton>
        </>
      )}

      {/* 导入数据：仅开始测绘后显示 */}
      {measuringActive && (
        <AppButton
          onClick={() => setImportPanelOpen(true)}
          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors text-gray-700"
          type="button"
        >
          <Upload className="w-4 h-4" />
          <span>导入数据</span>
        </AppButton>
      )}

      {/* 清空所有图层 */}
      <AppButton
        onClick={clearAllLayers}
        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors text-gray-700"
        type="button"
      >
        <Trash2 className="w-4 h-4" />
        <span>清空所有图层</span>
      </AppButton>
    </AppCard>
  );

  const measureDropdownPortal = measureDropdownDesktop && measureDropdownOpen && measureDropdownPortalRoot && measureDropdownRect
    ? createPortal(
        <div
          className="fixed pointer-events-auto origin-top-right"
          style={{
            top: measureDropdownRect.top,
            right: measureDropdownRect.right,
            zIndex: measureDropdownZIndex,
          }}
          onMouseDownCapture={() => focusMeasureDropdown()}
        >
          {measureDropdownMenu}
        </div>,
        measureDropdownPortalRoot
      )
    : null;

  const launcherContent = (
    <div ref={measureLauncherRef} className="relative">
      <ToolIconButton
        label="测绘"
        icon={<Pencil className="w-5 h-5" />}
        active={measuringActive}
        tone="blue"
        onClick={toggleMeasureDropdown}
        className="h-11 w-11"
      />

      {/* 移动端仍使用局部定位；桌面端通过桌面窗口 root portal 接入统一层级栈。 */}
      {!measureDropdownDesktop ? (
        <div className="absolute right-0 z-50 max-md:bottom-full max-md:mb-2 max-md:origin-bottom-right">
          {measureDropdownMenu}
        </div>
      ) : null}
      {measureDropdownPortal}
    </div>
  );

  // ======== 图层管理：临时挂载(全局)切换（存在即移除） ========
  const cancelTempMountConflict = () => {
    setTempMountConflictOpen(false);
    setTempMountConflictText('');
    setTempMountConflictAllowOverride(false);
    setTempMountPendingLayers(null);
    setTempMountPendingOverrideIds([]);
  };

  const confirmTempMountConflictOverride = () => {
    if (!tempMountPendingLayers || tempMountPendingLayers.length === 0) {
      cancelTempMountConflict();
      return;
    }

    // 写入覆盖屏蔽列表：固定数据源中同 ID 的要素在挂载期间不可读
    const all = readTempRuleOverrideIds();
    writeTempRuleOverrideIds({ ...all, [currentWorldId]: tempMountPendingOverrideIds });
    syncTempRuleDeleteIdsForCurrentWorld();

    // 通过确认：批量挂载所有图层（仅用于测试显示/去重/关联）
    mountAllLayersToTempSources(tempMountPendingLayers);
    setTempMountAllActive(true);
    // 挂载模式下仅观看：隐藏测绘图层显示，避免与规则渲染叠加
    fixedRootRef.current?.clearLayers();

    cancelTempMountConflict();
  };

  const toggleTempMountAllLayers = async (layerList: LayerType[], busy: boolean) => {
    if (busy) return;
    const ids = layerList.map((l) => l.id);

    // 已挂载：移除所有 layer-* 临时源，并恢复测绘图层显示（存在即移除）
    if (tempMountAllActive) {
      removeAllTempMountedLayersForWorld(ids);
      // 退出挂载：清除“覆盖屏蔽列表”，恢复固定数据源可读
      clearTempRuleOverrideIdsForWorld();
      clearTempRuleDeleteIdsForWorld();
      setTempMountAllActive(false);
      // 恢复 fixedRoot 显示（避免退出挂载后仍然空白）
      syncFixedRoot(layers, editingLayerId);
      return;
    }

    // 未挂载：先做“全局数据库（RULE_DATA_SOURCES 全文件）”ID 重复性检查
    const candidates: TempLayerIdCandidate[] = layerList
      .map((l) => ({
        title: getLayerDisplayTitle(l),
        id: getLayerPrimaryIdValue(l),
      }))
      .filter((c) => String(c.id ?? '').trim().length > 0);

    let shown = false;
    const timer = window.setTimeout(() => {
      shown = true;
      setTempMountIdCheckText('正在对比临时图层ID...');
      setTempMountIdCheckOpen(true);
    }, 1000);

    try {
      // 新挂载：先清理上一次残留的覆盖屏蔽列表
      clearTempRuleOverrideIdsForWorld();
      clearTempRuleDeleteIdsForWorld();

      setTempMountIdCheckText('正在读取全局数据库要素索引...');
      const res = await checkTempMountIdConflictsDetailed({ worldId: currentWorldId, candidates });
      if (res.messages.length > 0) {
        if (shown) setTempMountIdCheckOpen(false);

        // 内部冲突：临时图层之间已冲突 —— 不能提供“确定/更新挂载”入口
        if (res.internalConflict) {
          setTempMountConflictText(res.messages.join('\n'));
          setTempMountConflictAllowOverride(false);
          setTempMountPendingLayers(null);
          setTempMountPendingOverrideIds([]);
          setTempMountConflictOpen(true);
          return;
        }

        // 全局冲突：提供“返回/更新挂载”两个选项（使用站内弹窗，避免浏览器 confirm 被拦截）
        setTempMountConflictText(
          `${res.messages.join('\n')}\n\n是否要“更新挂载”？\n- 返回：不挂载\n- 确定：更新挂载（用临时图层覆盖同ID要素）`
        );
        setTempMountConflictAllowOverride(true);
        setTempMountPendingLayers(layerList);
        setTempMountPendingOverrideIds(res.conflictIds);
        setTempMountConflictOpen(true);
        return;
      }
    } finally {
      window.clearTimeout(timer);
      if (shown) setTempMountIdCheckOpen(false);
    }

    // 通过检查：批量挂载所有图层（仅用于测试显示/去重/关联）
    syncTempRuleDeleteIdsForCurrentWorld();
    mountAllLayersToTempSources(layerList);
    setTempMountAllActive(true);
    // 挂载模式下仅观看：隐藏测绘图层显示，避免与规则渲染叠加
    fixedRootRef.current?.clearLayers();
  };

  const layerPanelCard = (
    <AppCard className="w-96 overflow-hidden border" style={{ maxHeight: '70vh' }}>
      <div ref={layerMgrCardRef}>
      {/* 标题栏（拖拽区域：前 48px） */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-bold text-gray-800">图层</h3>
        <AppButton
          onClick={closeMeasuringUI}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          aria-label="关闭"
          title="退出测绘并清理"
          type="button"
        >
          <X className="w-4 h-4" />
        </AppButton>
      </div>

      {(() => {
        const busy = (drawing && drawMode !== 'none') || editingLayerId !== null;
        // “快捷测绘模式(便捷)”启用时（面板处于 workflow 变体），禁止图层编辑：
        // 该限制不依赖 measuringActive（因为图层栏可在多种状态下被打开）。
        const quickMeasuringActive = measuringVariant === 'workflow';
        const visibleList = layers.filter((l) => l.id !== editingLayerId);
        const hasDefaultLayer = visibleList.some((l) => (l?.jsonInfo?.subType ?? '默认') === '默认');
        const hasRelayExportContent = visibleList.length > 0 || relayPackageDraft.deleteMarks.length > 0;
        const relayExportTitle = busy
          ? '当前有要素正在编辑/绘制，请先保存'
          : !hasRelayExportContent
            ? '暂无可导出内容'
            : visibleList.length === 0
              ? '导出仅含删除标记的标准包'
              : '导出当前图层管理区为标准包';

        return (
          <>
            {/* 标题下按钮行：整体JSON + 临时挂载（全局） */}
            <div className="flex items-center gap-2 px-4 py-2 border-b">
              <AppButton
                type="button"
                className={`px-2 py-1 text-sm rounded border ${
                  busy || visibleList.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-200'
                    : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-300'
                }`}
                title={
                  busy
                    ? '当前有要素正在编辑/绘制，无法整体导出'
                    : visibleList.length === 0
                      ? '暂无图层'
                      : '导出图层管理区全部图层 JSON'
                }
                disabled={busy || visibleList.length === 0}
                onClick={() => {
                  if (busy || visibleList.length === 0) return;
                  setJsonExportSubType('__ALL__');
                  setJsonPanelText(getLayersJSONOutputBySubType('__ALL__'));
                  setJsonPanelOpen(true);
                }}
              >
                整体JSON
              </AppButton>

              <AppButton
                type="button"
                className={`px-2 py-1 text-sm rounded border ${
                  busy || visibleList.length === 0 || hasDefaultLayer
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-200'
                    : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-300'
                }`}
                title={
                  busy
                    ? '当前有要素正在编辑/绘制，无法导出'
                    : visibleList.length === 0
                      ? '暂无图层'
                      : hasDefaultLayer
                        ? '存在默认图层，无法导出简略CSV'
                        : '导出 Type,Class,World,ID,Name 简略CSV（便于快速维护检查）'
                }
                disabled={busy || visibleList.length === 0 || hasDefaultLayer}
                onClick={() => {
                  if (busy || visibleList.length === 0 || hasDefaultLayer) return;
                  const csv = buildBriefCsvFromLayers(visibleList, currentWorldId);
                  const now = new Date();
                  const y = String(now.getFullYear());
                  const m = String(now.getMonth() + 1).padStart(2, '0');
                  const d = String(now.getDate()).padStart(2, '0');
                  const filename = `brief_${y}${m}${d}.csv`;
                  downloadTextFile(csv, filename, 'text/csv;charset=utf-8');
                }}
              >
                简略CSV文件
              </AppButton>

              <AppButton
                type="button"
                className={`px-2 py-1 text-sm rounded border ${
                  busy || visibleList.length === 0 || (!tempMountAllActive && hasDefaultLayer)
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-200'
                    : tempMountAllActive
                      ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                      : 'bg-emerald-200 text-emerald-900 border-emerald-300 hover:bg-emerald-300'
                }`}
                title={
                  busy
                    ? '当前有要素正在编辑/绘制，请先保存'
                    : visibleList.length === 0
                      ? '暂无图层'
                      : (!tempMountAllActive && hasDefaultLayer)
                        ? '存在默认图层，无法挂载'
                      : tempMountAllActive
                        ? '取消临时挂载（存在即移除）'
                        : '临时挂载所有图层到规则图层（用于测试显示/去重/关联）'
                }
                disabled={busy || visibleList.length === 0 || (!tempMountAllActive && hasDefaultLayer)}
                onClick={() => void toggleTempMountAllLayers(visibleList, busy)}
              >
                {tempMountAllActive ? '取消临时挂载' : '临时挂载'}
              </AppButton>

              <AppButton
                type="button"
                className={`px-2 py-1 text-sm rounded border ${busy || !hasRelayExportContent ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-300'}`}
                title={relayExportTitle}
                disabled={busy || !hasRelayExportContent}
                onClick={() => { if (!busy && hasRelayExportContent) setRelayPackageExportOpen(true); }}
              >
                导出标准包
              </AppButton>

              <AppButton
                type="button"
                className="px-2 py-1 text-sm rounded border bg-white text-gray-800 hover:bg-gray-50 border-gray-300"
                title="查看待删除标记"
                onClick={() => { setDeletePickedCandidate(null); setDeleteMapPickEnabled(false); setDeletePanelOpen(true); }}
              >
                删除要素
              </AppButton>
            </div>

            <div className="px-4 py-2 border-b text-xs text-gray-600 space-y-1">
              <div><span className="font-bold">标准包状态：</span>{relayDraftStatusLabel(relayPackageDraft.meta.draftStatus)}</div>
              {relayDraftShowsMeta(relayPackageDraft.meta.draftStatus) ? (
                <div><span className="font-bold">Operator：</span>{relayPackageDraft.meta.operator || '-'}</div>
              ) : null}
              {relayDraftShowsMeta(relayPackageDraft.meta.draftStatus) ? (
                <div><span className="font-bold">Note：</span>{relayPackageDraft.meta.note || '-'}</div>
              ) : null}
              <div><span className="font-bold">待删除：</span>{relayPackageDraft.deleteMarks.length}　<span className="font-bold">已绑定图片：</span>{countActiveRelayPictures(relayPackageDraft)}</div>
              <div>
                {relayDraftShowsMeta(relayPackageDraft.meta.draftStatus) ? (
                  <><span className="font-bold">包版本：</span>{relayPackageDraft.meta.packageVersion ?? '-'}　</>
                ) : null}
                <span className="font-bold">更新时间：</span>{relayPackageDraft.meta.updatedAt || '-'}
              </div>
            </div>

            {relayPackageDraft.deleteMarks.length > 0 && (
              <div className="px-4 py-2 border-b text-xs text-gray-700 bg-rose-50/60 space-y-1">
                <div className="font-bold text-rose-800">待删除标记</div>
                <div className="flex flex-wrap gap-1">
                  {relayPackageDraft.deleteMarks.map((it) => (
                    <button
                      key={it.ID}
                      type="button"
                      className="px-2 py-0.5 rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                      title={it.ID}
                      onClick={() => setRelayPackageDraft((prev) => ({
                        ...prev,
                        deleteMarks: prev.deleteMarks.filter((x) => x.ID !== it.ID),
                        meta: { ...prev.meta, updatedAt: new Date().toISOString() },
                      }))}
                    >
                      {it.Name || it.ID}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 顶部横向滚动条：始终可见 */}
            <div className="px-3 pt-2">
              <div
                ref={layerMgrTopXRef}
                className="overflow-x-auto overflow-y-hidden h-3 rounded bg-gray-50 border"
                title="左右滑动"
              >
                <div ref={layerMgrSpacerRef} className="h-1" />
              </div>
            </div>

            {/* 列表：纵向滚动 + 横向滚动（与顶部同步） */}
            <div className="px-3 pb-3">
              <div
                ref={layerMgrBodyRef}
                className="overflow-y-auto overflow-x-auto"
                style={{ maxHeight: layerMgrListMaxHeight }}
              >
                <div className="min-w-max">
                {visibleList.map((l) => {
                  const entry = getTempMountedEntryByLayer(l.id);
                  const enabled = entry ? Boolean(entry.enabled) : false;

                  // 挂载模式：仅显示 enabled 开关（true/false）与标题
                  if (tempMountAllActive) {
                    return (
                      <div key={l.id} className="flex items-center gap-2 mb-1 whitespace-nowrap min-w-[520px]">
                        <AppButton
                          type="button"
                          className={`px-2 py-1 text-sm rounded border ${
                            enabled
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-gray-200 text-gray-700 border-gray-300'
                          }`}
                          onClick={() => setTempMountedEnabledForLayer(l.id, !enabled)}
                          title="作为规则图层开关：enabled=true/false"
                        >
                          {enabled ? 'enabled=true' : 'enabled=false'}
                        </AppButton>

                        <div className="flex-1 text-sm truncate">
                          {getLayerDisplayTitle(l)}
                          <span className="text-gray-400"> {String(l.jsonInfo?.subType ?? l.mode)}</span>
                        </div>
                      </div>
                    );
                  }

                  // 普通模式：保留原图层管理能力（不再提供单图层“临时挂载”按钮）
                  const toolbarExpanded = Boolean(expandedLayerToolbars[l.id]);
                  return (
                    <div key={l.id} className="flex items-center gap-1 mb-1 whitespace-nowrap min-w-[640px]">
                      <AppButton
                        className="px-2 py-1 text-sm border bg-white"
                        onClick={() => setExpandedLayerToolbars((prev) => ({ ...prev, [l.id]: !prev[l.id] }))}
                        type="button"
                        title={toolbarExpanded ? '收起工具栏' : '展开工具栏'}
                      >
                        {toolbarExpanded ? '<' : '>'}
                      </AppButton>

                      <AppButton
                        className="px-2 py-1 text-sm border bg-white"
                        onClick={() => { setPicturePanelLayerId(l.id); setPicturePanelOpen(true); }}
                        type="button"
                        title="要素绑定图片"
                      >
                        图
                      </AppButton>

                      {toolbarExpanded ? (
                        <>
                          <AppButton
                            className={`px-2 py-1 text-sm ${l.visible ? 'bg-green-300' : 'bg-gray-300'}`}
                            onClick={() => toggleLayerVisible(l.id)}
                            type="button"
                          >
                            {l.visible ? '隐藏' : '显示'}
                          </AppButton>

                          <AppButton className="px-2 py-1 text-sm bg-blue-200" onClick={() => moveLayerUp(l.id)} type="button">↑</AppButton>
                          <AppButton className="px-2 py-1 text-sm bg-blue-200" onClick={() => moveLayerDown(l.id)} type="button">↓</AppButton>

                          <AppButton
                            className={`px-2 py-1 text-sm ${(busy || quickMeasuringActive) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-yellow-300 hover:bg-yellow-400'}`}
                            disabled={busy || quickMeasuringActive}
                            onClick={() => { if (busy || quickMeasuringActive) return; editLayer(l.id); }}
                            type="button"
                            title={busy ? '当前有要素正在编辑/绘制，请先保存' : quickMeasuringActive ? '快捷测绘模式启用时禁止编辑图层（避免图层被转移导致卡死）' : '编辑'}
                          >编辑</AppButton>

                          <AppButton className="px-2 py-1 text-sm bg-red-400 text-white" onClick={() => deleteLayer(l.id)} type="button">删除</AppButton>

                          <AppButton
                            className="px-3 py-1 text-sm bg-purple-400 text-white"
                            onClick={() => { setJsonPanelText(getLayerJSONOutput(l)); setJsonPanelOpen(true); }}
                            type="button"
                          >JSON</AppButton>
                        </>
                      ) : null}

                      <div className="flex-1 text-sm truncate">
                        {getLayerDisplayTitle(l)}
                        <span className="text-gray-400"> {String(l.jsonInfo?.subType ?? l.mode)}</span>
                        <span style={{ color: l.color }} className="ml-1">■</span>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          </>
        );
      })()}
      </div>
    </AppCard>
  );



// 1) 启动按钮节点：允许被外部收纳，但不要影响其它面板渲染
const launcherNode = launcherSlot ? (
  launcherSlot(launcherContent)
) : (
  <div className="hidden sm:block">
    <div className="fixed top-4 right-4 z-[1001]">
      {launcherContent}
    </div>
  </div>
);

// 2) 桌面端图层管理：仅在 measuringActive 时出现（与测绘主面板一致：可拖拽，关闭=退出测绘并清理）
const layerManagerDesktopNode = measuringActive ? (
  <div className="hidden sm:block">
    <DraggablePanel
      id="measuring-layers"
      defaultPosition={{ x: 960, y: 120 }}
      zIndex={1790}
      constrainExpandedToViewport
    >
      {layerPanelCard}
    </DraggablePanel>
  </div>
) : null;

// 3) 合并输出：launcherSlot 只影响 launcher，不再“短路”图层管理
const rightDockNode = (
  <>
    {launcherNode}
    {layerManagerDesktopNode}
  </>
);





const measuringWindowActions = (
  <>
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setFeatureInteractionSuppressionEnabled((v) => !v);
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
        featureInteractionSuppressionEnabled
          ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
          : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600'
      }`}
      aria-label="要素交互抑制"
      title={featureInteractionSuppressionEnabled ? '要素交互抑制已开启：绘图时不再点开要素信息卡' : '要素交互抑制已关闭：绘图时允许点击要素信息卡'}
    >
      <MousePointerClick className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setToolPanelDisplaySuppressionEnabled((v) => !v);
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
        toolPanelDisplaySuppressionEnabled
          ? 'border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100'
          : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600'
      }`}
      aria-label="工具栏显示抑制"
      title={toolPanelDisplaySuppressionEnabled ? '工具栏显示抑制已开启：未绘图时隐藏辅助工具区' : '工具栏显示抑制已关闭：辅助工具区始终显示'}
    >
      <EyeOff className="h-4 w-4" />
    </button>
  </>
);





  return (
    <>
      {rightDockNode}

      {/* =========================
          测绘菜单：桌面端（可拖拽）
         ========================= */}
      {measuringActive && (
        <div className="hidden sm:block">
          <DraggablePanel
            id="measuring-main"
            defaultPosition={{ x: 16, y: 240 }}
            zIndex={1800}
            expandedHeaderActions={measuringWindowActions}
          >
            <AppCard className="w-96 max-h-[70vh] overflow-hidden border" data-draggable-proxy-close="true">
              {/* 标题栏（拖拽区域） */}
              <div className="flex items-center px-4 py-3 pr-40 border-b">
                <h3 className="font-bold text-gray-800" data-draggable-title>测绘</h3>
                <button
                  type="button"
                  data-draggable-close
                  onClick={closeMeasuringUI}
                  className="sr-only"
                  aria-label="关闭"
                  title="关闭"
                />
              </div>

              {/* 内容区 */}
              <div className="p-3 overflow-y-auto max-h-[calc(70vh-48px)]">

{/* 点/线/面（完整模式） / 工作流选择（快捷模式） */}
{measuringVariant === 'full' ? (
  <div className="flex gap-2 mb-2">
    {(['point', 'polyline', 'polygon'] as const).map((m) => (
      <AppButton
        key={m}
        className={`flex-1 py-1 border ${drawMode === m ? 'bg-blue-300' : ''} ${
          isTempMountReadonly ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        onClick={() => handleDrawModeButtonClick(m)}
        type="button"
        disabled={isTempMountReadonly}
      >
        {m === 'point' ? '点' : m === 'polyline' ? '线' : '面'}
      </AppButton>
    ))}
  </div>
) : (
  <div className="flex gap-2 mb-2">
    <select
      className="flex-1 border p-1 rounded"
      value={workflowKey}
      disabled={workflowRunning}
      onChange={(e) => setWorkflowKey(e.target.value as WorkflowKey)}
    >
      {WORKFLOW_SELECT_OPTIONS.filter((item) => !item.hidden).map((item) => (
        <option key={item.key} value={item.key}>
          {item.label}
        </option>
      ))}
    </select>

    <AppButton
      className={`px-3 py-1 rounded border ${workflowRunning || isTempMountReadonly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
      type="button"
      disabled={workflowRunning || isTempMountReadonly}
      onClick={startWorkflow}
    >
      开始
    </AppButton>

    <AppButton
      className={`px-3 py-1 rounded border ${!workflowRunning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
      type="button"
      disabled={!workflowRunning}
      onClick={stopWorkflowToSelector}
    >
      结束
    </AppButton>
  </div>
)}



                {/* 要素类型下拉 */}
                {measuringVariant === 'full' && drawMode !== 'none' && !isWorkflowStyleEditing && (
                  <div className="mb-2">
                    <label className="block text-sm font-bold">要素类型</label>
                    <select
                      value={subType}
onChange={(e) => {
  const next = e.target.value as FeatureKey;

  requestSwitchWithExtraWarn(() => {
    requestExitSpecialDraftIfNeeded(() => {
      resetSpecialDrafts();

      setSubType(next);
      const def = FORMAT_REGISTRY[next];
      const hydrated = def.hydrate({});
      setFeatureInfo(hydrated.values ?? {});
      setGroupInfo(normalizeGroupInfoByDef(def, (hydrated.groups ?? {}) as any));
    });
  });
}}

                      className="w-full border p-1 rounded"
                    >
                      <option value="默认">默认</option>
                      {subTypeOptions.map((k) => (
                        <option key={k} value={k}>
                          {FORMAT_REGISTRY[k].label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 颜色 */}
                {drawMode !== 'none' && (
                  <div className="mb-2">
                    <label className="block mb-1 text-sm">颜色</label>
                    <input
                      type="color"
                      value={drawColor}
                      onChange={(e) => setDrawColor(e.target.value)}
                      className="w-full"
                    />
                  </div>
                )}

{drawMode !== 'none' && (
  <div className="flex gap-2 mb-2">
    <AppButton className="bg-yellow-400 text-white px-2 py-1 rounded flex-1" onClick={handleUndo} type="button">
      撤销
    </AppButton>
    <AppButton className="bg-orange-400 text-white px-2 py-1 rounded flex-1" onClick={handleRedo} type="button">
      重做
    </AppButton>

    {measuringVariant === 'full' && (
      <AppButton
        className={`px-3 py-1 rounded-lg flex-1 ${
          isTempMountReadonly ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-500 text-white'
        }`}
        onClick={finishLayer}
        type="button"
        disabled={isTempMountReadonly}
      >
        {editingLayerId !== null ? '保存编辑图层' : '完成当前图层'}
      </AppButton>
    )}
  </div>
)}


<div className={shouldShowDrawingToolPanel ? '' : 'hidden'} aria-hidden={!shouldShowDrawingToolPanel}>
{/* 显示控制点 / 显示坐标：始终可见（坐标按钮仍只在开启后显示） */}
<div className="flex gap-2 mb-2">
  <AppButton
    type="button"
    className={`flex-1 px-2 py-1 rounded text-sm border ${
      showDraftControlPoints ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
    } ${showDraftControlPointsLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
    onClick={() => {
      if (showDraftControlPointsLocked) return;

      setShowDraftControlPoints((v) => {
        const next = !v;
        if (!next) setShowDraftControlPointCoords(false);
        return next;
      });
    }}
    title={showDraftControlPointsLocked ? '控制点修改/添加中：显示控制点已锁定开启' : '显示/隐藏控制点'}
  >
    显示控制点
  </AppButton>

  {showDraftControlPoints && (
    <AppButton
      type="button"
      className={`flex-1 px-2 py-1 rounded text-sm border ${
        showDraftControlPointCoords ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
      }`}
      onClick={() => setShowDraftControlPointCoords((v) => !v)}
      title="显示/隐藏控制点坐标"
    >
      显示坐标
    </AppButton>
  )}
</div>

{/* 坐标网格模式（点击创建点后立刻生效，可随时切换） */}
<div className="mb-2">
  <GridSnapModeSwitch />
</div>

{/* 手动输入 & 曲线输入：同一行并平分空间 */}
<div className="flex gap-2 mb-2">
  <ManualPointInput
    enabled={measuringActive && drawing && drawMode !== 'none' && !showDraftControlPointsLocked && !drawClickSuppressed && !curveInputFrozen}
    activeMode={drawMode}
    defaultY={-64}
    onSubmit={onManualPointSubmit}
    outerClassName="flex-1"
  />

  <CurveInputT
    ref={curveInputTRef}
    enabled={measuringActive && drawing && (drawMode === 'polyline' || drawMode === 'polygon') && !showDraftControlPointsLocked}
    externallySuppressed={drawClickSuppressed || curveInputFrozen}
    mapReady={mapReady}
    leafletMapRef={leafletMapRef}
    projectionRef={projectionRef}
    activeMode={drawMode}
    outerClassName="flex-1"
    // 曲线输入开启时：完全冻结主绘制/编辑交互（不影响 ControlPointsT 的抑制状态）
    onSetDrawClickSuppressed={(v) => setCurveInputFrozenImmediate(v)}
    filterWorldPointByAssistLine={(p) => {
      const assist = assistLineToolsRef.current;
      if (assist?.isEnabled?.()) {
        const r = assist.transformWorldPoint(p);
        return r?.point ?? p;
      }
      return p;
    }}
    onCommitPoints={(points) => {
      if (!Array.isArray(points) || points.length === 0) return;

      setRedoStack([]);
      setTempPoints((prev) => {
        const updated = [...prev, ...points];
        drawDraftGeometry(updated, drawMode, drawColor);
        const last = updated[updated.length - 1];
        if (last) updateLatestEndpointMarker({ x: last.x, z: last.z }, drawColor);
        return updated;
      });
    }}
  />
</div>


{/* 辅助线 */}
<div className="mb-2">
  <AssistLineTools
    ref={assistLineToolsRef}
    mapReady={mapReady}
    leafletMapRef={leafletMapRef}
    projectionRef={projectionRef}
  />
</div>



{/* 控制点修改/添加/保存*/}
{drawMode !== 'none' && (
  <ControlPointsT
    ref={controlPointsTRef}
    mapReady={mapReady}
    leafletMapRef={leafletMapRef}
    projectionRef={projectionRef}
    activeMode={drawMode}
    activeColor={drawColor}
    activeCoords={tempPoints}
    onApplyActiveCoords={(coords) => {
      setTempPoints(coords);
      drawDraftGeometry(coords, drawMode, drawColor);

      // 控制点编辑/插入保存后：不保留“最新端点临时点”
      draftEndpointRef.current?.clearLayers();
    }}
    onSetDrawClickSuppressed={(v) => {
      setDrawClickSuppressed(v);
    }}
    showControlPointsEnabled={showDraftControlPoints}
    showControlPointsLocked={showDraftControlPointsLocked}
    setShowControlPointsEnabled={(v) => {
      setShowDraftControlPoints(v);
      if (!v) setShowDraftControlPointCoords(false);
    }}
    setShowControlPointsLocked={setShowDraftControlPointsLocked}
    filterWorldPointByAssistLine={(p) => {
      const assist = assistLineToolsRef.current;
      if (assist?.isEnabled?.()) {
        const r = assist.transformWorldPoint(p);
        return r?.point ?? p;
      }
      return p;
    }}
  />
)}
</div>


{/* 临时输出：默认关闭；仅“默认” subtype 启用 */}
{measuringVariant === 'workflow' ? (
  workflowRunning ? (
    <div
  className="mb-2 border-t pt-2 pointer-events-auto"
  onMouseDownCapture={(e) => e.stopPropagation()}
  onPointerDownCapture={(e) => e.stopPropagation()}
  onTouchStartCapture={(e) => e.stopPropagation()}
>
  <WorkflowHost
    workflowKey={workflowKey}
    bridge={workflowBridge}
    registry={workflowRegistry}
    onExit={stopWorkflowToSelector}
  />
</div>

  ) : null
) : (
  /* 临时输出：默认关闭；仅“默认” subtype 启用 */
  drawMode !== 'none' && subType === '默认' && (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold">临时输出</label>
        <AppButton
          type="button"
          className={`px-2 py-1 text-xs rounded border ${
            tempOutputOpen ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
          }`}
          onClick={() => setTempOutputOpen(v => !v)}
        >
          {tempOutputOpen ? '收起' : '展开'}
        </AppButton>
      </div>

      {tempOutputOpen && (
        <textarea readOnly className="w-full h-20 border p-1" value={currentTempOutput()} />
      )}
    </div>
  )
)}



                {/* JSON 输入区 */}
{measuringVariant === 'full' && subType !== '默认' && (
  <div className="mb-2 border-t pt-2">
    <div className="flex items-center justify-between gap-2">
      <label className="text-sm font-bold">
        附加信息 (
        {specialDraftMode === 'merge-point-platform-station'
          ? '多点合一-站台车站'
          : specialDraftMode === 'merge-polygon-outline-building'
          ? '多面合一-站台建筑与轮廓'
          : FORMAT_REGISTRY[subType].label}
        )
      </label>

      <div className="flex items-center gap-2">
        {/* 点：站台 -> 多点合一 */}
        {drawMode === 'point' && subType === '站台' && (
          <AppButton
            type="button"
            className={`px-2 py-1 text-xs rounded border ${
              specialDraftMode === 'merge-point-platform-station'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => {
              requestSwitchWithExtraWarn(() => {
                if (specialDraftMode === 'merge-point-platform-station') {
                  requestExitSpecialDraftIfNeeded(() => resetSpecialDrafts());
                } else {
                  // 进入多点合一：初始化草稿
                  setSpecialDraftMode('merge-point-platform-station');
                  setMergePointPSDraft({ platforms: [], station: null });
                }
              });
            }}
          >
            多点合一
          </AppButton>
        )}

        {/* 线：铁路 -> 方向反转（>=2 控制点） */}
        {drawMode === 'polyline' && subType === '铁路' && (
          <RailwayDirectionReverseButton
            enabled={tempPoints.length >= 2 && !drawClickSuppressed}
            onReverse={() => {
              if (tempPoints.length < 2) return;

              // 反转控制点
              const reversed = [...tempPoints].reverse();
              setTempPoints(reversed);
              drawDraftGeometry(reversed, 'polyline', drawColor);

              // 调转起止站台字段（若存在）
              setFeatureInfo((prev: any) => {
                const start = prev?.startplf;
                const end = prev?.endplf;
                return { ...(prev ?? {}), startplf: end ?? '', endplf: start ?? '' };
              });
            }}
          />
        )}

        {/* 面：站台轮廓/车站建筑 -> 多面合一 */}
        {drawMode === 'polygon' && (String(subType) === '站台轮廓' || subType === '车站建筑') && (
          <AppButton
            type="button"
            className={`px-2 py-1 text-xs rounded border ${
              specialDraftMode === 'merge-polygon-outline-building'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => {
              requestSwitchWithExtraWarn(() => {
                if (specialDraftMode === 'merge-polygon-outline-building') {
                  requestExitSpecialDraftIfNeeded(() => resetSpecialDrafts());
                } else {
                  setSpecialDraftMode('merge-polygon-outline-building');
                  setMergePolygonOBDraft({ outline: null, building: null });
                }
              });
            }}
          >
            多面合一
          </AppButton>
        )}
      </div>
    </div>

    {/* 内容：编辑专用模式优先；否则按 special 模式切换渲染 */}
    {isWorkflowStyleEditing && activeEditorView ? (
      <WorkflowStyleEditPanel
        view={activeEditorView}
        values={editorDraftValues}
        unparsedEntries={editorDraftUnparsed}
        onChangeValue={setEditorDraftValue}
        onChangeUnparsedEntries={setEditorDraftUnparsed}
        bridge={workflowBridge}
        editorId={editorIdInput}
        onChangeEditorId={setEditorIdInput}
      />
    ) : specialDraftMode === 'merge-point-platform-station' ? (
      <MergePointPlatformStation
        draft={mergePointPSDraft}
        onChange={setMergePointPSDraft}
      />
    ) : specialDraftMode === 'merge-polygon-outline-building' ? (
      <MergePolygonOutlineBuilding
        draft={mergePolygonOBDraft}
        onChange={setMergePolygonOBDraft}
        outlineKey="站台轮廓"
        buildingKey="车站建筑"
      />
    ) : (
      renderDynamicExtraInfo()
    )}
  </div>
)}

              </div>
            </AppCard>
          </DraggablePanel>
        </div>
      )}

      {/* 测绘菜单：手机端（固定布局，风格一致） */}
      {measuringActive && (
        <div className="sm:hidden fixed top-[240px] left-2 right-2 z-[1800]">
          <AppCard className="overflow-hidden border max-h-[70vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-800">测绘</h3>
              <AppButton
                onClick={closeMeasuringUI}
                className="text-gray-400 hover:text-gray-600"
                aria-label="关闭"
                type="button"
              >
                <X className="w-5 h-5" />
              </AppButton>
            </div>

            <div className="p-3 overflow-y-auto max-h-[calc(70vh-48px)]">
              <div className="flex gap-2 mb-2">
  {(['point', 'polyline', 'polygon'] as const).map((m) => (
    <AppButton
      key={m}
      className={`flex-1 py-1 border ${drawMode === m ? 'bg-blue-300' : ''} ${
        isTempMountReadonly ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      onClick={() => handleDrawModeButtonClick(m)}
      type="button"
      disabled={isTempMountReadonly}
    >
      {m === 'point' ? '点' : m === 'polyline' ? '线' : '面'}
    </AppButton>
  ))}
</div>


              {drawMode !== 'none' && !isWorkflowStyleEditing && (
                <div className="mb-2">
                  <label className="block text-sm font-bold">要素类型</label>
                  <select
                    value={subType}
onChange={(e) => {
  const next = e.target.value as FeatureKey;

  requestSwitchWithExtraWarn(() => {
    setSubType(next);

    const def = FORMAT_REGISTRY[next];
    const hydrated = def.hydrate({});
    setFeatureInfo(hydrated.values ?? {});
    setGroupInfo(normalizeGroupInfoByDef(def, (hydrated.groups ?? {}) as any));
  });
}}

                    className="w-full border p-1 rounded"
                  >
                    <option value="默认">默认</option>
                    {subTypeOptions.map((k) => (
                      <option key={k} value={k}>
                        {FORMAT_REGISTRY[k].label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {drawMode !== 'none' && (
                <div className="mb-2">
                  <label className="block mb-1 text-sm">颜色</label>
                  <input
                    type="color"
                    value={drawColor}
                    onChange={(e) => setDrawColor(e.target.value)}
                    className="w-full"
                  />
                </div>
              )}

{drawMode !== 'none' && (
  <div className="flex gap-2 mb-2">
    <AppButton className="bg-yellow-400 text-white px-2 py-1 rounded flex-1" onClick={handleUndo} type="button">
      撤销
    </AppButton>
    <AppButton className="bg-orange-400 text-white px-2 py-1 rounded flex-1" onClick={handleRedo} type="button">
      重做
    </AppButton>

    {measuringVariant === 'full' && (
      <AppButton
        className={`px-3 py-1 rounded-lg flex-1 ${
          isTempMountReadonly ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-500 text-white'
        }`}
        onClick={finishLayer}
        type="button"
        disabled={isTempMountReadonly}
      >
        {editingLayerId !== null ? '保存编辑图层' : '完成当前图层'}
      </AppButton>
    )}
  </div>
)}


{/* 控制点修改/添加/保存 */}
{drawMode !== 'none' && (
  <ControlPointsT
    ref={controlPointsTRef}
    mapReady={mapReady}
    leafletMapRef={leafletMapRef}
    projectionRef={projectionRef}
    activeMode={drawMode}
    activeColor={drawColor}
    activeCoords={tempPoints}
    onApplyActiveCoords={(coords) => {
      setTempPoints(coords);
      drawDraftGeometry(coords, drawMode, drawColor);

      // 控制点编辑/插入保存后：不保留“最新端点临时点”
      draftEndpointRef.current?.clearLayers();
    }}
    onSetDrawClickSuppressed={(v) => {
      setDrawClickSuppressed(v);
    }}
    showControlPointsEnabled={showDraftControlPoints}
    showControlPointsLocked={showDraftControlPointsLocked}
    setShowControlPointsEnabled={(v) => {
      setShowDraftControlPoints(v);
      if (!v) setShowDraftControlPointCoords(false);
    }}
    setShowControlPointsLocked={setShowDraftControlPointsLocked}
    filterWorldPointByAssistLine={(p) => {
      const assist = assistLineToolsRef.current;
      if (assist?.isEnabled?.()) {
        const r = assist.transformWorldPoint(p);
        return r?.point ?? p;
      }
      return p;
    }}
  />
)}



{measuringVariant === 'workflow' ? (
  workflowRunning ? (
    <div
  className="mb-2 border-t pt-2 pointer-events-auto"
  onMouseDownCapture={(e) => e.stopPropagation()}
  onPointerDownCapture={(e) => e.stopPropagation()}
  onTouchStartCapture={(e) => e.stopPropagation()}
>
  <WorkflowHost
    workflowKey={workflowKey}
    bridge={workflowBridge}
    registry={workflowRegistry}
    onExit={stopWorkflowToSelector}
  />
</div>

  ) : null
) : (
  /* 临时输出：默认关闭；仅“默认” subtype 启用 */
  drawMode !== 'none' && subType === '默认' && (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold">临时输出</label>
        <AppButton
          type="button"
          className={`px-2 py-1 text-xs rounded border ${
            tempOutputOpen ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
          }`}
          onClick={() => setTempOutputOpen(v => !v)}
        >
          {tempOutputOpen ? '收起' : '展开'}
        </AppButton>
      </div>

      {tempOutputOpen && (
        <textarea readOnly className="w-full h-20 border p-1" value={currentTempOutput()} />
      )}
    </div>
  )
)}



{subType !== '默认' && (
  <div className="mb-2 border-t pt-2">
    <div className="flex items-center justify-between gap-2">
      <label className="text-sm font-bold">
        附加信息 (
        {specialDraftMode === 'merge-point-platform-station'
          ? '多点合一-站台车站'
          : specialDraftMode === 'merge-polygon-outline-building'
          ? '多面合一-站台建筑与轮廓'
          : FORMAT_REGISTRY[subType].label}
        )
      </label>

      <div className="flex items-center gap-2">
        {/* 点：站台 -> 多点合一 */}
        {drawMode === 'point' && subType === '站台' && (
          <AppButton
            type="button"
            className={`px-2 py-1 text-xs rounded border ${
              specialDraftMode === 'merge-point-platform-station'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => {
              requestSwitchWithExtraWarn(() => {
                if (specialDraftMode === 'merge-point-platform-station') {
                  requestExitSpecialDraftIfNeeded(() => resetSpecialDrafts());
                } else {
                  // 进入多点合一：初始化草稿
                  setSpecialDraftMode('merge-point-platform-station');
                  setMergePointPSDraft({ platforms: [], station: null });
                }
              });
            }}
          >
            多点合一
          </AppButton>
        )}

        {/* 线：铁路 -> 方向反转（>=2 控制点） */}
        {drawMode === 'polyline' && subType === '铁路' && (
          <RailwayDirectionReverseButton
            enabled={tempPoints.length >= 2 && !drawClickSuppressed}
            onReverse={() => {
              if (tempPoints.length < 2) return;

              // 反转控制点
              const reversed = [...tempPoints].reverse();
              setTempPoints(reversed);
              drawDraftGeometry(reversed, 'polyline', drawColor);

              // 调转起止站台字段（若存在）
              setFeatureInfo((prev: any) => {
                const start = prev?.startplf;
                const end = prev?.endplf;
                return { ...(prev ?? {}), startplf: end ?? '', endplf: start ?? '' };
              });
            }}
          />
        )}

        {/* 面：站台轮廓/车站建筑 -> 多面合一 */}
        {drawMode === 'polygon' && (String(subType) === '站台轮廓' || subType === '车站建筑') && (
          <AppButton
            type="button"
            className={`px-2 py-1 text-xs rounded border ${
              specialDraftMode === 'merge-polygon-outline-building'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => {
              requestSwitchWithExtraWarn(() => {
                if (specialDraftMode === 'merge-polygon-outline-building') {
                  requestExitSpecialDraftIfNeeded(() => resetSpecialDrafts());
                } else {
                  setSpecialDraftMode('merge-polygon-outline-building');
                  setMergePolygonOBDraft({ outline: null, building: null });
                }
              });
            }}
          >
            多面合一
          </AppButton>
        )}
      </div>
    </div>

    {/* 内容：编辑专用模式优先；否则按 special 模式切换渲染 */}
    {isWorkflowStyleEditing && activeEditorView ? (
      <WorkflowStyleEditPanel
        view={activeEditorView}
        values={editorDraftValues}
        unparsedEntries={editorDraftUnparsed}
        onChangeValue={setEditorDraftValue}
        onChangeUnparsedEntries={setEditorDraftUnparsed}
        bridge={workflowBridge}
        editorId={editorIdInput}
        onChangeEditorId={setEditorIdInput}
      />
    ) : specialDraftMode === 'merge-point-platform-station' ? (
      <MergePointPlatformStation
        draft={mergePointPSDraft}
        onChange={setMergePointPSDraft}
      />
    ) : specialDraftMode === 'merge-polygon-outline-building' ? (
      <MergePolygonOutlineBuilding
        draft={mergePolygonOBDraft}
        onChange={setMergePolygonOBDraft}
        outlineKey="站台轮廓"
        buildingKey="车站建筑"
      />
    ) : (
      renderDynamicExtraInfo()
    )}
  </div>
)}

            </div>
          </AppCard>
        </div>
      )}

      {/* =========================
          导入面板：桌面端（可拖拽）
         ========================= */}
      {importPanelOpen && (
        <div className="hidden sm:block">
          <DraggablePanel id="measuring-import" defaultPosition={{ x: 420, y: 240 }} zIndex={1800}>
            <AppCard className="w-96 overflow-hidden border">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-bold text-gray-800">导入矢量数据</h3>
                <AppButton
                  onClick={() => setImportPanelOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  aria-label="关闭"
                  title="关闭"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </AppButton>
              </div>

              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                <div className="text-sm font-bold">格式</div>
                <div className="text-xs text-gray-600">批量（JSON）</div>


                <label className="block text-sm font-bold mb-1">数据输入</label>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full border rounded p-2 text-sm"
placeholder={'批量 JSON：支持数组或 {items:[...]} / {features:[...]}。也允许多条对象粘贴但外层未包 []（例如 {..},{..} 或 换行分隔）。\n每条必须是“新规范 JSON”(含 Type/Class/World)，且 Class 必须可映射到已支持格式。'}
                  rows={6}
                />

                <AppButton
                  className="bg-blue-600 text-white px-3 py-2 rounded-lg w-full disabled:opacity-60"
                  onClick={handleUploadFileClick}
                  type="button"
                  disabled={importFileBusy}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Upload className="w-4 h-4" />
                    <span>上传文件</span>
                  </span>
                </AppButton>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".zip,application/zip,.json,application/json"
                  className="hidden"
                  onChange={handleImportFileSelected}
                />
                <AppButton className="bg-green-600 text-white px-3 py-2 rounded-lg w-full" onClick={handleImport} type="button">
                  导入
                </AppButton>
              </div>
            </AppCard>
          </DraggablePanel>
        </div>
      )}

      {/* 导入面板：手机端（固定） */}
      {importPanelOpen && (
        <div className="sm:hidden fixed bottom-24 left-2 right-2 z-[1800]">
          <AppCard className="overflow-hidden border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-800">导入矢量数据</h3>
              <AppButton
                onClick={() => setImportPanelOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                aria-label="关闭"
                title="关闭"
                type="button"
              >
                <X className="w-4 h-4" />
              </AppButton>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm font-bold">格式</div>
                <div className="text-xs text-gray-600">批量（JSON）</div>


              <label className="block text-sm font-bold mb-1">数据输入</label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full border rounded p-2 text-sm"
                rows={6}
              />

                <AppButton
                  className="bg-blue-600 text-white px-3 py-2 rounded-lg w-full disabled:opacity-60"
                  onClick={handleUploadFileClick}
                  type="button"
                  disabled={importFileBusy}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Upload className="w-4 h-4" />
                    <span>上传文件</span>
                  </span>
                </AppButton>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".zip,application/zip,.json,application/json"
                  className="hidden"
                  onChange={handleImportFileSelected}
                />
              <AppButton className="bg-green-600 text-white px-3 py-2 rounded-lg w-full" onClick={handleImport} type="button">
                导入
              </AppButton>
            </div>
          </AppCard>
        </div>
      )}

      {/* ======== 图层控制器（手机端） ======== */}
      {measuringActive && (
        <div className="sm:hidden fixed top-20 right-2 left-2 z-[1000]">
          {layerPanelCard}
        </div>
      )}


      {/* ======== JSON 导出窗口（替代 alert/print） ======== */}
{measuringActive && jsonPanelOpen && (
  <DraggablePanel id="measuring-json-export" defaultPosition={{ x: 340, y: 260 }} zIndex={1900}>
    <AppCard className="w-[520px] max-h-[70vh] overflow-hidden border">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-bold text-gray-800">JSON 导出</h3>
        <AppButton
          onClick={() => setJsonPanelOpen(false)}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          aria-label="关闭"
          title="关闭"
          type="button"
        >
          <X className="w-4 h-4" />
        </AppButton>
      </div>

      <div className="p-3 flex gap-3">
        {/* 左侧：按要素类型分区导出 */}
        <div className="w-28 shrink-0 border rounded p-2 bg-gray-50 max-h-[50vh] overflow-hidden flex flex-col">
          <div className="text-xs text-gray-500 mb-2">导出范围</div>
          <div className="space-y-1 overflow-y-auto flex-1">
            <AppButton
              type="button"
              className={`w-full px-2 py-1 text-sm rounded border ${
                jsonExportSubType === '__ALL__'
                  ? 'bg-blue-600 text-white border-blue-700'
                  : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => {
                setJsonExportSubType('__ALL__');
                setJsonPanelText(getLayersJSONOutputBySubType('__ALL__'));
              }}
            >
              全部
            </AppButton>
            {getAvailableSubTypes().map((k) => (
              <AppButton
                key={k}
                type="button"
                className={`w-full px-2 py-1 text-sm rounded border ${
                  jsonExportSubType === k
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => {
                  setJsonExportSubType(k);
                  setJsonPanelText(getLayersJSONOutputBySubType(k));
                }}
              >
                {k}
              </AppButton>
            ))}
            {getAvailableWorkflowCatalogKeys().length > 0 && (
              <>
                <div className="mt-3 pt-2 border-t border-black/10 text-xs text-black/60">
                  按目录（WORKFLOW_FEATURE_CATALOG）
                </div>
                {getAvailableWorkflowCatalogKeys().map((it) => (
                  <AppButton
                    key={it.key}
                    type="button"
                    className={`w-full px-2 py-1 text-sm rounded border ${
                      jsonExportSubType === it.key
                        ? 'bg-blue-600 text-white border-blue-700'
                        : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setJsonExportSubType(it.key);
                      setJsonPanelText(getLayersJSONOutputByWorkflowCatalogKey(it.key));
                    }}
                  >
                    {it.label}
                  </AppButton>
                ))}
              </>
            )}
          </div>

          {/* 红框位置：复制（把原“复制”按钮挪到左侧底部） */}
          <div className="pt-2">
            <AppButton
              className="w-full bg-blue-600 text-white px-2 py-2 rounded-lg"
              onClick={async () => {
                const text = jsonPanelText ?? '';
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  // fallback
                  const ta = document.createElement('textarea');
                  ta.value = text;
                  ta.style.position = 'fixed';
                  ta.style.left = '-9999px';
                  document.body.appendChild(ta);
                  ta.focus();
                  ta.select();
                  try {
                    document.execCommand('copy');
                  } finally {
                    document.body.removeChild(ta);
                  }
                }
              }}
              type="button"
            >
              复制
            </AppButton>
          </div>
        </div>

        {/* 右侧：内容 + 操作 */}
        <div className="flex-1 space-y-2">
          <textarea
            readOnly
            className="w-full h-64 border p-2 text-xs font-mono rounded"
            value={jsonPanelText}
          />

          <div className="flex gap-2">
            {/* 原“复制” → 下载(分条) */}
            <AppButton
              className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg"
              onClick={() => {
                const text = jsonPanelText ?? '';

                const safeName = (s: string) =>
                  String(s)
                    .trim()
                    .replace(/[\\/\s:*?"<>|]+/g, '_')
                    .replace(/_+/g, '_')
                    .slice(0, 120);

                let arr: any[] = [];
                try {
                  const parsed = JSON.parse(text);
                  if (Array.isArray(parsed)) arr = parsed;
                  else if (parsed && typeof parsed === 'object') arr = [parsed];
                } catch {
                  window.alert('无法解析当前 JSON 文本，无法进行分条下载。');
                  return;
                }

                if (!arr.length) {
                  window.alert('当前导出内容为空。');
                  return;
                }

                const files = arr.map((obj, idx) => {
                  const clsGuess = String((obj as any)?.Class ?? (obj as any)?.subType ?? (obj as any)?.Type ?? '').trim();
                  const { idValue } = pickIdFieldValue(obj, clsGuess);
                  const id = String(idValue ?? '').trim();
                  const base = safeName(id || `item_${String(idx + 1).padStart(3, '0')}`);
                  return {
                    name: `${base}.json`,
                    text: stringifyFeatureJson(obj),
                  };
                });

                const zipBlob = buildZipStore(files);
                const now = new Date();
                const y = String(now.getFullYear());
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                const scopeName = jsonExportSubType === '__ALL__' ? 'ALL' : String(jsonExportSubType);
                const zipName = `${safeName(scopeName)}_${y}${m}${d}_split.zip`;

                try {
                  const url = URL.createObjectURL(zipBlob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = zipName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch {
                  // ignore
                }
              }}
              type="button"
            >
              下载(分条)
            </AppButton>

            {/* 原“下载” → 下载(完整)（功能不变） */}
            <AppButton
              className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg"
              onClick={() => {
                const text = jsonPanelText ?? '';
                const now = new Date();
                const y = String(now.getFullYear());
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                const name = jsonExportSubType === '__ALL__' ? 'ALL' : String(jsonExportSubType);
                const filename = `${name}_${y}${m}${d}.json`;
                try {
                  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch {
                  // ignore
                }
              }}
              type="button"
            >
              下载(完整)
            </AppButton>

            <AppButton
              className="flex-1 bg-gray-200 text-gray-800 px-3 py-2 rounded-lg"
              onClick={() => setJsonPanelOpen(false)}
              type="button"
            >
              关闭
            </AppButton>
          </div>
        </div>
      </div>
    </AppCard>
  </DraggablePanel>
)}

{switchWarnOpen && (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
    <AppCard className="w-[420px] max-w-[90vw] border">
      <div className="px-4 py-3 border-b font-bold text-sm">
        切换确认
      </div>
      <div className="px-4 py-3 text-sm text-gray-800">
        特殊要素格式附加信息不为空，切换将会丢失所有信息，确定要切换吗？
      </div>
      <div className="px-4 py-3 border-t flex justify-end gap-2">
        <AppButton
          type="button"
          className="px-3 py-1.5 rounded border bg-white text-gray-800 hover:bg-gray-50"
          onClick={cancelExtraSwitch}
        >
          取消
        </AppButton>
        <AppButton
          type="button"
          className="px-3 py-1.5 rounded border bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
          onClick={confirmExtraSwitch}
        >
          确定
        </AppButton>
      </div>
    </AppCard>
  </div>
)}

{tempMountConflictOpen && (
  <>
    {/* 桌面端：可拖动 Panel（固定高度 + 纵向滚动），避免长报告溢出无法交互 */}
    <div className="hidden sm:block">
      <div className="fixed inset-0 z-[9998] bg-black/40" />
      <DraggablePanel id="temp-mount-conflict" defaultPosition={{ x: 420, y: 220 }} zIndex={9999}>
        <AppCard className="w-[560px] max-w-[90vw] max-h-[70vh] overflow-hidden border">
          <div className="px-4 py-3 border-b font-bold text-sm">ID 冲突提示</div>
          <div className="px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap overflow-y-auto max-h-[calc(70vh-96px)]">
            {tempMountConflictText}
          </div>
          <div className="px-4 py-3 border-t flex justify-end gap-2">
            <AppButton
              type="button"
              className="px-3 py-1.5 rounded border bg-white text-gray-800 hover:bg-gray-50"
              onClick={cancelTempMountConflict}
            >
              返回
            </AppButton>
            {tempMountConflictAllowOverride && (
              <AppButton
                type="button"
                className="px-3 py-1.5 rounded border bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
                onClick={confirmTempMountConflictOverride}
              >
                确定
              </AppButton>
            )}
          </div>
        </AppCard>
      </DraggablePanel>
    </div>

    {/* 移动端：底部面板（固定高度 + 纵向滚动） */}
    <div className="sm:hidden fixed inset-0 z-[9999] bg-black/40 flex items-end">
      <AppCard className="w-full max-h-[70vh] overflow-hidden border rounded-t-2xl">
        <div className="px-4 py-3 border-b font-bold text-sm">ID 冲突提示</div>
        <div className="px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap overflow-y-auto max-h-[calc(70vh-96px)]">
          {tempMountConflictText}
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <AppButton
            type="button"
            className="px-3 py-1.5 rounded border bg-white text-gray-800 hover:bg-gray-50"
            onClick={cancelTempMountConflict}
          >
            返回
          </AppButton>
          {tempMountConflictAllowOverride && (
            <AppButton
              type="button"
              className="px-3 py-1.5 rounded border bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
              onClick={confirmTempMountConflictOverride}
            >
              确定
            </AppButton>
          )}
        </div>
      </AppCard>
    </div>
  </>
)}

{tempMountIdCheckOpen && (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
    <AppCard className="w-[420px] max-w-[90vw] border">
      <div className="px-4 py-3 border-b font-bold text-sm">加载中</div>
      <div className="px-4 py-3 text-sm text-gray-800">{tempMountIdCheckText}</div>
      <div className="px-4 py-3 border-t">
        <div className="h-2 bg-gray-200 rounded overflow-hidden">
          <div className="h-2 bg-blue-600 rounded animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    </AppCard>
  </div>
)}

{endMeasuringWarnOpen && (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
    <AppCard className="w-[420px] max-w-[90vw] border">
      <div className="px-4 py-3 border-b font-bold text-sm">结束测绘确认</div>
      <div className="px-4 py-3 text-sm text-gray-800">
        结束测绘将清除所有测绘图层，是否确认？
      </div>
      <div className="px-4 py-3 border-t flex justify-end gap-2">
        <AppButton
          type="button"
          className="px-3 py-1.5 rounded border bg-white text-gray-800 hover:bg-gray-50"
          onClick={cancelEndMeasuring}
        >
          返回
        </AppButton>
        <AppButton
          type="button"
          className="px-3 py-1.5 rounded border bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
          onClick={confirmEndMeasuring}
        >
          确认
        </AppButton>
      </div>
    </AppCard>
  </div>
)}


      <RelayPackageExportPanel
        open={relayPackageExportOpen}
        draft={relayPackageDraft}
        featureCount={layers.filter((l) => l.id !== editingLayerId && l.jsonInfo?.featureInfo).length}
        onClose={() => setRelayPackageExportOpen(false)}
        onExport={handleExportRelayPackage}
      />

      <DeleteFeatureSelectionPanel
        open={deletePanelOpen}
        items={relayPackageDraft.deleteMarks}
        candidates={buildDeleteCandidatesFromLayers()}
        currentWorldId={currentWorldId}
        onClose={() => { setDeletePanelOpen(false); setDeleteMapPickEnabled(false); setDeletePickPanelOpen(false); setDeletePickCandidate(null); setDeletePickedCandidate(null); }}
        mapPickEnabled={deleteMapPickEnabled && deletePickPanelOpen}
        pickedItem={deletePickedCandidate}
        onOpenPickPanel={() => { setDeletePickPanelOpen(true); setDeleteMapPickEnabled(true); setDeletePickCandidate(null); }}
        onConfirm={(items) => {
          setRelayPackageDraft((prev) => ({ ...prev, deleteMarks: items.map((x) => ({ ID: x.ID, Name: x.Name || '' })), meta: { ...prev.meta, updatedAt: new Date().toISOString() } }));
          setDeletePanelOpen(false);
          setDeleteMapPickEnabled(false);
          setDeletePickPanelOpen(false);
          setDeletePickCandidate(null);
          setDeletePickedCandidate(null);
        }}
      />

      <DeleteFeaturePickPanel
        open={deletePickPanelOpen}
        active={deleteMapPickEnabled}
        candidate={deletePickCandidate}
        onCancel={() => { setDeletePickPanelOpen(false); setDeleteMapPickEnabled(false); setDeletePickCandidate(null); }}
        onConfirm={(item) => {
          setDeletePickedCandidate(item);
          setDeletePickPanelOpen(false);
          setDeleteMapPickEnabled(false);
          setDeletePickCandidate(null);
        }}
      />

      <FeaturePictureBindingPanel
        open={picturePanelOpen}
        title={getLayerPictureBindingContext(picturePanelLayerId)?.title ?? '图片绑定'}
        pictures={getLayerPictureBindingContext(picturePanelLayerId)?.pictures ?? []}
        onClose={() => setPicturePanelOpen(false)}
        onConfirm={(pictures) => applyPictureBindingForLayer(picturePanelLayerId, pictures)}
      />


  </>
);
});

export default MeasuringModule;