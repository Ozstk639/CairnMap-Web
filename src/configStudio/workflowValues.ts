import type { WorkflowDefinition,WorkflowControl,WorkflowGroupField } from './types';
import { storedOptionValue } from './fieldReuse';
/** Form validation, conditions and final drawing snapshots share value types. */
function leafValue(field:WorkflowControl|WorkflowGroupField,value:unknown):unknown {
  if(value==null||typeof value==='object'||(field.kind==='featureSearch'||field.kind==='coarseSearch')&&typeof value!=='string')return value;
  if(field.kind==='select')return storedOptionValue(value,field.optionValueType);
  if(field.kind==='json'&&typeof value==='string'&&value.trim()){try{return JSON.parse(value);}catch{return value;}}
  if(field.valueNormalization==='abbr')return String(value).trim().replace(/\s+/g,'').replace(/[^A-Za-z0-9_-]/g,'');
  if(field.valueNormalization==='trim')return String(value).replace(/\r\n?/g,'\n').trim();
  if((field.kind==='number'||field.valueNormalization==='number')&&String(value).trim()&&Number.isFinite(Number(value)))return Number(value);
  return value;
}
export function coerceWorkflowValues(workflow:WorkflowDefinition,raw:Record<string,unknown>):Record<string,unknown> {
  const slots={...raw};
  for(const control of workflow.steps.flatMap(step=>step.controls??[])){
    if(!control.slot||slots[control.slot]==null)continue;
    const value=slots[control.slot];
    if(control.kind==='select'){slots[control.slot]=storedOptionValue(value,control.optionValueType);continue;}
    if(control.kind==='group'&&Array.isArray(value)&&control.group){
      slots[control.slot]=value.map(row=>control.group!.storage==='scalar'?(control.group!.itemFields[0]?leafValue(control.group!.itemFields[0],row):row):row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.entries(row).map(([key,value])=>[key,control.group!.itemFields.find(field=>field.key===key)?leafValue(control.group!.itemFields.find(field=>field.key===key)!,value):value])):row);
      continue;
    }
    if(control.kind==='json'&&typeof value==='string'&&value.trim()){try{slots[control.slot]=JSON.parse(value);}catch{/* Validation keeps incomplete input visible. */}continue;}
    if(control.valueNormalization==='abbr')slots[control.slot]=String(value).trim().replace(/\s+/g,'').replace(/[^A-Za-z0-9_-]/g,'');
    else if(control.valueNormalization==='trim')slots[control.slot]=String(value).replace(/\r\n?/g,'\n').trim();
    else if((control.valueNormalization==='number'||control.kind==='number')&&String(value).trim()){const number=Number(value);if(Number.isFinite(number))slots[control.slot]=number;}
  }
  return slots;
}
