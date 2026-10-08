import { OptionSourcesEditor } from './OptionSourcesEditor';
import { FieldAdvancedSettings } from './FieldAdvancedSettings';
import { ExtraRuleSettings } from './ExtraRuleSettings';
import { InteractionShapeSettings, RuleInteractionSettings } from './InteractionShapeSettings';
import { DisplayPrioritySettings } from './DisplayPrioritySettings';
import { CollisionMetricEditor } from './CollisionMetricEditor';
import { LabelPlacementSettings } from './LabelPlacementSettings';
import { NativeSymbolSettings } from './NativeSymbolSettings';
import { prepareConfigForActivation } from './configActivation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileUp, Maximize2, Minimize2, Plus, Save, SlidersHorizontal, X } from 'lucide-react';
import { buildConfigPackageArchive, downloadConfigPackage, readConfigPackage } from './package';
import { classificationPathKey, fieldScope, fieldShortKey, resolveEffectiveFields, resolveGeometryProfile, resolveRenderExtensions, validateConfigPackage } from './runtime';
import { ConfigRuntimePreview, PREVIEW_SCENARIOS, previewScenarioCompatible } from './ConfigRuntimePreview';
import { RenderRuleExtensionsEditor } from './RenderRuleExtensionsEditor';
import { createDefaultGeometryProfile, createV32EngineDefaults, defaultRenderRule } from './v32Defaults';
import { createConfigPackageFromCurrentProject } from './legacyProjectAdapter';
import { V3CardEditor } from './V3CardEditor';
import { WorkflowWorkbench } from './WorkflowWorkbench';
import { canSwitchStudioTab, type StudioTab } from './studioSession';
import type {
  CategoryNode,
  ClassificationPath,
  Condition,
  ConfigEngineSettings,
  ConfigPackageV3,
  ContextBinding,
  FieldDefinition,
  GeometryInteractionTriggers,
  GeometryKind,
  GeometryProfile,
  InteractionState,
  MountedFeatureRecord,
  PreviewScenario,
  RenderColorBinding,
  RenderLabelVisualStyle,
  RenderRuleConditionalOverride,
  RenderStyle,
  ZoomPriorityRule,
} from './types';

const geometries: GeometryKind[] = ['Point', 'LineString', 'Polygon'];
const geometryLabel: Record<GeometryKind, string> = { Point: '点', LineString: '线', Polygon: '面' };
const labelFamilies: Array<{ value: RenderLabelVisualStyle['family']; label: string }> = [
  { value: 'gm-bw', label: 'gm-bw · 白填充黑描边' },
  { value: 'gm-outline', label: 'gm-outline · 黑填色白描边' },
  { value: 'gm-wtb', label: 'gm-wtb · 水域蓝描边' },
  { value: 'structure-label', label: 'structure-label · 黑字白光晕' },
  { value: 'bubble-dark', label: 'bubble-dark · 深色气泡' },
  { value: 'rle-line-color', label: 'rle-line-color · 线路色文字' },
  { value: 'rle-pill-color', label: 'rle-pill-color · 线路色胶囊' },
];
const textOnlyFamilies = new Set<RenderLabelVisualStyle['family']>(['gm-bw', 'gm-outline', 'gm-wtb', 'structure-label']);
const interactionStates: InteractionState[] = ['hover', 'selected', 'searchResult', 'editing', 'deletionMarked'];
const interactionStateLabel: Record<InteractionState, string> = {
  hover: '悬停', selected: '选中', searchResult: '搜索结果', editing: '编辑态', deletionMarked: '删除态',
};
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function uid(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function nodeLabel(node: CategoryNode): string {
  return (['class', 'kind', 'skind', 'skind2'] as const).filter((level) => Boolean(node.path[level])).map((level) => {
    const code = node.path[level] as string;
    const name = node.classificationLabels?.[level]?.zh;
    return name && name !== code ? `${code}（${name}）` : code;
  }).join(' / ');
}
function samePath(a: ClassificationPath, b: ClassificationPath): boolean { return classificationPathKey(a) === classificationPathKey(b); }
function pathDepth(path: ClassificationPath): number { return [path.class, path.kind, path.skind, path.skind2].filter(Boolean).length; }
function readMountedRecords(): MountedFeatureRecord[] {
  try { return JSON.parse(sessionStorage.getItem('cairnmap-config-studio-mounted-records') ?? '[]') as MountedFeatureRecord[]; }
  catch { return []; }
}
function readLocalConfig(): ConfigPackageV3 | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem('cairnmap-config-studio-saved') ?? sessionStorage.getItem('cairnmap-config-studio-draft') ?? 'null') as ConfigPackageV3 | null;
    if (value === null) return undefined;
    if (value?.schemaVersion !== 'cairnmap.config-package.v3') throw new Error('本地配置 schemaVersion 无效；原始 JSON 已保留用于恢复。');
    return prepareConfigForActivation(value);
  } catch (error) {
    try { const raw = sessionStorage.getItem('cairnmap-config-studio-saved') ?? sessionStorage.getItem('cairnmap-config-studio-draft'); if (raw) sessionStorage.setItem('cairnmap-config-studio-rejected-recovery', raw); sessionStorage.setItem('cairnmap-config-studio-recovery-issue', error instanceof Error ? error.message : '本地配置无效。'); } catch { /* storage unavailable */ }
    return undefined;
  }
}
function updateNode(config: ConfigPackageV3, nodeId: string, updater: (node: CategoryNode) => CategoryNode): ConfigPackageV3 {
  return { ...config, nodes: config.nodes.map((node) => node.nodeId === nodeId ? updater(node) : node) };
}
function allFieldKeys(config: ConfigPackageV3, path: ClassificationPath): string[] {
  return [...new Set(['ID', 'Name', 'World', 'Class', 'Kind', 'Skind', 'Skind2', ...resolveEffectiveFields(config, path).map((field) => field.key)])];
}
function defaultNode(path: ClassificationPath): CategoryNode {
  // A newly authored branch must remain as readable as a migrated V1 branch.
  // Keep the identifier as the initial label (rather than leaving the path
  // anonymous); authors can replace it with the domain term in the category
  // editor before saving.
  const classificationLabels = Object.fromEntries(
    (['class', 'kind', 'skind', 'skind2'] as const)
      .filter((level) => Boolean(path[level]))
      .map((level) => [level, { zh: String(path[level]), en: '' }]),
  ) as CategoryNode['classificationLabels'];
  return {
    nodeId: uid('node'), path, children: [],
    classificationLabels,
    inheritDown: { fields: true, display: true, card: true },
    fields: [], geometryProfiles: {},
  };
}
function defaultLabel(geometry: GeometryKind) {
  return clone(defaultRenderRule(geometry).label!);
}
function defaultStyle(geometry: GeometryKind) {
  return clone(defaultRenderRule(geometry).style!);
}

function NumberField({ label, value, onChange, min, max, step = 1, disabled = false }: {
  label: string; value: number | undefined; onChange: (value: number | undefined) => void; min?: number; max?: number; step?: number; disabled?: boolean;
}) {
  return <label className="text-xs">{label}<input disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" type="number" min={min} max={max} step={step} value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} /></label>;
}

/** Keeps the requested numeric entry and visible 0–1 slider in one source of truth. */
function OpacityField({ label, value, onChange }: { label: string; value: number | undefined; onChange: (value: number) => void }) {
  const resolved = Math.min(1, Math.max(0, Number.isFinite(value) ? Number(value) : 1));
  return <label className="min-w-0 text-xs">{label}<span className="mt-1 grid min-w-0 grid-cols-1 min-[1600px]:grid-cols-[minmax(0,1fr)_4rem] items-center gap-2"><input className="w-full min-w-0" type="range" min="0" max="1" step="0.05" value={resolved} onChange={(event) => onChange(Number(event.target.value))} /><input className="w-full rounded border px-2 py-1" type="number" min="0" max="1" step="0.05" value={resolved} onChange={(event) => onChange(Math.min(1, Math.max(0, Number(event.target.value))))} /></span></label>;
}

function ColorBindingEditor({ config, sourcePath: _sourcePath, fields, label, value, onChange, allowExternal = true }: {
  config: ConfigPackageV3; sourcePath: ClassificationPath; fields: string[]; label: string; value: RenderColorBinding; onChange: (next: RenderColorBinding) => void; allowExternal?: boolean;
}) {
  const mode = value.mode;
  const target = mode === 'external' ? value.target : undefined;
  const targetNode = target ? config.nodes.find((node) => samePath(node.path, target)) : undefined;
  const targetFields = targetNode ? allFieldKeys(config, targetNode.path) : [];
  return <fieldset className="rounded border bg-white p-2"><legend className="px-1 text-xs text-slate-600">{label}</legend>
    <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">颜色模式<select className="mt-1 w-full rounded border px-2 py-1" value={mode} onChange={(event) => {
      const next = event.target.value as RenderColorBinding['mode'];
      if (next === 'fixed') onChange({ mode: 'fixed', color: '#334155' });
      else if (next === 'field') onChange({ mode: 'field', field: fields[0] ?? 'Name', fallbackColor: '#334155' });
      else if (next === 'relatedLine') onChange({ mode: 'relatedLine', strategy: 'featureRelation', fallbackColor: '#2563eb' });
      else onChange({ mode: 'external', target: { class: '' }, targetIdField: 'ID', targetColorField: '', fallbackColor: '#334155' });
    }}><option value="fixed">直接选择</option><option value="field">绑定字段</option><option value="relatedLine">关联线路颜色</option>{allowExternal ? <option value="external">绑定外部要素字段</option> : null}</select></label>
      {mode === 'fixed' ? <label className="text-xs">颜色<input className="mt-1 block h-8 w-full rounded border" type="color" value={value.color} onChange={(event) => onChange({ ...value, color: event.target.value })} /></label> : null}
      {mode === 'field' ? <label className="text-xs sm:col-span-2">绑定颜色指示字段<select className="mt-1 w-full rounded border px-2 py-1" value={value.field} onChange={(event) => onChange({ ...value, field: event.target.value })}><option value="">选择字段</option>{fields.map((field) => <option key={field}>{field}</option>)}</select></label> : null}
    </div>
    {mode === 'relatedLine' ? <div className="mt-2 grid gap-2 md:grid-cols-2"><label className="text-xs">关联线路解析<select className="mt-1 w-full rounded border px-2 py-1" value={value.strategy} onChange={(event) => onChange({ ...value, strategy: event.target.value as typeof value.strategy })}><option value="featureRelation">要素关联线路（PFB）</option><option value="platformFirstLine">站台首条线路（PLF）</option><option value="stationFirstPlatform">车站首站台线路（STA）</option></select></label><label className="text-xs">未找到线路时的回退色<input className="mt-1 block h-8 w-full rounded border" type="color" value={value.fallbackColor ?? '#2563eb'} onChange={(event) => onChange({ ...value, fallbackColor: event.target.value })} /></label><p className="md:col-span-2 text-xs text-slate-500">此模式复用地图已建立的关联线路索引；它不是外部目标字段绑定，适用于 PFB、PLF、STA 等真实 V1 关联取色。</p></div> : null}
    {mode === 'external' ? <div className="mt-2 grid gap-2 md:grid-cols-3"><label className="text-xs">关系目标分类<select className="mt-1 w-full rounded border px-2 py-1" value={targetNode?.nodeId ?? ''} onChange={(event) => {
      const next = config.nodes.find((node) => node.nodeId === event.target.value);
      onChange({ ...value, target: next?.path ?? { class: '' }, targetColorField: '' });
    }}><option value="">选择分类</option>{config.nodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{nodeLabel(node)}</option>)}</select></label>
      <label className="text-xs">颜色目标要素 ID<select className="mt-1 w-full rounded border px-2 py-1" value={value.targetIdField} onChange={(event) => onChange({ ...value, targetIdField: event.target.value })}>{fields.map((field) => <option key={field}>{field}</option>)}</select></label>
      <label className="text-xs">目标要素颜色字段<select className="mt-1 w-full rounded border px-2 py-1" value={value.targetColorField} onChange={(event) => onChange({ ...value, targetColorField: event.target.value })}><option value="">选择字段</option>{targetFields.map((field) => <option key={field}>{field}</option>)}</select></label>
    </div> : null}
  </fieldset>;
}

/** Field-conditioned branches are still inside one inclusive Zoom rule.  This
 * is deliberately a small, typed editor because V1 only uses them for a few
 * real branches (for example RLE direction and PLF connection state), not a
 * second parallel time line. */
