import type { CategoryNode, ConfigPackageV3, FieldDefinition, GeometryKind, LabelAnchor } from './types';
import { classificationPathKey, fieldScope, inheritanceControls, pathDepth, resolveCardConfiguration, resolveCategoryNodes, resolveEffectiveFields, resolveGeometryProfile, resolveSelectableFields, validateConfigPackage } from './runtime';
import { editableGeometryProfile, newConfigId } from './renderRuleTemplates';
import { migrateConfigToR9 } from './r9Migration';

export type CategoryInitialization = {
  parentId?:string; code:string; labels:{zh:string;en:string};
  mode:'parent'|'template'|'blank';sourceId?:string;
  sync:{fields:boolean;geometry:boolean;display:boolean;card:boolean};
  geometry:GeometryKind;multiple:boolean;anchor:LabelAnchor;
};
export type CategoryInitializationReport={actions:string[];renamed:Record<string,string>};
const reserved=new Set(['World','Class','Kind','SKind','SKind2','Skind','Skind2','Type','ID','CreateBy','CreateTime','ModifityBy','ModifityTime']);
function semanticField(field:FieldDefinition):string {
  const {fieldId:_id,overrideOf:_override,scope:_scope,...definition}=field;
  const stable=(value:unknown):string=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+stable(item)).join(',')+'}':JSON.stringify(value);
  return stable({...definition,scope:fieldScope(field)});
}
function pathRename(path:string,renamed:Record<string,string>):string {
  const key=Object.keys(renamed).sort((a,b)=>b.length-a.length).find(key=>path===key||path.startsWith(key+'.'));
  return key?renamed[key]+path.slice(key.length):path;
}
/** Rewrite only real local field references, never titles or remote match fields. */
export function rewriteCategoryReferences<T>(value:T,renamed:Record<string,string>):T {
  const visit=(item:unknown,key='',remote=false):unknown=>{
    if(typeof item==='string')return !remote&&['field','source','nameSource','colorSource','targetIdField','parentReferenceField'].includes(key)?pathRename(item,renamed):item;
    if(Array.isArray(item))return item.map(child=>typeof child==='string'&&key==='fallbackSources'?pathRename(child,renamed):visit(child,key,remote));
    if(!item||typeof item!=='object')return item;
    return Object.fromEntries(Object.entries(item).map(([name,child])=>[name,name==='fallbackValueFormats'&&child&&typeof child==='object'?Object.fromEntries(Object.entries(child).map(([source,format])=>[pathRename(source,renamed),format])):visit(child,name,remote||name==='relation'||name==='reference'||name==='target')]));
  };
  return visit(value) as T;
}
function localDependencies(value:unknown):Set<string> {
  const result=new Set<string>();
  const visit=(item:unknown,key='',remote=false):void=>{
    if(typeof item==='string'){if(!remote&&['field','source','nameSource','colorSource','targetIdField','parentReferenceField'].includes(key))result.add(item);return;}
    if(Array.isArray(item)){item.forEach(child=>{if(typeof child==='string'&&key==='fallbackSources')result.add(child);else visit(child,key,remote);});return;}
    if(item&&typeof item==='object')for(const [name,child] of Object.entries(item))visit(child,name,remote||['relation','reference','target'].includes(name));
  };visit(value);return result;
}

