import { WORKFLOW_EDITOR_SCHEMAS, projectRegistryScene } from '@/components/Common/workflowEditorRegistry';
import type { WorkflowDefinition, WorkflowControl } from './types';

/** Imported user order is retained. Only a newly generated factory opts into V1 ordering. */
export function migrateWorkflowForms(value:WorkflowDefinition):WorkflowDefinition {
  const workflow=structuredClone(value);if(workflow.mode!=='composed')return workflow;
  const first=workflow.steps.find(step=>step.kind==='form');if(!first)return workflow;
  const tails=workflow.steps.filter(step=>step.kind==='tagsExtensions');
  const existing=workflow.steps.flatMap(step=>step.controls??[]).find(control=>control.kind==='tagsExtensions');
  if(!existing)first.controls=[...(first.controls??[]),{id:tails[0]?.id??`system-tags-${workflow.id}`,kind:'tagsExtensions',columns:1,label:{zh:'标签与扩展',en:'Tags and extensions'},systemManaged:true,tagsExtensions:tails[0]?.tagsExtensions??{tagsEnabled:true,extensionsEnabled:true}}];
  workflow.steps=workflow.steps.filter(step=>step.kind!=='tagsExtensions');
  return workflow;
}
export function orderFactoryWorkflowForms(value:WorkflowDefinition):WorkflowDefinition {
  const workflow=structuredClone(value);
  const classCode=workflow.outputs[0]?.classification.class;
  const common=['@classification','Name','@catAbbr','@abbr','tags.nomenclator'];
  const order=classCode==='ROD'?['@classification','Level','Oneway','Enter','Exit','SelfJunction','Name','@catAbbr','@abbr','ConnectL','Blacklist','Mode','Speed','tags.nomenclator','tags.Land','tags.UAdm','tags.UAdmG','extensions.link.wiki']
    :classCode==='TPP'?['@classification','Name','@abbr','hub','tags.Land','tags.UAdm','tags.UAdmG','extensions.link.wiki','TGTWarp']
    :classCode==='WRP'?['@classification','Name','@abbr','WRPointI2D','hub','tags.Land','tags.UAdm','tags.UAdmG','extensions.link.wiki']
    :classCode==='FLR'?[...common,'BuildingID','NofFloor','tags.Land','tags.Adm','tags.Pop','extensions.link.wiki','extensions.character.brief']:common;
  const key=(control:WorkflowControl)=>control.kind==='classificationPicker'?'@classification':control.kind==='tagsExtensions'?'@annotations':/-catAbbr-/.test(control.id)?'@catAbbr':/-abbr-/.test(control.id)?'@abbr':workflow.outputs.flatMap(output=>output.assignments).find(row=>row.expression===control.slot&&row.target!=='ID')?.target??control.id;
  for(const step of workflow.steps.filter(step=>step.kind==='form')) {
    const controls=step.controls??[];
    const rank=(control:WorkflowControl)=>key(control)==='@annotations'?10000:order.includes(key(control))?order.indexOf(key(control)):order.length;
    step.controls=controls.map((control,index)=>({control,index})).sort((left,right)=>rank(left.control)-rank(right.control)||left.index-right.index).map(row=>row.control);
  }
  return workflow;
}

export function migrateUnmodifiedFactoryOrder(workflow:WorkflowDefinition):WorkflowDefinition {
  const schemaKey=String(workflow.legacy?.source?.schemaKey??'');
  const schema=WORKFLOW_EDITOR_SCHEMAS.find(schema=>schema.schemaKey===schemaKey);
  const forms=workflow.steps.filter(step=>step.kind==='form');if(!schema||forms.length!==1)return workflow;
  const projected=projectRegistryScene(schema,'workflow');
  const expected=[...(schema.idField.workflow?.visible?[projected.idField.key]:[]),...projected.fields.map(field=>field.key),...projected.auxInputs.map(field=>field.key),...projected.groups.map(group=>group.key)];
  const actual=(forms[0].controls??[]).filter(control=>!control.systemManaged).map(control=>control.id.startsWith(`${schemaKey}-`)&&control.slot?control.id.slice(schemaKey.length+1,-control.slot.length-1):'');
  return JSON.stringify(actual)===JSON.stringify(expected)?orderFactoryWorkflowForms(workflow):workflow;
}