function ConditionalOverridesEditor({ config, path, geometry, rule, onChange }: {
  config: ConfigPackageV3; path: ClassificationPath; geometry: GeometryKind; rule: ZoomPriorityRule; onChange: (next: ZoomPriorityRule) => void;
}) {
  const fields = allFieldKeys(config, path);
  const overrides = rule.conditionalOverrides ?? [];
  const representations = geometry === 'Polygon'
    ? [['hidden', '隐藏'], ['point', '面内中点'], ['geometry', '显示面'], ['labelOnly', '仅标签']]
    : geometry === 'LineString' ? [['hidden', '隐藏'], ['geometry', '显示线'], ['labelOnly', '仅标签']]
      : [['hidden', '隐藏'], ['geometry', '显示点'], ['labelOnly', '仅标签']];
  const patch = (index: number, next: RenderRuleConditionalOverride) => onChange({ ...rule, conditionalOverrides: overrides.map((item, current) => current === index ? next : item) });
  const add = () => {
    const baseLabel = rule.label ? clone(rule.label) : defaultLabel(geometry);
    const next: RenderRuleConditionalOverride = {
      id: uid('field-branch'),
      when: [{ kind: 'fieldEquals', field: fields[0] ?? 'Name', value: '' }],
      representation: rule.representation,
      label: { ...baseLabel, visible: false },
    };
    onChange({ ...rule, conditionalOverrides: [...overrides, next] });
  };
  const conditionFor = (kind: 'fieldEquals' | 'fieldIn' | 'fieldPresent', field: string, value = '', present = true): Condition => {
    if (kind === 'fieldIn') return { kind, field, values: value.split(',').map((item) => item.trim()).filter(Boolean) };
    if (kind === 'fieldPresent') return { kind, field, present };
    return { kind, field, value };
  };
  return <details className="rounded border border-amber-200 bg-amber-50/40 p-2"><summary className="cursor-pointer text-sm font-medium">字段条件分支（同一 Zoom 规则内）</summary><p className="mt-1 text-xs text-slate-600">用于真实 V1 的方向、关联状态等字段分支。分支不会新增 Zoom 区间；顺序从上至下覆盖，后一个命中的分支优先。</p>
    <div className="mt-2 space-y-2">{overrides.map((override, index) => {
      const source = override.when[0] ?? { kind: 'fieldEquals' as const, field: fields[0] ?? 'Name', value: '' };
      const conditionKind = source.kind === 'fieldIn' || source.kind === 'fieldPresent' ? source.kind : 'fieldEquals';
      const sourceField = source.kind === 'always' || source.kind === 'zoomRange' || source.kind === 'bboxArea' ? fields[0] ?? 'Name' : source.field;
      const sourceValue = source.kind === 'fieldIn' ? source.values.join(', ') : source.kind === 'fieldEquals' ? source.value : '';
      const baseStyle = override.style;
      const branchLabel = override.label;
      const updateCondition = (kind: 'fieldEquals' | 'fieldIn' | 'fieldPresent' = conditionKind, field = sourceField, value = sourceValue, present = source.kind === 'fieldPresent' ? source.present : true) => patch(index, { ...override, when: [conditionFor(kind, field, value, present)] });
      return <article key={override.id} className="rounded border bg-white p-2"><div className="grid gap-2 md:grid-cols-[10rem_1fr_1fr_auto]"><label className="text-xs">条件<select className="mt-1 w-full rounded border px-2 py-1" value={conditionKind} onChange={(event) => updateCondition(event.target.value as typeof conditionKind)}><option value="fieldEquals">字段等于</option><option value="fieldIn">字段属于（多值）</option><option value="fieldPresent">字段存在/为空</option></select></label><label className="text-xs">字段<select className="mt-1 w-full rounded border px-2 py-1" value={sourceField} onChange={(event) => updateCondition(conditionKind, event.target.value)}>{fields.map((field) => <option key={field}>{field}</option>)}</select></label>{conditionKind === 'fieldPresent' ? <label className="inline-flex items-center gap-1 pt-5 text-xs"><input type="checkbox" checked={source.kind === 'fieldPresent' ? source.present : true} onChange={(event) => updateCondition(conditionKind, sourceField, '', event.target.checked)} />字段存在时命中</label> : <label className="text-xs">{conditionKind === 'fieldIn' ? '匹配值（逗号分隔）' : '匹配值'}<input className="mt-1 w-full rounded border px-2 py-1" value={sourceValue} onChange={(event) => updateCondition(conditionKind, sourceField, event.target.value)} /></label>}<button type="button" className="mt-5 text-xs text-rose-700" onClick={() => onChange({ ...rule, conditionalOverrides: overrides.filter((_, current) => current !== index) })}>删除分支</button></div>
        <div className="mt-2 grid gap-2 md:grid-cols-3"><label className="text-xs">该分支显示种类<select className="mt-1 w-full rounded border px-2 py-1" value={override.representation ?? rule.representation ?? 'geometry'} onChange={(event) => patch(index, { ...override, representation: event.target.value as RenderRuleConditionalOverride['representation'] })}>{representations.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label className="inline-flex items-center gap-1 pt-5 text-xs"><input type="checkbox" checked={Boolean(baseStyle)} onChange={(event) => patch(index, { ...override, style: event.target.checked ? clone(rule.style ?? defaultStyle(geometry)) : undefined })} />覆盖显示效果</label><label className="inline-flex items-center gap-1 pt-5 text-xs"><input type="checkbox" checked={Boolean(branchLabel)} onChange={(event) => patch(index, { ...override, label: event.target.checked ? clone(rule.label ?? defaultLabel(geometry)) : undefined })} />覆盖 Label 效果</label></div>
        {baseStyle ? <div className="mt-2 rounded border border-slate-200 p-2"><div className="grid gap-2 md:grid-cols-4"><NumberField label="点大小" value={baseStyle.size} min={1} onChange={(value) => patch(index, { ...override, style: { ...baseStyle, size: value } })} /><NumberField label="描边粗细" value={baseStyle.weight} min={0} step={0.5} onChange={(value) => patch(index, { ...override, style: { ...baseStyle, weight: value } })} /><OpacityField label="描边透明度" value={baseStyle.strokeOpacity} onChange={(value) => patch(index, { ...override, style: { ...baseStyle, strokeOpacity: value } })} /><OpacityField label="填色透明度" value={baseStyle.fillOpacity ?? 0.88} onChange={(value) => patch(index, { ...override, style: { ...baseStyle, fillOpacity: value } })} /></div><div className="mt-2 grid gap-2 md:grid-cols-2"><ColorBindingEditor config={config} sourcePath={path} fields={fields} label="条件描边" value={baseStyle.stroke} onChange={(stroke) => patch(index, { ...override, style: { ...baseStyle, stroke } })} /><ColorBindingEditor config={config} sourcePath={path} fields={fields} label="条件填色" value={baseStyle.fill ?? { mode: 'fixed', color: '#334155' }} onChange={(fill) => patch(index, { ...override, style: { ...baseStyle, fill } })} /></div></div> : null}
        {branchLabel ? <div className="mt-2 grid gap-2 rounded border border-slate-200 p-2 md:grid-cols-4"><label className="inline-flex items-center gap-1 pt-5 text-xs"><input type="checkbox" checked={branchLabel.visible} onChange={(event) => patch(index, { ...override, label: { ...branchLabel, visible: event.target.checked } })} />显示 Label</label><label className="text-xs">样式<select className="mt-1 w-full rounded border px-2 py-1" value={branchLabel.style?.family ?? 'gm-outline'} onChange={(event) => patch(index, { ...override, label: { ...branchLabel, style: { ...(branchLabel.style ?? { size: 14 }), family: event.target.value as RenderLabelVisualStyle['family'] } } })}>{labelFamilies.map((family) => <option key={family.value} value={family.value}>{family.label}</option>)}</select></label><NumberField label="Label 大小" value={branchLabel.style?.size ?? 14} min={6} max={72} onChange={(value) => patch(index, { ...override, label: { ...branchLabel, style: { ...(branchLabel.style ?? { family: 'gm-outline' }), size: value ?? 14 } } })} /><label className="text-xs">来源<select className="mt-1 w-full rounded border px-2 py-1" value={branchLabel.source ?? 'Name'} onChange={(event) => patch(index, { ...override, label: { ...branchLabel, source: event.target.value } })}>{fields.map((field) => <option key={field}>{field}</option>)}</select></label></div> : null}
        <details className="mt-2 rounded border p-2"><summary className="text-xs">条件分支高级设置</summary>{(() => {
          const branch: ZoomPriorityRule = { ...rule, ...override, conditionalOverrides: undefined, extensions: override.extensions ?? {}, style: override.style ?? rule.style, label: override.label ?? rule.label };
          const update = (next: ZoomPriorityRule) => patch(index, { ...override, style: next.style, label: next.label, priority: next.priority, geometryStack: next.geometryStack, extensions: next.extensions });
          return <><NativeSymbolSettings rule={branch} onChange={update} allowOffsets={geometry === 'Point' || branch.representation === 'point'} /><LabelPlacementSettings rule={branch} onChange={update} allowDecoration={geometry === 'Point' && branch.style?.symbolVisibility !== 'withLabel'} /><CollisionMetricEditor rule={branch} onChange={update} fields={fields} /><DisplayPrioritySettings rule={branch} onChange={update} /><RuleExtensionsEditor geometry={geometry} rule={branch} onChange={update} /><ExtraRuleSettings rule={branch} onChange={update} /><RuleInteractionSettings rule={branch} onChange={update} baseline={config.engine!.interactionBaselines[geometry]} /></>;
        })()}</details>
      </article>;
    })}</div><button type="button" className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs" onClick={add}><Plus className="h-3 w-3" />添加字段条件分支</button>
  </details>;
}

function RuleExtensionsEditor({ geometry, rule, onChange }: { geometry: GeometryKind; rule: ZoomPriorityRule; onChange: (rule: ZoomPriorityRule) => void }) {
  const ext = rule.extensions ?? {};
  const screen = ext.screenGate ?? { mode: 'inherit' as const };
  const labelText = ext.labelText ?? {};
  const density = ext.density ?? { mode: 'inherit' as const };
  const lineLabel = ext.lineLabel ?? { profile: 'inherit' as const };
  const anchorOptions = geometry === 'Point'
    ? [['inherit', '继承'], ['featureCenter', '完整中心']]
    : geometry === 'LineString'
      ? [['inherit', '继承'], ['featureCenter', '完整中心'], ['lineCenter', '线中点'], ['lineCandidates', '线候选点']]
      : [['inherit', '继承'], ['featureCenter', '完整中心'], ['interior', '面内固定'], ['visibleInterior', '可见面内']];
  const anchorCandidates = ['C', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'] as const;
  const patch = (next: typeof ext) => onChange({ ...rule, extensions: next });
  return <details className="rounded border border-indigo-200 bg-indigo-50/40 p-2"><summary className="cursor-pointer text-sm font-medium">扩展规则（引擎默认值，可按规则覆盖）</summary>
    <p className="mt-1 text-xs text-slate-600">Pane、点击容差、屏幕面积/长度、文字截断、候选锚点、密度预算和线标签算法均为类型化字段；没有 JSON 回退和 V1 成品规则开关。</p>
    <div className="mt-2 grid gap-2 md:grid-cols-4"><label className="text-xs">屏幕阈值<select className="mt-1 w-full rounded border px-2 py-1" value={screen.mode} onChange={(event) => patch({ ...ext, screenGate: { ...screen, mode: event.target.value as 'inherit' | 'override' } })}><option value="inherit">继承全局</option><option value="override">本规则覆盖</option></select></label>
      {geometry === 'Polygon' ? <NumberField label="最小屏幕面积 px²" value={screen.minScreenAreaPx} min={0} disabled={screen.mode !== 'override'} onChange={(value) => patch({ ...ext, screenGate: { ...screen, minScreenAreaPx: value } })} /> : null}
      {geometry === 'LineString' ? <NumberField label="最小屏幕长度 px" value={screen.minScreenLengthPx} min={0} disabled={screen.mode !== 'override'} onChange={(value) => patch({ ...ext, screenGate: { ...screen, minScreenLengthPx: value } })} /> : null}
      <label className="text-xs">Pane 覆盖<select className="mt-1 w-full rounded border px-2 py-1" value={ext.pane ?? 'auto'} onChange={(event) => patch({ ...ext, pane: event.target.value as NonNullable<typeof ext.pane> })}><option value="auto">自动（引擎默认）</option><option value="overlay">普通线/面</option><option value="overlay-top">顶层线/面</option><option value="point">普通点</option><option value="point-top">顶层点</option></select></label>
      <NumberField label="点击容差 px" value={ext.hitTolerancePx} min={0} max={80} onChange={(value) => patch({ ...ext, hitTolerancePx: value })} />
    </div>
    <div className="mt-2 grid gap-2 md:grid-cols-4"><NumberField label="Label 最大字符数" value={labelText.maxChars} min={1} onChange={(value) => patch({ ...ext, labelText: { ...labelText, maxChars: value } })} />
      <label className="text-xs">多行 Label<input className="ml-2" type="checkbox" checked={Boolean(labelText.multiline)} onChange={(event) => patch({ ...ext, labelText: { ...labelText, multiline: event.target.checked } })} /></label>
      <NumberField label="最大行数" value={labelText.maxLines} min={1} disabled={!labelText.multiline} onChange={(value) => patch({ ...ext, labelText: { ...labelText, maxLines: value } })} />
      <label className="text-xs">截断后缀<input className="mt-1 w-full rounded border px-2 py-1" value={labelText.suffix ?? '…'} onChange={(event) => patch({ ...ext, labelText: { ...labelText, suffix: event.target.value } })} /></label>
    </div>
    <div className="mt-2 rounded border border-indigo-100 bg-white p-2"><div className="grid gap-2 md:grid-cols-3"><label className="text-xs">候选锚点策略<select className="mt-1 w-full rounded border px-2 py-1" value={ext.anchor?.strategy ?? 'inherit'} onChange={(event) => patch({ ...ext, anchor: { ...ext.anchor, strategy: event.target.value as NonNullable<typeof ext.anchor>['strategy'] } })}>{anchorOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="inline-flex items-center gap-1 pt-5 text-xs"><input type="checkbox" checked={Boolean(ext.anchor?.preferViewportCenter)} onChange={(event) => patch({ ...ext, anchor: { ...ext.anchor, preferViewportCenter: event.target.checked } })} />大要素优先视窗中心</label>
      <label className="text-xs">密度预算<select className="mt-1 w-full rounded border px-2 py-1" value={density.mode} onChange={(event) => patch({ ...ext, density: { ...density, mode: event.target.value as 'inherit' | 'override' } })}><option value="inherit">继承</option><option value="override">本规则覆盖</option></select></label></div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs"><span>候选方向：</span>{anchorCandidates.map((candidate) => <label key={candidate}><input type="checkbox" checked={Boolean(ext.anchor?.candidates?.includes(candidate))} onChange={(event) => { const next = new Set(ext.anchor?.candidates ?? []); if (event.target.checked) next.add(candidate); else next.delete(candidate); patch({ ...ext, anchor: { ...ext.anchor, candidates: [...next] } }); }} /> {candidate}</label>)}</div>
      <div className="mt-2 grid gap-2 md:grid-cols-3"><NumberField label="密度网格 px" value={density.gridSizePx} min={1} disabled={density.mode !== 'override'} onChange={(value) => patch({ ...ext, density: { ...density, gridSizePx: value } })} /><NumberField label="每格最多 Label" value={density.maxLabelsPerGrid} min={1} disabled={density.mode !== 'override'} onChange={(value) => patch({ ...ext, density: { ...density, maxLabelsPerGrid: value } })} /><NumberField label="每格最多符号" value={density.maxSymbolsPerGrid} min={1} disabled={density.mode !== 'override'} onChange={(value) => patch({ ...ext, density: { ...density, maxSymbolsPerGrid: value } })} /></div>
    </div>
    {geometry === 'LineString' ? <div className="mt-2 rounded border border-indigo-100 bg-white p-2"><div className="grid gap-2 md:grid-cols-3"><label className="text-xs">线标签算法<select className="mt-1 w-full rounded border px-2 py-1" value={lineLabel.profile} onChange={(event) => patch({ ...ext, lineLabel: { ...lineLabel, profile: event.target.value as NonNullable<typeof ext.lineLabel>['profile'] } })}><option value="inherit">继承</option><option value="standard">标准</option><option value="network">网络</option><option value="strict-on-line">严格沿线</option></select></label><label className="text-xs">线文字模式<select className="mt-1 w-full rounded border px-2 py-1" value={lineLabel.textMode ?? 'auto'} onChange={(event) => patch({ ...ext, lineLabel: { ...lineLabel, textMode: event.target.value as NonNullable<typeof lineLabel.textMode> } })}><option value="auto">自动</option><option value="rotatedLabel">旋转文字</option><option value="textPath">沿线字形</option></select></label><NumberField label="端点留白比例" value={lineLabel.endpointPaddingRatio} min={0} step={0.01} onChange={(value) => patch({ ...ext, lineLabel: { ...lineLabel, endpointPaddingRatio: value } })} /></div><div className="mt-2 grid gap-2 md:grid-cols-3"><NumberField label="端点最小留白 px" value={lineLabel.endpointPaddingMinPx} min={0} onChange={(value) => patch({ ...ext, lineLabel: { ...lineLabel, endpointPaddingMinPx: value } })} /><NumberField label="最大转角" value={lineLabel.maxTurnAngleDeg} min={0} max={180} onChange={(value) => patch({ ...ext, lineLabel: { ...lineLabel, maxTurnAngleDeg: value } })} /><NumberField label="最小线长 px" value={lineLabel.minLengthPx} min={0} onChange={(value) => patch({ ...ext, lineLabel: { ...lineLabel, minLengthPx: value } })} /></div></div> : null}
  </details>;
}
// Kept as a read-only compatibility reference while the complete editor lives
// in RenderRuleExtensionsEditor.  It helps old saved JSX snapshots remain
// explainable without becoming a second editable contract.
void RuleExtensionsEditor;

function LegacyRenderRuleEditor({ config, path, geometry, profile, onChange }: { config: ConfigPackageV3; path: ClassificationPath; geometry: GeometryKind; profile: GeometryProfile; onChange: (value: GeometryProfile) => void }) {
  const rules = profile.zoomPriority.rules;
  const fields = allFieldKeys(config, path);
  const update = (ruleId: string, patch: Partial<ZoomPriorityRule>) => onChange({ ...profile, zoomPriority: { rules: rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule) } });
  const updateRule = (next: ZoomPriorityRule) => update(next.id, next);
  const append = () => {
    const last = rules[rules.length - 1] ?? defaultRenderRule(geometry);
    const min = Math.max(0, Number(last.minZoom ?? 0));
    const max = Math.min(8, Number(last.maxZoom ?? 8));
    // The intervals are inclusive.  Copying a 0–8 rule verbatim would make
    // the freshly added rule invalid until the author manually repairs both
    // ends, which is a particularly easy way to lose a draft after pressing
    // “添加渲染规则”. Split the previous final interval into two adjacent,
    // non-overlapping intervals instead. The copied visual settings remain
    // editable on the new half.
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return;
    const split = Math.floor((min + max) / 2);
    const next = clone(last);
    next.id = uid('render');
    next.minZoom = split + 1;
    next.maxZoom = max;
    onChange({
      ...profile,
      zoomPriority: {
        rules: rules.map((rule) => rule.id === last.id ? { ...rule, maxZoom: split } : rule).concat(next),
      },
    });
  };
  const representationOptions = geometry === 'Polygon'
    ? [['hidden', '隐藏'], ['point', '面内中点'], ['geometry', '显示面'], ['labelOnly', '仅标签']]
    : geometry === 'LineString'
      ? [['hidden', '隐藏'], ['geometry', '显示线'], ['labelOnly', '仅标签']]
      : [['hidden', '隐藏'], ['geometry', '显示点'], ['labelOnly', '仅标签']];
  return <section className="space-y-3"><div><h4 className="font-semibold">渲染规则</h4><p className="mt-1 text-xs text-slate-500">规则 Zoom 区间是唯一的渲染规则对象（沿用 V1 的 round(Leaflet Zoom + 3)、0–8 映射）。每条规则独立拥有样式、Label、层级、优先级及扩展覆盖；渲染规则 1 不可删除。</p></div>
    {rules.map((rule, index) => {
      const style = rule.style ?? defaultStyle(geometry);
      const label = rule.label ?? defaultLabel(geometry);
      const visual = label.style ?? defaultLabel(geometry).style!;
      const pointLike = geometry === 'Point' || rule.representation === 'point';
      const supportsFill = geometry !== 'LineString' || pointLike;
      const updateStyle = (patch: Partial<RenderStyle>) => update(rule.id, { style: { ...style, ...patch } });
      const updateLabel = (patch: Partial<typeof label>) => update(rule.id, { label: { ...label, ...patch } });
      const updateVisual = (patch: Partial<RenderLabelVisualStyle>) => updateLabel({ style: { ...visual, ...patch } });
      const metricKinds = geometry === 'Point' ? ['partCount', 'field'] : geometry === 'LineString' ? ['length', 'partCount', 'field'] : ['area', 'partCount', 'field'];
      return <details key={rule.id} open={index === 0} className="rounded border bg-slate-50 p-3"><summary className="cursor-pointer font-medium">渲染规则 {index + 1} · {rule.minZoom ?? 0} ≤ Zoom ≤ {rule.maxZoom ?? 8}</summary><div className="mt-3 space-y-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_1fr_auto]"><NumberField label="下界" value={rule.minZoom} min={0} max={8} onChange={(value) => update(rule.id, { minZoom: value })} /><span className="pt-6 text-sm">≤ Zoom ≤</span><NumberField label="上界" value={rule.maxZoom} min={0} max={8} onChange={(value) => update(rule.id, { maxZoom: value })} /><label className="text-xs">显示种类<select className="mt-1 w-full rounded border px-2 py-1" value={rule.representation ?? 'geometry'} onChange={(event) => update(rule.id, { representation: event.target.value as ZoomPriorityRule['representation'] })}>{representationOptions.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>{index > 0 ? <button type="button" className="mt-5 text-xs text-rose-700" onClick={() => onChange({ ...profile, zoomPriority: { rules: rules.filter((item) => item.id !== rule.id) } })}>删除</button> : <span />}</div>
        {rule.representation !== 'hidden' ? <section className="rounded border bg-white p-2"><h5 className="font-medium">显示效果</h5><div className="mt-2 grid gap-2 md:grid-cols-4"><label className="text-xs">显示效果<select className="mt-1 w-full rounded border px-2 py-1" value={pointLike ? style.pointShape ?? 'circle' : style.dashPreset ?? 'solid'} onChange={(event) => updateStyle(pointLike ? { pointShape: event.target.value as RenderStyle['pointShape'] } : { dashPreset: event.target.value as RenderStyle['dashPreset'] })}>{pointLike ? [['circle', '圆圈'], ['square', '方块'], ['triangle', '三角'], ['regular4', '正方形'], ['regular5', '五边形'], ['regular6', '六边形']].map(([value, name]) => <option key={value} value={value}>{name}</option>) : [['solid', '实线'], ['dash', '虚线'], ['dotDash', '点-短线虚线'], ['dotDotDash', '点-点-短线虚线']].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>{pointLike ? <NumberField label="大小" value={style.size} min={1} onChange={(value) => updateStyle({ size: value })} /> : null}<NumberField label="描边粗细" value={style.weight} min={0} step={0.5} onChange={(value) => updateStyle({ weight: value })} />{geometry !== 'Point' ? <><label className="text-xs">线端<select className="mt-1 w-full rounded border px-2 py-1" value={style.lineCap ?? 'round'} onChange={(event) => updateStyle({ lineCap: event.target.value as RenderStyle['lineCap'] })}><option value="round">圆</option><option value="butt">平</option><option value="square">方</option></select></label><label className="text-xs">转角<select className="mt-1 w-full rounded border px-2 py-1" value={style.lineJoin ?? 'round'} onChange={(event) => updateStyle({ lineJoin: event.target.value as RenderStyle['lineJoin'] })}><option value="round">圆</option><option value="miter">尖</option><option value="bevel">斜</option></select></label></> : null}</div><div className={`mt-2 grid gap-2 ${supportsFill ? 'lg:grid-cols-2' : ''}`}><ColorBindingEditor config={config} sourcePath={path} fields={fields} label="描边" value={style.stroke} onChange={(stroke) => updateStyle({ stroke })} />{supportsFill ? <ColorBindingEditor config={config} sourcePath={path} fields={fields} label="填色" value={style.fill ?? { mode: 'fixed', color: '#334155' }} onChange={(fill) => updateStyle({ fill })} /> : null}</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><OpacityField label="描边透明度" value={style.strokeOpacity} onChange={(value) => updateStyle({ strokeOpacity: value })} />{supportsFill ? <OpacityField label="填色透明度" value={style.fillOpacity ?? (geometry === 'Polygon' ? 0.24 : 0.88)} onChange={(value) => updateStyle({ fillOpacity: value })} /> : null}</div>{pointLike ? <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2"><summary className="cursor-pointer text-xs font-medium">图标覆盖（本 Zoom 规则）</summary><div className="mt-2 grid gap-2 md:grid-cols-5"><label className="inline-flex items-center gap-1 pt-5 text-xs"><input type="checkbox" checked={Boolean(style.icon)} onChange={(event) => updateStyle({ icon: event.target.checked ? { source: fields.find((field) => /icon|image|picture/i.test(field)) ?? fields[0] ?? 'iconUrl', size: [32, 32], anchor: [16, 16], fallback: 'circle' } : undefined })} />使用外部图标字段</label>{style.icon ? <><label className="text-xs">图标 URL 字段<select className="mt-1 w-full rounded border px-2 py-1" value={style.icon.source} onChange={(event) => updateStyle({ icon: { ...style.icon!, source: event.target.value } })}>{fields.map((field) => <option key={field}>{field}</option>)}</select></label><NumberField label="宽度 px" value={style.icon.size[0]} min={1} onChange={(value) => updateStyle({ icon: { ...style.icon!, size: [value ?? 32, style.icon!.size[1]] } })} /><NumberField label="高度 px" value={style.icon.size[1]} min={1} onChange={(value) => updateStyle({ icon: { ...style.icon!, size: [style.icon!.size[0], value ?? 32] } })} /><label className="text-xs">URL 缺失时<select className="mt-1 w-full rounded border px-2 py-1" value={style.icon.fallback} onChange={(event) => updateStyle({ icon: { ...style.icon!, fallback: event.target.value as typeof style.icon.fallback } })}><option value="circle">使用本规则点样式</option><option value="hide">隐藏</option></select></label></> : null}</div>{style.icon ? <div className="mt-2 grid gap-2 md:grid-cols-2"><NumberField label="锚点 X px" value={style.icon.anchor[0]} onChange={(value) => updateStyle({ icon: { ...style.icon!, anchor: [value ?? 16, style.icon!.anchor[1]] } })} /><NumberField label="锚点 Y px" value={style.icon.anchor[1]} onChange={(value) => updateStyle({ icon: { ...style.icon!, anchor: [style.icon!.anchor[0], value ?? 16] } })} /></div> : null}</details> : null}</section> : null}
        <section className="rounded border bg-white p-2"><h5 className="font-medium">Label 效果</h5><div className="mt-2 grid gap-2 md:grid-cols-5"><label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={label.visible} onChange={(event) => updateLabel({ visible: event.target.checked })} />显示 Label</label><label className="text-xs">样式<select className="mt-1 w-full rounded border px-2 py-1" value={visual.family} onChange={(event) => updateVisual({ family: event.target.value as RenderLabelVisualStyle['family'], ...(textOnlyFamilies.has(event.target.value as RenderLabelVisualStyle['family']) ? {} : { modifiers: {} }) })}>{labelFamilies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><NumberField label="大小" value={visual.size} min={6} max={72} onChange={(value) => updateVisual({ size: value ?? 14 })} /><label className="text-xs">来源<select className="mt-1 w-full rounded border px-2 py-1" value={label.source ?? 'Name'} onChange={(event) => updateLabel({ source: event.target.value })}>{fields.map((field) => <option key={field}>{field}</option>)}</select></label>{textOnlyFamilies.has(visual.family) ? <span className="flex flex-col gap-1 pt-1 text-xs"><label><input type="checkbox" checked={Boolean(visual.modifiers?.italic)} onChange={(event) => updateVisual({ modifiers: { ...visual.modifiers, italic: event.target.checked } })} /> 斜体</label><label><input type="checkbox" checked={Boolean(visual.modifiers?.underline)} onChange={(event) => updateVisual({ modifiers: { ...visual.modifiers, underline: event.target.checked } })} /> 下划线</label></span> : <span className="pt-5 text-xs text-slate-400">该样式不支持斜体/下划线</span>}</div><div className="mt-2 grid gap-2 md:grid-cols-6"><label className="text-xs md:col-span-2">回退来源（逗号分隔，按顺序）<input className="mt-1 w-full rounded border px-2 py-1" value={(label.fallbackSources ?? []).join(', ')} placeholder="例如 ID, NofFloor" onChange={(event) => updateLabel({ fallbackSources: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label><label className="text-xs">主来源格式<select className="mt-1 w-full rounded border px-2 py-1" value={label.valueFormat ?? 'plain'} onChange={(event) => updateLabel({ valueFormat: event.target.value as NonNullable<typeof label.valueFormat> })}><option value="plain">原文</option><option value="floorLabel">楼层号格式</option></select></label><label className="text-xs">标签位置<select className="mt-1 w-full rounded border px-2 py-1" value={label.placement ?? 'center'} onChange={(event) => updateLabel({ placement: event.target.value as NonNullable<typeof label.placement> })}>{labelPlacementOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><NumberField label="X 偏移 px" value={label.offsetX} onChange={(value) => updateLabel({ offsetX: value })} /><NumberField label="Y 偏移 px" value={label.offsetY} onChange={(value) => updateLabel({ offsetY: value })} /></div><div className="mt-2 grid gap-2 md:grid-cols-4"><label className="text-xs">首个回退格式<select className="mt-1 w-full rounded border px-2 py-1" value={label.fallbackValueFormats?.[(label.fallbackSources ?? [])[0] ?? ''] ?? 'plain'} disabled={!(label.fallbackSources ?? []).length} onChange={(event) => { const source = (label.fallbackSources ?? [])[0]; if (!source) return; updateLabel({ fallbackValueFormats: { ...label.fallbackValueFormats, [source]: event.target.value as 'plain' | 'floorLabel' } }); }}><option value="plain">原文</option><option value="floorLabel">楼层号格式</option></select></label><label className="inline-flex items-center gap-1 pt-5 text-xs"><input type="checkbox" checked={Boolean(label.withDot)} onChange={(event) => updateLabel({ withDot: event.target.checked })} />显示锚点圆点</label><label className="text-xs">圆点位置<select className="mt-1 w-full rounded border px-2 py-1" value={label.dotAnchorMode ?? 'anchorRight'} onChange={(event) => updateLabel({ dotAnchorMode: event.target.value as NonNullable<typeof label.dotAnchorMode> })}><option value="anchorRight">标签右侧</option><option value="inline">文字前</option></select></label><p className="pt-5 text-xs text-slate-500">格式、回退、位置与圆点均属于当前 Zoom 渲染规则，不会写入全局默认。</p></div>{visual.family === 'rle-line-color' || visual.family === 'rle-pill-color' ? <div className="mt-2"><ColorBindingEditor config={config} sourcePath={path} fields={fields} label={visual.family === 'rle-line-color' ? '线路文字颜色' : '胶囊背景颜色'} value={visual.color ?? { mode: 'fixed', color: '#2563eb' }} onChange={(color) => updateVisual({ color })} /></div> : null}</section>
        <section className="rounded border bg-white p-2"><h5 className="font-medium">权重和层数</h5><p className="mt-1 text-xs text-slate-500">几何 zLevel 决定跨类覆盖顺序；Label 角色和显示权重分别独立参与碰撞与同层排序，互不混用。</p><div className="mt-2 grid gap-2 md:grid-cols-4"><NumberField label="整体几何 zLevel" value={rule.geometryStack?.zLevel} min={0} max={9999} onChange={(value) => update(rule.id, { geometryStack: { ...rule.geometryStack, zLevel: value ?? 300 } })} /><label className="text-xs">Label 角色<select className="mt-1 w-full rounded border px-2 py-1" value={label.collision.role} onChange={(event) => updateLabel({ collision: { ...label.collision, role: event.target.value as typeof label.collision.role } })}>{['ignore', 'soft', 'optional', 'important', 'required'].map((role) => <option key={role}>{role}</option>)}</select></label><NumberField label="Label 优先级" value={label.collision.basePriority} onChange={(value) => updateLabel({ collision: { ...label.collision, basePriority: value ?? 0 } })} /><NumberField label="基础显示权重" value={rule.priority?.base} onChange={(value) => update(rule.id, { priority: { ...(rule.priority ?? { mode: 'replace' }), base: value } })} /></div><div className="mt-2 grid gap-2 md:grid-cols-4"><label className="text-xs">动态指标<select className="mt-1 w-full rounded border px-2 py-1" value={rule.priority?.metric?.kind ?? ''} onChange={(event) => { const kind = event.target.value; update(rule.id, { priority: { ...(rule.priority ?? { mode: 'replace' }), metric: kind ? { kind: kind as NonNullable<NonNullable<ZoomPriorityRule['priority']>['metric']>['kind'], multiplier: 1, rounding: 'floor' } : undefined } }); }}>{<option value="">不启用</option>}{metricKinds.map((kind) => <option key={kind} value={kind}>{kind === 'area' ? '面积' : kind === 'length' ? '长度' : kind === 'partCount' ? '部件数量' : '字段数值'}</option>)}</select></label>{rule.priority?.metric ? <><label className="text-xs">权重合成<select className="mt-1 w-full rounded border px-2 py-1" value={rule.priority?.mode ?? 'replace'} onChange={(event) => updateRule({ ...rule, priority: { ...rule.priority!, mode: event.target.value as NonNullable<ZoomPriorityRule['priority']>['mode'] } })}><option value="replace">指标替代基础权重</option><option value="add">基础权重 + 指标</option></select></label><NumberField label="倍率" value={rule.priority.metric.multiplier} onChange={(value) => updateRule({ ...rule, priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, multiplier: value ?? 1 } } })} /><NumberField label="除数" value={rule.priority.metric.divisor} min={0.0001} onChange={(value) => updateRule({ ...rule, priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, divisor: value } } })} />{rule.priority.metric.kind === 'field' ? <label className="text-xs">指标字段<select className="mt-1 w-full rounded border px-2 py-1" value={rule.priority.metric.field ?? ''} onChange={(event) => updateRule({ ...rule, priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, field: event.target.value } } })}>{fields.map((field) => <option key={field}>{field}</option>)}</select></label> : null}</> : null}</div>{rule.priority?.metric ? <div className="mt-2 grid gap-2 md:grid-cols-4"><NumberField label="指标下限（可空）" value={rule.priority.metric.min} onChange={(value) => updateRule({ ...rule, priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, min: value } } })} /><NumberField label="指标上限（可空）" value={rule.priority.metric.max} onChange={(value) => updateRule({ ...rule, priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, max: value } } })} /><label className="text-xs">取整方式<select className="mt-1 w-full rounded border px-2 py-1" value={rule.priority.metric.rounding} onChange={(event) => updateRule({ ...rule, priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, rounding: event.target.value as NonNullable<NonNullable<ZoomPriorityRule['priority']>['metric']>['rounding'] } } })}><option value="none">不取整</option><option value="floor">向下取整</option><option value="round">四舍五入</option><option value="ceil">向上取整</option></select></label></div> : null}</section>
        {pointLike ? <NativeSymbolSettings rule={rule} onChange={updateRule} /> : null}<LabelPlacementSettings rule={rule} onChange={updateRule} allowDecoration={geometry === 'Point' && style.symbolVisibility !== 'withLabel' && rule.representation !== 'labelOnly'} /><ConditionalOverridesEditor config={config} path={path} geometry={geometry} rule={rule} onChange={updateRule} />
        <RenderRuleExtensionsEditor geometry={geometry} rule={rule} onChange={updateRule} config={config} sourcePath={path} fields={fields} /><CollisionMetricEditor rule={rule} onChange={updateRule} fields={fields} /><ExtraRuleSettings rule={rule} onChange={updateRule} /><RuleInteractionSettings rule={rule} baseline={(config.engine ?? createV32EngineDefaults()).interactionBaselines[geometry]} onChange={updateRule} />
      </div></details>;
    })}
    <button type="button" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm" onClick={append}><Plus className="h-4 w-4" />添加渲染规则（复制上一条）</button>
  </section>;
}

