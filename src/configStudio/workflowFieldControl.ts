import type { ConfigPackageV3, FieldDefinition, WorkflowControl, WorkflowDefinition } from './types';
import { resolveWorkflowSelectOptions } from './runtime';
import { isSafeWorkflowTarget, PROTECTED_WORKFLOW_TARGETS, WORKFLOW_SYSTEM_TOKENS, workflowDerivedPointTokens } from './workflowExpression';

export function nextWorkflowSlot(workflow: WorkflowDefinition): string {
  const used = new Set([...WORKFLOW_SYSTEM_TOKENS, ...workflowDerivedPointTokens(workflow), ...workflow.steps.flatMap(step => (step.controls ?? []).map(control => control.slot ?? control.id))]);
  for (let index = 0; ; index++) {
    const name = index < 26 ? String.fromCharCode(65 + index) : `SLOT_${index - 25}`;
    if (!used.has(name)) return name;
  }
}

/** Field definitions supply defaults for newly authored inputs. Existing
 * controls keep their explicit settings and bindings. */
export function workflowControlFromField(field: FieldDefinition, slot: string, id: string, config?: ConfigPackageV3): WorkflowControl {
  if (!isSafeWorkflowTarget(field.key) || PROTECTED_WORKFLOW_TARGETS.has(field.key) || field.key === 'ID') throw new Error('系统字段不能通过普通字段输入重新定义。');
  if (field.scenes?.workflow === false) throw new Error('此字段未开放为新工作流输入。');
  const kind = field.input === 'text' && field.type === 'number' ? 'number' : field.input;
  const search = kind === 'featureSearch' ? field.reference ? {
    target: { class: field.reference.classCode }, queryFields: [...new Set([field.reference.matchField, field.reference.displayField ?? 'Name'])],
    returnField: field.reference.matchField, displayTemplate: `{{${field.reference.matchField}}} ({{${field.reference.displayField ?? 'Name'}}})`,
    matcher: 'contains' as const, minQueryLength: 1, maxResults: 30, debounceMs: 180, cacheScope: 'world' as const,
  } : undefined : undefined;
  if (kind === 'featureSearch' && !search) throw new Error('要素搜索输入需要先在字段定义中设置引用目标。');
  const common = { id, slot, columns: 1 as const, label: structuredClone(field.labels), required: field.required, placeholder: field.placeholder, defaultValue: structuredClone(field.defaultValue), optionValueType:field.optionValueType??(field.type==='number'?'number':field.type==='boolean'?'boolean':undefined), fieldFormat:field.format };
  if(field.type==='json'&&field.cardinality==='multiple')return {...common,kind:'json'};
  if (field.cardinality === 'multiple') return { ...common, kind: 'group', group: {
    storage: 'scalar', optional: !field.required, addLabel: { zh: `添加${field.labels.zh}`, en: '' },
    itemFields: [{ key: '', kind, label: structuredClone(field.labels), options: config ? resolveWorkflowSelectOptions(config,field) : field.options, search, required: true, placeholder: field.placeholder, optionValueType:field.optionValueType??(field.type==='number'?'number':field.type==='boolean'?'boolean':undefined),fieldFormat:field.format }],
  } };
  return { ...common, kind, options: field.options, optionSource: field.optionSource, search };
}
