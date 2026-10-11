import type { WorkflowControl, WorkflowGroupField } from './types';
import { WorkflowValueConditionEditor } from './WorkflowValueConditionEditor';

type Settings = WorkflowControl | WorkflowGroupField;
export function WorkflowControlSettings({ value, onChange }: { value: Settings; onChange: (next: Settings) => void }) {
  const patch = (next: Partial<Settings>) => onChange({ ...value, ...next } as Settings);
  const structured = value.kind === 'json' || value.kind === 'group';
  const defaultText = value.defaultValue === undefined ? '' : structured && typeof value.defaultValue !== 'string' ? JSON.stringify(value.defaultValue) : String(value.defaultValue);
  const setDefault = (text: string) => {
    let next: unknown = text;
    if ((value.kind === 'number'||value.kind==='select'&&value.optionValueType==='number') && text.trim() && Number.isFinite(Number(text))) next = Number(text);
    else if ((value.kind === 'toggle'||value.kind==='select'&&value.optionValueType==='boolean') && (text === 'true' || text === 'false')) next = text === 'true';
    else if (structured) { try { next = JSON.parse(text); } catch { /* Invalid editable text remains visible and fails validation. */ } }
    patch({ defaultValue: next });
  };
  return <div className="mt-2 grid min-w-0 gap-2 rounded border bg-white p-2 text-xs md:grid-cols-3">
    <label><input type="checkbox" checked={Boolean(value.required)} onChange={event => patch({ required: event.target.checked })} /> 必填</label>
    <label><input type="checkbox" checked={value.defaultValue !== undefined} onChange={event => patch({ defaultValue: event.target.checked ? value.kind === 'toggle' ? false : value.kind === 'group' ? [] : '' : undefined })} /> 使用默认值<input aria-label="输入默认值" disabled={value.defaultValue === undefined} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={defaultText} onChange={event => setDefault(event.target.value)} /></label>
    <label>英文显示名称<input className="mt-1 w-full rounded border px-2 py-1" value={value.label.en} onChange={event => patch({ label: { ...value.label, en: event.target.value } })} /></label>
    <label>输入提示<input className="mt-1 w-full rounded border px-2 py-1" value={value.placeholder ?? ''} onChange={event => patch({ placeholder: event.target.value })} /></label>
    {value.kind === 'textarea' || value.kind === 'json' ? <label>输入行数<input type="number" min={1} className="mt-1 w-full rounded border px-2 py-1" value={value.rows ?? 3} onChange={event => patch({ rows: Number(event.target.value) })} /></label> : null}
    <label>填写格式<select aria-label="输入填写格式" className="mt-1 w-full rounded border" value={value.fieldFormat??'plain'} onChange={event=>patch({fieldFormat:event.target.value as Settings['fieldFormat']})}><option value="plain">普通文字</option><option value="externalLink">外部链接</option><option value="boolean">是 / 否</option><option value="json">JSON 内容</option><option value="date">日期</option></select></label>
    {value.kind==='select'?<label>选项保存值类型<select className="mt-1 w-full rounded border" value={value.optionValueType??'string'} onChange={event=>patch({optionValueType:event.target.value as Settings['optionValueType']})}><option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔</option></select></label>:null}
    {!['number','toggle','json','group','runtimeValue','classificationPicker','tagsExtensions'].includes(value.kind) ? <label>保存值处理<select className="mt-1 w-full rounded border px-2 py-1" value={value.valueNormalization ?? 'none'} onChange={event => onChange({ ...value, valueNormalization: event.target.value as WorkflowControl['valueNormalization'] })}><option value="none">保留输入</option><option value="trim">去首尾空白</option><option value="abbr">标识缩写</option><option value="number">数值</option></select></label> : null}
    {'id' in value ? <WorkflowValueConditionEditor value={value.when} onChange={when => onChange({ ...value, when })} /> : null}
  </div>;
}
