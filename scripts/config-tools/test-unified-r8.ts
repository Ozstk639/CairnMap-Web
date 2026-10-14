import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { createEditableConfigPackageFromCurrentProject } from '../../src/configStudio/renderRuleTemplates';
import { prepareConfigForActivation } from '../../src/configStudio/configActivation';
import { resolveGeometryProfile,validateConfigPackage,validateWorkflowDefinition } from '../../src/configStudio/runtime';
import { resolveConfigRuntimeRule } from '../../src/components/Rules/configRuntime/configPackageAdapter';
import { FeatureStore } from '../../src/components/Rules/data/featureStore';
import { evaluateV3WorkflowOutputs,validateV3WorkflowInputs } from '../../src/configStudio/V3WorkflowRunner';
import { importFieldIntoControl } from '../../src/configStudio/fieldReuse';
import { buildV3CardSections } from '../../src/configStudio/V3CardRenderer';
import { buildConfigPackageArchive,readConfigPackage } from '../../src/configStudio/package';
import { evaluateWorkflowExpression } from '../../src/configStudio/workflowExpression';
import type { FieldDefinition,WorkflowControl } from '../../src/configStudio/types';
const source=createConfigPackageFromCurrentProject(),config=createEditableConfigPackageFromCurrentProject();
const runtime=prepareConfigForActivation(config);
const normalize=(rule:unknown)=>JSON.parse(JSON.stringify(rule,(key,value)=>key==='name'?undefined:value));
let count=0;
for(const node of source.nodes)for(const geometry of ['Point','LineString','Polygon'] as const){
 if(!resolveGeometryProfile(source,node.path,geometry)?.enabled)continue;
 for(const direction of ['0','1','3'])for(const Connect of [false,true])for(let zoom=0;zoom<=8;zoom++){
 const featureInfo={ID:'comparison',World:'zth',Class:node.path.class,Kind:node.path.kind,SKind:node.path.skind,SKind2:node.path.skind2,Name:'比较',direction,Connect};
 const record:any={uid:'comparison',featureInfo,type:geometry==='Point'?'Points':geometry==='LineString'?'Polyline':'Polygon',meta:{Class:node.path.class,idValue:'comparison',sig:{},groups:{}},p3:{x:0,y:-64,z:0},coords3:[{x:0,y:-64,z:0},{x:100,y:-64,z:0},{x:100,y:-64,z:100},{x:0,y:-64,z:0}]};
 const ctx:any={worldId:'zth',zoomLevel:zoom,leafletZoom:zoom-3,inFloorView:false,activeBuildingUid:null,activeFloorSelector:null,activeBuildingFloorRefSet:null},store=new FeatureStore([record]);
 assert.deepEqual(normalize(resolveConfigRuntimeRule(runtime,record,ctx,null,store)),normalize(resolveConfigRuntimeRule(source,record,ctx,null,store)),`${node.nodeId}/${geometry}/${zoom}`);count++;
 }}
const fixtures=JSON.parse(fs.readFileSync('scripts/config-tools/fixtures/v1-workflow-output-parity.json','utf8')).cases;
for(const fixture of fixtures){
 const workflow=config.workflows.find(w=>w.id===`v3-${fixture.schemaKey}`)!,output=workflow.outputs[0];
 const slots:Record<string,unknown>={actor:'fixture-user'};
 for(const control of workflow.steps.flatMap(s=>s.controls??[]))if(control.slot){const key=control.id.slice(fixture.schemaKey.length+1,-control.slot.length-1);if(key in fixture.inputs)slots[control.slot]=fixture.inputs[key];}
 const data=fixture.geometry==='Point'?fixture.expectedRecord.CoordP:fixture.geometry==='LineString'?fixture.expectedRecord.CoordL[0]:fixture.expectedRecord.CoordG[0][0];
 const coords=data.map(([x,y,z]:number[])=>({x,y,z}));
 assert.deepEqual(evaluateV3WorkflowOutputs(workflow,slots,{world:'zth',classifications:{[output.id]:fixture.classification},config,coordinates:{[output.id]:coords},now:new Date('2026-10-07T00:00:00Z')})[0].record,fixture.expectedRecord,fixture.schemaKey);
}
const custom=structuredClone(config),root=custom.nodes.find(node=>node.path.class==='WRP'&&!node.path.kind)!;
const gate:FieldDefinition={fieldId:'gate',key:'tags.gate',type:'number',cardinality:'single',input:'text',labels:{zh:'门槛',en:''},description:{zh:'',en:''}};
const field:FieldDefinition={fieldId:'conditional',key:'tags.conditional',type:'string',cardinality:'multiple',input:'text',labels:{zh:'条件值',en:''},description:{zh:'',en:''},requiredWhen:[{kind:'fieldEquals',field:gate.key,value:'0'},{kind:'fieldEquals',field:gate.key,value:'2'}]};root.fields.push(gate,field);
const workflow=structuredClone(custom.workflows.find(w=>w.id==='v3-wrp_warp')!),form=workflow.steps.find(s=>s.kind==='form')!;
const input:WorkflowControl={id:'gate-input',slot:'GATE',columns:1,kind:'number',label:{zh:'门槛',en:''}};form.controls!.push(input);workflow.outputs[0].assignments.push({id:'gate-bind',target:gate.key,expression:'GATE'});
const imported=importFieldIntoControl(custom,workflow,{...input,id:'condition-input',slot:'CONDITIONAL'},root.nodeId,field);form.controls!.push(imported);workflow.outputs[0].assignments.push({id:'condition-bind',target:field.key,expression:'CONDITIONAL'});
assert(validateV3WorkflowInputs(workflow,{GATE:0,CONDITIONAL:[]},[form],custom).some(issue=>issue.controlId===imported.id));
assert(!validateV3WorkflowInputs(workflow,{GATE:1,CONDITIONAL:[]},[form],custom).some(issue=>issue.controlId===imported.id));
root.card={mode:'fields',items:[{id:'dictionary',source:field.key,visible:true,renderer:'text',labelMode:'field',valueMode:'field'}]};field.options=[{value:'a',label:{zh:'甲',en:''}},{value:'b',label:{zh:'乙',en:''}}];
assert.deepEqual(buildV3CardSections(custom,{featureInfo:{Class:'WRP',tags:{conditional:['a','b','c']}},meta:{Class:'WRP'}} as any)?.mainRows[0],{label:'条件值',value:['甲','乙','c']});
field.type='enum';root.card.items[0].valueMode='override';root.card.items[0].valueOptions=[{value:'removed',label:{zh:'失效',en:''}}];assert(validateConfigPackage(custom).issues.some(issue=>issue.code==='card-field-map-conflict'));
assert.throws(()=>evaluateWorkflowExpression('multiply(number("1e308"),number("1e308"))',{},{}),/有限数值/);
const explicitEnglish=structuredClone(config);explicitEnglish.nodes[0].classificationLabels!.class={zh:'同名站',en:'同名站'};assert.deepEqual(await readConfigPackage(new File([JSON.stringify(explicitEnglish)],'explicit-en.json')),JSON.parse(JSON.stringify(explicitEnglish)));
const report=validateConfigPackage(config);assert(report.valid);const archive=await buildConfigPackageArchive(config,report),restored=await readConfigPackage(new File([archive],'r8.zip'));assert.deepEqual(restored,JSON.parse(JSON.stringify(config)));
assert.equal(validateWorkflowDefinition(workflow,custom).valid,false);
console.log(`unified-r8: ${count} r6/r8 native render results, ${fixtures.length} complete records, conditional numeric imports, dictionary arrays, source conflicts, finite calculations and actual ZIP roundtrip: OK`);