// The former component is retained only as a migration reference.  The
// author-facing editor below is deliberately structured around one inclusive
// Zoom rule at a time, so no global geometry/style values can silently leak
// between low- and high-zoom BUD/ROD/ISG states.
void LegacyRenderRuleEditor;

const labelPlacementOptions: Array<[string, string]> = [
  ['center', '中心'], ['N', '上方'], ['S', '下方'], ['E', '右侧'], ['W', '左侧'],
  ['NE', '右上'], ['NW', '左上'], ['SE', '右下'], ['SW', '左下'],
  ['aboveLine', '线条上方'], ['belowLine', '线条下方'], ['near', '近锚点（兼容旧包）'],
];

/** Native r5 rule authoring surface.  Every visual value lives in exactly one
 * inclusive logical Zoom interval.  Geometry interaction triggers stay on
 * the GeometryProfile, and common hover/selected/edit/delete styling stays
 * in the engine baseline, as agreed in the V3.2 contract. */
function RenderRuleEditor({ config, path, geometry, profile, onChange }: { config: ConfigPackageV3; path: ClassificationPath; geometry: GeometryKind; profile: GeometryProfile; onChange: (value: GeometryProfile) => void }) {
  const rules = profile.zoomPriority.rules;
  const fields = allFieldKeys(config, path);
  const representations: Array<[ZoomPriorityRule['representation'], string]> = geometry === 'Polygon'
    ? [['hidden', '隐藏'], ['point', '面内中点'], ['geometry', '显示面'], ['labelOnly', '仅标签']]
    : geometry === 'LineString'
      ? [['hidden', '隐藏'], ['geometry', '显示线'], ['labelOnly', '仅标签']]
      : [['hidden', '隐藏'], ['geometry', '显示点'], ['labelOnly', '仅标签']];
  const updateRule = (id: string, patch: Partial<ZoomPriorityRule>) => onChange({
    ...profile,
    zoomPriority: { rules: rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) },
  });
  const replaceRule = (next: ZoomPriorityRule) => updateRule(next.id, next);
  const append = () => {
    const last = rules[rules.length - 1] ?? defaultRenderRule(geometry);
    const min = Math.max(0, Math.trunc(last.minZoom ?? 0));
    const max = Math.min(8, Math.trunc(last.maxZoom ?? 8));
    if (min >= max) return;
    const split = Math.floor((min + max) / 2);
    const copy = clone(last);
    copy.id = uid('render'); copy.minZoom = split + 1; copy.maxZoom = max;
    onChange({ ...profile, zoomPriority: { rules: rules.map((rule) => rule.id === last.id ? { ...rule, maxZoom: split } : rule).concat(copy) } });
  };
  return <section className="space-y-3"><div><h4 className="font-semibold">渲染规则</h4><p className="mt-1 text-xs text-slate-500">每条规则只负责一个含边界的逻辑 Zoom 区间（0–8）。样式、Label、层级、权重与扩展规则均随区间保存；不会把低比例点与高比例全几何混成同一套样式。</p></div>
    {rules.map((rule, index) => {
      const style = rule.style ?? defaultStyle(geometry);
      const label = rule.label ?? defaultLabel(geometry);
      const visual = label.style ?? { family: 'gm-outline' as const, size: 14 };
      const pointLike = geometry === 'Point' || rule.representation === 'point';
      const supportsFill = pointLike || geometry === 'Polygon';
      const metricKinds = geometry === 'Point' ? ['partCount', 'field'] : geometry === 'LineString' ? ['length', 'partCount', 'field'] : ['area', 'partCount', 'field'];
      const setStyle = (patch: Partial<RenderStyle>) => updateRule(rule.id, { style: { ...style, ...patch } });
      const setLabel = (patch: Partial<typeof label>) => updateRule(rule.id, { label: { ...label, ...patch } });
      const setVisual = (patch: Partial<RenderLabelVisualStyle>) => setLabel({ style: { ...visual, ...patch } });
      return <details key={rule.id} open={index === 0} className="rounded border bg-slate-50 p-3"><summary className="cursor-pointer font-medium">渲染规则 {index + 1} · {rule.minZoom ?? 0} ≤ Zoom ≤ {rule.maxZoom ?? 8}</summary><div className="mt-3 space-y-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(8rem,1fr)_auto_minmax(8rem,1fr)_minmax(10rem,1fr)_auto]"><NumberField label="下界" value={rule.minZoom} min={0} max={8} onChange={(value) => updateRule(rule.id, { minZoom: value })} /><span className="pt-6 text-sm">≤ Zoom ≤</span><NumberField label="上界" value={rule.maxZoom} min={0} max={8} onChange={(value) => updateRule(rule.id, { maxZoom: value })} /><label className="text-xs">显示种类<select className="mt-1 w-full rounded border px-2 py-1" value={rule.representation ?? 'geometry'} onChange={(event) => updateRule(rule.id, { representation: event.target.value as ZoomPriorityRule['representation'] })}>{representations.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>{index > 0 ? <button type="button" className="mt-5 text-xs text-rose-700" onClick={() => onChange({ ...profile, zoomPriority: { rules: rules.filter((item) => item.id !== rule.id) } })}>删除</button> : <span />}</div>
        {rule.representation !== 'hidden' ? <section className="rounded border bg-white p-2"><h5 className="font-medium">显示效果</h5><div className="mt-2 grid gap-2 md:grid-cols-4"><label className="text-xs">显示效果<select className="mt-1 w-full rounded border px-2 py-1" value={pointLike ? style.pointShape ?? 'circle' : style.dashPreset ?? 'solid'} onChange={(event) => setStyle(pointLike ? { pointShape: event.target.value as RenderStyle['pointShape'] } : { dashPreset: event.target.value as RenderStyle['dashPreset'] })}>{pointLike ? <><option value="circle">圆圈</option><option value="square">方块</option><option value="triangle">三角</option><option value="regular4">正方形</option><option value="regular5">五边形</option><option value="regular6">六边形</option></> : <><option value="solid">实线描边</option><option value="dash">虚线描边</option><option value="dotDash">点-短线虚线</option><option value="dotDotDash">点-点-短线虚线</option></>}</select></label>{pointLike ? <NumberField label="大小 px" value={style.size} min={1} onChange={(value) => setStyle({ size: value })} /> : null}<NumberField label="描边粗细" value={style.weight} min={0} step={0.5} onChange={(value) => setStyle({ weight: value })} />{geometry !== 'Point' ? <><label className="text-xs">线端<select className="mt-1 w-full rounded border px-2 py-1" value={style.lineCap ?? 'round'} onChange={(event) => setStyle({ lineCap: event.target.value as RenderStyle['lineCap'] })}><option value="round">圆</option><option value="butt">平</option><option value="square">方</option></select></label><label className="text-xs">转角<select className="mt-1 w-full rounded border px-2 py-1" value={style.lineJoin ?? 'round'} onChange={(event) => setStyle({ lineJoin: event.target.value as RenderStyle['lineJoin'] })}><option value="round">圆</option><option value="miter">尖</option><option value="bevel">斜</option></select></label></> : null}</div><div className={`mt-2 grid gap-2 ${supportsFill ? 'lg:grid-cols-2' : ''}`}><ColorBindingEditor config={config} sourcePath={path} fields={fields} label="描边" value={style.stroke} onChange={(stroke) => setStyle({ stroke })} />{supportsFill ? <ColorBindingEditor config={config} sourcePath={path} fields={fields} label="填色" value={style.fill ?? { mode: 'fixed', color: '#334155' }} onChange={(fill) => setStyle({ fill })} /> : null}</div><div className="mt-2 grid gap-2 md:grid-cols-2"><OpacityField label="描边透明度" value={style.strokeOpacity} onChange={(value) => setStyle({ strokeOpacity: value })} />{supportsFill ? <OpacityField label="填色透明度" value={style.fillOpacity ?? (geometry === 'Polygon' ? 0.24 : 0.88)} onChange={(value) => setStyle({ fillOpacity: value })} /> : null}</div>{pointLike ? <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2"><summary className="cursor-pointer text-xs font-medium">图标覆盖（本 Zoom 规则）</summary><div className="mt-2 grid gap-2 md:grid-cols-4"><label className="inline-flex items-center gap-1 pt-5 text-xs"><input type="checkbox" checked={Boolean(style.icon)} onChange={(event) => setStyle({ icon: event.target.checked ? { source: fields.find((field) => /icon|image|picture/i.test(field)) ?? fields[0] ?? 'iconUrl', size: [32, 32], anchor: [16, 16], fallback: 'circle' } : undefined })} />使用图标字段</label>{style.icon ? <><label className="text-xs">图标 URL 字段<select className="mt-1 w-full rounded border px-2 py-1" value={style.icon.source} onChange={(event) => setStyle({ icon: { ...style.icon!, source: event.target.value } })}>{fields.map((field) => <option key={field}>{field}</option>)}</select></label><NumberField label="图标宽 px" value={style.icon.size[0]} min={1} onChange={(value) => setStyle({ icon: { ...style.icon!, size: [value ?? 32, style.icon!.size[1]] } })} /><NumberField label="图标高 px" value={style.icon.size[1]} min={1} onChange={(value) => setStyle({ icon: { ...style.icon!, size: [style.icon!.size[0], value ?? 32] } })} /></> : null}</div></details> : null}</section> : null}
        <section className="rounded border bg-white p-2"><h5 className="font-medium">Label 效果</h5><div className="mt-2 grid gap-2 lg:grid-cols-5"><label className="inline-flex items-center gap-1 pt-5 text-sm"><input type="checkbox" checked={label.visible} onChange={(event) => setLabel({ visible: event.target.checked })} />显示 Label</label><label className="text-xs">样式<select className="mt-1 w-full rounded border px-2 py-1" value={visual.family} onChange={(event) => setVisual({ family: event.target.value as RenderLabelVisualStyle['family'], ...(textOnlyFamilies.has(event.target.value as RenderLabelVisualStyle['family']) ? {} : { modifiers: {} }) })}>{labelFamilies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><NumberField label="大小" value={visual.size} min={6} max={72} onChange={(value) => setVisual({ size: value ?? 14 })} /><label className="text-xs">主来源<select className="mt-1 w-full rounded border px-2 py-1" value={label.source ?? ''} onChange={(event) => setLabel({ source: event.target.value || undefined })}><option value="">不绑定来源（显示 Null）</option>{fields.map((field) => <option key={field}>{field}</option>)}</select></label>{textOnlyFamilies.has(visual.family) ? <span className="grid gap-1 pt-1 text-xs"><label><input type="checkbox" checked={Boolean(visual.modifiers?.italic)} onChange={(event) => setVisual({ modifiers: { ...visual.modifiers, italic: event.target.checked } })} /> 斜体</label><label><input type="checkbox" checked={Boolean(visual.modifiers?.underline)} onChange={(event) => setVisual({ modifiers: { ...visual.modifiers, underline: event.target.checked } })} /> 下划线</label></span> : <span className="pt-5 text-xs text-slate-400">该样式不支持斜体/下划线</span>}</div><div className="mt-2 grid gap-2 lg:grid-cols-6"><label className="text-xs lg:col-span-2">回退来源（逗号分隔，按顺序）<input className="mt-1 w-full rounded border px-2 py-1" value={(label.fallbackSources ?? []).join(', ')} placeholder="例如 ID, NofFloor" onChange={(event) => setLabel({ fallbackSources: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label><label className="text-xs">主来源格式<select className="mt-1 w-full rounded border px-2 py-1" value={label.valueFormat ?? 'plain'} onChange={(event) => setLabel({ valueFormat: event.target.value as NonNullable<typeof label.valueFormat> })}><option value="plain">原文</option><option value="floorLabel">楼层号格式</option></select></label><label className="text-xs">标签位置<select className="mt-1 w-full rounded border px-2 py-1" value={label.placement ?? (geometry === 'LineString' ? 'aboveLine' : 'center')} onChange={(event) => setLabel({ placement: event.target.value as NonNullable<typeof label.placement> })}>{labelPlacementOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><NumberField label="X 偏移 px" value={label.offsetX} onChange={(value) => setLabel({ offsetX: value })} /><NumberField label="Y 偏移 px" value={label.offsetY} onChange={(value) => setLabel({ offsetY: value })} /></div>{visual.family === 'rle-line-color' || visual.family === 'rle-pill-color' ? <div className="mt-2"><ColorBindingEditor config={config} sourcePath={path} fields={fields} label={visual.family === 'rle-line-color' ? '线路文字颜色' : '胶囊背景颜色'} value={visual.color ?? { mode: 'fixed', color: '#2563eb' }} onChange={(color) => setVisual({ color })} /></div> : null}<p className="mt-2 text-xs text-slate-500">标签位置使用当前渲染锚点的方向；圆点是该规则的真实点/面中点显示效果，不再使用 BUD 式“标签装饰圆点”兼容逻辑。</p></section>
        <section className="rounded border bg-white p-2"><h5 className="font-medium">权重和层数</h5><p className="mt-1 text-xs text-slate-500">几何 zLevel、Label 碰撞优先级与显示权重是三个独立数值。</p><div className="mt-2 grid gap-2 lg:grid-cols-4"><NumberField label="整体几何 zLevel" value={rule.geometryStack?.zLevel} min={0} max={9999} onChange={(value) => updateRule(rule.id, { geometryStack: { ...rule.geometryStack, zLevel: value ?? 300 } })} /><label className="text-xs">Label 角色<select className="mt-1 w-full rounded border px-2 py-1" value={label.collision.role} onChange={(event) => setLabel({ collision: { ...label.collision, role: event.target.value as typeof label.collision.role } })}>{['ignore', 'soft', 'optional', 'important', 'required'].map((role) => <option key={role}>{role}</option>)}</select></label><NumberField label="Label 优先级" value={label.collision.basePriority} onChange={(value) => setLabel({ collision: { ...label.collision, basePriority: value ?? 0 } })} /><NumberField label="基础显示权重" value={rule.priority?.base} onChange={(value) => updateRule(rule.id, { priority: { ...(rule.priority ?? { mode: 'replace' }), base: value } })} /></div><div className="mt-2 grid gap-2 lg:grid-cols-4"><label className="text-xs">动态指标<select className="mt-1 w-full rounded border px-2 py-1" value={rule.priority?.metric?.kind ?? ''} onChange={(event) => { const kind = event.target.value as '' | 'area' | 'length' | 'partCount' | 'field'; updateRule(rule.id, { priority: { ...(rule.priority ?? { mode: 'replace' }), metric: kind ? { kind, multiplier: 1, rounding: 'floor' } : undefined } }); }}><option value="">不启用</option>{metricKinds.map((kind) => <option key={kind} value={kind}>{kind === 'area' ? '面积' : kind === 'length' ? '长度' : kind === 'partCount' ? '部件数量' : '字段数值'}</option>)}</select></label>{rule.priority?.metric ? <><NumberField label="系数" value={rule.priority.metric.multiplier} step={0.01} onChange={(value) => updateRule(rule.id, { priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, multiplier: value ?? 1 } } })} /><NumberField label="除数" value={rule.priority.metric.divisor} min={0.0001} step={0.01} onChange={(value) => updateRule(rule.id, { priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, divisor: value } } })} />{rule.priority.metric.kind === 'field' ? <label className="text-xs">数值字段<select className="mt-1 w-full rounded border px-2 py-1" value={rule.priority.metric.field ?? ''} onChange={(event) => updateRule(rule.id, { priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, field: event.target.value } } })}><option value="">选择字段</option>{fields.map((field) => <option key={field}>{field}</option>)}</select></label> : <label className="text-xs">计算<select className="mt-1 w-full rounded border px-2 py-1" value={rule.priority.metric.rounding ?? 'floor'} onChange={(event) => updateRule(rule.id, { priority: { ...rule.priority!, metric: { ...rule.priority!.metric!, rounding: event.target.value as NonNullable<typeof rule.priority.metric>['rounding'] } } })}><option value="none">原数值</option><option value="floor">向下取整</option><option value="round">四舍五入</option><option value="ceil">向上取整</option></select></label>}</> : null}</div></section>
        <NativeSymbolSettings rule={rule} onChange={replaceRule} allowOffsets={pointLike} /><LabelPlacementSettings rule={rule} onChange={replaceRule} allowDecoration={geometry === 'Point' && style.symbolVisibility !== 'withLabel' && rule.representation !== 'labelOnly'} /><CollisionMetricEditor rule={rule} onChange={replaceRule} fields={fields} /><DisplayPrioritySettings rule={rule} onChange={replaceRule} /><ExtraRuleSettings rule={rule} onChange={replaceRule} /><RuleInteractionSettings rule={rule} baseline={(config.engine ?? createV32EngineDefaults()).interactionBaselines[geometry]} onChange={replaceRule} />
        <ConditionalOverridesEditor config={config} path={path} geometry={geometry} rule={rule} onChange={replaceRule} />
        <RenderRuleExtensionsEditor config={config} sourcePath={path} fields={fields} geometry={geometry} rule={rule} onChange={replaceRule} /><details className="mt-2 rounded border p-2"><summary className="text-xs">有效扩展值与来源</summary><p className="mt-1 text-xs">全局几何默认 → 当前 Zoom 规则 → 命中字段条件分支 → 交互态；未覆盖值继承全局。</p><pre className="mt-2 max-h-48 overflow-auto text-xs">{JSON.stringify({ global: config.engine?.renderDefaults?.[geometry] ?? {}, local: rule.extensions ?? {}, effective: resolveRenderExtensions(config, geometry, rule.extensions) },null,2)}</pre></details>
      </div></details>;
    })}
    <button type="button" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm" onClick={append}><Plus className="h-4 w-4" />添加渲染规则</button>
  </section>;
}

function GeometryEditor({ config, path, geometry, profile, onChange }: { config: ConfigPackageV3; path: ClassificationPath; geometry: GeometryKind; profile: GeometryProfile; onChange: (profile: GeometryProfile) => void }) {
  const [expanded, setExpanded] = useState(profile.enabled);
  const triggers = profile.interaction?.triggers ?? {};
  const triggerLabels: Array<[keyof GeometryInteractionTriggers, string]> = geometry === 'Point'
    ? [['point', '点击点'], ['label', '点击 Label']]
    : geometry === 'LineString' ? [['line', '点击线'], ['label', '点击 Label']]
      : [['boundary', '点击边框'], ['interior', '点击面内'], ['label', '点击 Label']];
  const toggle = (key: keyof GeometryInteractionTriggers, value: boolean) => onChange({ ...profile, interaction: { triggers: { ...triggers, [key]: value } } });
  return <article className="rounded-lg border bg-white"><header className="flex items-center gap-3 p-3"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<strong>{geometryLabel[geometry]}</strong><span className="text-xs text-slate-500">{expanded ? '渲染规则已展开' : '仅显示启用状态'}</span></button><label className="shrink-0 text-sm"><input type="checkbox" checked={profile.enabled} onChange={(event) => { onChange({ ...profile, enabled: event.target.checked }); if (event.target.checked) setExpanded(true); }} /> 启用</label></header>{expanded ? <div className="space-y-3 border-t p-3"><section className="rounded border bg-slate-50 p-2"><h4 className="font-medium">多部件与交互触发</h4><div className="mt-2 grid gap-2 md:grid-cols-3"><label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={profile.allowMultipleParts} onChange={(event) => onChange({ ...profile, allowMultipleParts: event.target.checked })} />允许多部件</label><label className="text-xs">锚点<select disabled={!profile.allowMultipleParts} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={profile.anchor ?? 'featureBbox'} onChange={(event) => onChange({ ...profile, anchor: event.target.value as GeometryProfile['anchor'] })}><option value="featureBbox">完整要素 bbox 中心</option><option value="perPart">各部件中心</option></select></label><div className="flex flex-wrap gap-3 pt-5 text-xs">{triggerLabels.map(([key, text]) => <label key={key}><input type="checkbox" checked={Boolean(triggers[key])} onChange={(event) => toggle(key, event.target.checked)} /> {text}</label>)}</div></div></section><RenderRuleEditor config={config} path={path} geometry={geometry} profile={profile} onChange={onChange} /></div> : null}</article>;
}

export function LegacyFieldEditor({ config, node, onChange }: { config: ConfigPackageV3; node: CategoryNode; onChange: (node: CategoryNode) => void }) {
  const effective = resolveEffectiveFields(config, node.path);
  const local = new Set(node.fields.map((field) => field.overrideOf || field.key));
  const add = () => onChange({ ...node, fields: [...node.fields, { fieldId: uid('field'), key: 'NewField', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '新字段', en: 'New field' }, description: { zh: '', en: '' } }] });
  const update = (fieldId: string, patch: Partial<FieldDefinition>) => onChange({ ...node, fields: node.fields.map((field) => field.fieldId === fieldId ? { ...field, ...patch } : field) });
  const addOverride = (field: FieldDefinition) => onChange({ ...node, fields: [...node.fields, { ...clone(field), fieldId: uid('field-override'), overrideOf: field.key }] });
  return <section><div className="mb-2 flex items-center justify-between"><div><h3 className="font-semibold">字段设置</h3><p className="text-xs text-slate-500">World 是引擎自动分配的必填系统字段；子分类可新增特有字段，也可对继承字段建立本地覆盖。字段名称、数据类型、单/多值和中英文定义均在此保存。</p></div><button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" onClick={add}><Plus className="h-4 w-4" />添加字段</button></div><div className="space-y-2">{effective.map((field) => {
    const isLocal = local.has(field.key);
    const disabled = !isLocal;
    return <article key={field.fieldId} className="rounded border bg-white p-2"><div className="grid gap-2 md:grid-cols-[minmax(9rem,1fr)_9rem_8rem_9rem_auto_auto]"><label className="text-xs">字段名<input disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.key} onChange={(event) => update(field.fieldId, { key: event.target.value })} /></label><label className="text-xs">数据类型<select disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.type} onChange={(event) => update(field.fieldId, { type: event.target.value as FieldDefinition['type'] })}>{['string', 'number', 'boolean', 'enum', 'json', 'reference'].map((type) => <option key={type}>{type}</option>)}</select></label><label className="text-xs">值数量<select disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.cardinality} onChange={(event) => update(field.fieldId, { cardinality: event.target.value as FieldDefinition['cardinality'] })}><option value="single">单值</option><option value="multiple">允许多值</option></select></label><label className="text-xs">输入控件<select disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.input} onChange={(event) => update(field.fieldId, { input: event.target.value as FieldDefinition['input'] })}>{['text', 'textarea', 'select', 'toggle', 'json', 'featureSearch'].map((input) => <option key={input}>{input}</option>)}</select></label><label className="pt-5 text-sm"><input disabled={disabled} type="checkbox" checked={Boolean(field.required)} onChange={(event) => update(field.fieldId, { required: event.target.checked })} /> 必填</label>{isLocal ? <button type="button" className="mt-5 text-xs text-rose-700" onClick={() => onChange({ ...node, fields: node.fields.filter((item) => item.fieldId !== field.fieldId) })}>删除</button> : <button type="button" className="mt-5 text-xs text-blue-700" onClick={() => addOverride(field)}>建立覆盖</button>}</div><div className="mt-2 grid gap-2 md:grid-cols-2"><label className="text-xs">名称（zh）<input disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.labels.zh} onChange={(event) => update(field.fieldId, { labels: { ...field.labels, zh: event.target.value } })} /></label><label className="text-xs">名称（en）<input disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.labels.en} onChange={(event) => update(field.fieldId, { labels: { ...field.labels, en: event.target.value } })} /></label><label className="text-xs">定义（zh）<textarea disabled={disabled} className="mt-1 min-h-16 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.description.zh} onChange={(event) => update(field.fieldId, { description: { ...field.description, zh: event.target.value } })} /></label><label className="text-xs">定义（en）<textarea disabled={disabled} className="mt-1 min-h-16 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.description.en} onChange={(event) => update(field.fieldId, { description: { ...field.description, en: event.target.value } })} /></label></div>{field.type === 'enum' ? <label className="mt-2 block text-xs">枚举选项（用逗号分隔）<input disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={(field.options ?? []).map((option) => option.value).join(', ')} onChange={(event) => update(field.fieldId, { options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean).map((value) => ({ value, label: { zh: value, en: '' } })) })} /></label> : null}</article>;
  })}</div></section>;
}

