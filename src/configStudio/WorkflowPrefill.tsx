import { useState } from 'react';
import { FieldPrefill } from './FieldPrefillDialog';
import { prefillGroupField, prefillWorkflowControl } from './fieldPrefillModel';
import { resolveEffectiveFields } from './runtime';
import type { ConfigPackageV3, WorkflowControl, WorkflowDefinition, WorkflowGroupField } from './types';

export function WorkflowPrefill({config,workflow,value,onChange,onImport,groupField=false}:{config:ConfigPackageV3;workflow:WorkflowDefinition;value:WorkflowControl|WorkflowGroupField;onChange:(value:WorkflowControl|WorkflowGroupField)=>void;onImport?:(value:WorkflowControl,key:string,outputId?:string)=>void;groupField?:boolean}) {
  const [bind,setBind]=useState(false),[outputId,setOutputId]=useState(workflow.outputs[0]?.id??'');
  return <div className="mt-2 flex flex-wrap items-center gap-2 rounded border bg-white p-2 text-xs"><FieldPrefill config={config} initialPath={workflow.outputs[0]?.classification} single={groupField} onApply={field=>{
    if(groupField){onChange(prefillGroupField(value as WorkflowGroupField,field));return;}
    const control=prefillWorkflowControl(value as WorkflowControl,field);
    const output=workflow.outputs.find(output=>output.id===outputId),existing=output?.assignments.find(item=>item.target===field.key);
    if(bind&&(!output||!resolveEffectiveFields(config,output.classification).some(item=>item.key===field.key)))throw Error('所选输出没有对应字段，不能绑定。');
    if(bind&&existing&&existing.expression!==control.slot)throw Error('目标字段已被其他输入绑定，请先调整原组装行。');
    if(onImport)onImport(control,field.key,bind&&!existing?outputId:undefined);else onChange(control);
  }}/>{onImport&&!groupField?<><label><input type="checkbox" checked={bind} onChange={event=>setBind(event.target.checked)}/>同时绑定到输出</label>{bind?<select aria-label="预填绑定输出" value={outputId} onChange={event=>setOutputId(event.target.value)}>{workflow.outputs.map((output,index)=><option key={output.id} value={output.id}>输出 {index+1}</option>)}</select>:null}</>:null}</div>;
}
