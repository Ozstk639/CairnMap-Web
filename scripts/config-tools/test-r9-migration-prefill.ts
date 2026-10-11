import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEditableConfigPackageFromCurrentProject } from '../../src/configStudio/renderRuleTemplates';
import { migrateConfigToR9 } from '../../src/configStudio/r9Migration';
import { prepareConfigForActivation } from '../../src/configStudio/configActivation';
import { resolveGeometryProfile,validateConfigPackage,validateWorkflowDefinition } from '../../src/configStudio/runtime';
import { resolveConfigRuntimeRule } from '../../src/components/Rules/configRuntime/configPackageAdapter';
import { FeatureStore } from '../../src/components/Rules/data/featureStore';
import { evaluateV3WorkflowOutputs } from '../../src/configStudio/V3WorkflowRunner';
import { buildV3CardSections } from '../../src/configStudio/V3CardRenderer';
import { prefillCardItem,prefillWorkflowControl,prefillGroupField } from '../../src/configStudio/fieldPrefillModel';
import { buildConfigPackageArchive,readConfigPackage } from '../../src/configStudio/package';
import type { FieldDefinition } from '../../src/configStudio/types';

const old=createEditableConfigPackageFromCurrentProject(),oldJson=JSON.stringify(old),config=migrateConfigToR9(old);
assert.equal(config.contractRevision,9);assert.equal(config.revision,5);
assert.equal(JSON.stringify(old),oldJson);assert.deepEqual(migrateConfigToR9(config),config);
const report=validateConfigPackage(config);assert(report.valid,JSON.stringify(report.issues.filter(i=>i.severity==='error')));
const runtime=prepareConfigForActivation(config),oldRuntime=prepareConfigForActivation(old);
const normalise=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,item)=>key==='name'?undefined:item));
let renderCount=0;
for(const node of config.nodes)for(const geometry of ['Point','LineString','Polygon'] as const){
 if(!resolveGeometryProfile(config,node.path,geometry)?.enabled)continue;
 for(const direction of ['0','1','3'])for(const Connect of [false,true])for(let zoom=0;zoom<=8;zoom++){
  const featureInfo={ID:'r9-compare',World:'zth',Class:node.path.class,Kind:node.path.kind,SKind:node.path.skind,SKind2:node.path.skind2,Name:'比较',direction,Connect};
  const record:any={uid:'r9-compare',featureInfo,type:geometry==='Point'?'Points':geometry==='LineString'?'Polyline':'Polygon',meta:{Class:node.path.class,idValue:'r9-compare',sig:{},groups:{}},p3:{x:0,y:-64,z:0},coords3:[{x:0,y:-64,z:0},{x:100,y:-64,z:0},{x:100,y:-64,z:100},{x:0,y:-64,z:0}]};
  const ctx:any={worldId:'zth',zoomLevel:zoom,leafletZoom:zoom-3,inFloorView:false,activeBuildingUid:null,activeFloorSelector:null,activeBuildingFloorRefSet:null},store=new FeatureStore([record]);
  assert.deepEqual(normalise(resolveConfigRuntimeRule(runtime,record,ctx,null,store)),normalise(resolveConfigRuntimeRule(oldRuntime,record,ctx,null,store)));renderCount++;
 }
}
const fixtures=JSON.parse(fs.readFileSync('scripts/config-tools/fixtures/v1-workflow-output-parity.json','utf8')).cases;
for(const fixture of fixtures){
 const workflow=config.workflows.find(w=>w.id===`v3-${fixture.schemaKey}`)!,output=workflow.outputs[0],slots:Record<string,unknown>={actor:'fixture-user'};
 for(const control of workflow.steps.flatMap(s=>s.controls??[]))if(control.slot){const key=control.id.slice(fixture.schemaKey.length+1,-control.slot.length-1);if(key in fixture.inputs)slots[control.slot]=fixture.inputs[key];}
 const data=fixture.geometry==='Point'?fixture.expectedRecord.CoordP:fixture.geometry==='LineString'?fixture.expectedRecord.CoordL[0]:fixture.expectedRecord.CoordG[0][0],coords=data.map(([x,y,z]:number[])=>({x,y,z}));
 assert.deepEqual(evaluateV3WorkflowOutputs(workflow,slots,{world:'zth',classifications:{[output.id]:fixture.classification},config,coordinates:{[output.id]:coords},now:new Date('2026-10-07T00:00:00Z')})[0].record,fixture.expectedRecord,fixture.schemaKey);
}
const baseline=JSON.parse(fs.readFileSync('scripts/config-tools/fixtures/v1-independent-card-baseline.json','utf8'));
const empty=(v:any)=>v==null||typeof v==='string'&&(!v.trim()||v.trim()==='未知')||typeof v==='object'&&!Object.keys(v).length||Array.isArray(v)&&!v.length||v.kind==='lineChips'&&!v.items?.length;
const normalCards=(sections:any)=>Object.fromEntries(['mainRows','otherRows'].map(key=>[key,(sections?.[key]??[]).filter((r:any)=>!empty(r.value)).map(({label,value}:any)=>({label,value}))]));
let cards=0;
for(const fixture of baseline.cases){if(fixture.record.Class==='TRP')continue;const fi=fixture.record,record:any={uid:fi.ID,featureInfo:fi,type:fi.Type,meta:{Class:fi.Class,idValue:fi.ID,sig:fi}};assert.deepEqual(JSON.parse(JSON.stringify(normalCards(buildV3CardSections(config,record)))),JSON.parse(JSON.stringify(normalCards(fixture.sections))),fixture.key);cards++;}

