import JSZip from 'jszip';
import type { CategoryNode, ClassificationPath, ConfigPackageV3, ConfigValidationReport } from './types';
import { classificationPathKey, parentClassificationPath, pathDepth, resolveEffectiveFields, validateConfigPackage } from './runtime';
import { validateNativeStructure } from './nativeContractValidation';
import { createBlankV32Package } from './v32Defaults';
import { migrateConfigToR9 } from './r9Migration';
import { newConfigId } from './renderRuleTemplates';

export type CategoryArtifactPayload={schemaVersion:'cairnmap.category-artifact.v1';contractRevision:9;kind:'node'|'classTree';projectId:string;classCode:string;path:ClassificationPath;nodes:CategoryNode[];ancestors:ClassificationPath[];engineFingerprint:string};
export type CategoryArtifact={payload:CategoryArtifactPayload;sha256:string};
export function categoryStableText(value:unknown):string {if(Array.isArray(value))return '['+value.map(categoryStableText).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+categoryStableText(v)).join(',')+'}';return JSON.stringify(value);}
async function digest(value:unknown):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(categoryStableText(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');}

function checkPayload(payload:CategoryArtifactPayload) {
  if(!payload||payload.schemaVersion!=='cairnmap.category-artifact.v1'||payload.contractRevision!==9||!['node','classTree'].includes(payload.kind)||!payload.classCode||!Array.isArray(payload.nodes)||!payload.nodes.length||payload.nodes.length>2048||!Array.isArray(payload.ancestors))throw Error('文件不是受支持的单分类/Class 树输出。');
  const shape=validateNativeStructure({...createBlankV32Package(),contractRevision:9,nodes:payload.nodes,workflows:[]});if(shape.length)throw Error(shape.map(i=>`${i.path}：${i.message}`).join('\n'));
  if(payload.nodes.some(node=>node.path.class!==payload.classCode)||payload.path?.class!==payload.classCode)throw Error('分类文件包含其他 Class 或范围身份不一致。');
  const ids=payload.nodes.map(node=>node.nodeId),paths=payload.nodes.map(node=>classificationPathKey(node.path));if(new Set(ids).size!==ids.length||new Set(paths).size!==paths.length)throw Error('分类文件内部节点 ID/路径重复。');
  for(const node of payload.nodes){const levels=['class','kind','skind','skind2'] as const;for(let index=1;index<levels.length;index++)if(node.path[levels[index]]&&!node.path[levels[index-1]])throw Error('分类路径层级不连续。');}
  if(payload.kind==='node'){if(payload.nodes.length!==1||classificationPathKey(payload.nodes[0].path)!==classificationPathKey(payload.path)||payload.nodes[0].children.length)throw Error('单分类文件必须只有一个节点且不带从属树。');}
  else {
    if(pathDepth(payload.path)!==1||!payload.nodes.some(node=>pathDepth(node.path)===1))throw Error('Class 树必须包含其 Class 根。');
    for(const node of payload.nodes){const parent=parentClassificationPath(node.path);if(parent&&!paths.includes(classificationPathKey(parent)))throw Error('Class 树中间祖先缺失。');for(const child of node.children)if(!ids.includes(child))throw Error('Class 树存在悬空子节点。');}
    for(const node of payload.nodes){const parent=parentClassificationPath(node.path);if(parent&&!payload.nodes.find(n=>classificationPathKey(n.path)===classificationPathKey(parent))!.children.includes(node.nodeId))throw Error('Class 树父子连接不完整。');}
  }
}
export async function createCategoryArtifact(config:ConfigPackageV3,nodeId:string,kind:'node'|'classTree'):Promise<CategoryArtifact> {
  const report=validateConfigPackage(config);if(!report.valid)throw Error('配置未通过核验，不能导出分类文件。');
  if(config.contractRevision!==9)throw Error('请先迁移并保存 r9，再导出分类。');
  const selected=config.nodes.find(n=>n.nodeId===nodeId);if(!selected)throw Error('请选择要导出的分类。');
  const path=kind==='classTree'?{class:selected.path.class}:selected.path;
  const nodes=structuredClone(kind==='classTree'?config.nodes.filter(n=>n.path.class===path.class):[selected]);if(kind==='node')nodes[0].children=[];
  const ancestors:ClassificationPath[]=[];let parent=parentClassificationPath(path);while(parent){ancestors.unshift(parent);parent=parentClassificationPath(parent);}
  const payload:CategoryArtifactPayload={schemaVersion:'cairnmap.category-artifact.v1',contractRevision:9,kind,projectId:config.projectId,classCode:path.class,path,nodes,ancestors,engineFingerprint:await digest(config.engine)};checkPayload(payload);return {payload,sha256:await digest(payload)};
}
export async function categoryArtifactBlob(artifact:CategoryArtifact,zip=true):Promise<Blob> {
  checkPayload(artifact.payload);if(artifact.sha256!==await digest(artifact.payload))throw Error('分类内容摘要无效。');
  if(!zip)return new Blob([JSON.stringify(artifact,null,2)],{type:'application/json'});
  const archive=new JSZip();archive.file('category.json',JSON.stringify(artifact.payload));archive.file('manifest.json',JSON.stringify({schemaVersion:'cairnmap.category-manifest.v1',sha256:artifact.sha256}));return archive.generateAsync({type:'blob',compression:'DEFLATE'});
}
export async function readCategoryArtifact(file:File):Promise<CategoryArtifact> {
  if(file.size>50*1024*1024)throw Error('分类文件超过 50 MiB。');
  let artifact:CategoryArtifact;
  if(file.name.toLowerCase().endsWith('.zip')) {const zip=await JSZip.loadAsync(await file.arrayBuffer()),body=zip.file('category.json'),manifest=zip.file('manifest.json');if(!body||!manifest)throw Error('ZIP 不是分类输出文件。');const header=JSON.parse(await manifest.async('string'));if(header.schemaVersion!=='cairnmap.category-manifest.v1')throw Error('分类 manifest 类型无效。');artifact={payload:JSON.parse(await body.async('string')),sha256:header.sha256};}
  else if(file.name.toLowerCase().endsWith('.json'))artifact=JSON.parse(await file.text());else throw Error('只接受分类 JSON/ZIP。');
  checkPayload(artifact.payload);if(artifact.sha256!==await digest(artifact.payload))throw Error('分类文件摘要不一致，拒绝导入。');return artifact;
}
export type CategoryImportResult={config:ConfigPackageV3;selectedId:string;classCode:string;kind:'node'|'classTree';conflicts:string[];changes:string[];report:ConfigValidationReport};

/** Candidate only: never mutates the saved package or merges old tree nodes. */
export function prepareCategoryImport(input:ConfigPackageV3,artifact:CategoryArtifact,fixConflicts=false):CategoryImportResult {
  checkPayload(artifact.payload);const config=input.contractRevision<9?migrateConfigToR9(input):structuredClone(input),payload=artifact.payload,changes:string[]=[],conflicts:string[]=[];
  if(payload.kind==='node') {
    let parent=parentClassificationPath(payload.path);while(parent){if(!config.nodes.some(n=>classificationPathKey(n.path)===classificationPathKey(parent!)))throw Error(parent.kind?`不存在上级 ${classificationPathKey(parent)}，请选择导入整体分类树或逐级上传保存`:'不存在上级Class，请选择导入整体分类树或逐级上传保存');parent=parentClassificationPath(parent);}
  }
  const incoming=structuredClone(payload.nodes),old=config.nodes.filter(n=>payload.kind==='classTree'?n.path.class===payload.classCode:classificationPathKey(n.path)===classificationPathKey(payload.path));
  const retained=config.nodes.filter(n=>!old.some(item=>item.nodeId===n.nodeId)),used=new Set(retained.map(n=>n.nodeId)),idMap=new Map<string,string>();
  for(const node of incoming){const previous=old.find(n=>classificationPathKey(n.path)===classificationPathKey(node.path));let id=previous?.nodeId??node.nodeId;if(used.has(id)){conflicts.push(`节点 ID 冲突：${id}`);id=newConfigId('node');}used.add(id);idMap.set(node.nodeId,id);node.nodeId=id;}
  for(const node of incoming)node.children=node.children.map(id=>idMap.get(id)??id);
  if(payload.kind==='node')incoming[0].children=old[0]?.children??[];
  const fieldIds=new Set(retained.flatMap(n=>n.fields.map(f=>f.fieldId)));
  for(const node of incoming){const parent=parentClassificationPath(node.path),upstream=parent?resolveEffectiveFields({...config,nodes:[...retained,...incoming]},parent).filter(f=>f.inheritance==='sealed'):[];
    for(const field of node.fields){const fixed=upstream.find(f=>f.key===(field.overrideOf??field.key));if(fixed){const {fieldId:_a,overrideOf:_b,...local}=field,{fieldId:_c,overrideOf:_d,...inherited}=fixed;if(categoryStableText(local)!==categoryStableText(inherited))conflicts.push(`固定继承字段冲突：${classificationPathKey(node.path)} / ${field.key}`);}}
    node.fields=node.fields.filter(field=>{const fixed=upstream.find(f=>f.key===(field.overrideOf??field.key));if(!fixed)return true;const {fieldId:_a,overrideOf:_b,...local}=field,{fieldId:_c,overrideOf:_d,...inherited}=fixed;return !fixConflicts&&categoryStableText(local)!==categoryStableText(inherited);});
    const previous=old.find(n=>classificationPathKey(n.path)===classificationPathKey(node.path));
    for(const field of node.fields){const same=previous?.fields.find(f=>f.key===field.key);if(same)field.fieldId=same.fieldId;else if(fieldIds.has(field.fieldId)){conflicts.push(`字段 ID 冲突：${field.fieldId}`);field.fieldId=newConfigId('field');}fieldIds.add(field.fieldId);}
  }
  for(const node of retained)node.children=node.children.map(id=>old.find(n=>n.nodeId===id)?incoming.find(n=>classificationPathKey(n.path)===classificationPathKey(old.find(n=>n.nodeId===id)!.path))?.nodeId??id:id);
  config.nodes=[...retained,...incoming];
  if(payload.kind==='node'){const parent=parentClassificationPath(payload.path),owner=parent?config.nodes.find(n=>classificationPathKey(n.path)===classificationPathKey(parent)):undefined;if(owner&&!owner.children.includes(incoming[0].nodeId))owner.children.push(incoming[0].nodeId);}
  const newPaths=new Set(incoming.map(n=>classificationPathKey(n.path)));for(const node of old)if(!newPaths.has(classificationPathKey(node.path)))changes.push(`删除 ${classificationPathKey(node.path)}`);for(const node of incoming)changes.push(`${old.some(n=>classificationPathKey(n.path)===classificationPathKey(node.path))?'替换':'新增'} ${classificationPathKey(node.path)}`);
  return {config,selectedId:incoming.find(n=>classificationPathKey(n.path)===classificationPathKey(payload.path))!.nodeId,classCode:payload.classCode,kind:payload.kind,conflicts,changes,report:validateConfigPackage(config)};
}

/** Replace exactly this Class, using current global/other-Class content. */
export function prepareClassTreeCommit(current:ConfigPackageV3,baseline:ConfigPackageV3,staged:ConfigPackageV3,classCode:string):ConfigPackageV3 {
  if(current.contractRevision<9)current=migrateConfigToR9(current);
  if(baseline.contractRevision<9)baseline=migrateConfigToR9(baseline);
  const tree=(config:ConfigPackageV3)=>config.nodes.filter(node=>node.path.class===classCode);
  if(categoryStableText(tree(current))!==categoryStableText(tree(baseline)))throw Error('主配置中的同 Class 树已发生变化，请重新导入/核验，未覆盖较新的修改。');
  const outside=(config:ConfigPackageV3)=>({...config,nodes:config.nodes.filter(node=>node.path.class!==classCode)});
  if(categoryStableText(outside(staged))!==categoryStableText(outside(baseline)))throw Error('暂存 Class 树修改了范围外内容，不能注入。');
  const nodes=tree(staged);if(!nodes.some(node=>pathDepth(node.path)===1))throw Error('暂存树缺少 Class 根。');
  const candidate={...current,nodes:[...current.nodes.filter(node=>node.path.class!==classCode),...structuredClone(nodes)]};
  const report=validateConfigPackage(candidate);if(!report.valid)throw Error(report.issues.filter(issue=>issue.severity==='error').map(issue=>`${issue.path}：${issue.message}`).join('\n'));return candidate;
}