export function initializeCategory(input:ConfigPackageV3,request:CategoryInitialization):{config:ConfigPackageV3;node:CategoryNode;report:CategoryInitializationReport} {
  const config=input.contractRevision<9?migrateConfigToR9(input):structuredClone(input),actions:string[]=[],renamed:Record<string,string>={};
  const parent=config.nodes.find(node=>node.nodeId===request.parentId);
  if(request.parentId&&!parent)throw Error('目标父级不存在。');
  const depth=parent?pathDepth(parent.path):0;if(depth>=4)throw Error('Skind2 已是末级，不能再创建下级。');
  const code=request.code.trim();if(!code||['__proto__','constructor','prototype'].includes(code))throw Error('分类代码为空或为保留名称。');
  const level=(['class','kind','skind','skind2'] as const)[depth],path={...parent?.path,[level]:code} as CategoryNode['path'];
  if(config.nodes.some(node=>classificationPathKey(node.path)===classificationPathKey(path)))throw Error('该分类路径已经存在。');
  const source=request.mode==='parent'?parent:request.mode==='template'?config.nodes.find(node=>node.nodeId===request.sourceId):undefined;
  if(request.mode!=='blank'&&!source)throw Error(request.mode==='parent'?'没有父级，不能选择继承父级。':'请选择具体的模板分类。');
  const sourceType=source?.geometryType??(['Point','LineString','Polygon'] as const).find(type=>source&&resolveGeometryProfile(config,source.path,type)?.enabled);
  const sourceCapability=source&&sourceType?resolveGeometryProfile(config,source.path,sourceType):undefined;
  const sync=request.mode==='blank'?{fields:false,geometry:false,display:false,card:false}:request.sync;
  if(sync.geometry&&!sourceCapability)throw Error('来源分类没有可用的几何设置。');
  const geometry=sync.geometry?sourceType!:request.geometry,multiple=sync.geometry?sourceCapability!.allowMultipleParts:request.multiple,anchor=multiple?(sync.geometry?sourceCapability!.anchor??'featureBbox':request.anchor):'featureBbox';
  if(parent&&resolveCategoryNodes(config,parent.path).some(node=>node.geometryType&&node.geometryType!==geometry))throw Error(`几何 ${geometry} 与目标祖先固定几何冲突。`);
  const base=parent&&inheritanceControls(parent).fields?resolveEffectiveFields(config,parent.path).filter(field=>field.inheritance!=='localOnly'):[];
  const occupied=new Map(base.map(field=>[field.key,field]));
  actions.push(`目标 ${classificationPathKey(path)}；保留父级向下传递字段 ${base.length} 项与系统字段。`);
  const originals=sync.fields&&source?resolveEffectiveFields(config,source.path):[],copies=new Map<string,FieldDefinition>();
  for(const field of [...originals].sort((a,b)=>a.key.split('.').length-b.key.split('.').length)) {
    const mapped=pathRename(field.key,renamed),candidate={...field,key:mapped},inherited=occupied.get(mapped);
    if(inherited&&semanticField({...candidate,key:inherited.key})===semanticField(inherited)){actions.push(`一致跳过：${field.key}`);continue;}
    let key=mapped;
    if(inherited){if(reserved.has(field.key))throw Error(`固定系统字段 ${field.key} 与模板定义冲突，不能重命名绕过。`);let index=1;while(occupied.has(`${mapped}_${index}`))index++;key=`${mapped}_${index}`;renamed[field.key]=key;actions.push(`重命名：${field.key} → ${key}`);}
    const {overrideOf:_override,...local}=structuredClone(field);const copied={...local,key,fieldId:newConfigId('field')};occupied.set(key,copied);copies.set(field.key,copied);actions.push(`复制字段：${key}`);
  }
  const fields=originals.flatMap(field=>{const copied=copies.get(field.key);return copied?[rewriteCategoryReferences(copied,renamed)]:[];});
  const profile=editableGeometryProfile(geometry,9);
  profile.allowMultipleParts=multiple;profile.anchor=anchor;
  if(sync.geometry&&sourceCapability)profile.interaction=structuredClone(sourceCapability.interaction);
  const display=source?resolveGeometryProfile(config,source.path,geometry):undefined;
  if(sync.display){
    if(!display?.enabled||display.allowMultipleParts!==multiple||(multiple&&(display.anchor??'featureBbox')!==anchor))throw Error('显示模板与目标几何、多部件或部件显示模式不兼容。');
    profile.zoomPriority=rewriteCategoryReferences(structuredClone(display.zoomPriority),renamed);profile.zoomPriority.rules=profile.zoomPriority.rules.map(rule=>({...rule,id:newConfigId('render')}));profile.renderState=profile.zoomPriority.rules.length?'enabled':'unconfigured';actions.push(`复制显示规则 ${profile.zoomPriority.rules.length} 条。`);
  }else {profile.zoomPriority.rules=[];profile.renderState='unconfigured';actions.push('显示未配置：不会隐式继承或渲染。');}
  const card=sync.card&&source?rewriteCategoryReferences(structuredClone(resolveCardConfiguration(config,source.path)??{mode:'fields' as const,items:[]}),renamed):{mode:'fields' as const,items:[]};
  if(card.mode==='fields')card.items=card.items.map(item=>({...item,id:newConfigId('card')}));
  const node:CategoryNode={nodeId:newConfigId('node'),path,classificationLabels:{...parent?.classificationLabels,[level]:{zh:request.labels.zh.trim()||code,en:request.labels.en}},children:[],inheritDown:source?structuredClone(inheritanceControls(source)):{fields:true,display:true,card:true},fields,geometryType:geometry,geometryProfiles:{[geometry]:profile},card};
  const next=structuredClone(config);next.nodes.push(node);if(parent)next.nodes.find(item=>item.nodeId===parent.nodeId)!.children.push(node.nodeId);
  const available=new Set(resolveSelectableFields(next,path).map(field=>field.key));
  for(const dependency of localDependencies([profile.zoomPriority,card]))if(!available.has(dependency))throw Error(`未同步依赖字段 ${dependency}；请同步字段设计或调整初始化选择。`);
  for(const rule of profile.zoomPriority.rules){const visibility=rule.extensions?.visibility;if(visibility?.mode==='activeContextMember'&&visibility.activeContextMember?.bindingId){const binding=next.contextBindings?.find(binding=>binding.id===visibility.activeContextMember?.bindingId);if(binding?.member?.classification.class!==path.class)throw Error('模板显示引用的上下文绑定不适用于目标 Class。');}}
  const validation=validateConfigPackage(next);if(!validation.valid)throw Error(validation.issues.filter(issue=>issue.severity==='error').map(issue=>`${issue.path}：${issue.message}`).join('\n'));
  actions.push('完整配置核验通过，新分类草稿可以继续编辑。');return {config:next,node,report:{actions,renamed}};
}
