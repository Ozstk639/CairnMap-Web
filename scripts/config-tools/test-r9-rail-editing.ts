import {prepareNativeFeatureImport} from '../../src/configStudio/nativeFeatureImport';
import {reverseWorkflowEditEndpoints} from '../../src/configStudio/workflowEditing';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrateConfigToR9} from '../../src/configStudio/r9Migration';
import {createEditableConfigPackageFromCurrentProject} from '../../src/configStudio/renderRuleTemplates';
import {installRailEditingWorkflows} from '../../src/configStudio/railEditingTemplates';
import {compileWorkflowEditPlan,hydrateWorkflowEdit,findEditingWorkflow,isQuickMappingWorkflow,buildWorkflowEditRecord} from '../../src/configStudio/workflowEditing';
import {prepareNativeWorkflowEdit} from '../../src/configStudio/workflowEditCommit';
import {readMultipartGeometry} from '../../src/core/geometry/multipartGeometry';
import {validateConfigPackage} from '../../src/configStudio/runtime';
import {buildConfigPackageArchive,readConfigPackage} from '../../src/configStudio/package';
const fixture=JSON.parse(fs.readFileSync('scripts/config-tools/fixtures/v1-rail-editing-reference.json','utf8'));
const base=migrateConfigToR9(createEditableConfigPackageFromCurrentProject()),config=installRailEditingWorkflows(base),report=validateConfigPackage(config);assert(report.valid,JSON.stringify(report.issues.filter(i=>i.severity==='error')));assert.equal(config.workflows.length,27);assert.equal(base.workflows.length,20);
for(const test of fixture.cases){
 assert.deepEqual(prepareNativeFeatureImport(config,test.original,'zth').record,test.original);assert.throws(()=>prepareNativeFeatureImport(config,test.original,'eden'),/世界/);
 const workflow=findEditingWorkflow(config,test.original)!;assert(workflow&&workflow.id===`v3-editor-${test.classCode.toLowerCase()}`);assert(!isQuickMappingWorkflow(workflow));assert.equal(workflow.mode,'composed');assert(workflow.editor?.dedicated);
 const plan=compileWorkflowEditPlan(workflow,config),draft=hydrateWorkflowEdit(plan,test.original);
 assert.deepEqual(plan.controls.filter(c=>!c.systemManaged).map(c=>plan.bindings.find(b=>b.slot===c.slot)!.target),[...test.view.fields.map((f:any)=>({path:f.path,order:f.order})),...test.view.groups.map((g:any)=>({path:g.path,order:g.order}))].sort((a,b)=>a.order-b.order).map(item=>item.path));
 assert(!plan.controls.some(c=>c.prefillField==='extensions.link.wiki'||c.id.endsWith('-wiki')||c.id.endsWith('-brief')),'hidden V1 wiki/brief are preserved through the common module');
 for(const binding of plan.bindings)assert.deepEqual(plan.controls.find(c=>c.slot===binding.slot)?.kind==='group'&&draft.slots[binding.slot]===undefined?[]:draft.slots[binding.slot],test.projectedValues[binding.target],`${test.classCode}/${binding.target} backfill`);
 assert.deepEqual(buildWorkflowEditRecord(plan,test.original,draft),test.original);
 const name=plan.bindings.find(b=>b.target==='Name')!;draft.slots[name.slot]='V1 edited '+test.classCode;
 const geometry=readMultipartGeometry(test.original,workflow.outputs[0].geometry.selected).geometry!;
 const actual=prepareNativeWorkflowEdit(config,workflow,test.original,draft,geometry,'zth','editing-user',[],new Date('2026-10-12T00:00:00Z'));assert.deepEqual(actual,test.updated,`${test.classCode}: complete edited record differs from frozen V1 actual parser/formatter`);
 if(test.classCode==='PLF'){const lines=plan.bindings.find(b=>b.target==='lines')!;const values=draft.slots[lines.slot] as any[];assert.equal(values[0].stationCode,0);assert.equal(values[0].Avaliable,false);assert.equal(actual.Situation,false);assert.equal(actual.Connect,false);const changed=structuredClone(draft);(changed.slots[lines.slot] as any[])[0].stationDistance=3;assert.equal((prepareNativeWorkflowEdit(config,workflow,test.original,changed,geometry,'zth','editing-user',[]).lines as any[])[0].stationDistance,3);}
 if(test.classCode==='RLE'){const reversed=reverseWorkflowEditEndpoints(plan,draft),reversedRecord=buildWorkflowEditRecord(plan,test.original,reversed);assert.equal(reversedRecord.startplf,test.original.endplf);assert.equal(reversedRecord.endplf,test.original.startplf);const direction=plan.controls.find(c=>c.id==='edit-RLE-direction')!;assert.equal(direction.kind,'select');assert.equal(direction.optionValueType,'number');assert(direction.options?.find(o=>o.value==='1')?.label.zh==='上行');}
}
const blob=await buildConfigPackageArchive(config),roundtrip=await readConfigPackage(blob);assert.deepEqual(roundtrip.workflows.filter(w=>w.editor?.dedicated),JSON.parse(JSON.stringify(config.workflows.filter(w=>w.editor?.dedicated))));
assert.throws(()=>installRailEditingWorkflows(config),/已存在/);
console.log('r9-rail-editing: seven V1 editor scenes, control order/values/groups, seven complete frozen V1 actual edited records, false/zero, hidden wiki/brief preservation, capture exclusion and ZIP roundtrip: OK');
