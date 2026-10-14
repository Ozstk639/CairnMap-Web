import { resolveWorkflowFields } from './fieldReuse';
import { WorkflowExpressionEditor } from './WorkflowExpressionEditor';
import { GripVertical, Plus } from 'lucide-react';
import { WorkflowValueConditionEditor } from './WorkflowValueConditionEditor';
import { useMemo, useState } from 'react';
import type { ConfigPackageV3, WorkflowAssignment, WorkflowDefinition, WorkflowOutput } from './types';
import { resolveSelectableFields, validateWorkflowDefinition } from './runtime';
import { evaluateV3Expression, normalizeV3WorkflowSlots, workflowOutputSystem, type V3WorkflowValueMap } from './V3WorkflowRunner';
import { WORKFLOW_SYSTEM_TOKENS, workflowDerivedPointTokens } from './workflowExpression';

const uid = () => `assignment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function AssignmentRow({ value, index, targets, tokens, tokenInfo, system, slots, errors, onChange, onDelete, onCopy, onDragStart, onDragEnd, onDrop }: {
  value: WorkflowAssignment; index: number; targets: string[]; tokens: string[]; tokenInfo:Array<{token:string;label:string;type?:string}>; system: V3WorkflowValueMap; slots: V3WorkflowValueMap; errors: string[];
  onChange: (next: WorkflowAssignment) => void; onDelete: () => void; onCopy: () => void; onDragStart: () => void; onDragEnd: () => void; onDrop: () => void;
}) {
  const expression = (next: string) => onChange({ ...value, expression: next });
  let preview = '';
  try { const result = evaluateV3Expression(value.expression, slots, system); preview = result === undefined ? '（尚未填写）' : JSON.stringify(result); }
  catch (error) { preview = error instanceof Error ? error.message : '表达式无效'; }
  return <article className="min-w-0 rounded border bg-white p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(); }}>
    <div className="flex min-w-0 items-start gap-2">
      <span draggable onDragStart={(event) => { event.stopPropagation(); onDragStart(); }} onDragEnd={onDragEnd} className="mt-2 cursor-grab text-slate-400" title="拖动手柄排序组装行"><GripVertical className="h-4 w-4" /></span>
      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
        <label className="grid min-w-0 gap-1 text-xs">目标字段／tags 或 extensions 路径<input aria-label={`组装目标 ${index + 1}`} list={`targets-${value.id}`} className="min-w-0 rounded border px-2 py-1" value={value.target} onChange={(event) => onChange({ ...value, target: event.target.value })} placeholder="Name、tags.zone、extensions.custom" /><datalist id={`targets-${value.id}`}>{targets.map((target) => <option key={target} value={target} />)}</datalist></label>
        <label className="grid min-w-0 gap-1 text-xs">来源／受控表达式<textarea aria-label={`组装表达式 ${index + 1}`} className="min-h-10 min-w-0 resize-y rounded border px-2 py-1 font-mono" rows={1} value={value.expression} onChange={(event) => expression(event.target.value)} placeholder={'A 或 join("_",WorldPrefix+Class,A)'} /></label>
      </div>
    </div>
    <WorkflowExpressionEditor value={value.expression} onChange={expression} tokens={tokenInfo} slots={slots} system={system} target={value.target}/>
    <div className="mt-2 flex min-w-0 flex-wrap items-start gap-2 text-xs"><code className="min-w-0 flex-1 break-all">{value.target || '（未选择目标）'} ← {preview}</code><button type="button" className="shrink-0 rounded border px-2 py-1" onClick={onCopy}>复制行</button><button type="button" className="shrink-0 rounded border px-2 py-1 text-rose-700" onClick={onDelete}>删除行</button></div>
    <WorkflowValueConditionEditor value={value.when} tokens={tokens} onChange={when => onChange({ ...value, when })} />
    {errors.length ? <ul role="alert" className="mt-2 space-y-1 text-xs text-rose-700">{errors.map((error, i) => <li key={i}>{error}</li>)}</ul> : null}
  </article>;
}

export function WorkflowOutputEditor({ config, workflow, output, slots, world, onChange }: { config: ConfigPackageV3; workflow: WorkflowDefinition; output: WorkflowOutput; slots: V3WorkflowValueMap; world?: string; onChange: (next: WorkflowOutput) => void }) {
  const [dragId, setDragId] = useState<string>();
  const targets = resolveSelectableFields(config, output.classification).map((field) => field.key);
  workflow=resolveWorkflowFields(config,workflow);
  const controlSlots = workflow.steps.flatMap((step) => step.controls ?? []).flatMap((control) => control.slot ? [control.slot] : []);
  const tokens = [...new Set([...controlSlots, ...workflowDerivedPointTokens(workflow), ...WORKFLOW_SYSTEM_TOKENS, ...workflow.outputs.flatMap((_, index) => WORKFLOW_SYSTEM_TOKENS.map((token) => `${token}_${index + 1}`))])];
  const tokenInfo=tokens.map(token=>{const control=workflow.steps.flatMap(step=>step.controls??[]).find(item=>item.slot===token);return {token,label:control?.label.zh??({World:'活动世界',WorldPrefix:'世界前缀',Creator:'填写人',Class:'主分类',Kind:'分类',Skind:'子分类',Skind2:'末级分类',ID:'要素 ID'} as Record<string,string>)[token]??token,type:control?.optionValueType??control?.kind};});
  slots = normalizeV3WorkflowSlots(workflow, slots);
  const system = workflowOutputSystem(workflow, slots, { world }, output.id);
  const issues = useMemo(() => validateWorkflowDefinition(workflow, config).issues, [workflow, config]);
  const set = (assignments: WorkflowAssignment[]) => onChange({ ...output, assignments });
  const move = (toId: string) => {
    if (!dragId || dragId === toId) return;
    const next = [...output.assignments]; const from = next.findIndex((row) => row.id === dragId); const to = next.findIndex((row) => row.id === toId);
    if (from < 0 || to < 0) return;
    const [row] = next.splice(from, 1); next.splice(to, 0, row); setDragId(undefined); set(next);
  };
  return <details open className="mt-3 min-w-0 rounded border border-emerald-200 bg-emerald-50 p-3"><summary className="cursor-pointer font-medium">输出分类、字段绑定与组装 · {output.assignments.length} 行</summary><div className="mt-3 space-y-2">{output.assignments.map((row, index) => <AssignmentRow key={row.id} value={row} index={index} targets={targets} tokens={tokens} tokenInfo={tokenInfo} slots={slots} system={system} errors={issues.filter((issue) => issue.path === `workflows/${workflow.id}/outputs/${output.id}/assignments/${row.id}`).map((issue) => issue.message)} onChange={(next) => set(output.assignments.map((item) => item.id === row.id ? next : item))} onDelete={() => set(output.assignments.filter((item) => item.id !== row.id))} onCopy={() => { const next = [...output.assignments]; next.splice(index + 1, 0, { ...row, id: uid() }); set(next); }} onDragStart={() => setDragId(row.id)} onDragEnd={() => setDragId(undefined)} onDrop={() => move(row.id)} />)}<button type="button" className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-sm" onClick={() => set([...output.assignments, { id: uid(), target: '', expression: '' }])}><Plus className="h-4 w-4" />添加组装行</button></div></details>;
}