function FieldOptionRows({ value, disabled, onChange }: { value?: FieldDefinition['options']; disabled: boolean; onChange: (value: NonNullable<FieldDefinition['options']>) => void }) {
  const rows = value ?? [];
  const update = (index: number, patch: Omit<Partial<NonNullable<FieldDefinition['options']>[number]>, 'label'> & { label?: Partial<NonNullable<FieldDefinition['options']>[number]['label']> }) => onChange(rows.map((entry, entryIndex) => entryIndex === index ? { value: patch.value ?? entry.value, label: { zh: patch.label?.zh ?? entry.label.zh, en: patch.label?.en ?? entry.label.en } } : entry));
  return <div className="mt-2 rounded border bg-slate-50 p-2 text-xs"><p className="font-medium">下拉选项：显示名称与最终存储值</p>{rows.map((option, index) => <div key={`${option.value}-${index}`} className="mt-1 grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"><input disabled={disabled} className="min-w-0 rounded border px-2 py-1 disabled:bg-slate-100" placeholder="名称（zh）" value={option.label.zh} onChange={(event) => update(index, { label: { zh: event.target.value } })} /><input disabled={disabled} className="min-w-0 rounded border px-2 py-1 disabled:bg-slate-100" placeholder="名称（en）" value={option.label.en} onChange={(event) => update(index, { label: { en: event.target.value } })} /><input disabled={disabled} className="min-w-0 rounded border px-2 py-1 disabled:bg-slate-100" placeholder="存储值" value={option.value} onChange={(event) => update(index, { value: event.target.value })} /><button type="button" disabled={disabled} className="text-rose-700 disabled:text-slate-300" onClick={() => onChange(rows.filter((_, entryIndex) => entryIndex !== index))}>删除</button></div>)}<button type="button" disabled={disabled} className="mt-2 rounded border bg-white px-2 py-1 disabled:text-slate-300" onClick={() => onChange([...rows, { value: '', label: { zh: '', en: '' } }])}>添加选项</button></div>;
}

