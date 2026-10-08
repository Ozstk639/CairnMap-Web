import type { WorkflowControl, WorkflowGroupField } from './types';
import { WorkflowValueConditionEditor } from './WorkflowValueConditionEditor';

type Settings = WorkflowControl | WorkflowGroupField;
export function WorkflowControlSettings({ value, onChange }: { value: Settings; onChange: (next: Settings) => void }) {
  const patch = (next: Partial<Settings>) => onChange({ ...value, ...next } as Settings);
  const structured = value.kind === 'json' || value.kind === 'group';
  const defaultText = value.defaultValue === undefined ? '' : structured && typeof value.defaultValue !== 'string' ? JSON.stringify(value.defaultValue) : String(value.defaultValue);
  const setDefault = (text: string) => {
    let next: unknown = text;
    if (value.kind === 'number' && text.trim() && Number.isFinite(Number(text))) next = Number(text);
    else if (value.kind === 'toggle' && (text === 'true' || text === 'false')) next = text === 'true';
    else if (structured) { try { next = JSON.parse(text); } catch { /* Invalid editable text remains visible and fails validation. */ } }
    patch({ defaultValue: next });
  };
  return <div className="mt-2 grid min-w-0 gap-2 rounded border bg-white p-2 text-xs md:grid-cols-3">
    <label><input type="checkbox" checked={Boolean(value.required)} onChange={event => patch({ required: event.target.checked })} /> 必填</label>
    <label><input type="checkbox" checked={value.defaultValue !== undefined} onChange={event => patch({ defaultValue: event.target.checked ? value.kind === 'toggle' ? false : value.kind === 'group' ? [] : '' : undefined })} /> 使用默认值<input aria-label="输入默认值" disabled={value.defaultValue === undefined} className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100" value={defaultText} onChange={event => setDefault(event.target.value)} /></label>
    <label>英文显示名称<input className="mt-1 w-full rounded border px-2 py-1" value={value.label.en} onChange={event => patch({ label: { ...value.label, en: event.target.value } })} /></label>
    <label>输入提示<input className="mt-1 w-full rounded border px-2 py-1" value={value.placeholder ?? ''} onChange={event => patch({ placeholder: event.target.value })} /></label>
    {value.kind === 'textarea' || value.kind === 'json' ? <label>输入行数<input type="number" min={1} className="mt-1 w-full rounded border px-2 py-1" value={value.rows ?? 3} onChange={event => patch({ rows: Number(event.target.value) })} /></label> : null}
    {'slot' in value ? <label>值规范化<select className="mt-1 w-full rounded border px-2 py-1" value={value.valueNormalization ?? 'none'} onChange={event => onChange({ ...value, valueNormalization: event.target.value as WorkflowControl['valueNormalization'] })}><option value="none">保留输入</option><option value="trim">去首尾空白</option><option value="abbr">标识缩写</option><option value="number">数值</option></select></label> : null}
    {'id' in value && value.kind === 'select' ? <label>共享选项来源 ID<input className="mt-1 w-full rounded border px-2" value={value.optionSource?.registryKey ?? ''} onChange={event => onChange({ ...value, optionSource: event.target.value ? { registryKey: event.target.value } : undefined })} /></label> : null}
    {'id' in value ? <WorkflowValueConditionEditor value={value.when} onChange={when => onChange({ ...value, when })} /> : null}
  </div>;
}
