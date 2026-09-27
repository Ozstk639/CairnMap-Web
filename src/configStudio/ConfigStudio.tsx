import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer as LeafletMap, Polygon, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { ChevronDown, ChevronRight, Download, FileUp, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { createDynmapCRS, ZTH_FLAT_CONFIG } from '@/lib/DynmapProjection';
import { createDynmapTileLayer } from '@/lib/DynmapTileLayer';
import { buildConfigPackageArchive, downloadConfigPackage, readConfigPackage } from './package';
import {
  classificationPathKey,
  hasDescendants,
  resolveEffectiveFields,
  resolveGeometryProfile,
  resolveSelectableFields,
  resolveZoomRule,
  validateConfigPackage,
} from './runtime';
import { createConfigPackageFromCurrentProject } from './legacyProjectAdapter';
import type {
  CardConfiguration,
  CardItem,
  CategoryNode,
  ClassificationPath,
  ConfigPackageV3,
  GeometryInteractionTriggers,
  GeometryKind,
  GeometryProfile,
  MountedFeatureRecord,
  SearchProfile,
  WorkflowAssignment,
  WorkflowControl,
  WorkflowDefinition,
  WorkflowStep,
  ZoomPriorityRule,
} from './types';

type StudioMode = 'feature' | 'workflow';

const geometryLabels: Record<GeometryKind, string> = { Point: '点', LineString: '线', Polygon: '面' };
const geometryValues: GeometryKind[] = ['Point', 'LineString', 'Polygon'];
const systemTokens = ['World', 'Class', 'Kind', 'Skind', 'Skind2'];

function readSessionRecords(): MountedFeatureRecord[] {
  try {
    const value = sessionStorage.getItem('cairnmap-config-studio-mounted-records');
    return value ? JSON.parse(value) as MountedFeatureRecord[] : [];
  } catch {
    return [];
  }
}

function updateNode(config: ConfigPackageV3, nodeId: string, updater: (node: CategoryNode) => CategoryNode): ConfigPackageV3 {
  return { ...config, nodes: config.nodes.map((node) => node.nodeId === nodeId ? updater(node) : node) };
}

function defaultProfile(geometry: GeometryKind): GeometryProfile {
  const zLevel = geometry === 'Point' ? 420 : geometry === 'LineString' ? 320 : 360;
  const color = geometry === 'Point' ? '#e04747' : geometry === 'LineString' ? '#2563eb' : '#334155';
  return {
    enabled: false,
    allowMultipleParts: false,
    color,
    geometryStack: { zLevel },
    label: { visible: true, anchor: 'featureBbox', conditions: [{ kind: 'always' }], collision: { role: 'optional', basePriority: zLevel, hideWhenColliding: true } },
    zoomPriority: { rules: [{ id: 'default', minExclusive: 0, representation: 'geometry', priority: { mode: 'replace', base: zLevel } }] },
    interaction: { triggers: geometry === 'Point' ? { point: true, label: true } : geometry === 'LineString' ? { line: true, label: true } : { boundary: true, interior: true, label: true } },
  };
}

function CategoryPathPicker({ config, selected, onSelect }: { config: ConfigPackageV3; selected: CategoryNode; onSelect: (nodeId: string) => void }) {
  const path = selected.path;
  const values = (items: Array<string | undefined>) => [...new Set(items.filter((item): item is string => Boolean(item)))].sort();
  const classes = values(config.nodes.map((node) => node.path.class));
  const kinds = values(config.nodes.filter((node) => node.path.class === path.class).map((node) => node.path.kind));
  const skinds = values(config.nodes.filter((node) => node.path.class === path.class && node.path.kind === path.kind).map((node) => node.path.skind));
  const skind2s = values(config.nodes.filter((node) => node.path.class === path.class && node.path.kind === path.kind && node.path.skind === path.skind).map((node) => node.path.skind2));
  const choose = (next: ClassificationPath) => {
    const match = config.nodes.find((node) => classificationPathKey(node.path) === classificationPathKey(next))
      ?? config.nodes.find((node) => node.path.class === next.class && !node.path.kind);
    if (match) onSelect(match.nodeId);
  };
  return <section className="rounded border bg-slate-50 p-3"><div className="mb-2 text-sm font-medium">编辑分类</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    <label className="text-xs">一级 Class<select className="mt-1 w-full rounded border bg-white px-2 py-1.5" value={path.class} onChange={(event) => choose({ class: event.target.value })}>{classes.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="text-xs">二级 Kind<select className="mt-1 w-full rounded border bg-white px-2 py-1.5" value={path.kind ?? ''} onChange={(event) => choose({ class: path.class, ...(event.target.value ? { kind: event.target.value } : {}) })}><option value="">（继承 Class）</option>{kinds.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="text-xs">三级 Skind<select className="mt-1 w-full rounded border bg-white px-2 py-1.5" value={path.skind ?? ''} disabled={!path.kind} onChange={(event) => choose({ class: path.class, kind: path.kind, ...(event.target.value ? { skind: event.target.value } : {}) })}><option value="">（继承 Kind）</option>{skinds.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="text-xs">四级 Skind2<select className="mt-1 w-full rounded border bg-white px-2 py-1.5" value={path.skind2 ?? ''} disabled={!path.skind} onChange={(event) => choose({ class: path.class, kind: path.kind, skind: path.skind, ...(event.target.value ? { skind2: event.target.value } : {}) })}><option value="">（继承 Skind）</option>{skind2s.map((value) => <option key={value}>{value}</option>)}</select></label>
  </div></section>;
}

/** Controlled four-level selector used by relation links and searches. */
function PathSelector({ config, value, onChange, label = '目标分类' }: { config: ConfigPackageV3; value: ClassificationPath; onChange: (value: ClassificationPath) => void; label?: string }) {
  const values = (items: Array<string | undefined>) => [...new Set(items.filter((item): item is string => Boolean(item)))].sort();
  const classes = values(config.nodes.map((node) => node.path.class));
  const kinds = values(config.nodes.filter((node) => node.path.class === value.class).map((node) => node.path.kind));
  const skinds = values(config.nodes.filter((node) => node.path.class === value.class && node.path.kind === value.kind).map((node) => node.path.skind));
  const skind2s = values(config.nodes.filter((node) => node.path.class === value.class && node.path.kind === value.kind && node.path.skind === value.skind).map((node) => node.path.skind2));
  return <fieldset className="grid gap-2 rounded border border-slate-200 p-2 sm:grid-cols-2 xl:grid-cols-4"><legend className="px-1 text-xs text-slate-500">{label}</legend>
    <label className="text-xs">Class<select className="mt-1 w-full rounded border px-2 py-1" value={value.class} onChange={(event) => onChange({ class: event.target.value })}><option value="">选择 Class</option>{classes.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="text-xs">Kind<select className="mt-1 w-full rounded border px-2 py-1" disabled={!value.class} value={value.kind ?? ''} onChange={(event) => onChange({ class: value.class, ...(event.target.value ? { kind: event.target.value } : {}) })}><option value="">全部 Kind</option>{kinds.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="text-xs">Skind<select className="mt-1 w-full rounded border px-2 py-1" disabled={!value.kind} value={value.skind ?? ''} onChange={(event) => onChange({ class: value.class, kind: value.kind, ...(event.target.value ? { skind: event.target.value } : {}) })}><option value="">全部 Skind</option>{skinds.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="text-xs">Skind2<select className="mt-1 w-full rounded border px-2 py-1" disabled={!value.skind} value={value.skind2 ?? ''} onChange={(event) => onChange({ class: value.class, kind: value.kind, skind: value.skind, ...(event.target.value ? { skind2: event.target.value } : {}) })}><option value="">全部 Skind2</option>{skind2s.map((item) => <option key={item}>{item}</option>)}</select></label>
  </fieldset>;
}

function FieldChecklist({ fields, value, onChange, label }: { fields: string[]; value: string[]; onChange: (value: string[]) => void; label: string }) {
  return <fieldset className="rounded border p-2"><legend className="px-1 text-xs text-slate-500">{label}</legend><div className="flex max-h-24 flex-wrap gap-x-3 gap-y-1 overflow-auto text-xs">{fields.length ? fields.map((field) => <label key={field} className="inline-flex items-center gap-1"><input type="checkbox" checked={value.includes(field)} onChange={(event) => onChange(event.target.checked ? [...value, field] : value.filter((item) => item !== field))} />{field}</label>) : <span className="text-slate-400">请先选择存在的目标分类。</span>}</div></fieldset>;
}

function SearchEditor({ config, control, onChange }: { config: ConfigPackageV3; control: WorkflowControl; onChange: (value: WorkflowControl) => void }) {
  const defaultTarget = { class: config.nodes[0]?.path.class ?? '' };
  const search: SearchProfile = control.search ?? { mode: control.kind === 'coarseSearch' ? 'coarse' : 'feature', target: defaultTarget, searchFields: [], displayFields: [], returnFields: [], cacheScope: 'loadedWorlds', ...(control.kind === 'coarseSearch' ? { coarse: { matcher: 'contains', minQueryLength: 1, maxResults: 30 } } : {}) };
  const fields = resolveSelectableFields(config, search.target).map((field) => field.key);
  const update = (patch: Partial<SearchProfile>) => onChange({ ...control, search: { ...search, ...patch } });
  return <div className="mt-2 space-y-2 rounded bg-slate-50 p-2"><PathSelector config={config} label="搜索目标范围" value={search.target} onChange={(target) => update({ target, searchFields: [], displayFields: [], returnFields: [] })} /><div className="grid gap-2 md:grid-cols-3"><FieldChecklist label="搜索字段" fields={fields} value={search.searchFields} onChange={(searchFields) => update({ searchFields })} /><FieldChecklist label="展示字段" fields={fields} value={search.displayFields} onChange={(displayFields) => update({ displayFields })} /><FieldChecklist label="返回字段" fields={fields} value={search.returnFields} onChange={(returnFields) => update({ returnFields })} /></div>{control.kind === 'coarseSearch' ? <div className="grid gap-2 sm:grid-cols-4"><label className="text-xs">匹配方式<select className="mt-1 w-full rounded border px-2 py-1" value={search.coarse?.matcher ?? 'contains'} onChange={(event) => update({ coarse: { ...(search.coarse ?? { minQueryLength: 1, maxResults: 30 }), matcher: event.target.value as NonNullable<SearchProfile['coarse']>['matcher'] } })}>{['contains', 'prefix', 'token', 'fuzzy'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs">最短输入<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={search.coarse?.minQueryLength ?? 1} onChange={(event) => update({ coarse: { ...(search.coarse ?? { matcher: 'contains', maxResults: 30 }), minQueryLength: Number(event.target.value) } })} /></label><label className="text-xs">结果上限<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={search.coarse?.maxResults ?? 30} onChange={(event) => update({ coarse: { ...(search.coarse ?? { matcher: 'contains', minQueryLength: 1 }), maxResults: Number(event.target.value) } })} /></label><label className="text-xs">缓存范围<select className="mt-1 w-full rounded border px-2 py-1" value={search.cacheScope} onChange={(event) => update({ cacheScope: event.target.value as SearchProfile['cacheScope'] })}><option value="loadedWorlds">当前已加载世界</option><option value="world">当前世界</option></select></label></div> : null}</div>;
}

function ZoomPriorityEditor({ profile, onChange }: { profile: GeometryProfile; onChange: (profile: GeometryProfile) => void }) {
  const rows = profile.zoomPriority.rules;
  const update = (id: string, patch: Partial<ZoomPriorityRule>) => onChange({ ...profile, zoomPriority: { rules: rows.map((row) => row.id === id ? { ...row, ...patch } : row) } });
  const updateMetric = (row: ZoomPriorityRule, patch: Partial<NonNullable<NonNullable<ZoomPriorityRule['priority']>['metric']>>) => update(row.id, { priority: { ...(row.priority ?? { mode: 'replace' }), metric: { ...(row.priority?.metric ?? { kind: 'area', multiplier: 1, rounding: 'floor' }), ...patch } } });
  return <section className="mt-3 rounded border border-indigo-100 bg-indigo-50/40 p-2"><h5 className="text-sm font-medium text-indigo-950">三区块 C：Zoom 与动态优先级</h5><p className="mt-1 text-xs text-slate-600">每一行均为 n &lt; zoom &lt; n；该数值仅影响 Label 选择/显示，不改变几何 zLevel。</p>{rows.map((row) => <div key={row.id} className="mt-2 rounded border bg-white p-2"><div className="grid gap-2 md:grid-cols-5"><label className="text-xs">下界 n<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={row.minExclusive ?? ''} onChange={(event) => update(row.id, { minExclusive: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label className="text-xs">上界 n<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={row.maxExclusive ?? ''} onChange={(event) => update(row.id, { maxExclusive: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label className="text-xs">显示形态<select className="mt-1 w-full rounded border px-2 py-1" value={row.representation} onChange={(event) => update(row.id, { representation: event.target.value as ZoomPriorityRule['representation'] })}><option value="hidden">隐藏</option><option value="point">中心点/低缩放</option><option value="geometry">完整几何</option></select></label><label className="text-xs">优先级方式<select className="mt-1 w-full rounded border px-2 py-1" value={row.priority?.mode ?? 'replace'} onChange={(event) => update(row.id, { priority: { ...(row.priority ?? {}), mode: event.target.value as 'add' | 'replace' } })}><option value="replace">覆盖基础值</option><option value="add">叠加基础值</option></select></label><div className="flex items-end"><button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs" onClick={() => onChange({ ...profile, zoomPriority: { rules: rows.filter((item) => item.id !== row.id) } })}><Trash2 className="h-3 w-3" />删除</button></div></div><div className="mt-2 grid gap-2 md:grid-cols-5"><label className="text-xs">规则基础优先级<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={row.priority?.base ?? ''} onChange={(event) => update(row.id, { priority: { ...(row.priority ?? { mode: 'replace' }), base: event.target.value === '' ? undefined : Number(event.target.value) } })} /></label><label className="text-xs">动态指标<select className="mt-1 w-full rounded border px-2 py-1" value={row.priority?.metric?.kind ?? ''} onChange={(event) => event.target.value ? updateMetric(row, { kind: event.target.value as NonNullable<NonNullable<ZoomPriorityRule['priority']>['metric']>['kind'] }) : update(row.id, { priority: { ...(row.priority ?? { mode: 'replace' }), metric: undefined } })}><option value="">不启用</option>{['area', 'length', 'partCount', 'field'].map((item) => <option key={item}>{item}</option>)}</select></label>{row.priority?.metric ? <><label className="text-xs">倍率<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={row.priority.metric.multiplier} onChange={(event) => updateMetric(row, { multiplier: Number(event.target.value) })} /></label><label className="text-xs">除数<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={row.priority.metric.divisor ?? ''} onChange={(event) => updateMetric(row, { divisor: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label className="text-xs">封顶<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={row.priority.metric.max ?? ''} onChange={(event) => updateMetric(row, { max: event.target.value === '' ? undefined : Number(event.target.value) })} /></label></> : <span className="md:col-span-3" />}</div></div>)}<button type="button" className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs" onClick={() => onChange({ ...profile, zoomPriority: { rules: [...rows, { id: `zoom-${Date.now()}`, minExclusive: 0, representation: 'geometry', priority: { mode: 'replace', base: profile.label.collision.basePriority } }] } })}><Plus className="h-3 w-3" />添加区间</button></section>;
}

function GeometryEditor({ geometry, profile, onChange }: { geometry: GeometryKind; profile: GeometryProfile; onChange: (profile: GeometryProfile) => void }) {
  const [expanded, setExpanded] = useState(profile.enabled);
  const triggerKeys = geometry === 'Point' ? [['point', '点击点'], ['label', '点击 Label']] : geometry === 'LineString' ? [['line', '点击线'], ['label', '点击 Label']] : [['boundary', '点击边框'], ['interior', '点击面内'], ['label', '点击 Label']];
  const setTrigger = (key: keyof GeometryInteractionTriggers, enabled: boolean) => onChange({ ...profile, interaction: { triggers: { ...profile.interaction.triggers, [key]: enabled } } });
  return <article className="rounded-lg border bg-white"><header className="flex items-center gap-2 p-3"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<strong>{geometryLabels[geometry]}</strong><span className="text-xs text-slate-500">{expanded ? '展开设置' : '仅显示启用状态'}</span></button><label className="shrink-0 text-sm"><input type="checkbox" checked={profile.enabled} onChange={(event) => onChange({ ...profile, enabled: event.target.checked })} /> 启用</label></header>{expanded ? <div className="space-y-3 border-t p-3"><section className="rounded border border-slate-200 p-2"><h5 className="text-sm font-medium">三区块 A：几何层级与样式</h5><div className="mt-2 grid gap-2 sm:grid-cols-3"><label className="text-xs">颜色<input className="mt-1 h-8 w-full rounded border px-1" type="color" value={profile.color} onChange={(event) => onChange({ ...profile, color: event.target.value })} /></label><label className="text-xs">几何 zLevel<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={profile.geometryStack.zLevel} onChange={(event) => onChange({ ...profile, geometryStack: { ...profile.geometryStack, zLevel: Number(event.target.value) } })} /></label><label className="text-xs">边框粗细<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={profile.style?.weight ?? 2} onChange={(event) => onChange({ ...profile, style: { ...profile.style, weight: Number(event.target.value) } })} /></label></div></section><section className="rounded border border-slate-200 p-2"><h5 className="text-sm font-medium">多部件与交互触发</h5><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-sm"><input type="checkbox" checked={profile.allowMultipleParts} onChange={(event) => onChange({ ...profile, allowMultipleParts: event.target.checked, label: { ...profile.label, anchor: event.target.checked ? profile.label.anchor : 'featureBbox' } })} /> 允许多部件</label><label className="text-xs">Label 锚点<select className="mt-1 w-full rounded border px-2 py-1" disabled={!profile.allowMultipleParts} value={profile.label.anchor} onChange={(event) => onChange({ ...profile, label: { ...profile.label, anchor: event.target.value as GeometryProfile['label']['anchor'] } })}><option value="perPart">各部件位置</option><option value="featureBbox">完整 bbox</option></select></label></div><div className="mt-2 flex flex-wrap gap-3 text-xs">{triggerKeys.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(profile.interaction.triggers[key as keyof GeometryInteractionTriggers])} onChange={(event) => setTrigger(key as keyof GeometryInteractionTriggers, event.target.checked)} /> {label}</label>)}</div></section><section className="rounded border border-emerald-100 bg-emerald-50/40 p-2"><h5 className="text-sm font-medium text-emerald-950">三区块 B：Label 碰撞策略</h5><div className="mt-2 grid gap-2 sm:grid-cols-4"><label className="text-xs">角色<select className="mt-1 w-full rounded border px-2 py-1" value={profile.label.collision.role} onChange={(event) => onChange({ ...profile, label: { ...profile.label, collision: { ...profile.label.collision, role: event.target.value as GeometryProfile['label']['collision']['role'] } } })}>{['ignore', 'soft', 'optional', 'important', 'required'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs">基础优先级<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={profile.label.collision.basePriority} onChange={(event) => onChange({ ...profile, label: { ...profile.label, collision: { ...profile.label.collision, basePriority: Number(event.target.value) } } })} /></label><label className="text-xs">碰撞组<input className="mt-1 w-full rounded border px-2 py-1" value={profile.label.collision.collisionGroup ?? ''} onChange={(event) => onChange({ ...profile, label: { ...profile.label, collision: { ...profile.label.collision, collisionGroup: event.target.value || undefined } } })} /></label><label className="text-sm pt-5"><input type="checkbox" checked={profile.label.collision.hideWhenColliding} onChange={(event) => onChange({ ...profile, label: { ...profile.label, collision: { ...profile.label.collision, hideWhenColliding: event.target.checked } } })} /> 冲突时隐藏</label></div></section><ZoomPriorityEditor profile={profile} onChange={onChange} /></div> : null}</article>;
}

function ContainmentEditor({ node, fields, onChange }: { node: CategoryNode; fields: string[]; onChange: (node: CategoryNode) => void }) {
  const binding = node.containment ?? { enabled: false };
  return <section className="rounded border bg-violet-50/40 p-3"><h3 className="font-semibold">包含关系绑定</h3><p className="mt-1 text-xs text-slate-600">独立于点击触发；用于建筑/附属结构的正常加载与楼层视图关系。</p><label className="mt-2 block text-sm"><input type="checkbox" checked={binding.enabled} onChange={(event) => onChange({ ...node, containment: event.target.checked ? { enabled: true, role: binding.role ?? 'parent' } : { enabled: false } })} /> 启用包含关系绑定</label>{binding.enabled ? <div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-xs">关系角色<select className="mt-1 w-full rounded border px-2 py-1" value={binding.role ?? ''} onChange={(event) => onChange({ ...node, containment: { ...binding, role: event.target.value as 'parent' | 'child', ...(event.target.value === 'parent' ? { parentReferenceField: undefined } : {}) } })}><option value="parent">主结构（建筑）</option><option value="child">附属结构（楼层）</option></select></label>{binding.role === 'child' ? <label className="text-xs">主结构引用字段<select className="mt-1 w-full rounded border px-2 py-1" value={binding.parentReferenceField ?? ''} onChange={(event) => onChange({ ...node, containment: { ...binding, parentReferenceField: event.target.value || undefined } })}><option value="">选择字段</option>{fields.map((field) => <option key={field}>{field}</option>)}</select></label> : <span />}</div> : null}</section>;
}

function RegistryOptions({ schema, value, onChange }: { schema: ConfigPackageV3['registries']['cardLayouts'][number]['optionSchema']; value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  if (!schema?.length) return <p className="mt-2 text-xs text-slate-500">该受控注册项没有额外公开配置；运行时细节由注册表维护。</p>;
  return <div className="mt-2 grid gap-2 sm:grid-cols-2">{schema.map((option) => <label key={option.key} className="text-xs">{option.label.zh}{option.type === 'boolean' ? <input className="ml-2" type="checkbox" checked={Boolean(value[option.key])} onChange={(event) => onChange({ ...value, [option.key]: event.target.checked })} /> : option.type === 'select' ? <select className="mt-1 w-full rounded border px-2 py-1" value={String(value[option.key] ?? '')} onChange={(event) => onChange({ ...value, [option.key]: event.target.value })}>{option.options?.map((item) => <option key={item}>{item}</option>)}</select> : <input className="mt-1 w-full rounded border px-2 py-1" type={option.type === 'number' ? 'number' : 'text'} value={String(value[option.key] ?? '')} onChange={(event) => onChange({ ...value, [option.key]: option.type === 'number' ? Number(event.target.value) : event.target.value })} />}</label>)}</div>;
}

function CardEditor({ config, node, fields, onChange }: { config: ConfigPackageV3; node: CategoryNode; fields: string[]; onChange: (node: CategoryNode) => void }) {
  const card = node.card;
  const setCard = (next: CardConfiguration) => onChange({ ...node, card: next });
  const updateItem = (id: string, patch: Partial<CardItem>) => card.mode === 'fields' && setCard({ ...card, items: card.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const sources = [...fields, 'tags.custom', 'extensions.custom'];
  const switchMode = (mode: CardConfiguration['mode']) => {
    if (mode === 'fields') setCard({ mode, items: card.mode === 'fields' ? card.items : [] });
    if (mode === 'layout') setCard({ mode, layoutId: config.registries.cardLayouts[0]?.id ?? '' });
    if (mode === 'component') setCard({ mode, componentKey: config.registries.cardComponents.find((item) => !item.allowedClasses?.length || item.allowedClasses.includes(node.path.class))?.id ?? '' });
  };
  return <section><h3 className="mb-2 font-semibold">信息卡设置</h3><div className="mb-3 flex flex-wrap gap-3 rounded border bg-slate-50 p-2 text-sm"><strong>卡片模式</strong>{(['fields', 'layout', 'component'] as CardConfiguration['mode'][]).map((mode) => <label key={mode}><input type="radio" checked={card.mode === mode} onChange={() => switchMode(mode)} /> {mode === 'fields' ? '字段布局' : mode === 'layout' ? '受控布局' : '专用组件'}</label>)}</div>{card.mode === 'layout' ? <div className="rounded border p-3"><label className="text-sm">声明式布局<select className="mt-1 w-full rounded border px-2 py-1" value={card.layoutId} onChange={(event) => setCard({ ...card, layoutId: event.target.value, options: {} })}>{config.registries.cardLayouts.filter((item) => !item.allowedClasses?.length || item.allowedClasses.includes(node.path.class)).map((item) => <option key={item.id} value={item.id}>{item.label.zh}</option>)}</select></label><RegistryOptions schema={config.registries.cardLayouts.find((item) => item.id === card.layoutId)?.optionSchema} value={card.options ?? {}} onChange={(options) => setCard({ ...card, options })} /></div> : null}{card.mode === 'component' ? <div className="rounded border p-3"><label className="text-sm">代码型专用卡片组件<select className="mt-1 w-full rounded border px-2 py-1" value={card.componentKey} onChange={(event) => setCard({ ...card, componentKey: event.target.value, options: {} })}><option value="">选择组件</option>{config.registries.cardComponents.filter((item) => !item.allowedClasses?.length || item.allowedClasses.includes(node.path.class)).map((item) => <option key={item.id} value={item.id}>{item.label.zh}</option>)}</select></label><RegistryOptions schema={config.registries.cardComponents.find((item) => item.id === card.componentKey)?.optionSchema} value={card.options ?? {}} onChange={(options) => setCard({ ...card, options })} /></div> : null}{card.mode === 'fields' ? <div className="space-y-2">{card.items.map((item) => <article key={item.id} className="rounded border p-3"><div className="grid gap-2 md:grid-cols-4"><label className="text-xs">来源<select className="mt-1 w-full rounded border px-2 py-1" value={item.source} onChange={(event) => updateItem(item.id, { source: event.target.value })}>{sources.map((source) => <option key={source}>{source}</option>)}</select></label><label className="text-xs">显示器<select className="mt-1 w-full rounded border px-2 py-1" value={item.renderer} onChange={(event) => updateItem(item.id, { renderer: event.target.value as CardItem['renderer'], ...(event.target.value === 'relationLink' ? { relation: item.relation ?? { targetClassification: { class: config.nodes[0]?.path.class ?? '' } } } : {}) })}>{['text', 'tag', 'colorCapsule', 'nameColorCapsule', 'relationLink', 'media'].map((renderer) => <option key={renderer}>{renderer}</option>)}</select></label><label className="text-xs">中文标签<input className="mt-1 w-full rounded border px-2 py-1" value={item.label?.zh ?? item.source} onChange={(event) => updateItem(item.id, { label: { zh: event.target.value, en: item.label?.en ?? event.target.value } })} /></label><label className="pt-5 text-sm"><input type="checkbox" checked={item.visible} onChange={(event) => updateItem(item.id, { visible: event.target.checked })} /> 显示</label></div>{item.renderer === 'colorCapsule' || item.renderer === 'nameColorCapsule' ? <div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-xs">颜色字段<select className="mt-1 w-full rounded border px-2 py-1" value={item.options?.colorSource ?? ''} onChange={(event) => updateItem(item.id, { options: { ...item.options, colorSource: event.target.value } })}><option value="">选择颜色字段</option>{fields.map((field) => <option key={field}>{field}</option>)}</select></label>{item.renderer === 'nameColorCapsule' ? <label className="text-xs">名称字段<select className="mt-1 w-full rounded border px-2 py-1" value={item.options?.nameSource ?? ''} onChange={(event) => updateItem(item.id, { options: { ...item.options, nameSource: event.target.value } })}><option value="">选择名称字段</option>{fields.map((field) => <option key={field}>{field}</option>)}</select></label> : null}</div> : null}{item.renderer === 'relationLink' ? <RelationLinkEditor config={config} item={item} onChange={(relation) => updateItem(item.id, { relation })} /> : null}{item.renderer === 'media' ? <label className="mt-2 block text-xs">媒体来源<select className="mt-1 w-full rounded border px-2 py-1" value={item.options?.mediaSource ?? 'picture-index'} onChange={(event) => updateItem(item.id, { options: { ...item.options, mediaSource: event.target.value as 'picture-index' | 'external-url' } })}><option value="picture-index">图片索引</option><option value="external-url">外部链接</option></select></label> : null}<button type="button" className="mt-2 inline-flex items-center gap-1 text-xs text-rose-700" onClick={() => setCard({ ...card, items: card.items.filter((entry) => entry.id !== item.id) })}><Trash2 className="h-3 w-3" />删除项目</button></article>)}<button type="button" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm" onClick={() => setCard({ ...card, items: [...card.items, { id: `card-${Date.now()}`, source: fields[0] ?? 'tags.custom', visible: true, renderer: 'text', label: { zh: '新字段', en: 'New field' } }] })}><Plus className="h-4 w-4" />添加字段/模块</button></div> : null}</section>;
}

function RelationLinkEditor({ config, item, onChange }: { config: ConfigPackageV3; item: CardItem; onChange: (relation: NonNullable<CardItem['relation']>) => void }) {
  const relation = item.relation ?? { targetClassification: { class: config.nodes[0]?.path.class ?? '' }, clickable: true };
  const target = relation.targetClassification ?? { class: config.nodes[0]?.path.class ?? '' };
  const targetFields = resolveSelectableFields(config, target).map((field) => field.key);
  return <div className="mt-2 rounded border border-blue-100 bg-blue-50/40 p-2"><div className="mb-1 text-xs font-medium text-blue-950">关系跳转：Class / Kind / Skind / Skind2 / 匹配字段 / 展示字段</div><PathSelector config={config} label="目标分类范围" value={target} onChange={(targetClassification) => onChange({ ...relation, targetClassification, targetMatchField: undefined, targetDisplayField: undefined })} /><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-xs">目标匹配字段<select className="mt-1 w-full rounded border px-2 py-1" value={relation.targetMatchField ?? ''} onChange={(event) => onChange({ ...relation, targetMatchField: event.target.value || undefined })}><option value="">重新选择</option>{targetFields.map((field) => <option key={field}>{field}</option>)}</select></label><label className="text-xs">目标展示字段<select className="mt-1 w-full rounded border px-2 py-1" value={relation.targetDisplayField ?? ''} onChange={(event) => onChange({ ...relation, targetDisplayField: event.target.value || undefined })}><option value="">重新选择</option>{targetFields.map((field) => <option key={field}>{field}</option>)}</select></label></div></div>;
}

function FieldEditor({ config, node, onChange }: { config: ConfigPackageV3; node: CategoryNode; onChange: (node: CategoryNode) => void }) {
  const effective = resolveEffectiveFields(config, node.path);
  const local = new Set(node.fields.map((field) => field.fieldId));
  const editable = node.policies.fields !== 'sealed';
  const updateLocal = (fieldId: string, patch: Partial<CategoryNode['fields'][number]>) => onChange({ ...node, fields: node.fields.map((field) => field.fieldId === fieldId ? { ...field, ...patch } : field) });
  return <section><h3 className="mb-2 font-semibold">字段设置</h3><p className="mb-2 text-xs text-slate-500">上级固定字段会显示为继承状态；只有当前节点允许覆写时可以编辑或新增本地字段。</p>{effective.map((field) => <div key={field.fieldId} className="mb-2 grid gap-2 rounded border p-2 md:grid-cols-5"><input className="rounded border px-2 py-1 disabled:bg-slate-100" disabled={!local.has(field.fieldId) || !editable} value={field.key} onChange={(event) => updateLocal(field.fieldId, { key: event.target.value })} /><select className="rounded border px-2 py-1 disabled:bg-slate-100" disabled={!local.has(field.fieldId) || !editable} value={field.type} onChange={(event) => updateLocal(field.fieldId, { type: event.target.value as typeof field.type })}>{['string', 'number', 'boolean', 'enum', 'json', 'reference'].map((type) => <option key={type}>{type}</option>)}</select><input className="rounded border px-2 py-1 disabled:bg-slate-100" disabled={!local.has(field.fieldId) || !editable} value={field.labels.zh} onChange={(event) => updateLocal(field.fieldId, { labels: { ...field.labels, zh: event.target.value } })} /><label className="text-sm"><input type="checkbox" disabled={!local.has(field.fieldId) || !editable} checked={Boolean(field.required)} onChange={(event) => updateLocal(field.fieldId, { required: event.target.checked })} /> 必填</label><span className="text-xs text-slate-500">{local.has(field.fieldId) ? '本地定义' : '继承/固定'}</span></div>)}{editable ? <button type="button" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm" onClick={() => onChange({ ...node, fields: [...node.fields, { fieldId: `field-${Date.now()}`, key: 'NewField', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '新字段', en: 'New field' }, description: { zh: '', en: '' } }] })}><Plus className="h-4 w-4" />添加字段</button> : null}</section>;
}

function ensureClassificationControl(config: ConfigPackageV3, workflow: WorkflowDefinition): WorkflowDefinition {
  const required = hasDescendants(config, workflow.target);
  const firstFormIndex = workflow.steps.findIndex((step) => step.kind === 'form');
  if (firstFormIndex < 0) return workflow;
  return {
    ...workflow,
    steps: workflow.steps.map((step, index) => {
      if (index !== firstFormIndex) return step;
      const controls = step.controls ?? [];
      const withoutManaged = controls.filter((control) => !(control.kind === 'classificationPicker' && control.systemManaged));
      return required ? { ...step, controls: [{ id: 'system-classification', kind: 'classificationPicker', columns: 1, label: { zh: '分类', en: 'Classification' }, classificationScope: workflow.target, systemManaged: true }, ...withoutManaged] } : { ...step, controls: withoutManaged };
    }),
  };
}

function makeWorkflow(config: ConfigPackageV3): WorkflowDefinition | null {
  const target = config.nodes.find((node) => !node.path.kind)?.path ?? config.nodes[0]?.path;
  if (!target) return null;
  const id = `workflow-${Date.now()}`;
  return ensureClassificationControl(config, {
    id,
    label: { zh: '标准要素填卡', en: 'Standard feature workflow' },
    target,
    steps: [
      { id: `${id}-actor`, kind: 'actor', label: { zh: '填写人', en: 'Actor' } },
      { id: `${id}-form-1`, kind: 'form', label: { zh: '基本信息 1', en: 'Basic information 1' }, controls: [] },
      { id: `${id}-tail`, kind: 'tagsExtensions', label: { zh: '标签与扩展', en: 'Tags and extensions' }, tagsExtensions: { tagsEnabled: true, extensionsEnabled: true } },
      { id: `${id}-geometry`, kind: 'geometry', label: { zh: '绘制', en: 'Geometry' }, geometry: ['Point'] },
    ],
    assignments: [],
  });
}

function WorkflowEditor({ config, setConfig }: { config: ConfigPackageV3; setConfig: (config: ConfigPackageV3) => void }) {
  const [workflowId, setWorkflowId] = useState(() => config.workflows[0]?.id ?? '');
  const workflow = config.workflows.find((item) => item.id === workflowId) ?? config.workflows[0];
  const updateWorkflow = (updater: (value: WorkflowDefinition) => WorkflowDefinition) => {
    if (!workflow) return;
    setConfig({ ...config, workflows: config.workflows.map((item) => item.id === workflow.id ? ensureClassificationControl(config, updater(item)) : item) });
  };
  const addWorkflow = () => {
    const next = makeWorkflow(config);
    if (!next) return;
    setConfig({ ...config, workflows: [...config.workflows, next] });
    setWorkflowId(next.id);
  };
  if (!workflow) return <button type="button" className="rounded border px-3 py-2" onClick={addWorkflow}>创建标准工作流</button>;
  const updateStep = (id: string, patch: Partial<WorkflowStep>) => updateWorkflow((value) => ({ ...value, steps: value.steps.map((step) => step.id === id ? { ...step, ...patch } : step) }));
  const forms = workflow.steps.filter((step) => step.kind === 'form');
  const addPage = () => updateWorkflow((value) => {
    const tailIndex = value.steps.findIndex((step) => step.kind === 'tagsExtensions');
    const page: WorkflowStep = { id: `form-${Date.now()}`, kind: 'form', label: { zh: `基本信息 ${forms.length + 1}`, en: `Basic information ${forms.length + 1}` }, controls: [] };
    return { ...value, steps: [...value.steps.slice(0, tailIndex), page, ...value.steps.slice(tailIndex)] };
  });
  const removePage = (step: WorkflowStep) => {
    if (forms.length <= 1) return;
    updateWorkflow((value) => ({ ...value, steps: value.steps.filter((item) => item.id !== step.id) }));
  };
  const addControl = (step: WorkflowStep) => updateStep(step.id, { controls: [...(step.controls ?? []), { id: `control-${Date.now()}`, slot: String.fromCharCode(65 + (step.controls?.filter((control) => !control.systemManaged).length ?? 0)), kind: 'text', columns: 1, label: { zh: '新输入项', en: 'New input' } }] });
  const updateControl = (step: WorkflowStep, id: string, patch: Partial<WorkflowControl>) => updateStep(step.id, { controls: (step.controls ?? []).map((control) => control.id === id ? { ...control, ...patch } : control) });
  const assignments = workflow.assignments ?? [];
  const updateAssignment = (id: string, patch: Partial<WorkflowAssignment>) => updateWorkflow((value) => ({ ...value, assignments: (value.assignments ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) }));
  return <div className="space-y-3"><div className="flex flex-wrap gap-2"><select className="rounded border px-2 py-1.5" value={workflow.id} onChange={(event) => setWorkflowId(event.target.value)}>{config.workflows.map((item) => <option key={item.id} value={item.id}>{item.label.zh}</option>)}</select><button type="button" className="rounded border px-3 py-1.5" onClick={addWorkflow}>+ 新工作流</button></div><PathSelector config={config} label="工作流默认输出分类" value={workflow.target} onChange={(target) => updateWorkflow((value) => ({ ...value, target }))} /><p className="rounded bg-blue-50 p-2 text-xs text-blue-900">固定顺序：填写人 → 一个或多个基本信息页 → tags/extensions 尾部区 → 最终绘制页。表单控件仅输出槽位，字段写入只在下方组装区定义。</p>{workflow.steps.map((step) => <article key={step.id} className="rounded border p-3"><div className="flex items-center justify-between gap-2"><div className="font-medium">{step.label.zh} <span className="text-xs text-slate-500">{step.kind}</span></div>{step.kind === 'form' && forms.length > 1 ? <button type="button" className="text-xs text-rose-700" onClick={() => removePage(step)}>删除页</button> : null}</div>{step.kind === 'form' ? <div className="mt-2 space-y-2"><label className="block text-xs">页面标题<input className="mt-1 w-full rounded border px-2 py-1" value={step.label.zh} onChange={(event) => updateStep(step.id, { label: { ...step.label, zh: event.target.value } })} /></label>{(step.controls ?? []).map((control) => <div key={control.id} className="rounded border bg-slate-50 p-2"><div className="grid gap-2 md:grid-cols-[8rem_11rem_minmax(18rem,1fr)_auto]"><input className="rounded border px-2 py-1" disabled={control.systemManaged} value={control.slot ?? ''} placeholder="槽位 A" onChange={(event) => updateControl(step, control.id, { slot: event.target.value.toUpperCase() })} /><select className="rounded border px-2 py-1" disabled={control.systemManaged} value={control.kind} onChange={(event) => updateControl(step, control.id, { kind: event.target.value as WorkflowControl['kind'], ...(event.target.value === 'featureSearch' || event.target.value === 'coarseSearch' ? { search: undefined } : {}) })}>{['text', 'textarea', 'number', 'select', 'classificationPicker', 'featureSearch', 'coarseSearch', 'notice', 'json', 'runtimeValue', 'component'].map((kind) => <option key={kind}>{kind}</option>)}</select><input className="rounded border px-2 py-1" disabled={control.systemManaged} placeholder="新输入项" value={control.label.zh} onChange={(event) => updateControl(step, control.id, { label: { ...control.label, zh: event.target.value } })} /><button type="button" className="text-xs text-rose-700 disabled:text-slate-300" disabled={control.systemManaged} onClick={() => updateStep(step.id, { controls: (step.controls ?? []).filter((item) => item.id !== control.id) })}>删除</button></div>{control.systemManaged ? <p className="mt-2 text-xs text-violet-700">由工作流目标分类自动维护；其输出提供 Class/Kind/Skind/Skind2 系统变量。</p> : null}{control.kind === 'select' ? <label className="mt-2 block text-xs">选项（以逗号分隔）<input className="mt-1 w-full rounded border px-2 py-1" value={(control.options ?? []).join(', ')} onChange={(event) => updateControl(step, control.id, { options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label> : null}{control.kind === 'featureSearch' || control.kind === 'coarseSearch' ? <SearchEditor config={config} control={control} onChange={(value) => updateControl(step, control.id, value)} /> : null}{control.kind === 'component' ? <label className="mt-2 block text-xs">受控工作流组件<select className="mt-1 w-full rounded border px-2 py-1" value={control.componentKey ?? ''} onChange={(event) => updateControl(step, control.id, { componentKey: event.target.value })}><option value="">选择组件块</option>{config.registries.workflowBlocks.map((item) => <option key={item.id}>{item.id}</option>)}</select></label> : null}</div>)}<button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs" onClick={() => addControl(step)}><Plus className="h-3 w-3" />添加控件</button></div> : null}{step.kind === 'tagsExtensions' ? <div className="mt-2 flex gap-4 text-sm"><label><input type="checkbox" checked={step.tagsExtensions?.tagsEnabled !== false} onChange={(event) => updateStep(step.id, { tagsExtensions: { ...(step.tagsExtensions ?? { extensionsEnabled: true }), tagsEnabled: event.target.checked } })} /> 开放 tags</label><label><input type="checkbox" checked={step.tagsExtensions?.extensionsEnabled !== false} onChange={(event) => updateStep(step.id, { tagsExtensions: { ...(step.tagsExtensions ?? { tagsEnabled: true }), extensionsEnabled: event.target.checked } })} /> 开放 extensions</label></div> : null}{step.kind === 'geometry' ? <p className="mt-2 text-xs text-slate-600">最终绘制页固定在尾部，绘制类型：{step.geometry?.map((item) => geometryLabels[item]).join('、') ?? '未设置'}。</p> : null}</article>)}<button type="button" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm" onClick={addPage}><Plus className="h-4 w-4" />添加基本信息页</button><section className="rounded border p-3"><h3 className="font-semibold">字段绑定与多段组装</h3><p className="mt-1 text-xs text-slate-500">只保留“目标字段/路径”和“值表达式”。可引用槽位 A、B、C…，以及系统变量 {systemTokens.join(' / ')}；例如 <code>ID=World+"_"+Class+"_"+A</code>。</p>{assignments.map((item) => <div key={item.id} className="mt-2 grid gap-2 md:grid-cols-2"><input className="rounded border px-2 py-1" placeholder="目标字段、tags.xxx 或 extensions.xxx" value={item.target} onChange={(event) => updateAssignment(item.id, { target: event.target.value })} /><div className="flex gap-2"><input className="min-w-0 flex-1 rounded border px-2 py-1" placeholder="值表达式" value={item.expression} onChange={(event) => updateAssignment(item.id, { expression: event.target.value })} /><button type="button" className="text-xs text-rose-700" onClick={() => updateWorkflow((value) => ({ ...value, assignments: (value.assignments ?? []).filter((entry) => entry.id !== item.id) }))}>删除</button></div></div>)}<button type="button" className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs" onClick={() => updateWorkflow((value) => ({ ...value, assignments: [...(value.assignments ?? []), { id: `assignment-${Date.now()}`, target: 'ID', expression: 'A' }] }))}><Plus className="h-3 w-3" />添加组装行</button></section></div>;
}

function ZoomReporter({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onChange(map.getZoom()) });
  return null;
}

function PreviewTiles() {
  const map = useMap();
  useEffect(() => {
    const layer = createDynmapTileLayer('zth', 'flat', { maxRetries: 1 });
    layer.addTo(map);
    return () => { layer.remove(); };
  }, [map]);
  return null;
}

function previewPriority(profile: GeometryProfile, zoom: number): number | null {
  const rule = resolveZoomRule(profile, zoom);
  if (!rule?.priority) return profile.label.collision.basePriority;
  const metric = rule.priority.metric;
  let contribution = 0;
  if (metric) {
    const base = metric.kind === 'area' ? 4800 : metric.kind === 'length' ? 150 : metric.kind === 'partCount' ? 3 : 1;
    const raw = metric.divisor ? base / metric.divisor : base;
    const rounded = metric.rounding === 'floor' ? Math.floor(raw) : metric.rounding === 'ceil' ? Math.ceil(raw) : metric.rounding === 'round' ? Math.round(raw) : raw;
    contribution = rounded * metric.multiplier;
    if (metric.min !== undefined) contribution = Math.max(metric.min, contribution);
    if (metric.max !== undefined) contribution = Math.min(metric.max, contribution);
  }
  return (rule.priority.mode === 'add' ? profile.label.collision.basePriority : 0) + (rule.priority.base ?? 0) + contribution;
}

function PreviewCard({ node, config, geometry, zoom }: { node: CategoryNode; config: ConfigPackageV3; geometry: GeometryKind; zoom: number }) {
  const profile = resolveGeometryProfile(config, node.path, geometry);
  const card = node.card;
  const name = classificationPathKey(node.path);
  if (!profile) return null;
  return <aside className="absolute bottom-3 left-3 z-[500] max-w-xs rounded-lg border border-slate-300 bg-white/95 p-3 text-xs shadow-lg"><div className="font-semibold">{name}</div><div className="mt-1 text-slate-500">正式规则预览 · {geometryLabels[geometry]} · Label 优先级 {previewPriority(profile, zoom) ?? '—'}</div>{card.mode === 'fields' ? <div className="mt-2 space-y-1">{card.items.filter((item) => item.visible).slice(0, 4).map((item) => <div key={item.id}><span className="text-slate-500">{item.label?.zh ?? item.source}</span>：{item.renderer === 'relationLink' ? `${item.relation?.targetClassification ? classificationPathKey(item.relation.targetClassification) : '未配置'} → ${item.relation?.targetDisplayField ?? '未配置'}` : item.renderer}</div>)}</div> : <div className="mt-2 rounded bg-slate-100 p-2">{card.mode === 'layout' ? `受控布局：${card.layoutId}` : `专用组件：${card.componentKey}`}</div>}</aside>;
}

function PreviewMap({ config, node, zoom, onZoom }: { config: ConfigPackageV3; node: CategoryNode; zoom: number; onZoom: (zoom: number) => void }) {
  const profiles = geometryValues.map((geometry) => ({ geometry, profile: resolveGeometryProfile(config, node.path, geometry) })).filter((item): item is { geometry: GeometryKind; profile: GeometryProfile } => Boolean(item.profile));
  const primary = profiles.find((item) => item.profile.enabled) ?? profiles[0];
  const label = classificationPathKey(node.path);
  const isFloor = node.containment?.enabled && node.containment.role === 'child';
  const visible = (profile: GeometryProfile) => profile.enabled && resolveZoomRule(profile, zoom)?.representation !== 'hidden';
  const opts = (profile: GeometryProfile) => ({ color: profile.color, weight: profile.style?.weight ?? 2, opacity: profile.style?.opacity ?? 0.9, fillOpacity: profile.style?.fillOpacity ?? 0.2, dashArray: profile.style?.dashArray });
  return <div className="relative h-full min-h-[440px] overflow-hidden rounded-xl border border-slate-300"><LeafletMap center={[-4, 0]} zoom={zoom} minZoom={0} maxZoom={8} crs={createDynmapCRS(ZTH_FLAT_CONFIG)} className="h-full w-full" attributionControl zoomControl dragging={false} touchZoom={false} doubleClickZoom={false} boxZoom={false} keyboard={false} scrollWheelZoom>
    <PreviewTiles /><ZoomReporter onChange={onZoom} />
    {isFloor ? <Polygon positions={[[-7.5, -8.6], [-1.8, -7.2], [-1.2, 7.7], [-7.9, 7.2]]} pathOptions={{ color: '#111827', weight: 2, fillOpacity: 0.13 }}><Tooltip permanent direction="top">默认 BUD 主结构</Tooltip></Polygon> : null}
    {profiles.map(({ geometry, profile }) => visible(profile) ? <PreviewGeometry key={geometry} geometry={geometry} profile={profile} label={label} options={opts(profile)} representation={resolveZoomRule(profile, zoom)?.representation ?? 'geometry'} /> : null)}
  </LeafletMap>{isFloor ? <div className="absolute right-3 top-3 z-[500] rounded-lg border bg-white/95 p-2 text-xs shadow"><div className="font-medium">楼层切换</div><div className="mt-1 flex gap-1"><button type="button" className="rounded bg-slate-800 px-2 py-1 text-white">主结构</button><button type="button" className="rounded border px-2 py-1">楼层 1</button></div></div> : null}{primary ? <PreviewCard config={config} node={node} geometry={primary.geometry} zoom={zoom} /> : null}</div>;
}

function PreviewGeometry({ geometry, profile, label, options, representation }: { geometry: GeometryKind; profile: GeometryProfile; label: string; options: { color: string; weight: number; opacity: number; fillOpacity: number; dashArray?: string }; representation: ZoomPriorityRule['representation'] }) {
  const tooltip = profile.label.visible ? <Tooltip permanent direction="top">{label}</Tooltip> : null;
  if (representation === 'point' || geometry === 'Point') return <CircleMarker center={[-4.4, 0]} radius={9} pathOptions={{ color: options.color, fillColor: options.color, fillOpacity: 0.88, weight: options.weight }}>{tooltip}</CircleMarker>;
  if (geometry === 'LineString') return <Polyline positions={[[-8, -9], [-5.5, -3], [-4, 1], [-2.2, 8]]} pathOptions={options}>{tooltip}</Polyline>;
  return <Polygon positions={[[-5.3, -8], [-3.2, -1], [-4.1, 7], [-8.2, 5], [-8.8, -4]]} pathOptions={options}>{tooltip}</Polygon>;
}

function Report({ config, records }: { config: ConfigPackageV3; records: MountedFeatureRecord[] }) {
  const report = useMemo(() => validateConfigPackage(config, records), [config, records]);
  const [open, setOpen] = useState<string | null>(null);
  return <section className="border-t bg-white p-3"><div className="flex items-center justify-between gap-2 text-sm"><strong className={report.valid ? 'text-emerald-700' : 'text-rose-700'}>{report.valid ? '校验通过' : `发现 ${report.issues.length} 个问题组`}</strong><span className="text-right text-xs text-slate-500">配置 {report.summary?.configuration ?? 0} · 顺承 {report.summary?.parity ?? 0} · 挂载数据 {report.summary?.mountedData ?? 0} 组 / {report.summary?.affectedFeatures ?? 0} 要素</span></div><div className="mt-2 max-h-40 overflow-auto text-xs">{report.issues.map((item, index) => { const key = `${item.code}-${item.path}-${index}`; return <div key={key} className={`mb-1 rounded border p-2 ${item.severity === 'error' ? 'border-rose-100 bg-rose-50 text-rose-800' : 'border-amber-100 bg-amber-50 text-amber-800'}`}><button type="button" className="w-full text-left" onClick={() => setOpen(open === key ? null : key)}><b>{item.code}</b> · {item.field ?? item.path} · {item.count ?? 1} 项：{item.message}</button>{open === key && item.affectedFeatures?.length ? <ol className="mt-2 max-h-32 list-decimal overflow-auto pl-5 text-slate-700">{item.affectedFeatures.map((feature) => <li key={feature.id}><code>{feature.id}</code> · {feature.name}</li>)}</ol> : null}</div>; })}</div></section>;
}

export function ConfigStudio({ onClose, mountedRecords }: { onClose: () => void; mountedRecords?: MountedFeatureRecord[] }) {
  const [config, setConfig] = useState<ConfigPackageV3>(() => createConfigPackageFromCurrentProject());
  const [records] = useState<MountedFeatureRecord[]>(() => mountedRecords ?? readSessionRecords());
  const [selectedNodeId, setSelectedNodeId] = useState(() => config.nodes[0]?.nodeId ?? '');
  const [mode, setMode] = useState<StudioMode>('feature');
  const [zoom, setZoom] = useState(2);
  const [message, setMessage] = useState('已载入 V1 完整顺承基准；编辑仅保存在本地会话。');
  const uploadRef = useRef<HTMLInputElement>(null);
  const selected = config.nodes.find((node) => node.nodeId === selectedNodeId) ?? config.nodes[0];
  const fields = useMemo(() => selected ? resolveEffectiveFields(config, selected.path) : [], [config, selected]);
  const report = useMemo(() => validateConfigPackage(config, records), [config, records]);
  if (!selected) return null;
  const updateSelected = (updater: (node: CategoryNode) => CategoryNode) => setConfig((current) => updateNode(current, selected.nodeId, updater));
  const importPackage = async (file?: File) => {
    if (!file) return;
    try {
      const next = await readConfigPackage(file);
      setConfig(next);
      setSelectedNodeId(next.nodes[0]?.nodeId ?? '');
      setMessage(`已加载 ${next.packageId}（V3）。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '读取配置包失败。');
    }
  };
  const exportPackage = async () => {
    if (!report.valid) {
      setMessage(`校验阻断：${report.issues.filter((item) => item.severity === 'error').length} 个问题组。`);
      return;
    }
    const blob = await buildConfigPackageArchive(config, report);
    downloadConfigPackage(blob, config);
    setMessage(`已下载 ${config.packageId}；线上更新仍需 Pipeline 授权导入。`);
  };
  return <main className="fixed inset-0 z-[3000] flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-800"><header className="flex shrink-0 items-center gap-3 border-b bg-white px-5 py-3"><SlidersHorizontal className="h-5 w-5 text-blue-600" /><div className="min-w-0 flex-1"><h1 className="font-bold">配置文件工作台</h1><p className="text-xs text-slate-500">{config.packageId} · V3 配置契约 · V1 顺承 {config.parity?.entries.filter((item) => item.status !== 'unsupported').length ?? 0}/{config.parity?.entries.length ?? 0} · 内部版本由导出流程记录</p></div><button type="button" onClick={() => uploadRef.current?.click()} className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm"><FileUp className="h-4 w-4" />导入</button><button type="button" onClick={exportPackage} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-sm text-white"><Download className="h-4 w-4" />校验并下载</button><button type="button" onClick={onClose} className="rounded p-2 hover:bg-slate-100" aria-label="关闭工作台"><X className="h-5 w-5" /></button><input ref={uploadRef} className="hidden" type="file" accept=".zip,.json,application/json,application/zip" onChange={(event) => void importPackage(event.target.files?.[0])} /></header><div className="min-h-0 flex-1 grid grid-cols-1 gap-3 p-3 xl:grid-cols-2"><section className="min-h-[44vh] rounded-xl border bg-white p-3 xl:min-h-0"><div className="mb-2 flex justify-between text-sm"><strong>显示规则验证器</strong><span>Zoom {zoom} · 背景瓦片 / 固定中心 / 仅可缩放</span></div><PreviewMap config={config} node={selected} zoom={zoom} onZoom={setZoom} /><p className="mt-2 text-xs text-slate-500">预览没有临时挂载或编辑高亮态；它使用当前分类的已解析配置、正式坐标系和背景瓦片。附属结构会自动生成默认主结构与楼层切换状态。</p></section><section className="min-h-0 overflow-y-auto rounded-xl border bg-white p-4"><div className="mb-3 flex flex-wrap gap-2"><button type="button" onClick={() => setMode('feature')} className={`rounded px-3 py-1.5 text-sm ${mode === 'feature' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>要素设计</button><button type="button" onClick={() => setMode('workflow')} className={`rounded px-3 py-1.5 text-sm ${mode === 'workflow' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>工作流设计</button></div><div className="mb-3 rounded border bg-slate-50 p-2 text-xs text-slate-600">{message}</div>{mode === 'workflow' ? <WorkflowEditor config={config} setConfig={setConfig} /> : <div className="space-y-5"><CategoryPathPicker config={config} selected={selected} onSelect={setSelectedNodeId} /><FieldEditor config={config} node={selected} onChange={(node) => setConfig((current) => updateNode(current, node.nodeId, () => node))} /><section><h3 className="mb-2 font-semibold">显示、交互与层级</h3><div className="grid gap-3 2xl:grid-cols-3">{geometryValues.map((geometry) => { const profile = selected.geometryProfiles[geometry] ?? defaultProfile(geometry); return <GeometryEditor key={geometry} geometry={geometry} profile={profile} onChange={(value) => updateSelected((node) => ({ ...node, geometryProfiles: { ...node.geometryProfiles, [geometry]: value } }))} />; })}</div></section><ContainmentEditor node={selected} fields={fields.map((field) => field.key)} onChange={(node) => setConfig((current) => updateNode(current, node.nodeId, () => node))} /><CardEditor config={config} node={selected} fields={fields.map((field) => field.key)} onChange={(node) => setConfig((current) => updateNode(current, node.nodeId, () => node))} /></div>}</section></div><Report config={config} records={records} /></main>;
}

export default ConfigStudio;