function FieldCard({ field, local, onUpdate, onDelete, onOverride }: { field: FieldDefinition; local: boolean; onUpdate: (patch: Partial<FieldDefinition>) => void; onDelete: () => void; onOverride: () => void }) {
  const disabled = !local;
  const scope = fieldScope(field);
  const shortKey = fieldShortKey(field);
  const setShortKey = (next: string) => onUpdate({ key: scope === 'root' ? next : `${scope}.${next}`, scope });
  return <article aria-label={`字段 ${field.key}`} className="min-w-0 rounded border bg-white p-2">
    <div className="grid min-w-0 gap-2 grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0 text-xs">字段名<input disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={shortKey} onChange={(event) => setShortKey(event.target.value)} /></label>
      <label className="min-w-0 text-xs">数据类型<select disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.type} onChange={(event) => onUpdate({ type: event.target.value as FieldDefinition['type'] })}>{['string', 'number', 'boolean', 'enum', 'json', 'reference'].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <label className="min-w-0 text-xs">值数量<select disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.cardinality} onChange={(event) => onUpdate({ cardinality: event.target.value as FieldDefinition['cardinality'] })}><option value="single">单值</option><option value="multiple">允许多值</option></select></label>
      <label className="min-w-0 text-xs">输入控件<select disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.input} onChange={(event) => onUpdate({ input: event.target.value as FieldDefinition['input'] })}>{['text', 'textarea', 'select', 'toggle', 'json', 'featureSearch'].map((input) => <option key={input} value={input}>{input}</option>)}</select></label>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-sm">
      <label className="inline-flex items-center gap-1"><input disabled={disabled} type="checkbox" checked={Boolean(field.required)} onChange={(event) => onUpdate({ required: event.target.checked })} />必填</label>
      {local ? <button type="button" className="ml-auto text-xs text-rose-700" onClick={onDelete}>删除</button> : <button type="button" className="ml-auto text-xs text-blue-700" onClick={onOverride}>建立覆盖</button>}
    </div>
    <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2"><label className="min-w-0 text-xs">名称（zh）<input disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.labels.zh} onChange={(event) => onUpdate({ labels: { ...field.labels, zh: event.target.value } })} /></label><label className="min-w-0 text-xs">名称（en）<input disabled={disabled} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.labels.en} onChange={(event) => onUpdate({ labels: { ...field.labels, en: event.target.value } })} /></label><label className="min-w-0 text-xs">定义（zh）<textarea disabled={disabled} className="mt-1 min-h-16 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.description.zh} onChange={(event) => onUpdate({ description: { ...field.description, zh: event.target.value } })} /></label><label className="min-w-0 text-xs">定义（en）<textarea disabled={disabled} className="mt-1 min-h-16 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={field.description.en} onChange={(event) => onUpdate({ description: { ...field.description, en: event.target.value } })} /></label></div>{field.type === 'enum' || field.input === 'select' ? <FieldOptionRows value={field.options} disabled={disabled} onChange={(options) => onUpdate({ options })} /> : null}<FieldAdvancedSettings field={field} disabled={disabled} onChange={onUpdate} /></article>;
}

