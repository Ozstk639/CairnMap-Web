import { ValueOptionsEditor } from './ValueOptionsEditor';
import { Plus } from 'lucide-react';
import { useId } from 'react';
import type { CardConfiguration, CardItem, CategoryNode, ClassificationPath, ConfigPackageV3 } from './types';
import { resolveCardConfiguration, resolveSelectableFields } from './runtime';
import { FieldPrefill } from './FieldPrefillDialog';
import { prefillCardItem } from './fieldPrefillModel';

const renderers: Array<[CardItem['renderer'], string]> = [
  ['text', '普通文字'],
  ['tag', '标签'],
  ['colorCapsule', '颜色胶囊'],
  ['nameColorCapsule', '名称 + 颜色胶囊'],
  ['relationLink', '目标要素跳转'],
  ['lineChips', '关联线路胶囊'],
  ['media', '图片 / 外链'],
];
const formats: Array<[NonNullable<CardItem['options']>['format'], string]> = [
  ['plain', '原样文本'], ['externalLink', '外部链接'], ['boolean', '是 / 否'], ['json', 'JSON'], ['classification', '分类显示名称'], ['enum', '枚举显示文本'], ['date', '日期'], ['world', '世界'],
];
const lineChipSources: Array<[NonNullable<CardItem['options']>['lineChipSource'], string]> = [
  ['platform', '当前平台'], ['station', '当前车站'], ['stationBuilding', '当前车站建筑'],
];
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const systemPaths = ['ID', 'Name', 'World', 'Type', 'Class', 'Kind', 'SKind', 'SKind2', 'CreateBy', 'CreateTime', 'ModifityTime', 'ModifityBy'];

function PathInput({ value, options, onChange, placeholder = '字段 / tags.xxx / extensions.xxx' }: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const listId = `v3-card-path-${useId().replace(/:/g, '')}`;
  return <><input className="mt-1 w-full rounded border px-2 py-1" list={listId} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /><datalist id={listId}>{options.map((entry) => <option key={entry} value={entry} />)}</datalist></>;
}

