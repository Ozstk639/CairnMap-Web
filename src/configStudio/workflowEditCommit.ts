import type {ConfigPackageV3,WorkflowDefinition} from './types';
import {compileWorkflowEditPlan,hydrateWorkflowEdit,buildWorkflowEditRecord,assertEditIdentity,type WorkflowEditDraft} from './workflowEditing';
import {validateV3WorkflowInputs,validateV3WorkflowRecords} from './V3WorkflowRunner';
import {coerceWorkflowValues} from './workflowValues';
import {featureTypeFromGeometryType,validateMultipartGeometry,withCanonicalMultipartGeometry,type MultipartGeometry} from '../core/geometry/multipartGeometry';
export function prepareNativeWorkflowEdit(config:ConfigPackageV3,workflow:WorkflowDefinition,original:Record<string,unknown>,draft:WorkflowEditDraft,geometry:MultipartGeometry,world:string,editor:string,others:Record<string,unknown>[],now=new Date()):Record<string,unknown> {
 const plan=compileWorkflowEditPlan(workflow,config),type=workflow.outputs[0].geometry.selected;
 if(type!==geometry.type)throw Error('编辑几何类型与工作流不一致。');const geometryError=validateMultipartGeometry(geometry);if(geometryError)throw Error(geometryError);
 const projected={...workflow,steps:[{id:'edit',kind:'form' as const,label:{zh:'编辑',en:''},controls:plan.controls}],actor:{required:false}};
 const inputIssues=validateV3WorkflowInputs(projected,coerceWorkflowValues(projected,draft.slots),projected.steps,config);if(inputIssues.length)throw Error(inputIssues.map(i=>i.message).join('\n'));
 let record=buildWorkflowEditRecord(plan,original,draft);assertEditIdentity(record,original,world,others);
 record=withCanonicalMultipartGeometry({...record,Type:featureTypeFromGeometryType(geometry.type)},geometry);
 const issues=validateV3WorkflowRecords(config,workflow,[{outputId:workflow.outputs[0].id,classification:draft.classification,geometry:type,record}]);if(issues.length)throw Error(issues.map(i=>i.message).join('\n'));
 if(!editor.trim())throw Error('编辑人不能为空。');record.ModifityBy=editor.trim();record.ModifityTime=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
 return record;
}
/** Conversion performs actual original-record hydration and a lossless patch. */
export function testWorkflowEditConversion(config:ConfigPackageV3,workflow:WorkflowDefinition,records:Record<string,unknown>[]=[]) {
 const plan=compileWorkflowEditPlan(workflow,config),output=workflow.outputs[0],matching=records.filter(r=>r.Class===output.classification.class),sample:Record<string,unknown>={ID:'EDIT_SAMPLE',Class:output.classification.class,World:'zth',...(output.classification.kind?{Kind:output.classification.kind}:{}),...(output.classification.skind?{SKind:output.classification.skind}:{}),...(output.classification.skind2?{SKind2:output.classification.skind2}:{})};
 const set=(key:string,value:unknown)=>{const parts=key.split('.');let node=sample;for(const part of parts.slice(0,-1)){node[part]??={};node=node[part] as Record<string,unknown>;}node[parts[parts.length-1]]=value;};
 for(const control of plan.controls){const scalar=(field:Pick<typeof control,'kind'|'options'|'optionValueType'>)=>field.kind==='number'?0:field.kind==='toggle'?false:field.kind==='select'?field.optionValueType==='number'?Number(field.options?.[0]?.value??0):field.optionValueType==='boolean'?field.options?.[0]?.value==='true':field.options?.[0]?.value??'':field.kind==='json'?{kept:0}: '样本';
 const value=control.kind==='group'&&control.group?Array.from({length:Math.max(1,control.group.minItems??0)},()=>control.group!.storage==='scalar'?scalar(control.group!.itemFields[0]):Object.fromEntries(control.group!.itemFields.map(f=>[f.key,scalar(f)]))):scalar(control);for(const binding of plan.bindings.filter(b=>b.slot===control.slot))set(binding.target,value);}
 for(const record of [sample,...matching]) {const draft=hydrateWorkflowEdit(plan,record),result=buildWorkflowEditRecord(plan,record,draft);if(JSON.stringify(result)!==JSON.stringify(record))throw Error(`记录 ${record.ID} 无修改回填输出发生变化。`);}
 return {plan,report:[`三页/单输出/无额外绘制/无启用条件通过`,`保留 ${plan.controls.length} 个模块，移除 ${plan.removed.length} 个仅用于 ID 的模块`,`样本与 ${matching.length} 条现有记录实际回填及无修改输出一致`]};
}
