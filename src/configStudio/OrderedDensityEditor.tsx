import { ModuleHelp } from './ModuleHelp';
import { GripOrderControls } from './GripOrderControls';
import { useId } from 'react';
import type { LabelDensityReduceStep } from '@/components/Rules/rendering/label/labelDensity';
const names: Record<LabelDensityReduceStep, string> = { hideSoftLabels: '隐藏弱标签', abbreviateOptionalLabels: '缩略可选标签', hideOptionalLabels: '隐藏可选标签', hideSymbols: '隐藏符号', geometryOnly: '仅保留几何' };
export function OrderedDensityEditor({ value, effective, scope, onChange }: { value?: LabelDensityReduceStep[]; effective: LabelDensityReduceStep[]; scope: string; onChange: (value: LabelDensityReduceStep[] | undefined) => void }) {
  const instance = useId();
  const order = value ?? effective;
  scope = `${scope}:${instance}`;
  const choices = [...order, ...(Object.keys(names) as LabelDensityReduceStep[]).filter(action => !order.includes(action))];
  return <fieldset className="rounded border p-2" data-density-order><legend className="px-1 text-xs">密度降低顺序（按选择顺序）{value === undefined ? '（继承有效顺序）' : '（本地覆盖）'}<ModuleHelp title="密度降低顺序（按选择顺序）" /></legend><div className="space-y-1 text-xs">{choices.map(action => { const index = order.indexOf(action); return <div key={action} className="flex items-center gap-2"><button type="button" role="checkbox" aria-checked={index >= 0} aria-label={`密度步骤：${names[action]}`} className={`h-6 w-6 rounded border ${index >= 0 ? 'border-blue-600 bg-blue-50 text-blue-700' : 'bg-white'}`} onClick={() => onChange(index >= 0 ? order.filter(item => item !== action) : [...order, action])}>{index >= 0 ? index + 1 : ''}</button><span>{names[action]}</span>{index >= 0 ? <GripOrderControls scope={scope} index={index} count={order.length} label="密度步骤" onMove={(from, to) => { const next = [...order]; const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange(next); }} /> : null}</div>; })}</div><button type="button" className="mt-2 text-xs text-blue-700" onClick={() => onChange(undefined)}>恢复继承顺序</button>{!order.length ? <p className="text-xs text-slate-500">未配置降级步骤，预算失败后直接采用最终回退。</p> : null}</fieldset>;
}