function FieldEditor({ config, node, onChange }: { config: ConfigPackageV3; node: CategoryNode; onChange: (node: CategoryNode) => void }) {
  const effective = resolveEffectiveFields(config, node.path);
  const local = new Set(node.fields.map((field) => field.overrideOf || field.key));
  const levels: Array<keyof ClassificationPath> = ['class', 'kind', 'skind', 'skind2'];
  const update = (fieldId: string, patch: Partial<FieldDefinition>) => onChange({ ...node, fields: node.fields.map((field) => field.fieldId === fieldId ? { ...field, ...patch } : field) });
  const updateClassificationLabel = (level: keyof ClassificationPath, language: 'zh' | 'en', value: string) => {
    const current = node.classificationLabels?.[level] ?? { zh: String(node.path[level] ?? ''), en: '' };
    onChange({
      ...node,
      classificationLabels: {
        ...node.classificationLabels,
        [level]: { ...current, [language]: value },
      },
    });
  };
  const add = (scope: 'root' | 'tags' | 'extensions') => {
    const base = 'NewField';
    const key = scope === 'root' ? base : `${scope}.${base}`;
    onChange({ ...node, fields: [...node.fields, { fieldId: uid('field'), key, scope, type: 'string', cardinality: 'single', input: 'text', labels: { zh: '新字段', en: '' }, description: { zh: '', en: '' } }] });
  };
  const renderScope = (scope: 'root' | 'tags' | 'extensions', title: string, detail: string) => {
    const fields = effective.filter((field) => fieldScope(field) === scope && !(scope !== 'root' && (field.key === scope || field.key === `${scope}.`)));
    return <section key={scope} aria-label={`${scope} 字段组`} className="rounded-lg border bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h4 className="font-medium">{title}</h4><p className="text-xs text-slate-500">{detail}</p></div>
        <button type="button" className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-sm" onClick={() => add(scope)}><Plus className="h-4 w-4" />添加字段</button>
      </div>
      {fields.length ? <div className="mt-2 space-y-2">{fields.map((field) => {
        const isLocal = local.has(field.key);
        return <FieldCard key={field.fieldId} field={field} local={isLocal} onUpdate={(patch) => update(field.fieldId, patch)} onDelete={() => onChange({ ...node, fields: node.fields.filter((item) => item.fieldId !== field.fieldId) })} onOverride={() => onChange({ ...node, fields: [...node.fields, { ...clone(field), fieldId: uid('field-override'), overrideOf: field.key }] })} />;
      })}</div> : <p className="mt-2 text-xs text-slate-500">当前没有此字段组的已定义字段。</p>}
    </section>;
  };
  return <section>
    <div className="mb-2"><h3 className="font-semibold">分类标识与字段设置</h3><p className="text-xs text-slate-500">World 是引擎自动分配的必填系统字段。tags 与 extensions 是始终存在的可选字段组，不会再被伪造成名为 tags/extensions 的顶级文本字段；子分类可新增本地字段或建立继承覆盖。</p></div>
    <section className="mb-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3"><h4 className="font-medium">分类标识（路径代码与显示名称）</h4><p className="mt-1 text-xs text-slate-500">路径代码用于机器分类；中文/英文显示名称用于编辑器、选择框与工作流。例如 ROD／道路、ROD/NOM／普通。</p><div className="mt-2 grid gap-2 lg:grid-cols-2">{levels.filter((level) => Boolean(node.path[level])).map((level) => {
      const label = node.classificationLabels?.[level] ?? { zh: String(node.path[level] ?? ''), en: '' };
      return <div key={level} className="grid min-w-0 gap-2 rounded border bg-white p-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]"><label className="text-xs">代码<input disabled className="mt-1 w-full rounded border bg-slate-100 px-2 py-1" value={String(node.path[level] ?? '')} /></label><label className="min-w-0 text-xs">名称（zh）<input className="mt-1 w-full rounded border px-2 py-1" value={label.zh} onChange={(event) => updateClassificationLabel(level, 'zh', event.target.value)} /></label><label className="min-w-0 text-xs">名称（en）<input className="mt-1 w-full rounded border px-2 py-1" value={label.en} onChange={(event) => updateClassificationLabel(level, 'en', event.target.value)} /></label></div>;
    })}</div></section>
    <div className="space-y-3">{renderScope('root', '顶级字段', '直接写入要素根对象。')}{renderScope('tags', 'tags（可选字段组）', '写入 tags.xxx；字段组本身不可删除。')}{renderScope('extensions', 'extensions（可选字段组）', '写入 extensions.xxx；字段组本身不可删除。')}</div>
  </section>;
}

