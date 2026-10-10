import type { WorkflowDefinition } from './types';
import { isSafeWorkflowTarget } from './workflowExpression';

export type AnnotationRow = { key:string; group?:string; type:'text'|'number'|'bool'|'null'|'json'; value:unknown };
export type OutputAnnotations = { tags?:AnnotationRow[]; extensions?:AnnotationRow[]; advanced?:{tags?:unknown;extensions?:unknown}; advancedText?:{tags?:string;extensions?:string} };
export type WorkflowAnnotations = Record<string,OutputAnnotations>;
export const blankAnnotation = (extension=false):AnnotationRow => ({key:'',...(extension?{group:''}:{}),type:'text',value:''});
const plain = (value:unknown):value is Record<string,unknown> => Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
export function annotationEqual(left:unknown,right:unknown):boolean {
  if(Object.is(left,right))return true;
  if(Array.isArray(left)&&Array.isArray(right))return left.length===right.length&&left.every((value,index)=>annotationEqual(value,right[index]));
  if(plain(left)&&plain(right))return Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>Object.prototype.hasOwnProperty.call(right,key)&&annotationEqual(left[key],right[key]));
  return false;
}
/** Custom values and automatic mappings merge without silently replacing either. */
export function mergeAnnotations(target:Record<string,unknown>,incoming:Record<string,unknown>,prefix=''):void {
  for(const [key,value] of Object.entries(incoming)) {
    const path=prefix?`${prefix}.${key}`:key;
    if(!isSafeWorkflowTarget(path)||['__proto__','prototype','constructor'].includes(key))throw new Error(`无效标签/扩展路径：${path}`);
    if(!Object.prototype.hasOwnProperty.call(target,key)){target[key]=structuredClone(value);continue;}
    if(plain(target[key])&&plain(value)){mergeAnnotations(target[key] as Record<string,unknown>,value,path);continue;}
    if(!annotationEqual(target[key],value))throw new Error(`标签/扩展 ${path} 存在不同值：请编辑已有输入或删除重复行。`);
  }
}
function rowValue(row:AnnotationRow):unknown {
  if(row.type==='null')return null;
  if(row.type==='bool') {if(![true,false,'true','false'].includes(row.value as boolean))throw new Error('布尔值必须选择是或否。');return row.value===true||row.value==='true';}
  if(row.type==='number'){if(row.value==null||String(row.value).trim()===''||!Number.isFinite(Number(row.value)))throw new Error('数值必须是有限数字。');return Number(row.value);}
  if(row.type==='json')return typeof row.value==='string'?JSON.parse(row.value):structuredClone(row.value);
  return String(row.value??'').trim();
}
export function assembleAnnotations(value:OutputAnnotations|undefined):{tags:Record<string,unknown>;extensions:Record<string,unknown>} {
  const result={tags:{},extensions:{}} as {tags:Record<string,unknown>;extensions:Record<string,unknown>};
  for(const namespace of ['tags','extensions'] as const) {
    const text=value?.advancedText?.[namespace];
    const advanced=text?.trim()?JSON.parse(text):value?.advanced?.[namespace];
    if(advanced!==undefined){if(!plain(advanced))throw new Error(`${namespace} 高级数据必须为对象。`);mergeAnnotations(result[namespace],advanced,namespace);}
    for(const [index,row] of (value?.[namespace]??[]).entries()) {
      const key=row.key.trim(),group=row.group?.trim()??'';
      if(row.type!=='null'&&(row.value==null||String(row.value).trim()===''))continue;
      if(!key&&!group&&row.type==='text'&&!row.value)continue;
      if(!key||namespace==='extensions'&&!group)throw new Error(`${namespace} 第 ${index+1} 行缺少${!key?'字段名':'组名'}。`);
      if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)||namespace==='extensions'&&!/^[A-Za-z][A-Za-z0-9_]*$/.test(group))throw new Error(`${namespace} 第 ${index+1} 行的组名/字段名必须以字母开头。`);
      try {mergeAnnotations(result[namespace],namespace==='tags'?{[key]:rowValue(row)}:{[group]:{[key]:rowValue(row)}},namespace);}
      catch(error){throw new Error(`${namespace} 第 ${index+1} 行：${error instanceof Error?error.message:'值无效'}`);}
    }
  }
  return result;
}
export function annotationsForOutput(workflow:WorkflowDefinition,slots:Record<string,unknown>,outputId:string) {
  const result=assembleAnnotations(undefined);
  for(const control of workflow.steps.flatMap(step=>step.controls??[]).filter(control=>control.kind==='tagsExtensions')) {
    const stored=slots[control.id] as WorkflowAnnotations|undefined;
    const next=assembleAnnotations(stored?.[outputId]);
    mergeAnnotations(result.tags,next.tags,'tags');mergeAnnotations(result.extensions,next.extensions,'extensions');
  }
  return result;
}
