import {ValueMapColorEditor} from './ValueMapColorEditor';
import type {ConfigPackageV3,ClassificationPath,RenderColorBinding} from './types';
import {classificationPathKey,resolveSelectableFields} from './runtime';
const samePath=(a:ClassificationPath,b:ClassificationPath)=>classificationPathKey(a)===classificationPathKey(b);
const allFieldKeys=(config:ConfigPackageV3,path:ClassificationPath)=>resolveSelectableFields(config,path).map(f=>f.key);
const nodeLabel=(node:ConfigPackageV3['nodes'][number])=>classificationPathKey(node.path)+' · '+(node.classificationLabels?.[node.path.skind2?'skind2':node.path.skind?'skind':node.path.kind?'kind':'class']?.zh||'');
export function ColorBindingEditor({ config, sourcePath: _sourcePath, fields, label, value, onChange, allowExternal = true }: {
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
      else if(next==='valueMap')onChange({mode:'valueMap',field:fields[0]??'',entries:[],fallbackColor:'#334155'});
      else if (next === 'field') onChange({ mode: 'field', field: fields[0] ?? 'Name', fallbackColor: '#334155' });
      else if (next === 'relatedLine') onChange({ mode: 'relatedLine', strategy: 'featureRelation', fallbackColor: '#2563eb' });
      else onChange({ mode: 'external', target: { class: '' }, targetIdField: 'ID', targetColorField: '', fallbackColor: '#334155' });
    }}><option value="fixed">直接选择</option><option value="field">绑定字段</option>{config.contractRevision>=9?<option value="valueMap">按字段值设色</option>:null}<option value="relatedLine">关联线路颜色</option>{allowExternal ? <option value="external">绑定外部要素字段</option> : null}</select></label>
      {mode === 'fixed' ? <label className="text-xs">颜色<input className="mt-1 block h-8 w-full rounded border" type="color" value={value.color} onChange={(event) => onChange({ ...value, color: event.target.value })} /></label> : null}
      {mode === 'field' ? <label className="text-xs sm:col-span-2">绑定颜色指示字段<select className="mt-1 w-full rounded border px-2 py-1" value={value.field} onChange={(event) => onChange({ ...value, field: event.target.value })}><option value="">选择字段</option>{fields.map((field) => <option key={field}>{field}</option>)}</select></label> : null}
    </div>
    {mode==='valueMap'?<ValueMapColorEditor fields={resolveSelectableFields(config,_sourcePath)} value={value} onChange={onChange}/>:null}
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