function EngineEditor({ engine, config, onChange }: { engine: ConfigEngineSettings; config: ConfigPackageV3; onChange: (next: ConfigEngineSettings) => void }) {
  const [geometry, setGeometry] = useState<GeometryKind>('Point');
  const baseline = engine.interactionBaselines[geometry];
  const updateState = (state: InteractionState, patch: Partial<typeof baseline[InteractionState]>) => onChange({ ...engine, interactionBaselines: { ...engine.interactionBaselines, [geometry]: { ...baseline, [state]: { ...baseline[state], ...patch } } } });
  const contextView = engine.contextView ?? { minZoom: 6, activationRadiusPx: 70, retainRadiusPx: 120 };
  return <details className="rounded border bg-slate-50 p-3">
    <summary className="cursor-pointer font-medium">V3.2 全局引擎默认值</summary>
    <div className="mt-1 flex flex-wrap items-center gap-2"><p className="mr-auto text-xs text-slate-600">World 永远由当前地图世界赋值。导航/编辑态不是渲染规则选择项；交互状态、点击容差、屏幕阈值，以及通用主结构/单元视角入口统一在此处定义。</p></div>
    <div className="mt-2 grid gap-2 md:grid-cols-3">
      <label className="text-xs">World 系统字段<input disabled className="mt-1 w-full rounded border bg-slate-100 px-2 py-1" value="World（活动世界自动赋值）" /></label>
      <NumberField label="面最小屏幕面积 px²" value={engine.screenGateDefaults.polygonMinScreenAreaPx} min={0} onChange={(value) => onChange({ ...engine, screenGateDefaults: { ...engine.screenGateDefaults, polygonMinScreenAreaPx: value } })} />
      <NumberField label="线最小屏幕长度 px" value={engine.screenGateDefaults.lineMinScreenLengthPx} min={0} onChange={(value) => onChange({ ...engine, screenGateDefaults: { ...engine.screenGateDefaults, lineMinScreenLengthPx: value } })} />
    </div>
    <fieldset className="mt-3 rounded border bg-white p-2 text-xs"><legend>共享 Pane 名称</legend><div className="grid gap-2 md:grid-cols-4">{Object.entries(engine.paneDefaults).map(([key,value]) => <label key={key}>{key}<input className="w-full rounded border px-2" value={value} onChange={event => onChange({ ...engine, paneDefaults: { ...engine.paneDefaults, [key]: event.target.value } })} /></label>)}</div></fieldset>
    <details className="mt-3 rounded border bg-white p-2"><summary className="text-xs">{geometryLabel[geometry]}通用候选、密度与稳定性默认</summary><RenderRuleExtensionsEditor config={config} sourcePath={config.nodes.find(node => node.geometryType === geometry)?.path ?? { class: '' }} fields={['ID','Name']} geometry={geometry} rule={{ id: 'engine-default', extensions: engine.renderDefaults?.[geometry] }} onChange={rule => onChange({ ...engine, renderDefaults: { ...engine.renderDefaults, [geometry]: rule.extensions } })} /><ExtraRuleSettings rule={{ id: 'engine-default', extensions: engine.renderDefaults?.[geometry] }} onChange={rule => onChange({ ...engine, renderDefaults: { ...engine.renderDefaults, [geometry]: rule.extensions } })} /></details>
    <div className="mt-3 rounded border bg-white p-2">
      <strong className="text-sm">通用包含关系视角</strong>
      <p className="mt-1 text-xs text-slate-500">分类和关联字段在下方“包含关系绑定”中选择；这里仅定义进入/保持视角的全局方式。</p>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <NumberField label="进入视角最小 Zoom" value={contextView.minZoom} min={0} max={8} onChange={(value) => onChange({ ...engine, contextView: { ...contextView, minZoom: value ?? 6 } })} />
        <NumberField label="激活半径 px" value={contextView.activationRadiusPx} min={0} onChange={(value) => onChange({ ...engine, contextView: { ...contextView, activationRadiusPx: value ?? 0 } })} />
        <NumberField label="保持半径 px" value={contextView.retainRadiusPx} min={0} onChange={(value) => onChange({ ...engine, contextView: { ...contextView, retainRadiusPx: value ?? 0 } })} />
      </div>
    </div>
    <div className="mt-3 rounded border bg-white p-2">
      <div className="flex flex-wrap items-center gap-3">
        <strong className="text-sm">统一交互基准</strong>
        <label className="text-xs">几何<select className="ml-1 rounded border px-2 py-1" value={geometry} onChange={(event) => setGeometry(event.target.value as GeometryKind)}>{geometries.map((item) => <option key={item} value={item}>{geometryLabel[item]}</option>)}</select></label>
        <NumberField label="默认点击容差 px" value={baseline.hitTolerancePx} min={0} max={80} onChange={(value) => onChange({ ...engine, interactionBaselines: { ...engine.interactionBaselines, [geometry]: { ...baseline, hitTolerancePx: value ?? 0 } } })} />
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2 2xl:grid-cols-5">
        {interactionStates.map((state) => <fieldset key={state} className="rounded border p-2">
          <legend className="px-1 text-xs">{interactionStateLabel[state]}</legend>
          <label className="text-xs"><input type="checkbox" checked={baseline[state].enabled} onChange={(event) => updateState(state, { enabled: event.target.checked })} /> 启用</label>
          <label className="mt-1 block text-xs">描边颜色<input className="mt-1 h-7 w-full" type="color" value={baseline[state].strokeColor} onChange={(event) => updateState(state, { strokeColor: event.target.value })} /></label>
          <NumberField label="描边粗细" value={baseline[state].strokeWidth} min={0} step={0.5} onChange={(value) => updateState(state, { strokeWidth: value ?? 0 })} />
          <OpacityField label="描边透明度" value={baseline[state].strokeOpacity} onChange={(value) => updateState(state, { strokeOpacity: value })} />
          <label className="mt-1 block text-xs">填色颜色<input className="mt-1 h-7 w-full" type="color" value={baseline[state].fillColor ?? baseline[state].strokeColor} onChange={(event) => updateState(state, { fillColor: event.target.value })} /></label>
          <OpacityField label="填色透明度" value={baseline[state].fillOpacity} onChange={(value) => updateState(state, { fillOpacity: value })} />
          <NumberField label="zIndex 偏移" value={baseline[state].zIndexOffset} step={1} onChange={(value) => updateState(state, { zIndexOffset: value })} />
          <NumberField label="Label 优先级" value={baseline[state].labelPriority} step={1} onChange={(value) => updateState(state, { labelPriority: value })} />
          <label className="mt-1 block text-xs"><input type="checkbox" checked={baseline[state].forceShowLabel !== false} onChange={(event) => updateState(state, { forceShowLabel: event.target.checked })} /> 强制显示 Label</label>
          <InteractionShapeSettings visual={baseline[state]} onChange={patch => updateState(state, patch)} />
        </fieldset>)}
      </div>
    </div>
  </details>;
}

function ContextBindingsEditor({ config, selected, onChange }: { config: ConfigPackageV3; selected: CategoryNode; onChange: (next: ConfigPackageV3) => void }) {
  const bindings = config.contextBindings ?? [];
  const related = bindings.filter((binding) => samePath(binding.host.classification, selected.path) || samePath(binding.member.classification, selected.path));
  const endpointFields = (path: ClassificationPath) => allFieldKeys(config, path);
  const create = () => {
    const binding: ContextBinding = { id: uid('context'), label: { zh: '新的包含关系', en: 'New context binding' }, host: { classification: selected.path, referenceField: 'ID' }, member: { classification: { class: '' }, referenceField: '' }, enabled: false, profile: 'default' };
    onChange({ ...config, contextBindings: [...bindings, binding] });
  };
  const update = (id: string, patch: Partial<ContextBinding>) => onChange({ ...config, contextBindings: bindings.map((binding) => binding.id === id ? { ...binding, ...patch } : binding) });
  const selectEndpoint = (binding: ContextBinding, side: 'host' | 'member', nodeId: string) => {
    const node = config.nodes.find((item) => item.nodeId === nodeId);
    update(binding.id, { [side]: { classification: node?.path ?? { class: '' }, referenceField: '' } } as Partial<ContextBinding>);
  };
  return (
    <section className="rounded border p-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">包含关系绑定</h3>
          <p className="text-xs text-slate-500">任意主结构与任意附属/单元分类可互相绑定；不是 BUD/FLR 特例，也不属于任一 Zoom 渲染规则。</p>
        </div>
        <button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" onClick={create}><Plus className="h-4 w-4" />新建绑定</button>
      </div>
      {related.length ? (
        <div className="mt-2 space-y-2">
          {related.map((binding) => {
            const memberFields = endpointFields(binding.member.classification);
            return <div key={binding.id} className="rounded border bg-slate-50 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <input className="min-w-40 flex-1 rounded border px-2 py-1 text-sm" value={binding.label.zh} onChange={(event) => update(binding.id, { label: { zh: event.target.value, en: binding.label.en } })} />
                <label className="text-xs"><input type="checkbox" checked={binding.enabled} onChange={(event) => update(binding.id, { enabled: event.target.checked })} /> 启用</label>
                <label className="text-xs">成员显示<select className="ml-1 rounded border px-2 py-1" value={binding.profile} onChange={(event) => update(binding.id, { profile: event.target.value as ContextBinding['profile'] })}><option value="default">关联成员</option><option value="keep-host-context">保留主结构上下文</option><option value="show-active-member-only">仅当前成员</option></select></label>
                <button type="button" className="text-xs text-rose-700" onClick={() => onChange({ ...config, contextBindings: bindings.filter((item) => item.id !== binding.id) })}>删除</button>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {(['host', 'member'] as const).map((side) => {
                  const endpoint = binding[side];
                  const current = config.nodes.find((node) => samePath(node.path, endpoint.classification));
                  return <fieldset key={side} className="rounded border bg-white p-2">
                    <legend className="px-1 text-xs">{side === 'host' ? '主结构' : '附属/单元'}</legend>
                    <label className="text-xs">分类<select className="mt-1 w-full rounded border px-2 py-1" value={current?.nodeId ?? ''} onChange={(event) => selectEndpoint(binding, side, event.target.value)}><option value="">选择分类</option>{config.nodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{nodeLabel(node)}</option>)}</select></label>
                    <label className="mt-1 block text-xs">引用字段<select className="mt-1 w-full rounded border px-2 py-1" value={endpoint.referenceField} onChange={(event) => update(binding.id, { [side]: { ...endpoint, referenceField: event.target.value } } as Partial<ContextBinding>)}><option value="">选择字段</option>{endpointFields(endpoint.classification).map((field) => <option key={field}>{field}</option>)}</select></label>
                  </fieldset>;
                })}
              </div>
              <label className="mt-2 block max-w-sm text-xs">附属/单元切换字段（可选）<select className="mt-1 w-full rounded border px-2 py-1" value={binding.memberSelectorField ?? ''} onChange={(event) => update(binding.id, { memberSelectorField: event.target.value || undefined })}><option value="">默认 ID</option>{memberFields.map((field) => <option key={field}>{field}</option>)}</select></label>
            </div>;
          })}
        </div>
      ) : <p className="mt-2 text-sm text-slate-500">当前分类尚未参与包含关系绑定。</p>}
    </section>
  );
}

