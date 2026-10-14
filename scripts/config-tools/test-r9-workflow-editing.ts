import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createEditableConfigPackageFromCurrentProject} from '../../src/configStudio/renderRuleTemplates';
import {migrateConfigToR9} from '../../src/configStudio/r9Migration';
import {compileWorkflowEditPlan,hydrateWorkflowEdit,buildWorkflowEditRecord,findEditingWorkflow,isQuickMappingWorkflow} from '../../src/configStudio/workflowEditing';
import {prepareNativeWorkflowEdit,testWorkflowEditConversion} from '../../src/configStudio/workflowEditCommit';
import {readMultipartGeometry} from '../../src/core/geometry/multipartGeometry';
import {validateConfigPackage} from '../../src/configStudio/runtime';
const config=migrateConfigToR9(createEditableConfigPackageFromCurrentProject()),fixtures=JSON.parse(fs.readFileSync('scripts/config-tools/fixtures/v1-workflow-output-parity.json','utf8')).cases;
const eligible=config.workflows.filter(w=>w.mode==='composed'&&w.id!=='v3-tpp_teleport');assert.equal(eligible.length,16);
let records=0;
for(const workflow of eligible) {
 const result=testWorkflowEditConversion(config,workflow);assert(result.plan.controls.length);workflow.editor={enabled:true};
 for(const fixture of fixtures.filter((f:any)=>workflow.id==='v3-'+f.schemaKey)){
  const original={...fixture.expectedRecord,unknown:{zero:0,no:false,empty:[],nothing:null},tags:{...fixture.expectedRecord.tags,custom:false},extensions:{...fixture.expectedRecord.extensions,foreign:{list:[{a:0,b:false}],empty:''}}};
  const plan=compileWorkflowEditPlan(workflow,config),draft=hydrateWorkflowEdit(plan,original);assert.equal(draft.slots.EDIT_ID,original.ID);assert.deepEqual(buildWorkflowEditRecord(plan,original,draft),original);
  assert(plan.removed.every(control=>!plan.controls.includes(control)));assert(!plan.controls.some(c=>plan.removed.some(r=>r.id===c.id)));
  const geometry=readMultipartGeometry(original,workflow.outputs[0].geometry.selected).geometry!;assert(geometry);
  const unchanged=prepareNativeWorkflowEdit(config,workflow,original,draft,geometry,'zth','edit-user',[],new Date('2026-10-12T00:00:00Z'));
  assert.equal(unchanged.CreateTime,original.CreateTime);assert.equal(unchanged.CreateBy,original.CreateBy);assert.deepEqual(unchanged.unknown,original.unknown);assert.deepEqual(unchanged.tags,original.tags);assert.deepEqual(unchanged.extensions,original.extensions);assert.equal(unchanged.ModifityBy,'edit-user');
  const name=plan.bindings.find(b=>b.target==='Name');if(name){draft.slots[name.slot]='修改名称';const changed=prepareNativeWorkflowEdit(config,workflow,original,draft,geometry,'zth','edit-user',[]);assert.equal(changed.Name,'修改名称');assert.equal(changed.ID,original.ID);assert.deepEqual(changed.unknown,original.unknown);}
  assert.throws(()=>prepareNativeWorkflowEdit(config,workflow,original,draft,geometry,'eden','edit-user',[]),/世界/);
  draft.slots.EDIT_ID='occupied';assert.throws(()=>prepareNativeWorkflowEdit(config,workflow,original,draft,geometry,'zth','edit-user',[{ID:'occupied',World:'zth'}]),/占用/);
  draft.slots.EDIT_ID='renamed';assert.throws(()=>prepareNativeWorkflowEdit(config,workflow,original,draft,geometry,'zth','edit-user',[{ID:'ref',World:'zth',link:original.ID}]),/引用/);records++;
 }
}
assert.equal(records,32);assert(validateConfigPackage(config).valid);
const workflow=eligible[0];for(const mutate of [(w:any)=>w.steps.push({...w.steps[1],id:'extra-page'}),(w:any)=>w.steps[2].geometryRole='auxiliary',(w:any)=>w.outputs.push({...w.outputs[0],id:'another'}),(w:any)=>w.steps[1].controls[0].when={token:'A',operator:'present'},(w:any)=>w.outputs[0].when={token:'A',operator:'present'}]){const bad=structuredClone(workflow);mutate(bad);assert.throws(()=>compileWorkflowEditPlan(bad,config));}
const irreversible=structuredClone(workflow),nameAssignment=irreversible.outputs[0].assignments.find(a=>a.target==='Name')!;nameAssignment.expression='upper(A)';assert.throws(()=>compileWorkflowEditPlan(irreversible,config),/回填/);irreversible.editor={enabled:false,backfill:[{slot:'A',target:'Name'}]};assert(testWorkflowEditConversion(config,irreversible));
const shared=structuredClone(workflow);shared.outputs[0].assignments.find(a=>a.target==='ID')!.expression='join("_",A,E)';assert(compileWorkflowEditPlan(shared,config).controls.some(c=>c.slot==='A'));
const direct=structuredClone(workflow);direct.outputs[0].assignments.push({id:'ambiguous',target:'tags.Land',expression:'A'});assert.throws(()=>hydrateWorkflowEdit(compileWorkflowEditPlan(direct,config),{Class:direct.outputs[0].classification.class,Kind:direct.outputs[0].classification.kind,SKind:direct.outputs[0].classification.skind,Name:'one',tags:{Land:'two'},ID:'a'}),/不同值/);
const first=fixtures.find((f:any)=>workflow.id==='v3-'+f.schemaKey).expectedRecord;assert.equal(findEditingWorkflow(config,first)?.id,workflow.id);const duplicate=structuredClone(config);duplicate.workflows.push({...workflow,id:'duplicate-editor'});assert(!validateConfigPackage(duplicate).valid);assert.throws(()=>findEditingWorkflow(duplicate,first),/多个/);
assert(!isQuickMappingWorkflow({...workflow,quickMapping:false}));assert(!isQuickMappingWorkflow({...workflow,editor:{enabled:true,dedicated:true}}));assert(!isQuickMappingWorkflow({...workflow,mode:'external',external:{componentKey:'tradePointEditor',purpose:'edit',reason:'trp-integrated'}}));
assert.throws(()=>compileWorkflowEditPlan(config.workflows.find(w=>w.id==='v3-tpp_teleport')!,config));
const spatial=structuredClone(workflow);spatial.steps[2].drawing={...spatial.steps[2].drawing,captureSlot:'MAIN_COORDS',returnFormat:'coordG',bindings:[{outputId:spatial.outputs[0].id,target:'extensions.audit.coords',value:'geometry'}]};
spatial.outputs[0].assignments.push({id:'echo-id',target:'tags.self',expression:'ID_1'},{id:'echo-class',target:'tags.kind',expression:'Skind_1'},{id:'echo-x',target:'extensions.audit.x',expression:'MAIN_COORDS_X'});
assert(testWorkflowEditConversion(config,spatial));const spatialOriginal={...first,tags:{...first.tags,self:first.ID,kind:first.SKind},extensions:{...first.extensions,audit:{x:first.CoordG[0][0][0][0],coords:first.CoordG}}};
const spatialPlan=compileWorkflowEditPlan(spatial,config),spatialDraft=hydrateWorkflowEdit(spatialPlan,spatialOriginal),spatialGeometry=readMultipartGeometry(first,'Polygon').geometry!;
const moved=structuredClone(spatialGeometry);if(moved.type==='Polygon')moved.parts[0][0][0].x=99;spatialDraft.slots.EDIT_ID='changed-spatial-id';
const changedSpatial=prepareNativeWorkflowEdit(config,spatial,spatialOriginal,spatialDraft,moved,'zth','editor',[]);assert.equal((changedSpatial.tags as any).self,'changed-spatial-id');assert.equal((changedSpatial.extensions as any).audit.x,99);assert.equal((changedSpatial.extensions as any).audit.coords[0][0][0][0],99);
const outOfScope={...first,Class:'ISG',Kind:'ADM',SKind:'DBZ',SKind2:'NOM'};assert(testWorkflowEditConversion(config,workflow,[first,outOfScope]).report.at(-1)?.includes('1 条'));
console.log('r9-workflow-editing: 16 actual conversions / 32 V1 records, ID-only dependency removal, controlled reversible backfill, original data/metadata patch, world/ID/reference guards, routes and capture visibility: OK');
