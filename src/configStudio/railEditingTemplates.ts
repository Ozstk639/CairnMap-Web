import {RAIL_SCHEMAS,projectRegistryScene} from '../components/Common/workflowEditorRegistry';
import {FORMAT_REGISTRY} from '../components/Common/featureFormats';
import {resolveEffectiveFields,resolveGeometryProfile,hasDescendants} from './runtime';
import type {ConfigPackageV3,GeometryKind,WorkflowControl,WorkflowDefinition,WorkflowGroupField,WorkflowAssignment} from './types';
import {testWorkflowEditConversion} from './workflowEditCommit';
const kind=(control:string|undefined):WorkflowControl['kind']=>control==='bool'?'toggle':control==='number'?'number':control==='select'?'select':control==='textarea'?'textarea':'text';
/** Uses the V1 editor scene, never the collection scene or card renderer. */
export function createRailEditingWorkflows(config:ConfigPackageV3):WorkflowDefinition[] {
 return RAIL_SCHEMAS.map(schema=>{
  const code=String(schema.match.classCode),scope={class:code},view=projectRegistryScene(schema,'editor'),definition=FORMAT_REGISTRY[schema.match.subType!],fields=resolveEffectiveFields(config,scope),geometry=({RLE:'LineString',STA:'Point',PLF:'Point',PFB:'Polygon',STB:'Polygon',SBP:'Point',STF:'Polygon'} as Record<string,GeometryKind>)[code],outputId=`edit-${code}-output`;
  const controls:WorkflowControl[]=[],assignments:WorkflowAssignment[]=[{id:`edit-${code}-id`,target:'ID',expression:'ID'}];
  const entries=[...view.fields.map(field=>({order:field.order,field})),...view.groups.map(group=>({order:group.order,group}))].sort((a,b)=>a.order-b.order);
  for(const [index,entry]of entries.entries()){
   const slot='F'+(index+1);
   if('field' in entry){const field=entry.field,native=fields.find(f=>f.key===field.path),source=definition.fields.find(f=>f.key===field.key);if(!native)throw Error(`${code} 编辑字段 ${field.path} 未定义。`);
    controls.push({id:`edit-${code}-${field.key}`,slot,kind:kind(field.control),columns:1,label:{zh:field.label,en:native.labels.en},required:!source?.optional,fieldFormat:native.format,optionValueType:native.optionValueType,...(field.rows?{rows:field.rows}:{}),...(field.placeholder?{placeholder:field.placeholder}:{}),...(field.control==='select'?{options:structuredClone(native.options??[])}:{})});
    assignments.push({id:`edit-${code}-bind-${field.key}`,target:field.path,expression:slot});
   }else{const group=entry.group;
    const itemFields:WorkflowGroupField[]=group.fields.map(field=>({key:field.key,label:{zh:field.labels.editor??field.labels.default,en:''},kind:kind(field.control) as WorkflowGroupField['kind'],required:!field.optional,...(field.options?{options:field.options.map(o=>({value:o.value,label:{zh:o.label,en:''}}))}:{}),...(field.defaultValue!==undefined?{defaultValue:structuredClone(field.defaultValue)}:{})}));
    controls.push({id:`edit-${code}-${group.key}`,slot,kind:'group',columns:1,label:{zh:group.label,en:''},required:!group.optional,group:{storage:'object',optional:group.optional,minItems:group.minItems,itemFields,addLabel:{zh:`添加${group.label}`,en:''}}});assignments.push({id:`edit-${code}-bind-${group.key}`,target:group.path,expression:slot});
   }
  }
  if(hasDescendants(config,scope))controls.unshift({id:`edit-${code}-classification`,kind:'classificationPicker',columns:1,label:{zh:'分类',en:''},classificationScope:scope,outputId,systemManaged:true,required:true});
  controls.push({id:`edit-${code}-annotations`,kind:'tagsExtensions',columns:1,label:{zh:'标签与扩展',en:''},systemManaged:true,tagsExtensions:{tagsEnabled:true,extensionsEnabled:true}});
  const workflow:WorkflowDefinition={id:`v3-editor-${code.toLowerCase()}`,label:{zh:`${view.displayName}（专供编辑）`,en:''},mode:'composed',quickMapping:false,editor:{enabled:true,dedicated:true,scope},target:scope,actor:{required:true},steps:[{id:`edit-${code}-actor`,kind:'actor',label:{zh:'填写人',en:''}},{id:`edit-${code}-form`,kind:'form',label:{zh:'编辑信息',en:''},controls},{id:`edit-${code}-geometry`,kind:'geometry',outputId,geometry:[geometry],label:{zh:'编辑几何',en:''},drawing:{enabledFromThisPage:true,keepDrawingWhenBack:true,allowBack:true,multiple:resolveGeometryProfile(config,scope,geometry)?.allowMultipleParts??false}}],outputs:[{id:outputId,classification:scope,geometry:{selected:geometry},assignments}]};
  testWorkflowEditConversion(config,workflow);return workflow;
 });
}
export function installRailEditingWorkflows(value:ConfigPackageV3):ConfigPackageV3 {
 const config=structuredClone(value),workflows=createRailEditingWorkflows(config);
 for(const workflow of workflows){if(config.workflows.some(w=>w.id===workflow.id))throw Error(`编辑模板 ${workflow.id} 已存在，不能覆盖用户修改。`);config.workflows.push(workflow);}return config;
}
