import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrateConfigToR9} from '../../src/configStudio/r9Migration';
import {createEditableConfigPackageFromCurrentProject} from '../../src/configStudio/renderRuleTemplates';
import {createTrpEditingWorkflow,validateExternalEditBinding} from '../../src/configStudio/externalEditRegistry';
import {createTrpExternalEditSession,prepareTrpExternalEdit} from '../../src/configStudio/trpExternalEditing';
import {compileWorkflowEditPlan,isQuickMappingWorkflow,findEditingWorkflow} from '../../src/configStudio/workflowEditing';
import {validateConfigPackage} from '../../src/configStudio/runtime';
import {buildConfigPackageArchive,readConfigPackage} from '../../src/configStudio/package';
const config=migrateConfigToR9(createEditableConfigPackageFromCurrentProject()),workflow=createTrpEditingWorkflow();config.workflows.push(workflow);
assert(validateConfigPackage(config).valid);assert(!isQuickMappingWorkflow(workflow));assert.equal(workflow.external?.purpose,'edit');assert.equal(workflow.external?.version,1);assert.throws(()=>compileWorkflowEditPlan(workflow,config),/外部/);
const capture=config.workflows.find(w=>w.external?.componentKey==='tradePointWorkflow')!;assert(isQuickMappingWorkflow(capture));assert.equal(capture.external!.purpose,'capture');assert.notEqual(workflow.id,capture.id);assert.notEqual(workflow.external!.componentKey,capture.external!.componentKey);
const fixture=JSON.parse(fs.readFileSync('scripts/config-tools/fixtures/v1-trp-editing-reference.json','utf8'));
for(const test of fixture.cases){
 const session=createTrpExternalEditSession(config,workflow,test.original);assert.deepEqual(session.values,test.projectedValues);assert.equal(session.view.fields.find(f=>f.path==='Trade')?.control,'trpTrade');assert.equal(findEditingWorkflow(config,test.original)?.id,workflow.id);
 assert(!session.unparsed.some(e=>e.path.startsWith('tags.')||e.path.startsWith('extensions.')));
 const originalSnapshot=structuredClone(session.original);session.values=structuredClone(test.editedValues);
 const actual=prepareTrpExternalEdit(config,workflow,session,session.originalGeometry,'zth','editing-user',[],new Date('2026-10-12T00:00:00Z'));const expected=structuredClone(test.updated);if(typeof expected.elevation==='string'&&expected.elevation.trim()&&Number.isFinite(Number(expected.elevation)))expected.elevation=Number(expected.elevation);assert.deepEqual(actual,expected,`TRP/${test.case}: full record differs after the declared numeric-field normalization boundary`);assert.deepEqual(session.original,originalSnapshot);assert.deepEqual(actual.opaque,test.original.opaque);assert.equal(actual.CreateBy,'original-creator');assert.equal(actual.ModifityBy,'editing-user');
 assert.throws(()=>prepareTrpExternalEdit(config,workflow,session,session.originalGeometry,'eden','editing-user',[]),/世界/);
 const conflict=structuredClone(session);conflict.values.ID='occupied';assert.throws(()=>prepareTrpExternalEdit(config,workflow,conflict,session.originalGeometry,'zth','editing-user',[{ID:'occupied',World:'zth'}]),/占用/);
}
for(const mutate of [(w:any)=>w.external.componentKey='tradePointWorkflow',(w:any)=>w.external.version=99,(w:any)=>w.external.purpose='capture',(w:any)=>w.quickMapping=true,(w:any)=>w.editor.scope={class:'RLE'}]){const bad=structuredClone(workflow);mutate(bad);assert(validateExternalEditBinding(bad).length);assert(!validateConfigPackage({...config,workflows:[...config.workflows.filter(w=>w.id!==workflow.id),bad]}).valid);}
const incompatible=structuredClone(config);incompatible.nodes.find(n=>n.path.class==='TRP'&&!n.path.kind)!.fields.find(f=>f.key==='elevation')!.type='string';assert(validateConfigPackage(incompatible).issues.some(i=>i.code==='external-editor-field-contract-conflict'));
const archived=await readConfigPackage(await buildConfigPackageArchive(config));assert.deepEqual(archived.workflows.find(w=>w.id===workflow.id),workflow);
console.log('r9-trp-external-editing: registered purpose/version, no onsite standard conversion, three frozen V1 Trade/editor records (explicit finite numeric-string normalization), alias migration, type/height/classification/ID, creation and unknown metadata preservation, guards and ZIP roundtrip: OK');