function relationEditor({ config, item, onChange }: { config: ConfigPackageV3; item: CardItem; onChange: (item: CardItem) => void }) {
  const target = item.relation?.targetClassification ?? { class: '' };
  const classes = unique(config.nodes.map((node) => node.path.class));
  const kinds = unique(config.nodes.filter((node) => node.path.class === target.class).map((node) => node.path.kind ?? ''));
  const skinds = unique(config.nodes.filter((node) => node.path.class === target.class && (!target.kind || node.path.kind === target.kind)).map((node) => node.path.skind ?? ''));
  const skind2s = unique(config.nodes.filter((node) => node.path.class === target.class && (!target.kind || node.path.kind === target.kind) && (!target.skind || node.path.skind === target.skind)).map((node) => node.path.skind2 ?? ''));
  const targetFields = target.class ? unique([...systemPaths, ...resolveSelectableFields(config, target).map((field) => field.key)]) : [];
  const updatePath = (patch: Partial<ClassificationPath>) => onChange({
    ...item,
    relation: { ...item.relation, targetClassification: { ...target, ...patch }, targetMatchField: '', targetDisplayField: '' },
  });
  return <div className="mt-2 rounded border border-violet-200 bg-violet-50 p-2">
    <p className="text-xs text-violet-800">目标范围变更时，目标匹配字段与目标展示字段会自动清空，避免误绑定。</p>
    <div className="mt-2 grid gap-2 md:grid-cols-3">
      <label className="text-xs">Class<select className="mt-1 w-full rounded border px-2 py-1" value={target.class} onChange={(event) => updatePath({ class: event.target.value, kind: undefined, skind: undefined, skind2: undefined })}><option value="">选择 Class</option>{classes.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs">Kind<select className="mt-1 w-full rounded border px-2 py-1" value={target.kind ?? ''} disabled={!target.class} onChange={(event) => updatePath({ kind: event.target.value || undefined, skind: undefined, skind2: undefined })}><option value="">所有 Kind</option>{kinds.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs">Skind<select className="mt-1 w-full rounded border px-2 py-1" value={target.skind ?? ''} disabled={!target.class} onChange={(event) => updatePath({ skind: event.target.value || undefined, skind2: undefined })}><option value="">所有 Skind</option>{skinds.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs">Skind2<select className="mt-1 w-full rounded border px-2 py-1" value={target.skind2 ?? ''} disabled={!target.class} onChange={(event) => updatePath({ skind2: event.target.value || undefined })}><option value="">所有 Skind2</option>{skind2s.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs">目标匹配字段<select className="mt-1 w-full rounded border px-2 py-1" value={item.relation?.targetMatchField ?? ''} disabled={!target.class} onChange={(event) => onChange({ ...item, relation: { ...item.relation, targetClassification: target, targetMatchField: event.target.value } })}><option value="">选择字段</option>{targetFields.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs">目标展示字段<select className="mt-1 w-full rounded border px-2 py-1" value={item.relation?.targetDisplayField ?? ''} disabled={!target.class} onChange={(event) => onChange({ ...item, relation: { ...item.relation, targetClassification: target, targetDisplayField: event.target.value } })}><option value="">选择字段</option>{targetFields.map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="mt-2 flex flex-wrap gap-3 text-xs">
      <label><input type="checkbox" checked={item.relation?.clickable !== false} onChange={(event) => onChange({ ...item, relation: { ...item.relation, targetClassification: target, clickable: event.target.checked } })} /> 可点击跳转</label>
      <label><input type="checkbox" checked={Boolean(item.relation?.multiple)} onChange={(event) => onChange({ ...item, relation: { ...item.relation, targetClassification: target, multiple: event.target.checked } })} /> 多目标列表</label>
      <label className="min-w-56">对象内 ID 路径（可选）<input className="ml-1 rounded border px-2 py-1" value={item.relation?.sourceValuePath ?? ''} placeholder="例如 id" onChange={(event) => onChange({ ...item, relation: { ...item.relation, targetClassification: target, sourceValuePath: event.target.value || undefined } })} /></label>
    </div>
  </div>;
}

export function V3CardEditor({ config, node, onChange }: { config: ConfigPackageV3; node: CategoryNode; onChange: (node: CategoryNode) => void }) {
  const effective = resolveCardConfiguration(config, node.path);
  const card: CardConfiguration = node.card ?? effective ?? { mode: 'fields', items: [] };
  const items = card.mode === 'fields' ? card.items : [];
  const fields = unique([...systemPaths, ...resolveSelectableFields(config, node.path).map((field) => field.key)]);
  const setItems = (next: CardItem[]) => onChange({ ...node, card: { ...(card.mode === 'fields' ? card : {}), mode: 'fields', items: next } });
  const update = (id: string, patch: Partial<CardItem>) => setItems(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const add = () => setItems([...items, {
    id: `card-${Date.now()}-${items.length}`,
    source: fields.includes('Name') ? 'Name' : fields[0] ?? 'Name',
    visible: true,
    hideWhenEmpty: true,
    section: 'main',
    renderer: 'text',
    ...(config.contractRevision<9?{labelMode:'field' as const,valueMode:'field' as const}:{label:{zh:'',en:''}}),
  }]);
  if (card.mode === 'component') return <section className="rounded border border-violet-200 bg-violet-50 p-3"><h3 className="font-semibold">信息卡设置</h3><p className="mt-1 text-sm">当前分类使用保留的专用卡：{card.componentKey}。专用卡仅用于明确批准的复杂布局；普通分类会在此使用 V3 声明式卡片。</p></section>;
  return <section className="rounded border p-3">
    <div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold">信息卡设置</h3><p className="text-xs text-slate-500">字段由 V3CardRenderer 按此列表真实执行。支持 V1 主信息/其他信息分区、tags.xxx / extensions.xxx 路径、关系跳转、颜色胶囊与铁路关联线路胶囊。</p></div><button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm" onClick={add}><Plus className="h-4 w-4" />添加卡片项</button></div>
    {card.mode === 'fields' ? <fieldset className="mt-3 rounded border p-2 text-xs"><legend>未列出字段策略</legend><div className="flex flex-wrap gap-3"><label><input type="checkbox" checked={card.remaining?.enabled ?? false} onChange={event => onChange({ ...node, card: { ...card, remaining: { section: 'other', includeSystem: true, ...card.remaining, enabled: event.target.checked } } })} />显示剩余字段</label><label><input type="checkbox" checked={card.remaining?.includeSystem !== false} onChange={event => onChange({ ...node, card: { ...card, remaining: { enabled: true, section: 'other', ...card.remaining, includeSystem: event.target.checked } } })} />显示系统元数据</label><label><input type="checkbox" checked={card.remaining?.hideWhenEmpty ?? false} onChange={event => onChange({ ...node, card: { ...card, remaining: { enabled: true, section: 'other', includeSystem: true, ...card.remaining, hideWhenEmpty: event.target.checked } } })} />隐藏空值</label></div><div className="mt-2 grid gap-2 md:grid-cols-3"><label>排除路径（逗号分隔）<input className="mt-1 w-full rounded border px-2" value={card.remaining?.exclude?.join(',') ?? ''} onChange={event => onChange({ ...node, card: { ...card, remaining: { enabled: true, section: 'other', includeSystem: true, ...card.remaining, exclude: event.target.value.split(',').map(value => value.trim()).filter(Boolean) } } })} /></label><label>排序<select className="mt-1 w-full rounded border" value={card.remaining?.order ?? 'record'} onChange={event => onChange({ ...node, card: { ...card, remaining: { enabled: true, section: 'other', includeSystem: true, ...card.remaining, order: event.target.value as 'record' | 'alphabetical' } } })}><option value="record">原记录顺序</option><option value="alphabetical">按路径排序</option></select></label><label>区域<select className="mt-1 w-full rounded border" value={card.remaining?.section ?? 'other'} onChange={event => onChange({ ...node, card: { ...card, remaining: { enabled: true, includeSystem: true, ...card.remaining, section: event.target.value as 'main' | 'other' } } })}><option value="other">其他信息</option><option value="main">主要信息</option></select></label>{(['maxDepth','maxArrayLength'] as const).map(key => <label key={key}>{key === 'maxDepth' ? '对象最大深度' : '数组直接显示上限'}<input className="mt-1 w-full rounded border" type="number" min="1" value={card.remaining?.[key] ?? (key === 'maxDepth' ? 3 : 50)} onChange={event => onChange({ ...node, card: { ...card, remaining: { enabled: true, includeSystem: true, section: 'other', ...card.remaining, [key]: Number(event.target.value) } } })} /></label>)}</div></fieldset> : null}
    <div className="mt-2 space-y-2">{items.map((item) => <article key={item.id} className="rounded border bg-slate-50 p-2">
      {config.contractRevision>=9?<FieldPrefill config={config} initialPath={node.path} scene="infocard" onApply={field=>update(item.id,prefillCardItem(item,field))}/>:null}<div className="grid gap-2 md:grid-cols-6">
        <label className="text-xs md:col-span-2">显示字段<PathInput value={item.source} options={fields} onChange={(value) => update(item.id, { source: value })} /></label>
        <label className="text-xs">显示名称<input disabled={item.labelMode==='field'} className="mt-1 w-full rounded border px-2 py-1" value={item.labelMode==='field' ? resolveSelectableFields(config,node.path).find(field=>field.key===item.source)?.labels.zh ?? item.source : item.label?.zh ?? ''} onChange={(event) => update(item.id, { label: { zh: event.target.value, en: item.label?.en ?? '' } })} /></label>
        <label className="text-xs">显示器<select className="mt-1 w-full rounded border px-2 py-1" value={item.renderer} onChange={(event) => update(item.id, { renderer: event.target.value as CardItem['renderer'], relation: event.target.value === 'relationLink' ? item.relation ?? { targetClassification: { class: '' }, targetMatchField: '', targetDisplayField: '', clickable: true } : item.relation })}>{renderers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs">区域<select className="mt-1 w-full rounded border px-2 py-1" value={item.section ?? 'main'} onChange={(event) => update(item.id, { section: event.target.value as 'main' | 'other' })}><option value="main">主要信息</option><option value="other">其他信息</option></select></label>
        <button type="button" className="mt-5 text-xs text-rose-700" onClick={() => setItems(items.filter((entry) => entry.id !== item.id))}>删除</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">{config.contractRevision<9?<>{/* Legacy follow controls remain only for old packages. */}<label><input type="checkbox" checked={item.labelMode!=='field'} onChange={event=>update(item.id,{labelMode:event.target.checked?'override':'field'})}/>覆写显示名称</label><label><input type="checkbox" checked={item.valueMode==='override'} onChange={event=>update(item.id,{valueMode:event.target.checked?'override':'field',valueOptions:event.target.checked?structuredClone(resolveSelectableFields(config,node.path).find(field=>field.key===item.source)?.options??[]):undefined})}/>覆写值对照</label></>:null}<label>名称（en）<input className="rounded border px-2" disabled={item.labelMode==='field'} value={item.labelMode==='field'?resolveSelectableFields(config,node.path).find(field=>field.key===item.source)?.labels.en??'':item.label?.en??''} onChange={event => update(item.id, { label: { zh: item.label?.zh ?? '', en: event.target.value } })} /></label><label>回退来源<input className="rounded border px-2" value={item.fallbackSources?.join(',') ?? ''} onChange={event => update(item.id, { fallbackSources: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></label><label><input type="checkbox" checked={item.afterRemaining ?? false} onChange={event => update(item.id, { afterRemaining: event.target.checked })} />放在剩余字段之后</label><label><input type="checkbox" checked={item.visible} onChange={(event) => update(item.id, { visible: event.target.checked })} /> 显示</label><label><input type="checkbox" checked={item.hideWhenEmpty !== false} onChange={(event) => update(item.id, { hideWhenEmpty: event.target.checked })} /> 空值隐藏</label>{item.renderer === 'text' ? <label>文本格式<select className="ml-1 rounded border px-2 py-1" value={item.options?.format ?? ''} onChange={(event) => update(item.id, { options: { ...item.options, format: event.target.value?event.target.value as NonNullable<CardItem['options']>['format']:undefined } })}><option value="">{config.contractRevision>=9?'原样文本':'跟随字段格式'}</option>{formats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}</div>
      {item.options?.format === 'externalLink' ? <label className="mt-2 block text-xs">链接显示文字<select className="ml-2 rounded border" value={item.options.linkText ?? 'href'} onChange={event => update(item.id, { options: { ...item.options, linkText: event.target.value as 'raw' | 'href' } })}><option value="href">完整地址</option><option value="raw">输入文本</option></select></label> : null}
      {item.renderer === 'colorCapsule' || item.renderer === 'nameColorCapsule' ? <div className="mt-2 grid gap-2 md:grid-cols-3"><label className="text-xs">颜色字段<PathInput value={item.options?.colorSource ?? ''} options={fields} onChange={(value) => update(item.id, { options: { ...item.options, colorSource: value } })} /></label>{item.renderer === 'nameColorCapsule' ? <label className="text-xs">名称字段<PathInput value={item.options?.nameSource ?? item.source} options={fields} onChange={(value) => update(item.id, { options: { ...item.options, nameSource: value } })} /></label> : null}<label className="text-xs">回退颜色<input className="mt-1 h-8 w-full rounded border" type="color" value={item.options?.fallbackColor ?? '#64748b'} onChange={(event) => update(item.id, { options: { ...item.options, fallbackColor: event.target.value } })} /></label></div> : null}
      {item.renderer === 'tag' ? <label className="mt-2 block max-w-sm text-xs">标签颜色<input className="mt-1 h-8 w-full rounded border" type="color" value={item.options?.tagColor ?? '#475569'} onChange={(event) => update(item.id, { options: { ...item.options, tagColor: event.target.value } })} /></label> : null}
      {item.renderer === 'lineChips' ? <label className="mt-2 block max-w-sm text-xs">关联线路来源<select className="mt-1 w-full rounded border px-2 py-1" value={item.options?.lineChipSource ?? ''} onChange={(event) => update(item.id, { options: { ...item.options, lineChipSource: event.target.value as NonNullable<CardItem['options']>['lineChipSource'] } })}><option value="">选择来源</option>{lineChipSources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
      {item.renderer === 'media' ? <label className="mt-2 block max-w-sm text-xs">图片来源<select className="mt-1 w-full rounded border px-2 py-1" value={item.options?.mediaSource ?? 'external-url'} onChange={(event) => update(item.id, { options: { ...item.options, mediaSource: event.target.value as 'external-url' | 'picture-index' } })}><option value="external-url">外部链接</option><option value="picture-index">Picture Index</option></select></label> : null}
      {config.contractRevision<9&&item.valueMode==='override' ? <CardValueOptions value={item.valueOptions??[]} onChange={valueOptions=>update(item.id,{valueOptions})}/> : config.contractRevision<9?<p className="mt-2 text-xs text-slate-500">值显示跟随当前分类的有效字段对照。</p>:<p className="mt-2 text-xs text-slate-500">本地显示对照 {item.valueOptions?.length??0} 项；需要更新时重新预填。</p>}
      {item.renderer === 'relationLink' ? relationEditor({ config, item, onChange: (next) => update(item.id, next) }) : null}
    </article>)}</div>
    {!items.length ? <p className="mt-2 text-sm text-slate-500">暂无显示项；点击添加卡片项开始配置。</p> : null}
  </section>;
}

function CardValueOptions({value,onChange}:{value:NonNullable<CardItem['valueOptions']>;onChange:(value:NonNullable<CardItem['valueOptions']>)=>void}) {return <ValueOptionsEditor value={value} onChange={onChange} title="信息卡手动覆写对照"/>;}

export default V3CardEditor;
