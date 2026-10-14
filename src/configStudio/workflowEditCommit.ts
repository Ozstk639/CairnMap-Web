import type {ConfigPackageV3,WorkflowDefinition} from './types';
import {compileWorkflowEditPlan,hydrateWorkflowEdit,buildWorkflowEditRecord,workflowEditSlots,recordClassification,assertEditIdentity,type WorkflowEditDraft} from './workflowEditing';
import {evaluateV3WorkflowOutputs,validateV3WorkflowInputs,validateV3WorkflowRecords} from './V3WorkflowRunner';
import {coerceWorkflowValues} from './workflowValues';
import {featureTypeFromGeometryType,validateMultipartGeometry,withCanonicalMultipartGeometry,type MultipartGeometry} from '../core/geometry/multipartGeometry';
import {hasDescendants,pathMatchesScope,resolveGeometryProfile} from './runtime';
import {captureDrawingSnapshot,drawingKey} from './workflowDrawing';
export function prepareNativeWorkflowEdit(config:ConfigPackageV3,workflow:WorkflowDefinition,original:Record<string,unknown>,draft:WorkflowEditDraft,geometry:MultipartGeometry,world:string,editor:string,others:Record<string,unknown>[],now=new Date()):Record<string,unknown> {
 const plan=compileWorkflowEditPlan(workflow,config),type=workflow.outputs[0].geometry.selected;
 if(type!==geometry.type)throw Error('编辑几何类型与工作流不一致。');const geometryError=validateMultipartGeometry(geometry);if(geometryError)throw Error(geometryError);
 const projected={...workflow,steps:[{id:'edit',kind:'form' as const,label:{zh:'编辑',en:''},controls:plan.controls}],actor:{required:false}};
 const inputIssues=validateV3WorkflowInputs(projected,coerceWorkflowValues(projected,workflowEditSlots(plan,original,draft,geometry)),projected.steps,config);if(inputIssues.length)throw Error(inputIssues.map(i=>i.message).join('\n'));
 let record=buildWorkflowEditRecord(plan,original,draft,{geometry});assertEditIdentity(record,original,world,others);
 record=withCanonicalMultipartGeometry({...record,Type:featureTypeFromGeometryType(geometry.type)},geometry);
 const issues=validateV3WorkflowRecords(config,workflow,[{outputId:workflow.outputs[0].id,classification:draft.classification,geometry:type,record}]);if(issues.length)throw Error(issues.map(i=>i.message).join('\n'));
 if(!editor.trim())throw Error('编辑人不能为空。');record.ModifityBy=editor.trim();record.ModifityTime=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
 return record;
}
/** Conversion performs actual original-record hydration and a lossless patch. */
export function testWorkflowEditConversion(config:ConfigPackageV3,workflow:WorkflowDefinition,records:Record<string,unknown>[]=[]) {
 const plan=compileWorkflowEditPlan(workflow,config),output=workflow.outputs[0],matching=records.filter(r=>pathMatchesScope(recordClassification(r),plan.scope));
 const path=config.nodes.find(n=>pathMatchesScope(n.path,plan.scope)&&!hasDescendants(config,n.path)&&resolveGeometryProfile(config,n.path,output.geometry.selected)?.enabled)?.path;if(!path)throw Error('编辑范围没有最终可用分类。');
 const slots:Record<string,unknown>={ID:'EDIT_SAMPLE',actor:'editing-test'};
 for(const control of workflow.steps.flatMap(s=>s.controls??[])){const scalar=(field:Pick<typeof control,'kind'|'options'|'optionValueType'>)=>field.kind==='number'?0:field.kind==='toggle'?false:field.kind==='select'?field.optionValueType==='number'?Number(field.options?.[0]?.value??0):field.optionValueType==='boolean'?field.options?.[0]?.value==='true':field.options?.[0]?.value??'':field.kind==='json'?{kept:0}: '样本';
 if(control.kind==='classificationPicker'){slots[control.slot??control.id]=JSON.stringify(path);continue;}if(control.kind==='tagsExtensions')continue;
 slots[control.slot??control.id]=control.kind==='group'&&control.group?Array.from({length:Math.max(1,control.group.minItems??0)},()=>control.group!.storage==='scalar'?scalar(control.group!.itemFields[0]):Object.fromEntries(control.group!.itemFields.map(f=>[f.key,scalar(f)]))):scalar(control);}
 const geometry:MultipartGeometry=output.geometry.selected==='Point'?{type:'Point',parts:[{x:0,y:0,z:0}]}:output.geometry.selected==='LineString'?{type:'LineString',parts:[[{x:0,y:0,z:0},{x:10,y:0,z:10}]]}:{type:'Polygon',parts:[[[{x:0,y:0,z:0},{x:10,y:0,z:0},{x:10,y:0,z:10}]]]};
 const step=workflow.steps.find(s=>s.kind==='geometry')!,coords=geometry.type==='Point'?geometry.parts:geometry.type==='LineString'?geometry.parts[0]:geometry.parts[0][0],captured=captureDrawingSnapshot(workflow,slots,{[drawingKey(step)]:{geometry,coordinates:coords,point:coords[0]}});
 const sample=evaluateV3WorkflowOutputs(workflow,captured.slots,{config,world:'zth',classifications:{[output.id]:path},coordinates:{[output.id]:geometry},now:new Date('2026-10-12T00:00:00Z')})[0]?.record;if(!sample)throw Error('无法生成实际编辑试验记录。');
 for(const record of [sample,...matching]) {const draft=hydrateWorkflowEdit(plan,record),result=buildWorkflowEditRecord(plan,record,draft);if(JSON.stringify(result)!==JSON.stringify(record))throw Error(`记录 ${record.ID} 无修改回填输出发生变化。`);}
 return {plan,report:[`三页/单输出/无额外绘制/无启用条件通过`,`保留 ${plan.controls.length} 个模块，移除 ${plan.removed.length} 个仅用于 ID 的模块`,`样本与 ${matching.length} 条现有记录实际回填及无修改输出一致`]};
}
