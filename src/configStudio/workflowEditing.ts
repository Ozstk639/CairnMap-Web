import type {ClassificationPath,ConfigPackageV3,WorkflowControl,WorkflowDefinition} from './types';
import {annotationEqual,annotationsForOutput,type AnnotationRow,type WorkflowAnnotations} from './workflowAnnotations';
import {parseWorkflowExpression,workflowExpressionTokens,evaluateWorkflowExpression,isSafeWorkflowTarget} from './workflowExpression';
import {pathMatchesScope,classificationPathKey,readRecordPath,resolveSelectableFields} from './runtime';
import {coerceWorkflowValues} from './workflowValues';
import {normalizeRuleSourceWorldId} from '../components/Rules/data/ruleDataSources';
import {readMultipartGeometry,type MultipartGeometry} from '../core/geometry/multipartGeometry';
import {captureDrawingSnapshot,drawingKey} from './workflowDrawing';
export type WorkflowEditPlan={workflow:WorkflowDefinition;scope:ClassificationPath;controls:WorkflowControl[];removed:WorkflowControl[];bindings:Array<{slot:string;target:string}>};
export type WorkflowEditDraft={slots:Record<string,unknown>;classification:ClassificationPath;initialSlots:Record<string,unknown>};
export const recordClassification=(record:Record<string,unknown>):ClassificationPath=>({class:String(record.Class??''),...(record.Kind?{kind:String(record.Kind)}:{}),...(record.SKind??record.Skind?{skind:String(record.SKind??record.Skind)}:{}),...(record.SKind2??record.Skind2?{skind2:String(record.SKind2??record.Skind2)}:{})});
export const isQuickMappingWorkflow=(workflow:WorkflowDefinition)=>workflow.quickMapping!==false&&!workflow.editor?.dedicated&&workflow.external?.purpose!=='edit';
export function compileWorkflowEditPlan(workflow:WorkflowDefinition,config:ConfigPackageV3):WorkflowEditPlan {
 const errors:string[]=[];
 if(workflow.mode!=='composed')throw Error('外部方案通过已登记的编辑接口执行，不转换标准工作流。');
 if(workflow.steps.length!==3||workflow.steps.map(s=>s.kind).join(',')!=='actor,form,geometry')errors.push('必须恰为填写人、信息收集、要素绘制三页。');
 const drawings=workflow.steps.filter(s=>s.kind==='geometry');
 if(drawings.some(s=>s.geometryRole==='auxiliary'||s.drawing?.auxiliaryPoints?.length))errors.push('不能包含额外绘制。');
 if(workflow.outputs.length!==1||drawings.length!==1||drawings[0]?.outputId!==workflow.outputs[0]?.id)errors.push('必须只有一个明确绑定输出的要素绘制。');
 if(workflow.steps.some(s=>s.when||s.controls?.some(c=>c.when||c.group?.itemFields.some(f=>'when' in f&&f.when)))||workflow.outputs.some(o=>o.when||o.assignments.some(a=>a.when)))errors.push('不能包含输入、页面或输出的启用条件。');
 if(errors.length)throw Error(errors.join('\n'));
 const output=workflow.outputs[0],scope=workflow.editor?.scope??output.classification;
 if(!pathMatchesScope(scope,output.classification)||!config.nodes.some(n=>classificationPathKey(n.path)===classificationPathKey(scope)))throw Error('编辑作用范围必须为输出范围内的实际分类。');
 const controls=workflow.steps.flatMap(s=>s.controls??[]),tokens=new Set(controls.flatMap(c=>c.slot?[c.slot]:[])),needed=new Set<string>(),idOnly=new Set<string>(),bindings:Array<{slot:string;target:string}>=[];
 for(const assignment of output.assignments){const ast=parseWorkflowExpression(assignment.expression),used=workflowExpressionTokens(ast).filter(t=>tokens.has(t));if(assignment.target==='ID')used.forEach(t=>idOnly.add(t));else {used.forEach(t=>needed.add(t));if(ast.kind==='token'&&tokens.has(ast.name))bindings.push({slot:ast.name,target:assignment.target});}}
 for(const step of drawings){if(step.drawing?.heightSlot)needed.add(step.drawing.heightSlot);for(const binding of step.drawing?.bindings??[])if(binding.value==='height'&&step.drawing?.heightSlot)bindings.push({slot:step.drawing.heightSlot,target:binding.target});}
 for(const control of controls)for(const condition of control.requiredWhen??[])for(const token of conditionTokens(condition))if(tokens.has(token))needed.add(token);
 const explicit=workflow.editor?.backfill??[];for(const binding of explicit){if(!tokens.has(binding.slot)||!isSafeWorkflowTarget(binding.target)||!resolveSelectableFields(config,scope).some(f=>f.key===binding.target)||['World','Class','Kind','SKind','SKind2','Creator','CreateBy','CreateTime'].includes(binding.target))errors.push(`回填映射 ${binding.slot} → ${binding.target} 无效。`);else bindings.push({...binding});}
 const removed=controls.filter(c=>c.slot&&idOnly.has(c.slot)&&!needed.has(c.slot)),kept=controls.filter(c=>!removed.includes(c));
 for(const control of kept)if(control.slot&&!bindings.some(b=>b.slot===control.slot)&&!['classificationPicker','tagsExtensions'].includes(control.kind))errors.push(`控件 ${control.slot}（${control.label.zh}）缺少可逆直接赋值或明确回填映射。`);
 if(errors.length)throw Error(errors.join('\n'));
 return {workflow:structuredClone(workflow),scope,controls:structuredClone(kept),removed:structuredClone(removed),bindings:bindings.filter((b,i,all)=>all.findIndex(x=>x.slot===b.slot&&x.target===b.target)===i)};
}
function conditionTokens(condition:import('./types').WorkflowValueCondition):string[]{return [condition.token,...(condition.all??condition.any??[]).flatMap(conditionTokens)].filter(Boolean);}
function setPath(record:Record<string,unknown>,path:string,value:unknown){if(!isSafeWorkflowTarget(path))throw Error('非法字段路径');let node=record;const parts=path.split('.');for(const key of parts.slice(0,-1)){if(node[key]==null)node[key]={};if(typeof node[key]!=='object'||Array.isArray(node[key]))throw Error(`字段路径 ${path} 与现有数据冲突。`);node=node[key] as Record<string,unknown>;}if(value===undefined)delete node[parts[parts.length-1]];else node[parts[parts.length-1]]=structuredClone(value);}
function removePath(record:Record<string,unknown>,path:string){const parts=path.split('.');let node=record;for(const key of parts.slice(0,-1)){if(!node[key]||typeof node[key]!=='object'||Array.isArray(node[key]))return;node=node[key] as Record<string,unknown>;}delete node[parts[parts.length-1]];}
const row=(key:string,value:unknown,group?:string):AnnotationRow=>({key,...(group?{group}:{}),type:value===null?'null':typeof value==='number'?'number':typeof value==='boolean'?'bool':typeof value==='object'?'json':'text',value:structuredClone(value)});
export function residualAnnotations(plan:WorkflowEditPlan,record:Record<string,unknown>):WorkflowAnnotations {
 const residual=structuredClone({tags:record.tags??{},extensions:record.extensions??{}}) as Record<string,unknown>;
 for(const a of plan.workflow.outputs[0].assignments)if(a.target.startsWith('tags.')||a.target.startsWith('extensions.'))removePath(residual,a.target);
 const tags=Object.entries((residual.tags??{}) as Record<string,unknown>).map(([key,value])=>row(key,value)),extensions=Object.entries((residual.extensions??{}) as Record<string,Record<string,unknown>>).flatMap(([group,values])=>Object.entries(values??{}).map(([key,value])=>row(key,value,group)));
 return {[plan.workflow.outputs[0].id]:{tags,extensions}};
}
export function hydrateWorkflowEdit(plan:WorkflowEditPlan,record:Record<string,unknown>):WorkflowEditDraft {
 const classification=recordClassification(record);if(!pathMatchesScope(classification,plan.scope))throw Error('记录不在编辑工作流的作用范围内。');
 const slots:Record<string,unknown>={EDIT_ID:record.ID};
 for(const control of plan.controls){if(control.kind==='classificationPicker'){slots[control.slot??control.id]=JSON.stringify(classification);continue;}if(control.kind==='tagsExtensions'){slots[control.id]=residualAnnotations(plan,record);continue;}
   if(!control.slot)continue;const values=plan.bindings.filter(b=>b.slot===control.slot).map(b=>readRecordPath(record,b.target));if(values.some(v=>!annotationEqual(v,values[0])))throw Error(`槽位 ${control.slot} 的多个回填目标具有不同值，不能猜测。`);slots[control.slot]=structuredClone(values[0]);
 }
 const draft={slots,classification,initialSlots:structuredClone(slots)},filled=workflowEditSlots(plan,record,draft);
 return {...draft,slots:filled,initialSlots:structuredClone(filled)};
}
export function workflowEditSlots(plan:WorkflowEditPlan,original:Record<string,unknown>,draft:WorkflowEditDraft,supplied?:MultipartGeometry):Record<string,unknown> {
 const geometry=supplied??readMultipartGeometry(original,plan.workflow.outputs[0].geometry.selected).geometry,step=plan.workflow.steps.find(s=>s.kind==='geometry');if(!geometry||!step)return {...draft.slots};
 const coords=geometry.type==='Point'?geometry.parts:geometry.type==='LineString'?geometry.parts[0]:geometry.parts[0][0];
 const result=captureDrawingSnapshot(plan.workflow,draft.slots,{[drawingKey(step)]:{geometry,coordinates:coords,point:coords[0]}}).slots;
 const controls=new Set(plan.controls.flatMap(c=>c.slot?[c.slot]:[]));
 // Geometry adds derived tokens; hydration never normalizes existing input values.
 return {...draft.slots,...Object.fromEntries(Object.entries(result).filter(([key])=>!controls.has(key)))};
}
/** Patch the original, and never run creation ID assembly or default cleanup. */
export function buildWorkflowEditRecord(plan:WorkflowEditPlan,original:Record<string,unknown>,draft:WorkflowEditDraft,options:{geometry?:MultipartGeometry}={}):Record<string,unknown> {
 const record=structuredClone(original),slots=coerceWorkflowValues(plan.workflow,workflowEditSlots(plan,original,draft,options.geometry)),initial=draft.initialSlots;
 const id=String(draft.slots.EDIT_ID??'').trim();if(!id)throw Error('ID 不能为空。');record.ID=id;
 if(!pathMatchesScope(draft.classification,plan.scope))throw Error('不能将要素改为工作流作用范围之外的分类。');
 if(!annotationEqual(draft.classification,recordClassification(original))){for(const [key,value] of [['Class',draft.classification.class],['Kind',draft.classification.kind],['SKind',draft.classification.skind],['SKind2',draft.classification.skind2]] as const)if(value)record[key]=value;else delete record[key];}
 const system={ID:id,World:original.World,Class:draft.classification.class,Kind:draft.classification.kind??'',Skind:draft.classification.skind??'',Skind2:draft.classification.skind2??'',Creator:original.CreateBy??''};
 Object.assign(system,Object.fromEntries(Object.entries(system).map(([key,value])=>[`${key}_1`,value])));
 const geometryDirty=Boolean(options.geometry&&!annotationEqual(options.geometry,readMultipartGeometry(original,plan.workflow.outputs[0].geometry.selected).geometry));
 const geometryTokens=new Set(plan.workflow.steps.flatMap(s=>[s.drawing?.captureSlot,s.drawing?.pointSlot]).filter((slot):slot is string=>Boolean(slot)).flatMap(slot=>[slot,`${slot}_X`,`${slot}_Y`,`${slot}_Z`,`${slot}_HEIGHT`]));
 const beforePath=recordClassification(original),classificationDirty=!annotationEqual(draft.classification,beforePath);
 for(const assignment of plan.workflow.outputs[0].assignments)if(assignment.target!=='ID'){
   const tokens=workflowExpressionTokens(parseWorkflowExpression(assignment.expression));if(tokens.some(t=>plan.controls.some(c=>c.slot===t)&&!annotationEqual(draft.slots[t],initial[t])||geometryDirty&&geometryTokens.has(t)||/^ID(?:_1)?$/.test(t)&&id!==String(original.ID)||classificationDirty&&/^(Class|Kind|Skind|Skind2)(?:_1)?$/.test(t)))setPath(record,assignment.target,evaluateWorkflowExpression(assignment.expression,slots,system));
 }
 for(const binding of plan.bindings)if(plan.workflow.steps.some(step=>step.drawing?.heightSlot===binding.slot)&&!annotationEqual(draft.slots[binding.slot],initial[binding.slot]))setPath(record,binding.target,slots[binding.slot]);
 for(const step of plan.workflow.steps)for(const binding of step.drawing?.bindings??[])if(binding.outputId===plan.workflow.outputs[0].id&&(geometryDirty||step.drawing?.heightSlot&&!annotationEqual(draft.slots[step.drawing.heightSlot],initial[step.drawing.heightSlot]))){const capture=step.drawing?.captureSlot,value=capture?slots[binding.value==='height'?`${capture}_HEIGHT`:capture]:binding.value==='height'&&step.drawing?.heightSlot?slots[step.drawing.heightSlot]:undefined;if(value!==undefined)setPath(record,binding.target,value);}
 for(const control of plan.controls.filter(c=>c.kind==='tagsExtensions'))if(!annotationEqual(draft.slots[control.id],initial[control.id])) {
   const before=annotationsForOutput({...plan.workflow,steps:[{id:'annotations',kind:'form',label:{zh:'',en:''},controls:[control]}]},initial,plan.workflow.outputs[0].id),after=annotationsForOutput({...plan.workflow,steps:[{id:'annotations',kind:'form',label:{zh:'',en:''},controls:[control]}]},draft.slots,plan.workflow.outputs[0].id);
   for(const namespace of ['tags','extensions'] as const){for(const [key,value] of Object.entries(before[namespace]))if(namespace==='extensions'&&value&&typeof value==='object')for(const child of Object.keys(value))removePath(record,`${namespace}.${key}.${child}`);else removePath(record,`${namespace}.${key}`);for(const [key,value] of Object.entries(after[namespace]))if(namespace==='extensions'&&value&&typeof value==='object')for(const [child,data]of Object.entries(value))setPath(record,`${namespace}.${key}.${child}`,data);else setPath(record,`${namespace}.${key}`,value);}
 }
 return record;
}
export function findEditingWorkflow(config:ConfigPackageV3,record:Record<string,unknown>):WorkflowDefinition|undefined {
 const path=recordClassification(record),candidates=config.workflows.filter(w=>w.editor?.enabled&&pathMatchesScope(path,w.editor.scope??w.outputs[0]?.classification??w.target??{class:''})).sort((a,b)=>classificationPathKey(b.editor?.scope??b.outputs[0]?.classification??b.target!).split('/').length-classificationPathKey(a.editor?.scope??a.outputs[0]?.classification??a.target!).split('/').length);
 if(candidates[1]&&classificationPathKey(candidates[0].editor?.scope??candidates[0].outputs[0]?.classification??candidates[0].target!)===classificationPathKey(candidates[1].editor?.scope??candidates[1].outputs[0]?.classification??candidates[1].target!))throw Error('此范围存在多个编辑工作流，请在工作台解决重复路由。');return candidates[0];
}
export function assertEditIdentity(record:Record<string,unknown>,original:Record<string,unknown>,world:string,others:Record<string,unknown>[]) {
 const normalized=normalizeRuleSourceWorldId(world);if(normalizeRuleSourceWorldId(String(original.World??world))!==normalized||normalizeRuleSourceWorldId(String(record.World??world))!==normalized)throw Error('编辑世界已切换，请返回原世界继续或放弃草稿。');
 if(String(record.ID)!==String(original.ID)&&others.some(r=>normalizeRuleSourceWorldId(String(r.World??world))===normalized&&String(r.ID)===String(record.ID)))throw Error(`ID ${record.ID} 已被其他要素占用。`);
 // Rewriting arbitrary navigation/reference paths cannot be inferred safely.
 if(String(record.ID)!==String(original.ID)&&others.some(r=>JSON.stringify(r,(key,value)=>key==='ID'?undefined:value).includes(JSON.stringify(String(original.ID)))))throw Error('其他记录引用原 ID，无法安全自动改写所有引用；请保留 ID 或先调整引用。');
}
export function reverseWorkflowEditEndpoints(plan:WorkflowEditPlan,draft:WorkflowEditDraft):WorkflowEditDraft {
 const start=plan.bindings.find(b=>b.target==='startplf'),end=plan.bindings.find(b=>b.target==='endplf');if(!start||!end)return draft;
 return {...draft,slots:{...draft.slots,[start.slot]:draft.slots[end.slot],[end.slot]:draft.slots[start.slot]}};
}