function Report({ config: _config, records, report }: { config: ConfigPackageV3; records: MountedFeatureRecord[]; report: ReturnType<typeof validateConfigPackage> | null }) {
  if (!report) return <section className="shrink-0 border-t bg-white px-4 py-2 text-xs text-slate-500">尚未核验。核验会按错误编码、字段/内容和受影响要素 ID 集分组显示。</section>;
  const groups = new Map<string, typeof report.issues>();
  report.issues.forEach((item) => { const key = `${item.severity}:${item.code}:${item.message}`; groups.set(key, [...(groups.get(key) ?? []), item]); });
  return <details className="shrink-0 border-t bg-white px-4 py-2" open={!report.valid}><summary className={`cursor-pointer font-medium ${report.valid ? 'text-emerald-700' : 'text-rose-700'}`}>{report.valid ? '核验通过' : `发现 ${[...groups.values()].filter((items) => items.some((item) => item.severity === 'error')).length} 个问题组`} · 挂载记录 {records.length}</summary><div className="mt-2 max-h-48 space-y-2 overflow-auto">{[...groups.entries()].map(([key, items]) => { const affected = [...new Map(items.flatMap((item) => item.affectedFeatures ?? []).map((item) => [item.id, item])).values()]; return <div key={key} className={`rounded border px-3 py-2 text-xs ${items.some((item) => item.severity === 'error') ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><strong>{items[0].code}</strong> · {items[0].field ?? items[0].path} · {items[0].message}{affected.length ? <div className="mt-1">要素 ID：{affected.map((item) => `${item.id}${item.name ? `(${item.name})` : ''}`).join('、')}</div> : null}</div>; })}</div></details>;
}

export function ConfigStudio({ onClose, mountedRecords, initialTab }: { onClose: () => void; mountedRecords?: MountedFeatureRecord[]; initialTab?: StudioTab }) {
  const [activeTab, setActiveTab] = useState<StudioTab>(() => initialTab ?? (new URLSearchParams(window.location.search).get('tab') === 'workflows' ? 'workflows' : 'features'));
  const [workflowHasDraft, setWorkflowHasDraft] = useState(false);
  const [savedConfig, setSavedConfig] = useState<ConfigPackageV3>(() => {
    const stored = readLocalConfig();
    return stored?.nodes.length ? stored : createConfigPackageFromCurrentProject();
  });
  const [draftConfig, setDraftConfig] = useState<ConfigPackageV3 | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [rootClass, setRootClass] = useState('');
  const [childValue, setChildValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [nextRevision, setNextRevision] = useState(2);
  const [message, setMessage] = useState(() => { try { return sessionStorage.getItem('cairnmap-config-studio-recovery-issue') ?? '已加载 V1 真实字段的 V3.2 语义迁移包：显示、信息卡和标准工作流都可在本地继续编辑。'; } catch { return '已加载本地迁移包。'; } });
  const [report, setReport] = useState<ReturnType<typeof validateConfigPackage> | null>(null);
  const [scenario, setScenarioState] = useState<PreviewScenario>('singlePoint');
  const setScenario = (value: string) => setScenarioState(value as PreviewScenario);
  const uploadRef = useRef<HTMLInputElement>(null);
  const records = useMemo(() => mountedRecords ?? readMountedRecords(), [mountedRecords]);
  const config = draftConfig ?? savedConfig;
  const selected = config.nodes.find((node) => node.nodeId === selectedId) ?? config.nodes[0];
  const setConfig = (next: ConfigPackageV3 | ((current: ConfigPackageV3) => ConfigPackageV3)) => {
    const current = draftConfig ?? clone(savedConfig);
    const resolved = typeof next === 'function' ? (next as (value: ConfigPackageV3) => ConfigPackageV3)(current) : next;
    setDraftConfig(resolved);
    setEditing(true);
    setReport(null);
  };
  useEffect(() => { try {
    sessionStorage.setItem('cairnmap-config-studio-saved', JSON.stringify(savedConfig));
    sessionStorage.setItem('cairnmap-config-studio-draft', JSON.stringify(savedConfig));
  } catch { /* browser storage is an optional convenience */ } }, [savedConfig]);
  const switchTab = (next: StudioTab) => {
    if (!canSwitchStudioTab(activeTab, next, { feature: draftConfig !== null || editing, workflow: workflowHasDraft })) {
      setMessage('请先保存或放弃当前草稿，再切换设计标签。');
      return;
    }
    setActiveTab(next);
    const target = new URL(window.location.href);
    target.searchParams.set('workspace', 'config-studio');
    target.searchParams.set('tab', next);
    window.history.replaceState(null, '', target);
  };
  const saveWorkflowPackage = (next: ConfigPackageV3): boolean => {
    const nextReport = validateConfigPackage(next, records);
    setReport(nextReport);
    if (!nextReport.valid) { setMessage('工作流保存被配置包核验阻断。'); return false; }
    setSavedConfig(next); setMessage('工作流已保存到当前配置包；草稿已结束。');
    return true;
  };
  useEffect(() => { if (!selectedId && selected) setSelectedId(selected.nodeId); }, [selectedId, selected]);

  const createRoot = () => {
    const code = rootClass.trim();
    if (!code) { setMessage('请输入一级 Class。'); return; }
    const base = clone(draftConfig ?? savedConfig);
    if (base.nodes.some((node) => node.path.class === code && !node.path.kind)) { setMessage('该一级 Class 已存在，请从分类选择器读取。'); return; }
    const node = defaultNode({ class: code });
    base.nodes.push(node);
    setDraftConfig(base); setSelectedId(node.nodeId); setEditing(true); setRootClass(''); setReport(null);
    setMessage(`已新建 ${code} 草稿；请选择唯一几何类型后继续编辑。`);
  };
  const readSelected = () => {
    if (!selected) { setMessage('请先新建或选择一个分类。'); return; }
    if (!draftConfig) setDraftConfig(clone(savedConfig));
    setEditing(true); setReport(null); setMessage(`已读取 ${nodeLabel(selected)} 到本地草稿。`);
  };
  const addChild = () => {
    if (!selected) return;
    const value = childValue.trim();
    if (!value) return;
    const depth = pathDepth(selected.path);
    if (depth >= 4) { setMessage('该分类已达到 Skind2，不能继续添加下级。'); return; }
    const path: ClassificationPath = depth === 1 ? { ...selected.path, kind: value } : depth === 2 ? { ...selected.path, skind: value } : { ...selected.path, skind2: value };
    if (config.nodes.some((node) => samePath(node.path, path))) { setMessage('该分类已存在。'); return; }
    const node = defaultNode(path);
    setConfig((current) => ({ ...current, nodes: current.nodes.map((entry) => entry.nodeId === selected.nodeId ? { ...entry, children: [...entry.children, node.nodeId] } : entry).concat(node) }));
    setSelectedId(node.nodeId); setChildValue(''); setMessage(`已创建 ${nodeLabel(node)} 草稿。`);
  };
  const validate = () => {
    const next = validateConfigPackage(config, records);
    setReport(next); setMessage(next.valid ? '核验通过：当前草稿可保存。' : `核验发现 ${next.issues.filter((item) => item.severity === 'error').length} 项阻断问题。`);
  };
  const save = () => {
    const next = validateConfigPackage(config, records);
    setReport(next);
    if (!next.valid) { setMessage('保存被阻断；请先处理问题组。'); return; }
    if (!window.confirm('将当前 V3.2 草稿保存到浏览器本地配置。确定继续吗？')) return;
    setSavedConfig(config); setDraftConfig(null); setEditing(false); setMessage('已保存本地 V3.2 配置。');
  };
  const discard = () => { setDraftConfig(null); setEditing(false); setReport(null); setMessage('已放弃未保存草稿。'); };
  const remigrateV1 = () => {
    if (!window.confirm('这会以当前 V1 工程重新生成 V3.2 迁移包，并覆盖当前本地草稿。继续吗？')) return;
    const next = createConfigPackageFromCurrentProject();
    setSavedConfig(next); setDraftConfig(null); setSelectedId(next.nodes[0]?.nodeId ?? ''); setEditing(false); setReport(null);
    setMessage('已按当前 V1 真实字段重新生成 V3.2 迁移包。');
  };
  const importPackage = async (file?: File) => {
    if (!file) return;
    try {
      const next = await readConfigPackage(file);
      if (!window.confirm('导入将替换当前本地 V3.2 配置。确定继续吗？')) return;
      const importedReport = validateConfigPackage(next, records);
      if (importedReport.issues.some(issue => issue.code === 'native-contract-structure-invalid')) { setReport(importedReport); setMessage('导入结构无效；已保存版本保持原样。请按问题路径修正文件后重新导入。'); return; }
      if (!importedReport.valid) { setDraftConfig(next); setSelectedId(next.nodes[0]?.nodeId ?? ''); setEditing(true); setReport(importedReport); setMessage('已载入隔离草案；修正阻断问题前不能保存或启用。'); return; }
      setSavedConfig(prepareConfigForActivation(next)); setDraftConfig(null); setSelectedId(next.nodes[0]?.nodeId ?? ''); setEditing(false); setReport(importedReport); setMessage(`已导入 ${next.packageId} r${next.revision}。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '配置包读取失败。'); }
  };
  const exportPackage = async () => {
    const revision = Math.trunc(nextRevision);
    if (!Number.isSafeInteger(revision) || revision <= savedConfig.revision) { setMessage(`修订版必须是大于 r${savedConfig.revision} 的正整数。`); return; }
    const next = { ...savedConfig, revision };
    const nextReport = validateConfigPackage(next, records);
    setReport(nextReport);
    if (!nextReport.valid) { setMessage('整包保存被核验阻断。'); return; }
    const blob = await buildConfigPackageArchive(next, nextReport);
    setSavedConfig(next); downloadConfigPackage(blob, next); setRevisionOpen(false); setMessage(`已下载 ${next.packageId} r${revision}。`);
  };
  const inheritedGeometry = selected ? geometries.find((geometry) => Boolean(resolveGeometryProfile(config, selected.path, geometry)?.enabled)) : undefined;
  const geometry = selected?.geometryType ?? inheritedGeometry;
  const profile = selected && geometry ? selected.geometryProfiles[geometry] ?? resolveGeometryProfile(config, selected.path, geometry) ?? createDefaultGeometryProfile(geometry) : undefined;
  const compatibleScenarios = selected ? PREVIEW_SCENARIOS.filter((item) => previewScenarioCompatible(config, selected, item.id)) : [];
  const activeScenario = compatibleScenarios.some((item) => item.id === scenario) ? scenario : compatibleScenarios[0]?.id;
  const updateSelected = (updater: (node: CategoryNode) => CategoryNode) => selected && setConfig((current) => updateNode(current, selected.nodeId, updater));

  return <main className="fixed inset-0 z-[3000] flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-800"><header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-white px-5 py-3"><SlidersHorizontal className="h-5 w-5 text-violet-600" /><div className="min-w-0 flex-1"><h1 className="font-bold">配置文件工作台 · V3.2 原生渲染</h1><p className="text-xs text-slate-500">{savedConfig.packageId} · 契约 r{savedConfig.contractRevision} · World 自动归一化、原生渲染、信息卡和标准工作流均以可编辑 V3 配置承接。</p></div><button type="button" className="rounded border px-3 py-1.5 text-sm" disabled={Boolean(draftConfig) || workflowHasDraft} onClick={remigrateV1}>从 V1 重新生成</button><button type="button" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm" disabled={Boolean(draftConfig) || workflowHasDraft} onClick={() => uploadRef.current?.click()}><FileUp className="h-4 w-4" />导入</button><button type="button" className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-sm text-white" disabled={Boolean(draftConfig) || workflowHasDraft} onClick={() => { setNextRevision(savedConfig.revision + 1); setRevisionOpen(true); }}><Download className="h-4 w-4" />整包下载</button><button type="button" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm" onClick={() => setEditorExpanded((value) => !value)}>{editorExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}{editorExpanded ? '显示验证器' : '编辑器全屏'}</button><button type="button" className="rounded p-2 hover:bg-slate-100" onClick={() => { if (draftConfig || workflowHasDraft) { setMessage('请先保存或放弃当前草稿，再关闭工作台。'); return; } onClose(); }} aria-label="关闭"><X className="h-5 w-5" /></button><input ref={uploadRef} className="hidden" type="file" accept=".zip,.json,application/zip,application/json" onChange={(event) => void importPackage(event.target.files?.[0])} /></header>
    <nav className="flex shrink-0 gap-2 border-b bg-white px-5 py-2" aria-label="设计工作区"><button type="button" role="tab" aria-selected={activeTab === 'features'} className={`rounded px-4 py-2 text-sm ${activeTab === 'features' ? 'bg-violet-600 text-white' : 'bg-slate-100'}`} onClick={() => switchTab('features')}>要素设计</button><button type="button" role="tab" aria-selected={activeTab === 'workflows'} className={`rounded px-4 py-2 text-sm ${activeTab === 'workflows' ? 'bg-violet-600 text-white' : 'bg-slate-100'}`} onClick={() => switchTab('workflows')}>工作流设计</button><span role="status" className="min-w-0 self-center text-xs text-slate-600">{message}</span></nav>
    {activeTab === 'workflows' ? <div className="min-h-0 flex-1 overflow-hidden p-3"><WorkflowWorkbench config={savedConfig} records={records} onChange={saveWorkflowPackage} onDraftStateChange={setWorkflowHasDraft} /></div> : <div className={`grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-3 overflow-hidden p-3 ${editorExpanded ? '' : 'xl:grid-cols-2'}`}>{!editorExpanded ? <section className="flex h-full min-h-[40vh] min-w-0 flex-col overflow-hidden rounded-xl border bg-white p-3 xl:min-h-0"><div className="mb-2 flex shrink-0 items-center justify-between gap-2"><strong>显示规则验证器</strong>{activeScenario ? <label className="text-xs">样例状态<select className="ml-1 rounded border px-2 py-1" value={activeScenario} onChange={(event) => setScenario(event.target.value)}>{compatibleScenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : null}</div>{selected && activeScenario ? <div className="h-full min-h-[300px] min-w-0 flex-1 overflow-hidden"><ConfigRuntimePreview config={config} node={selected} scenario={activeScenario} onRuntimeError={(error) => setMessage(`验证器错误：${error.message}`)} /></div> : <div className="flex h-full min-h-[300px] items-center justify-center rounded border border-dashed p-6 text-sm text-slate-500">先新建分类、选择几何类型并启用首条渲染规则。验证器会调用与主地图相同的 V3.2 RuleDrivenLayer；中心固定，允许滚轮缩放。</div>}</section> : null}
      <section className={`min-h-0 overflow-y-auto rounded-xl border bg-white p-4 ${editorExpanded ? 'col-span-full' : ''}`}><div className="mb-3 rounded border bg-slate-50 p-2 text-xs text-slate-700">{message}</div><OptionSourcesEditor config={config} onChange={setConfig} /><EngineEditor config={config} engine={config.engine ?? createV32EngineDefaults()} onChange={(engine) => setConfig({ ...config, engine })} />
        {!selected ? <section className="mt-4 rounded-lg border border-dashed p-5"><h2 className="font-semibold">新建第一个分类</h2><p className="mt-1 text-sm text-slate-600">当前本地包为空。可先输入 Class 建立原生 V3.2 分类，也可点击顶部“从 V1 重新生成”恢复当前工程的真实字段、卡片与标准工作流映射。</p><div className="mt-3 flex max-w-lg gap-2"><input className="min-w-0 flex-1 rounded border px-3 py-2" placeholder="例如 NEW" value={rootClass} onChange={(event) => setRootClass(event.target.value)} /><button type="button" className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-white" onClick={createRoot}><Plus className="h-4 w-4" />新建分类</button></div></section> : <div className="mt-4 space-y-4"><section className="rounded-lg border bg-slate-50 p-3"><div className="flex flex-wrap items-end gap-2"><label className="min-w-64 flex-1 text-sm">编辑分类<select disabled={editing} className="mt-1 w-full rounded border bg-white px-2 py-1.5 disabled:bg-slate-100" value={selected.nodeId} onChange={(event) => setSelectedId(event.target.value)}>{config.nodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{nodeLabel(node)}</option>)}</select></label><button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={readSelected}>{editing ? '已读取草稿' : '读取/新建'}</button><button type="button" disabled={!editing} className="rounded border px-3 py-1.5 text-sm disabled:text-slate-300" onClick={validate}>核验</button><button type="button" disabled={!editing || !report?.valid} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:bg-emerald-200" onClick={save}><Save className="h-4 w-4" />保存</button><button type="button" disabled={!editing} className="rounded border px-3 py-1.5 text-sm disabled:text-slate-300" onClick={discard}>放弃草稿</button></div><div className="mt-3 grid gap-2 md:grid-cols-4"><span className="rounded border bg-white px-2 py-1 text-sm">Class：{selected.path.class}</span><span className="rounded border bg-white px-2 py-1 text-sm">Kind：{selected.path.kind || '—'}</span><span className="rounded border bg-white px-2 py-1 text-sm">Skind：{selected.path.skind || '—'}</span><span className="rounded border bg-white px-2 py-1 text-sm">Skind2：{selected.path.skind2 || '—'}</span></div><div className="mt-3 flex flex-wrap items-center gap-4 rounded border bg-white p-2 text-sm"><strong>该层设置是否向下继承</strong>{(['fields', 'display', 'card'] as const).map((key) => <label key={key}><input disabled={!editing} type="checkbox" checked={selected.inheritDown?.[key] ?? true} onChange={(event) => updateSelected((node) => ({ ...node, inheritDown: { ...(node.inheritDown ?? { fields: true, display: true, card: true }), [key]: event.target.checked } }))} /> {key === 'fields' ? '字段' : key === 'display' ? '显示与交互（软继承）' : '信息卡'}</label>)}</div><div className="mt-3 flex gap-2"><input disabled={!editing} className="min-w-0 flex-1 rounded border px-2 py-1.5 disabled:bg-slate-100" placeholder={`新建第 ${pathDepth(selected.path) + 1} 级分类`} value={childValue} onChange={(event) => setChildValue(event.target.value)} /><button type="button" disabled={!editing || pathDepth(selected.path) >= 4 || !childValue.trim()} className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm disabled:text-slate-300" onClick={addChild}><Plus className="h-4 w-4" />添加子分类</button></div></section>
          {editing ? <><FieldEditor config={config} node={selected} onChange={(node) => setConfig((current) => updateNode(current, node.nodeId, () => node))} /><section><h3 className="mb-2 font-semibold">显示、交互与层级</h3><p className="mb-2 text-xs text-slate-500">分类只能选择一种几何类型。父级未指定时，本级可以首次定义；若继承了父级，类型保持一致。</p><label className="block max-w-sm text-sm">几何类型<select className="ml-2 rounded border px-2 py-1" value={geometry ?? ''} onChange={(event) => { const next = event.target.value as GeometryKind; updateSelected((node) => ({ ...node, geometryType: next || undefined, geometryProfiles: next ? { [next]: node.geometryProfiles[next] ?? createDefaultGeometryProfile(next) } : {} })); }}><option value="">暂不指定</option>{geometries.map((item) => <option key={item} value={item}>{geometryLabel[item]}</option>)}</select></label>{geometry && profile ? <div className="mt-2"><GeometryEditor config={config} path={selected.path} geometry={geometry} profile={profile} onChange={(next) => updateSelected((node) => ({ ...node, geometryType: geometry, geometryProfiles: { ...node.geometryProfiles, [geometry]: next } }))} /></div> : <p className="mt-2 rounded border border-dashed p-3 text-sm text-slate-500">暂不定义几何，允许先编辑父/子分类结构；总包核验时最终分类必须解析到明确几何类型。</p>}</section><ContextBindingsEditor config={config} selected={selected} onChange={setConfig} /><V3CardEditor config={config} node={selected} onChange={(node) => setConfig((current) => updateNode(current, node.nodeId, () => node))} /></> : <p className="rounded border border-dashed p-5 text-sm text-slate-500">点击“读取/新建”后才开启字段、渲染规则、信息卡、工作流与上下文绑定编辑。</p>}</div>}</section></div>}
    <Report config={config} records={records} report={report} />{revisionOpen ? <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-950/40 p-4"><form className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onSubmit={(event) => { event.preventDefault(); void exportPackage(); }}><h2 className="font-semibold">保存并下载 V3.2 配置包</h2><p className="mt-1 text-sm text-slate-600">修订版只用于包版本控制，不参与 Zoom、zLevel 或动态优先级计算。</p><NumberField label="新修订版" value={nextRevision} min={savedConfig.revision + 1} onChange={(value) => setNextRevision(value ?? savedConfig.revision + 1)} /><div className="mt-4 flex justify-end gap-2"><button type="button" className="rounded border px-3 py-1.5" onClick={() => setRevisionOpen(false)}>取消</button><button type="submit" className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-white"><Save className="h-4 w-4" />保存并下载</button></div></form></div> : null}</main>;
}

export default ConfigStudio;
