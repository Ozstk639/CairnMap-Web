import { useState } from 'react';
import type { ConfigPackageV3, WorkflowControl, WorkflowDefinition } from './types';
import { resolveEffectiveFields } from './runtime';
import { PROTECTED_WORKFLOW_TARGETS } from './workflowExpression';
import { nextWorkflowSlot, workflowControlFromField } from './workflowFieldControl';

export function WorkflowFieldBindingEditor({ config, workflow, onAdd }: {
  config: ConfigPackageV3; workflow: WorkflowDefinition; onAdd: (control: WorkflowControl, field: string, outputId: string) => void;
}) {
  const [outputId,setOutputId] = useState(workflow.outputs[0]?.id ?? '');
  const [fieldKey,setFieldKey] = useState('');
  const [error,setError] = useState('');
  const output = workflow.outputs.find(item => item.id === outputId) ?? workflow.outputs[0];
  const fields = output ? resolveEffectiveFields(config,output.classification).filter(field => field.key !== 'ID' && !PROTECTED_WORKFLOW_TARGETS.has(field.key) && field.scenes?.workflow !== false && !output.assignments.some(assignment => assignment.target === field.key)) : [];
  return <div className="mt-2 rounded border bg-slate-50 p-2 text-xs"><p>按字段定义添加输入，并绑定到输出；已绑定字段请编辑现有控件与组装行。</p><div className="mt-2 flex flex-wrap gap-2"><select aria-label="字段输入所属输出" className="rounded border px-2 py-1" value={output?.id ?? ''} onChange={event => { setOutputId(event.target.value);setFieldKey(''); }}>{workflow.outputs.map((item,index) => <option key={item.id} value={item.id}>输出 {index + 1}</option>)}</select><select aria-label="添加输入的字段" className="rounded border px-2 py-1" value={fieldKey} onChange={event => setFieldKey(event.target.value)}><option value="">选择未绑定字段</option>{fields.map(field => <option key={field.key} value={field.key}>{field.key} · {field.labels.zh}</option>)}</select><button type="button" disabled={!fieldKey} className="rounded border bg-white px-2 py-1 disabled:opacity-40" onClick={() => { try { const field=fields.find(item => item.key === fieldKey);if(!field || !output)return;const control=workflowControlFromField(field,nextWorkflowSlot(workflow),`field-input-${Date.now().toString(36)}`,config);onAdd(control,field.key,output.id);setFieldKey('');setError(''); } catch(error) {setError(error instanceof Error ? error.message : '无法添加输入。');} }}>按字段添加输入与绑定</button></div>{error ? <p role="alert" className="mt-1 text-rose-700">{error}</p> : null}</div>;
}
