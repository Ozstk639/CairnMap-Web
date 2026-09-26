import { useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import { Download, Expand, FileUp, Minimize2, Plus, Save, SlidersHorizontal, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { buildConfigPackageArchive, downloadConfigPackage, readConfigPackage } from './package';
import { classificationPathKey, resolveEffectiveFields, resolveGeometryProfile, validateConfigPackage } from './runtime';
import { createConfigPackageFromCurrentProject } from './legacyProjectAdapter';
import type { CategoryNode, ConfigPackageV2, GeometryKind, GeometryProfile, MountedFeatureRecord, WorkflowStep } from './types';

type StudioMode = 'feature' | 'workflow';

const geometryLabels: Record<GeometryKind, string> = { Point: '点', LineString: '线', Polygon: '面' };

function ZoomReporter({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onChange(map.getZoom()) });
  return null;
}

function updateNode(config: ConfigPackageV2, nodeId: string, updater: (node: CategoryNode) => CategoryNode): ConfigPackageV2 {
  return { ...config, nodes: config.nodes.map((node) => node.nodeId === nodeId ? updater(node) : node) };
}

function defaultProfile(geometry: GeometryKind, zLevel: number): GeometryProfile {
  const color = geometry === 'Point' ? '#e04747' : geometry === 'LineString' ? '#2563eb' : '#7c3aed';
  return { enabled: true, allowMultipleParts: true, color, zLevel, labelOffset: 10, interactionPriority: zLevel, label: { visible: true, scope: 'featureBbox', conditions: [{ kind: 'zoomRange', min: 2 }] }, interaction: { mode: 'standard' } };
}

function CategoryPathPicker({ config, selected, onSelect }: { config: ConfigPackageV2; selected: CategoryNode; onSelect: (nodeId: string) => void }) {
  const path = selected.path;
  const values = (items: Array<string | undefined>) => [...new Set(items.filter((item): item is string => Boolean(item)))].sort();
  const classes = values(config.nodes.map((node) => node.path.class));
  const kinds = values(config.nodes.filter((node) => node.path.class === path.class).map((node) => node.path.kind));
  const skinds = values(config.nodes.filter((node) => node.path.class === path.class && node.path.kind === path.kind).map((node) => node.path.skind));
  const skind2s = values(config.nodes.filter((node) => node.path.class === path.class && node.path.kind === path.kind && node.path.skind === path.skind).map((node) => node.path.skind2));
  const choose = (next: { class: string; kind?: string; skind?: string; skind2?: string }) => {
    const match = config.nodes.find((node) => node.path.class === next.class && (node.path.kind ?? '') === (next.kind ?? '') && (node.path.skind ?? '') === (next.skind ?? '') && (node.path.skind2 ?? '') === (next.skind2 ?? ''))
      ?? config.nodes.find((node) => node.path.class === next.class && (!next.kind || node.path.kind === next.kind) && (!next.skind || node.path.skind === next.skind) && (!next.skind2 || node.path.skind2 === next.skind2));
    if (match) onSelect(match.nodeId);
  };
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-sm text-slate-700">一级 Class<select className="mt-1 w-full rounded border px-2 py-1.5" value={path.class} onChange={(event) => choose({ class: event.target.value })}>{classes.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="text-sm text-slate-700">二级 Kind<select className="mt-1 w-full rounded border px-2 py-1.5" value={path.kind ?? ''} onChange={(event) => choose({ class: path.class, ...(event.target.value ? { kind: event.target.value } : {}) })}><option value="">（使用一级继承）</option>{kinds.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="text-sm text-slate-700">三级 Skind<select disabled={!path.kind} className="mt-1 w-full rounded border px-2 py-1.5 disabled:bg-slate-100" value={path.skind ?? ''} onChange={(event) => choose({ class: path.class, kind: path.kind, ...(event.target.value ? { skind: event.target.value } : {}) })}><option value="">（使用上级继承）</option>{skinds.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="text-sm text-slate-700">四级 Skind2<select disabled={!path.skind} className="mt-1 w-full rounded border px-2 py-1.5 disabled:bg-slate-100" value={path.skind2 ?? ''} onChange={(event) => choose({ class: path.class, kind: path.kind, skind: path.skind, ...(event.target.value ? { skind2: event.target.value } : {}) })}><option value="">（使用上级继承）</option>{skind2s.map((value) => <option key={value}>{value}</option>)}</select></label>
  </div>;
}

function PreviewMap({ config, node, zoom, onZoom }: { config: ConfigPackageV2; node: CategoryNode; zoom: number; onZoom: (value: number) => void }) {
  const path = node.path;
  const polygon = resolveGeometryProfile(config, path, 'Polygon');
  const line = resolveGeometryProfile(config, path, 'LineString');
  const point = resolveGeometryProfile(config, path, 'Point');
  const show = (profile: GeometryProfile | undefined) => profile?.enabled && zoom >= (profile.label.conditions.find((item) => item.kind === 'zoomRange')?.min ?? 0);
  return <div className="h-full min-h-[360px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
    <MapContainer center={[0, 0]} zoom={zoom} minZoom={0} maxZoom={8} className="h-full w-full bg-slate-900" attributionControl={false} zoomControl>
      <ZoomReporter onChange={onZoom} />
      {show(polygon) ? <Polygon positions={[[18, -24], [32, 0], [17, 24], [-10, 19], [-20, -10]]} pathOptions={{ color: polygon?.color, weight: 3, fillOpacity: 0.25, pane: 'overlayPane' }}><Tooltip permanent>{classificationPathKey(path)} · 面 · z{polygon?.zLevel}</Tooltip></Polygon> : null}
      {show(line) ? <Polyline positions={[[-28, -36], [-5, -8], [12, 6], [28, 33]]} pathOptions={{ color: line?.color, weight: 5, pane: 'overlayPane' }}><Tooltip permanent>{classificationPathKey(path)} · 线 · z{line?.zLevel}</Tooltip></Polyline> : null}
      {show(point) ? <CircleMarker center={[0, 0]} radius={10} pathOptions={{ color: point?.color, fillColor: point?.color, fillOpacity: 0.85, pane: 'markerPane' }}><Tooltip permanent>{classificationPathKey(path)} · 点 · z{point?.zLevel}</Tooltip></CircleMarker> : null}
    </MapContainer>
  </div>;
}

function WorkflowEditor({ config, setConfig }: { config: ConfigPackageV2; setConfig: (config: ConfigPackageV2) => void }) {
  const [workflowId, setWorkflowId] = useState(() => config.workflows[0]?.id ?? '');
  const workflow = config.workflows.find((item) => item.id === workflowId) ?? config.workflows[0];
  if (!workflow) return <div className="p-4 text-sm text-slate-500">尚无工作流。</div>;
  const fields = resolveEffectiveFields(config, workflow.target);
  const updateWorkflow = (updater: (value: typeof workflow) => typeof workflow) => setConfig({ ...config, workflows: config.workflows.map((item) => item.id === workflow.id ? updater(item) : item) });
  const updateStep = (id: string, patch: Partial<WorkflowStep>) => updateWorkflow((item) => ({ ...item, steps: item.steps.map((step) => step.id === id ? { ...step, ...patch } : step) }));
  const addForm = () => updateWorkflow((item) => {
    const tailIndex = item.steps.findIndex((step) => step.kind === 'tagsExtensions');
    const insertAt = tailIndex < 0 ? item.steps.length - 1 : tailIndex;
    const step: WorkflowStep = { id: `form-${Date.now()}`, kind: 'form', label: { zh: '信息填写', en: 'Information' }, controls: [] };
    return { ...item, steps: [...item.steps.slice(0, insertAt), step, ...item.steps.slice(insertAt)] };
  });
  const addControl = (step: WorkflowStep) => updateStep(step.id, { controls: [...(step.controls ?? []), { id: `control-${Date.now()}`, kind: 'text', columns: 1, label: { zh: '新字段', en: 'New field' }, binding: { target: 'field', path: fields[0]?.key ?? '' } }] });
  const updateControl = (step: WorkflowStep, controlId: string, updater: (value: NonNullable<WorkflowStep['controls']>[number]) => NonNullable<WorkflowStep['controls']>[number]) => updateStep(step.id, { controls: (step.controls ?? []).map((control) => control.id === controlId ? updater(control) : control) });
  return <div className="space-y-3">
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">标准顺序固定为：填写人/上下文 → 一页或多页信息填写 → tags/extensions 尾部区 → 绘制页。绘制页固定为最后一步，tags/extensions 固定在其前。</div>
    <label className="block text-sm text-slate-700">工作流<select className="mt-1 w-full rounded border px-2 py-1.5" value={workflow.id} onChange={(event) => setWorkflowId(event.target.value)}>{config.workflows.map((item) => <option key={item.id} value={item.id}>{item.label.zh} · {classificationPathKey(item.target)}</option>)}</select></label>
    <label className="block text-sm text-slate-700">工作流名称<input className="mt-1 w-full rounded border px-2 py-1.5" value={workflow.label.zh} onChange={(event) => updateWorkflow((item) => ({ ...item, label: { ...item.label, zh: event.target.value } }))} /></label>
    <button type="button" onClick={addForm} className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm"><Plus className="h-4 w-4" />在尾部区前添加信息页</button>
    {workflow.steps.map((step, index) => <div key={step.id} className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">{index + 1}</span><input disabled={step.kind === 'tagsExtensions' || step.kind === 'geometry'} className="min-w-0 flex-1 rounded border px-2 py-1.5 disabled:bg-slate-100" value={step.label.zh} onChange={(event) => updateStep(step.id, { label: { ...step.label, zh: event.target.value } })} /><span className="text-xs text-slate-500">{step.kind}</span></div>
      {step.kind === 'special' ? <p className="mt-2 text-xs text-amber-700">混合适配器：{step.specialKey}（来自当前受控注册表，不能在下载包中任意执行组件）。</p> : null}
      {step.kind === 'tagsExtensions' ? <p className="mt-2 text-xs text-emerald-700">通用 tags/extensions 尾部区；会在最终绘制页前呈现。</p> : null}
      {step.kind === 'geometry' ? <p className="mt-2 text-xs text-slate-500">最终绘制页：{step.geometry?.map((value) => geometryLabels[value]).join('、') || '未配置'}</p> : null}
      {step.kind === 'form' ? <div className="mt-3 space-y-2 rounded bg-slate-50 p-2">{(step.controls ?? []).map((control) => <div key={control.id} className="grid gap-2 md:grid-cols-4"><select className="rounded border px-2 py-1" value={control.kind} onChange={(event) => updateControl(step, control.id, (value) => ({ ...value, kind: event.target.value as typeof value.kind }))}>{['text', 'textarea', 'select', 'classificationPicker', 'notice'].map((kind) => <option key={kind}>{kind}</option>)}</select><input className="rounded border px-2 py-1" value={control.label.zh} onChange={(event) => updateControl(step, control.id, (value) => ({ ...value, label: { ...value.label, zh: event.target.value } }))} /><select className="rounded border px-2 py-1" value={control.binding?.path ?? ''} onChange={(event) => updateControl(step, control.id, (value) => ({ ...value, binding: { target: 'field', path: event.target.value } }))}>{fields.map((field) => <option key={field.key}>{field.key}</option>)}</select><select className="rounded border px-2 py-1" value={control.columns} onChange={(event) => updateControl(step, control.id, (value) => ({ ...value, columns: Number(event.target.value) as 1 | 2 | 3 }))}>{[1, 2, 3].map((columns) => <option key={columns} value={columns}>{columns} 列</option>)}</select></div>)}<button type="button" onClick={() => addControl(step)} className="rounded border px-2 py-1 text-xs">+ 添加标准输入组件</button></div> : null}
    </div>)}
    <section className="rounded border border-slate-200 p-3"><h3 className="font-semibold text-slate-800">字段组装</h3><div className="mt-2 grid gap-2 md:grid-cols-3"><select className="rounded border px-2 py-1" value={workflow.idAssembly?.targetField ?? 'ID'} onChange={(event) => updateWorkflow((item) => ({ ...item, idAssembly: { targetField: event.target.value, operator: item.idAssembly?.operator ?? 'concat', parts: item.idAssembly?.parts ?? [], separator: item.idAssembly?.separator ?? '-' } }))}><option>ID</option>{fields.map((field) => <option key={field.key}>{field.key}</option>)}</select><input className="rounded border px-2 py-1" value={workflow.idAssembly?.parts.join('+') ?? ''} placeholder="字段名，用 + 分隔" onChange={(event) => updateWorkflow((item) => ({ ...item, idAssembly: { targetField: item.idAssembly?.targetField ?? 'ID', operator: 'concat', parts: event.target.value.split('+').map((value) => value.trim()).filter(Boolean), separator: item.idAssembly?.separator ?? '-' } }))} /><input className="rounded border px-2 py-1" value={workflow.idAssembly?.separator ?? '-'} placeholder="连接符" onChange={(event) => updateWorkflow((item) => ({ ...item, idAssembly: { targetField: item.idAssembly?.targetField ?? 'ID', operator: 'concat', parts: item.idAssembly?.parts ?? [], separator: event.target.value } }))} /></div></section>
  </div>;
}

export function ConfigStudio({ onClose, mountedRecords = [] }: { onClose: () => void; mountedRecords?: MountedFeatureRecord[] }) {
  const [config, setConfig] = useState<ConfigPackageV2>(() => createConfigPackageFromCurrentProject());
  const [selectedNodeId, setSelectedNodeId] = useState(() => config.nodes[0]?.nodeId ?? '');
  const [mode, setMode] = useState<StudioMode>('feature');
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [message, setMessage] = useState('已载入当前工程 v2 基准配置；所有编辑仅保存在本地会话。');
  const uploadRef = useRef<HTMLInputElement>(null);
  const selected = config.nodes.find((node) => node.nodeId === selectedNodeId) ?? config.nodes[0];
  const effectiveFields = useMemo(() => selected ? resolveEffectiveFields(config, selected.path) : [], [config, selected]);
  const report = useMemo(() => validateConfigPackage(config, mountedRecords), [config, mountedRecords]);
  if (!selected) return null;
  const updateSelected = (updater: (node: CategoryNode) => CategoryNode) => setConfig((current) => updateNode(current, selected.nodeId, updater));
  const importPackage = async (file?: File) => {
    if (!file) return;
    try {
      const next = await readConfigPackage(file);
      setConfig(next); setSelectedNodeId(next.nodes[0]?.nodeId ?? ''); setMessage(`已加载 ${next.packageId} r${next.revision}。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '读取配置包失败。'); }
  };
  const exportPackage = async () => {
    const nextReport = validateConfigPackage(config, mountedRecords);
    if (!nextReport.valid) { setMessage(`校验阻断：${nextReport.issues.filter((item) => item.severity === 'error').length} 项错误。请先修复。`); return; }
    const blob = await buildConfigPackageArchive(config, nextReport);
    downloadConfigPackage(blob, config);
    setMessage(`已下载 ${config.packageId} r${config.revision}；此操作未更新线上配置。`);
  };
  return <div className="fixed inset-3 z-[1000] flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-slate-50 shadow-2xl">
    <header className="flex shrink-0 items-center gap-3 border-b bg-white px-5 py-3"><SlidersHorizontal className="h-5 w-5 text-blue-600" /><div className="min-w-0 flex-1"><h2 className="font-bold text-slate-900">配置文件工作台</h2><p className="truncate text-xs text-slate-500">{config.packageId} · r{config.revision} · {report.valid ? '校验通过' : `存在 ${report.issues.length} 项问题`}</p></div><button type="button" onClick={() => setExpanded((value) => !value)} className="rounded p-2 hover:bg-slate-100" title="切换布局">{expanded ? <Minimize2 className="h-5 w-5" /> : <Expand className="h-5 w-5" />}</button><button type="button" onClick={onClose} className="rounded p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
    <div className={`min-h-0 flex-1 gap-3 p-3 ${expanded ? 'grid grid-cols-1' : 'grid grid-cols-1 lg:grid-cols-2'}`}>
      {!expanded ? <section className="min-h-0 rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700"><span>显示规则验证器</span><span className="text-xs font-normal">Zoom {zoom} · 可平移/缩放</span></div><PreviewMap config={config} node={selected} zoom={zoom} onZoom={setZoom} /><p className="mt-2 text-xs text-slate-500">预览数据隔离于真实图层；可测试多部件范围、整体 bbox、建筑聚合、层级覆盖及 Label 缩放条件。</p></section> : null}
      <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap gap-2"><button type="button" onClick={() => setMode('feature')} className={`rounded px-3 py-1.5 text-sm ${mode === 'feature' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>要素设计</button><button type="button" onClick={() => setMode('workflow')} className={`rounded px-3 py-1.5 text-sm ${mode === 'workflow' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>工作流设计</button><span className="flex-1" /><button type="button" onClick={() => uploadRef.current?.click()} className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm"><FileUp className="h-4 w-4" />导入</button><button type="button" onClick={exportPackage} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-sm text-white"><Download className="h-4 w-4" />校验并下载</button><input ref={uploadRef} className="hidden" type="file" accept=".zip,.json,application/json,application/zip" onChange={(event) => void importPackage(event.target.files?.[0])} /></div>
        <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">{message}</div>
        {mode === 'workflow' ? <WorkflowEditor config={config} setConfig={setConfig} /> : <>
          <div className="mb-4 space-y-2"><CategoryPathPicker config={config} selected={selected} onSelect={setSelectedNodeId} /><label className="block max-w-sm text-sm text-slate-700">统一 revision<input className="mt-1 w-full rounded border px-2 py-1.5" type="number" min="1" value={config.revision} onChange={(event) => setConfig({ ...config, revision: Number(event.target.value) || 1 })} /></label><p className="text-xs text-slate-500">下级节点继承上级固定项；只有标记为可覆盖的字段、显示、信息卡或工作流部分能够在当前节点修改。分类路径不得跳级。</p></div>
          <div className="space-y-4"><section><h3 className="mb-2 font-semibold text-slate-800">字段设置</h3><div className="space-y-2">{selected.fields.map((field) => <div key={field.fieldId} className="grid gap-2 rounded border p-2 md:grid-cols-4"><input className="rounded border px-2 py-1" value={field.key} onChange={(event) => updateSelected((node) => ({ ...node, fields: node.fields.map((item) => item.fieldId === field.fieldId ? { ...item, key: event.target.value } : item) }))} /><select className="rounded border px-2 py-1" value={field.type} onChange={(event) => updateSelected((node) => ({ ...node, fields: node.fields.map((item) => item.fieldId === field.fieldId ? { ...item, type: event.target.value as typeof item.type } : item) }))}>{['string', 'number', 'boolean', 'enum', 'json', 'reference'].map((type) => <option key={type}>{type}</option>)}</select><input className="rounded border px-2 py-1" value={field.labels.zh} onChange={(event) => updateSelected((node) => ({ ...node, fields: node.fields.map((item) => item.fieldId === field.fieldId ? { ...item, labels: { ...item.labels, zh: event.target.value } } : item) }))} placeholder="中文标签" /><label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateSelected((node) => ({ ...node, fields: node.fields.map((item) => item.fieldId === field.fieldId ? { ...item, required: event.target.checked } : item) }))} />必填</label></div>)}</div><button type="button" onClick={() => updateSelected((node) => ({ ...node, fields: [...node.fields, { fieldId: `field-${Date.now()}`, key: 'NewField', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '新字段', en: 'New field' }, description: { zh: '', en: '' } }] }))} className="mt-2 inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm"><Plus className="h-4 w-4" />添加字段</button><p className="mt-2 text-xs text-slate-500">有效字段：{effectiveFields.map((field) => field.key).join('、') || '无'}。系统字段和坐标字段由运行时固定，不能重定义。</p></section>
          <section><h3 className="mb-2 font-semibold text-slate-800">显示、交互与层级</h3><div className="grid gap-2 md:grid-cols-3">{(['Point', 'LineString', 'Polygon'] as GeometryKind[]).map((geometry) => { const item = selected.geometryProfiles[geometry] ?? defaultProfile(geometry, 300); return <div key={geometry} className="rounded border p-3"><div className="mb-2 flex items-center justify-between font-medium"><span>{geometryLabels[geometry]}</span><label className="text-xs"><input type="checkbox" checked={Boolean(selected.geometryProfiles[geometry]?.enabled)} onChange={(event) => updateSelected((node) => ({ ...node, geometryProfiles: { ...node.geometryProfiles, [geometry]: { ...item, enabled: event.target.checked } } }))} /> 启用</label></div><label className="block text-xs">zLevel<input className="mt-1 w-full rounded border px-2 py-1" type="number" min="100" max="699" value={item.zLevel} onChange={(event) => updateSelected((node) => ({ ...node, geometryProfiles: { ...node.geometryProfiles, [geometry]: { ...item, zLevel: Number(event.target.value), interactionPriority: Number(event.target.value) } } }))} /></label><label className="mt-2 block text-xs">Label 范围<select className="mt-1 w-full rounded border px-2 py-1" value={item.label.scope} onChange={(event) => updateSelected((node) => ({ ...node, geometryProfiles: { ...node.geometryProfiles, [geometry]: { ...item, label: { ...item.label, scope: event.target.value as GeometryProfile['label']['scope'] } } } }))}><option value="part">单部件</option><option value="featureBbox">完整 bbox</option><option value="buildingAggregate">建筑整体</option></select></label><label className="mt-2 block text-xs">最小 Zoom<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={item.label.conditions.find((condition) => condition.kind === 'zoomRange')?.min ?? 0} onChange={(event) => updateSelected((node) => ({ ...node, geometryProfiles: { ...node.geometryProfiles, [geometry]: { ...item, label: { ...item.label, conditions: [{ kind: 'zoomRange', min: Number(event.target.value) }] } } } }))} /></label></div>})}</div><p className="mt-2 text-xs text-slate-500">业务 zLevel 允许 100–699；底图、系统 Label、选中/编辑覆盖层和面板使用受保护层。STA 默认 420，高于 RLE 默认 320。</p></section>
          <section><h3 className="mb-2 font-semibold text-slate-800">信息卡设置</h3>{selected.card.map((item) => <div key={item.id} className="mb-2 grid gap-2 rounded border p-2 md:grid-cols-3"><select className="rounded border px-2 py-1" value={item.source} onChange={(event) => updateSelected((node) => ({ ...node, card: node.card.map((entry) => entry.id === item.id ? { ...entry, source: event.target.value } : entry) }))}>{effectiveFields.map((field) => <option key={field.key}>{field.key}</option>)}<option value="tags.custom">tags.custom</option></select><select className="rounded border px-2 py-1" value={item.renderer} onChange={(event) => updateSelected((node) => ({ ...node, card: node.card.map((entry) => entry.id === item.id ? { ...entry, renderer: event.target.value as typeof entry.renderer } : entry) }))}>{['text', 'tag', 'colorCapsule', 'nameColorCapsule', 'relationLink', 'media'].map((renderer) => <option key={renderer}>{renderer}</option>)}</select><label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={item.visible} onChange={(event) => updateSelected((node) => ({ ...node, card: node.card.map((entry) => entry.id === item.id ? { ...entry, visible: event.target.checked } : entry) }))} />显示</label></div>)}<button type="button" onClick={() => updateSelected((node) => ({ ...node, card: [...node.card, { id: `card-${Date.now()}`, source: effectiveFields[0]?.key ?? 'tags.custom', visible: true, renderer: 'text' }] }))} className="rounded border px-3 py-1.5 text-sm">+ 添加信息卡字段/关系</button><p className="mt-2 text-xs text-slate-500">关系跳转项使用 relationLink 渲染器；其目标分类、匹配字段与展示字段会在受控配置包内验证后再由运行时解析。</p></section>
          </div>
        </>}
      </section>
    </div>
    <footer className="flex shrink-0 items-center gap-3 border-t bg-white px-5 py-2 text-xs"><span className={report.valid ? 'text-emerald-700' : 'text-rose-700'}>{report.valid ? `完整功能校验通过（已检查当前挂载的 ${mountedRecords.length} 条要素），可导出本地包。` : report.issues.filter((item) => item.severity === 'error').map((item) => item.message).join('；')}</span><span className="flex-1" /><Save className="h-4 w-4 text-slate-500" /><span className="text-slate-500">仅本地保存；线上更新必须经 Pipeline 授权导入。</span></footer>
  </div>;
}

export default ConfigStudio;
