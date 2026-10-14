import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareConfigForActivation} from '../../src/configStudio/configActivation';
import {resolveGeometryProfile,validateConfigPackage} from '../../src/configStudio/runtime';
import {resolveConfigRuntimeRule} from '../../src/components/Rules/configRuntime/configPackageAdapter';
import {FeatureStore} from '../../src/components/Rules/data/featureStore';
import {evaluateV3WorkflowOutputs} from '../../src/configStudio/V3WorkflowRunner';
import {isQuickMappingWorkflow,findEditingWorkflow} from '../../src/configStudio/workflowEditing';
import {testWorkflowEditConversion} from '../../src/configStudio/workflowEditCommit';
import {readConfigPackage} from '../../src/configStudio/package';
import {stableConfigText} from '../../src/configStudio/defaultConfigProvider';
import {initializeCategory} from '../../src/configStudio/categoryInitialization';
const out='docs/90_roadmap-and-history/runtime-v32-final-execution-20261012';
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(fs.readFileSync('src/configStudio/defaults/manifest.json','utf8'));
const bytes=fs.readFileSync('src/configStudio/defaults/r9-r5.config.json'),config=JSON.parse(bytes.toString('utf8'));
assert.equal(sha(bytes),manifest.sha256);assert.equal(config.revision,5);assert.equal(config.contractRevision,9);
const {parity:_,...content}=config;assert.equal(sha(stableConfigText(content)),manifest.semanticFingerprint);
assert.equal(config.nodes.length,95);assert.equal(config.workflows.length,28);
assert.equal(config.workflows.filter(isQuickMappingWorkflow).length,20);assert.equal(config.workflows.filter((w:any)=>w.editor?.enabled).length,24);
assert.equal(config.workflows.filter((w:any)=>w.editor?.dedicated).length,8);
assert.equal(sha(fs.readFileSync('docs/90_roadmap-and-history/RuntimeV32_CategoryManagement_Prefill_Editing_Update_Blueprint_2026-10-12.md')),'f23bab765039e6438e2f342423b7d23389ccc7843486eb1f3ed4822e7ce445ff');
const oldBytes=fs.readFileSync('docs/90_roadmap-and-history/runtime-v32-unified-repair-20261011/CairnMap_V32_FieldReuse_Drawing_r4.config.json');
assert.equal(sha(oldBytes),'ffcf77938eb83ea7054ebde4bdbe42980c36cde73c4cad864af5e329a216a2f5');
assert(validateConfigPackage(config).valid);
const runtime=prepareConfigForActivation(config),oldRuntime=prepareConfigForActivation(JSON.parse(oldBytes.toString('utf8')));
const normalise=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,item)=>key==='name'?undefined:item));
let renderCount=0;
for(const node of config.nodes)for(const geometry of ['Point','LineString','Polygon'] as const){
 if(!resolveGeometryProfile(config,node.path,geometry)?.enabled)continue;
 for(const direction of ['0','1','3'])for(const Connect of [false,true])for(let zoom=0;zoom<=8;zoom++){
  const featureInfo={ID:'final-compare',World:'zth',Class:node.path.class,Kind:node.path.kind,SKind:node.path.skind,SKind2:node.path.skind2,Name:'比较',direction,Connect};
  const record:any={uid:'final-compare',featureInfo,type:geometry==='Point'?'Points':geometry==='LineString'?'Polyline':'Polygon',meta:{Class:node.path.class,idValue:'final-compare',sig:{},groups:{}},p3:{x:0,y:-64,z:0},coords3:[{x:0,y:-64,z:0},{x:100,y:-64,z:0},{x:100,y:-64,z:100},{x:0,y:-64,z:0}]};
  const ctx:any={worldId:'zth',zoomLevel:zoom,leafletZoom:zoom-3,inFloorView:false,activeBuildingUid:null,activeFloorSelector:null,activeBuildingFloorRefSet:null},store=new FeatureStore([record]);
  assert.deepEqual(normalise(resolveConfigRuntimeRule(runtime,record,ctx,null,store)),normalise(resolveConfigRuntimeRule(oldRuntime,record,ctx,null,store)));renderCount++;
 }
}
const fixtures=JSON.parse(fs.readFileSync('scripts/config-tools/fixtures/v1-workflow-output-parity.json','utf8')).cases;
for(const fixture of fixtures){
 const workflow=config.workflows.find((w:any)=>w.id===`v3-${fixture.schemaKey}`),output=workflow.outputs[0],slots:Record<string,unknown>={actor:'fixture-user'};
 for(const control of workflow.steps.flatMap((s:any)=>s.controls??[]))if(control.slot){const key=control.id.slice(fixture.schemaKey.length+1,-control.slot.length-1);if(key in fixture.inputs)slots[control.slot]=fixture.inputs[key];}
 const data=fixture.geometry==='Point'?fixture.expectedRecord.CoordP:fixture.geometry==='LineString'?fixture.expectedRecord.CoordL[0]:fixture.expectedRecord.CoordG[0][0],coords=data.map(([x,y,z]:number[])=>({x,y,z}));
 assert.deepEqual(evaluateV3WorkflowOutputs(workflow,slots,{world:'zth',classifications:{[output.id]:fixture.classification},config,coordinates:{[output.id]:coords},now:new Date('2026-10-07T00:00:00Z')})[0].record,fixture.expectedRecord,fixture.schemaKey);
}
for(const workflow of config.workflows.filter((w:any)=>w.mode==='composed'&&w.editor?.enabled))testWorkflowEditConversion(config,workflow);
for(const classCode of ['RLE','STA','PLF','PFB','STB','SBP','STF','TRP'])assert(findEditingWorkflow(config,{Class:classCode})?.editor?.dedicated,classCode);
const delivery=JSON.parse(fs.readFileSync(out+'/r9-r5-delivery-manifest.json','utf8'));
const zip=fs.readFileSync(out+'/CairnMap_V32_CategoryManagement_Editing_r5.zip');assert.equal(sha(zip),delivery.zipSha256);
const roundtrip=await readConfigPackage(new Blob([zip]) as File);assert.deepEqual(roundtrip,config);
assert.equal(sha(fs.readFileSync(out+'/CairnMap_V32_CategoryManagement_Editing_r5.config.json')),manifest.sha256);
const blank=initializeCategory(config,{parentId:undefined,code:'BLK',labels:{zh:'空白',en:''},mode:'blank',geometry:'Point',multiple:false,anchor:'featureBbox',sync:{fields:false,geometry:false,display:false,card:false}});
const record:any={uid:'blank',featureInfo:{Class:'BLK'},type:'Points',meta:{Class:'BLK',sig:{},groups:{}},p3:{x:0,y:0,z:0}};
const candidate=structuredClone(blank.config);candidate.engine.renderDefaults??={};candidate.engine.renderDefaults.Point={...candidate.engine.renderDefaults.Point,fallback:{whenRuleMissing:'geometryOnly'}};
const blankRuntime=prepareConfigForActivation(candidate);assert.equal(resolveConfigRuntimeRule(blankRuntime,record,{worldId:'zth',zoomLevel:3,leafletZoom:0} as any,null,new FeatureStore([record])),null);
console.log(`r9-final-package: final immutable source and default SHA, 95/28/20/24 coverage, ${renderCount} unchanged render results, ${fixtures.length} complete V1 creation records, 23 native conversion probes, 8 dedicated routes, signed ZIP/default roundtrip and explicit blank-render guard: OK`);
