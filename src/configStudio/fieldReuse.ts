import type { ConfigPackageV3, FieldDefinition, WorkflowControl, WorkflowDefinition, WorkflowFieldSource, WorkflowGroupField, WorkflowValueCondition } from './types';
import { resolveEffectiveFields } from './runtime';
import { workflowControlFromField } from './workflowFieldControl';

export const FIELD_IMPORT_PROPERTIES = ['label','kind','options','optionValueType','placeholder','defaultValue','required','requiredWhen','search','group','rows','valueNormalization','fieldFormat'] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function fieldSourceSnapshot(field: FieldDefinition): WorkflowFieldSource['snapshot'] {
  const { key,type,cardinality,labels,options,optionValueType,format,defaultValue,required,requiredWhen,input,placeholder,reference } = field;
  return structuredClone({ key,type,cardinality,labels,options,optionValueType,format,defaultValue,required,requiredWhen,input,placeholder,reference });
}
export function resolveSourceField(config: ConfigPackageV3, source: WorkflowFieldSource): FieldDefinition | undefined {
  const node = config.nodes.find(item => item.nodeId === source.nodeId);
  if (!node) return undefined;
  const fields = resolveEffectiveFields(config,node.path);
  return fields.find(field => field.fieldId === source.fieldId)
    ?? fields.find(field => field.key === source.snapshot.key && field.overrideOf === source.snapshot.key);
}
function requiredConditions(field: FieldDefinition, workflow: WorkflowDefinition): WorkflowValueCondition[] {
  return (field.requiredWhen ?? []).flatMap<WorkflowValueCondition>(condition => {
    if (condition.kind === 'always') return [];
    if (!('field' in condition)) throw new Error(`字段 ${field.key} 的必填条件不能转换为输入槽位。`);
    const bindings = workflow.outputs.flatMap(output => output.assignments).filter(item => item.target === condition.field && /^[A-Z][A-Z0-9_]*$/.test(item.expression));
    const tokens = [...new Set(bindings.map(item => item.expression))];
    if (tokens.length !== 1) throw new Error(`请先将条件字段 ${condition.field} 明确绑定到一个输入槽位。`);
    const source=workflow.steps.flatMap(step=>step.controls??[]).find(control=>control.slot===tokens[0]);
    const typed=(value:string)=>source?.kind==='number'||source?.optionValueType==='number'?Number(value):source?.kind==='toggle'||source?.optionValueType==='boolean'?value==='true':value;
    if (condition.kind === 'fieldEquals') return [{ token: tokens[0], operator: 'equals' as const, value: typed(condition.value) }];
    if (condition.kind === 'fieldPresent') return [{ token: tokens[0], operator: condition.present ? 'present' as const : 'empty' as const }];
    return [{ token:tokens[0],operator:'in' as const,values:condition.values.map(typed) }];
  });
}
export function importFieldIntoControl(config: ConfigPackageV3, workflow: WorkflowDefinition, control: WorkflowControl, nodeId: string, field: FieldDefinition): WorkflowControl {
  const imported = workflowControlFromField(field, control.slot ?? control.id, control.id, config);
  return { ...control, ...imported, columns: control.columns,
    required: Boolean(field.required||field.requiredWhen?.length),
    requiredWhen: field.required||field.requiredWhen?.some(condition=>condition.kind==='always')?[]:field.requiredWhen?.length?[{token:'',operator:'present',any:requiredConditions(field, workflow)}]:[], fieldFormat: field.format, optionValueType: imported.optionValueType,
    fieldSource: { nodeId, fieldId: field.fieldId, snapshot: fieldSourceSnapshot(field), overrides: [] } };
}
export function resolveImportedControl(config: ConfigPackageV3, workflow: WorkflowDefinition, control: WorkflowControl): WorkflowControl {
  if (config.contractRevision>=9 || !control.fieldSource) return control;
  const field = resolveSourceField(config,control.fieldSource);
  if (!field) return control; // Preflight keeps the failed reference visible.
  let generated: WorkflowControl;
  try { generated = importFieldIntoControl(config,workflow,control,control.fieldSource.nodeId,field); }
  catch { return control; }
  const next = { ...control };
  for (const key of FIELD_IMPORT_PROPERTIES) if (!control.fieldSource.overrides.includes(key)) {
    (next as unknown as Record<string,unknown>)[key] = generated[key];
  }
  return next;
}
export function markFieldOverrides<T extends WorkflowControl | WorkflowGroupField>(previous: T, next: T): T {
  if (!previous.fieldSource || !next.fieldSource) return next;
  const overrides = new Set(previous.fieldSource.overrides);
  for (const key of FIELD_IMPORT_PROPERTIES) if (!same((previous as unknown as Record<string,unknown>)[key],(next as unknown as Record<string,unknown>)[key])) overrides.add(key);
  return { ...next, fieldSource: { ...previous.fieldSource, overrides: [...overrides] } };
}
export function resolveImportedGroupField(config: ConfigPackageV3, workflow: WorkflowDefinition, field: WorkflowGroupField): WorkflowGroupField {
  if (!field.fieldSource) return field;
  const control = resolveImportedControl(config,workflow,{ ...field,id:field.key,slot:'GROUP_VALUE',columns:1 } as WorkflowControl);
  const { id: _id, slot: _slot, columns: _columns, ...resolved } = control;
  return { ...field,...resolved, key:field.key } as WorkflowGroupField;
}
export function resolveWorkflowFields(config: ConfigPackageV3, workflow: WorkflowDefinition): WorkflowDefinition {
  return { ...workflow, steps: workflow.steps.map(step => ({ ...step,controls:step.controls?.map(raw => {
    const control = resolveImportedControl(config,workflow,raw);
    return control.group ? { ...control, group:{ ...control.group,itemFields:control.group.itemFields.map(field=>resolveImportedGroupField(config,workflow,field)) } } : control;
  }) })) };
}
export function fieldImportErrors(config: ConfigPackageV3, workflow: WorkflowDefinition, control: WorkflowControl | WorkflowGroupField): string[] {
  const source = control.fieldSource;
  if (!source) return [];
  const field = resolveSourceField(config,source);
  if (!field) return [`来源分类/字段 ${source.nodeId}/${source.snapshot.key} 已不存在或不再有效。`];
  const errors: string[] = [];
  if(field.type==='enum'&&(field.optionValueType??'string')!==(source.snapshot.optionValueType??'string'))errors.push(`来源字段 ${field.key} 的保存值类型已变化，请重新导入。`);
  if (field.type !== source.snapshot.type || field.cardinality !== source.snapshot.cardinality) errors.push(`来源字段 ${field.key} 的类型或值数量已变化，请重新导入后确认绑定。`);
  if (source.overrides.some(key=>!(FIELD_IMPORT_PROPERTIES as readonly string[]).includes(key))) errors.push('存在未知字段覆写项。');
  if (field.scenes?.workflow === false) errors.push(`来源字段 ${field.key} 已关闭工作流使用。`);
  try { requiredConditions(field,workflow); } catch(error) { errors.push(error instanceof Error ? error.message : '必填依赖无法转换。'); }
  return errors;
}
export function storedOptionValue(value: unknown, kind: FieldDefinition['optionValueType']): unknown {
  if (value === '' || value == null) return value;
  if (kind === 'number') return Number(value);
  if (kind === 'boolean') return value===true||value==='true'?true:value===false||value==='false'?false:value;
  if (kind === 'string') return typeof value==='object'?value:String(value);
  return value;
}
