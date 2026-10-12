import {SCHEMA_TRP_TRADE,projectRegistryScene,type ProjectedRegistryScene} from '../components/Common/workflowEditorRegistry';
import {parseFeatureInfoByRegistry,mergeEditorDraftIntoFeatureInfo,CLASSIFICATION_DRAFT_KEY,type WorkflowEditorDraftValues,type WorkflowEditorUnparsedEntry} from '../components/Common/workflowEditorParser';
import {annotationEqual,type WorkflowAnnotations} from './workflowAnnotations';
import {residualAnnotations,buildWorkflowEditRecord,recordClassification,assertEditIdentity,type WorkflowEditPlan} from './workflowEditing';
import {validateExternalEditBinding} from './externalEditRegistry';
import type {ConfigPackageV3,WorkflowDefinition} from './types';
import {hasCategoryNode,hasDescendants,pathMatchesScope,resolveGeometryProfile} from './runtime';
import {validateV3WorkflowRecords} from './V3WorkflowRunner';
import {readMultipartGeometry,validateMultipartGeometry,withCanonicalMultipartGeometry,type MultipartGeometry} from '../core/geometry/multipartGeometry';
export type TrpExternalEditSession={original:Record<string,unknown>;view:ProjectedRegistryScene;values:WorkflowEditorDraftValues;initialValues:WorkflowEditorDraftValues;unparsed:WorkflowEditorUnparsedEntry[];initialUnparsed:WorkflowEditorUnparsedEntry[];annotations:WorkflowAnnotations;initialAnnotations:WorkflowAnnotations;annotationPlan:WorkflowEditPlan;originalGeometry:MultipartGeometry};
export function createTrpExternalEditSession(config:ConfigPackageV3,workflow:WorkflowDefinition,initialRecord:Record<string,unknown>):TrpExternalEditSession {
 const errors=validateExternalEditBinding(workflow);if(errors.length)throw Error(errors.join('\n'));
 const path=recordClassification(initialRecord),scope=workflow.editor!.scope??workflow.target!;if(!pathMatchesScope(path,scope)||!hasCategoryNode(config,path))throw Error('记录不属于登记的 TRP 编辑范围。');
 const geometry=readMultipartGeometry(initialRecord,'Point');if(geometry.error||!geometry.geometry)throw Error(geometry.error??'TRP 缺少点几何。');
 const view=projectRegistryScene(SCHEMA_TRP_TRADE,'editor'),original=structuredClone(initialRecord),parsed=parseFeatureInfoByRegistry(original,view),annotationControl={id:'trp-external-edit-annotations',kind:'tagsExtensions' as const,columns:1 as const,systemManaged:true,label:{zh:'标签与扩展',en:''},tagsExtensions:{tagsEnabled:true,extensionsEnabled:true}};
 const container:WorkflowDefinition={id:'trp-edit-annotations',label:{zh:'标签与扩展',en:''},mode:'composed',steps:[{id:'annotations',kind:'form',label:{zh:'',en:''},controls:[annotationControl]}],outputs:[{id:'trp-edit-output',classification:scope,geometry:{selected:'Point'},assignments:view.fields.map(field=>({id:field.path,target:field.path,expression:'null'}))}]};
 const annotationPlan:WorkflowEditPlan={workflow:container,scope,controls:[annotationControl],removed:[],bindings:[]},annotations=residualAnnotations(annotationPlan,original);
 return {original,view,values:parsed.values,initialValues:structuredClone(parsed.values),unparsed:parsed.unparsedEntries.filter(entry=>!entry.path.startsWith('tags.')&&!entry.path.startsWith('extensions.')),initialUnparsed:structuredClone(parsed.unparsedEntries),annotations,initialAnnotations:structuredClone(annotations),annotationPlan,originalGeometry:geometry.geometry};
}
/** Registered finished editor: no standard three-page conversion occurs. */
export function prepareTrpExternalEdit(config:ConfigPackageV3,workflow:WorkflowDefinition,session:TrpExternalEditSession,geometry:MultipartGeometry,world:string,editor:string,others:Record<string,unknown>[],now=new Date()):Record<string,unknown> {
 const errors=validateExternalEditBinding(workflow);if(errors.length)throw Error(errors.join('\n'));const geometryError=validateMultipartGeometry(geometry);if(geometry.type!=='Point'||geometryError)throw Error(geometryError??'TRP 只能使用点几何。');
 const changed=session.view.fields.filter(f=>!annotationEqual(session.values[f.path],session.initialValues[f.path])||f.path==='Trade'&&session.original.trade!==undefined&&session.original.Trade===undefined);
 const classificationChanged=!annotationEqual(session.values[CLASSIFICATION_DRAFT_KEY],session.initialValues[CLASSIFICATION_DRAFT_KEY]);
 let record=mergeEditorDraftIntoFeatureInfo({originalFeatureInfo:session.original,view:{...session.view,classification:classificationChanged?session.view.classification:undefined,fields:changed,groups:[]},draftValues:session.values});
 for(const field of changed)if(field.control==='number'&&record[field.path]!==undefined&&record[field.path]!==null&&record[field.path]!==''){const number=Number(record[field.path]);if(!Number.isFinite(number))throw Error(`${field.label} 必须为有限数值。`);record[field.path]=number;}
 for(const entry of session.unparsed)if(!annotationEqual(entry.value,session.initialUnparsed.find(item=>item.path===entry.path)?.value)){const parts=entry.path.split('.');if(parts.some(p=>['__proto__','prototype','constructor'].includes(p)))throw Error('危险未解析字段路径。');let node=record;for(const key of parts.slice(0,-1)){node[key]??={};if(!node[key]||typeof node[key]!=='object'||Array.isArray(node[key]))throw Error('未解析字段路径发生冲突。');node=node[key] as Record<string,unknown>;}node[parts[parts.length-1]]=structuredClone(entry.value);}
 const control=session.annotationPlan.controls[0],annotationDraft={slots:{EDIT_ID:record.ID,[control.id]:session.annotations},initialSlots:{EDIT_ID:record.ID,[control.id]:session.initialAnnotations},classification:recordClassification(record)};
 record=buildWorkflowEditRecord(session.annotationPlan,record,annotationDraft);
 const path=recordClassification(record),scope=workflow.editor!.scope??workflow.target!;
 if(!pathMatchesScope(path,scope)||!hasCategoryNode(config,path)||hasDescendants(config,path)||!resolveGeometryProfile(config,path,'Point')?.enabled)throw Error('请选择编辑范围内的最终 TRP 分类。');
 assertEditIdentity(record,session.original,world,others);record=withCanonicalMultipartGeometry(record,geometry);
 const output={id:'external-trp-edit',classification:scope,geometry:{selected:'Point' as const},assignments:[]};const issues=validateV3WorkflowRecords(config,{...workflow,mode:'composed',outputs:[output]},[{outputId:output.id,classification:path,geometry:'Point',record}]);if(issues.length)throw Error(issues.map(i=>i.message).join('\n'));
 if(!editor.trim())throw Error('编辑人不能为空。');record.ModifityBy=editor.trim();record.ModifityTime=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;return record;
}
