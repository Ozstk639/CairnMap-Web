import { ModuleHelp } from './ModuleHelp';
import type { ZoomPriorityRule, RenderPriority } from './types';
export function CollisionMetricEditor({ rule, onChange, fields }: { rule: ZoomPriorityRule; onChange: (rule: ZoomPriorityRule) => void; fields: string[] }) {
  const label = rule.label;
  if (!label) return null;
  const metric = label.collision.metric;
  const update = (value: RenderPriority['metric']) => onChange({ ...rule, label: { ...label, collision: { ...label.collision, metric: value } } });
  return <details className="mt-2 rounded border p-2"><summary className="text-xs" data-module-title="Label 独立碰撞指标">Label 独立碰撞指标<ModuleHelp title="Label 独立碰撞指标" /></summary><label className="mt-2 block text-xs"><input type="checkbox" checked={label.collision.compatibility === 'r5DisplayPriority'} onChange={event => onChange({ ...rule, label: { ...label, collision: { ...label.collision, compatibility: event.target.checked ? 'r5DisplayPriority' : undefined } } })} />保留导入 r5 的碰撞 / C 优先级联动</label><div className="mt-2 grid gap-2 text-xs md:grid-cols-4">
    <label>指标<select className="mt-1 w-full rounded border px-2 py-1" value={metric?.kind ?? ''} onChange={event => update(event.target.value ? { kind: event.target.value as NonNullable<RenderPriority['metric']>['kind'], multiplier: 1, rounding: 'floor' } : undefined)}><option value="">仅基础优先级</option>{['area','length','partCount','field'].map(kind => <option key={kind}>{kind}</option>)}</select></label>
    {metric ? <>{(['multiplier','divisor','min','max'] as const).map(key => <label key={key}>{({multiplier:'倍率',divisor:'除数',min:'指标下限',max:'指标上限'})[key]}<input className="mt-1 w-full rounded border px-2 py-1" type="number" value={metric[key] ?? ''} onChange={event => update({ ...metric, [key]: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>)}
      <label>取整<select className="mt-1 w-full rounded border px-2 py-1" value={metric.rounding} onChange={event => update({ ...metric, rounding: event.target.value as typeof metric.rounding })}>{['none','floor','round','ceil'].map(key => <option key={key}>{key}</option>)}</select></label>
      {metric.kind === 'field' ? <label>指标字段<select className="mt-1 w-full rounded border px-2 py-1" value={metric.field ?? ''} onChange={event => update({ ...metric, field: event.target.value })}><option value="">选择字段</option>{fields.map(field => <option key={field}>{field}</option>)}</select></label> : null}
    </> : null}
  </div></details>;
}