const root=config.nodes.find(n=>n.path.class==='WRP'&&!n.path.kind)!;
const field:FieldDefinition={fieldId:'r9-status',key:'tags.status',type:'enum',cardinality:'single',input:'select',labels:{zh:'状态',en:''},description:{zh:'',en:''},options:[{value:'0',label:{zh:'关闭',en:''}},{value:'1',label:{zh:'开启',en:'On'}}],optionValueType:'number'};root.fields.push(field);
const control=prefillWorkflowControl({id:'status-control',slot:'STATUS',columns:1,kind:'text',label:{zh:'旧',en:'Old'},defaultValue:'invalid',placeholder:'保留提示'},field);
assert.equal(control.fieldSource,undefined);assert.equal(control.defaultValue,undefined);assert.equal(control.placeholder,'保留提示');assert.equal(control.label.en,'');
const item=prefillCardItem({id:'status-card',source:'Name',visible:true,renderer:'text',labelMode:'field',valueMode:'field'},field);
root.card={mode:'fields',items:[item]};field.labels.zh='新名称';field.options![0].label.zh='新关闭';
assert.equal(control.label.zh,'状态');assert.equal(control.options![0].label.zh,'关闭');
assert.deepEqual(buildV3CardSections(config,{featureInfo:{Class:'WRP',tags:{status:0}},meta:{Class:'WRP'}} as any)?.mainRows[0],{label:'状态',value:'关闭'});
assert.equal(prefillCardItem(item,field).label!.zh,'新名称');
assert.equal(prefillGroupField({key:'item',kind:'text',label:{zh:'旧',en:''}},field).key,'item');
const workflow=config.workflows.find(w=>w.id==='v3-wrp_warp')!;workflow.steps.find(s=>s.kind==='form')!.controls!.push(control);workflow.outputs[0].assignments.push({id:'status-bind',target:field.key,expression:'STATUS'});
assert(validateWorkflowDefinition(workflow,config).valid);
field.type='boolean';assert(!validateWorkflowDefinition(workflow,config).valid);field.type='enum';
const emptyNode=structuredClone(root);emptyNode.nodeId='empty-r9';emptyNode.path={class:'EMPTY_R9'};emptyNode.children=[];emptyNode.fields=[];emptyNode.card={mode:'fields',items:[]};emptyNode.geometryProfiles.Point!.renderState='unconfigured';emptyNode.geometryProfiles.Point!.zoomPriority.rules=[];
const blank={...config,nodes:[...config.nodes,emptyNode]};assert(validateConfigPackage(blank).valid);
const archive=await buildConfigPackageArchive(config,validateConfigPackage(config));assert.deepEqual(await readConfigPackage(new File([archive],'r9.zip')),JSON.parse(JSON.stringify(config)));
console.log(`r9-migration-prefill: ${renderCount} unchanged render rules, ${fixtures.length} full V1 records, ${cards} independent V1 cards; one-shot values, conflicts, blank display and ZIP roundtrip: OK`);
