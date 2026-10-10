import assert from 'node:assert/strict';
import { createEditableConfigPackageFromCurrentProject } from '../../src/configStudio/renderRuleTemplates';
import { validateConfigPackage, validateWorkflowDefinition } from '../../src/configStudio/runtime';
import { canonicalizeWorkflow } from '../../src/configStudio/V3WorkflowEditor';
import { assembleAnnotations } from '../../src/configStudio/workflowAnnotations';
import { evaluateV3WorkflowOutputs,validateV3WorkflowInputs } from '../../src/configStudio/V3WorkflowRunner';
import { migrateWorkflowForms } from '../../src/configStudio/workflowFormMigration';
const config=createEditableConfigPackageFromCurrentProject();
const report=validateConfigPackage(config);assert(report.valid,JSON.stringify(report.issues.filter(x=>x.severity==='error')));
for(const workflow of config.workflows.filter(x=>x.mode==='composed')){
 const annotations=workflow.steps.flatMap(s=>s.controls??[]).filter(c=>c.kind==='tagsExtensions');
 assert.equal(annotations.length,1);assert(!workflow.steps.some(s=>s.kind==='tagsExtensions'));assert.equal(workflow.steps[1].controls?.at(-1)?.id,annotations[0].id);
 const ids=workflow.steps.flatMap(s=>s.controls??[]).map(c=>[c.id,c.slot]);
 const canonical=canonicalizeWorkflow(workflow,config);assert.deepEqual(canonical.steps.flatMap(s=>s.controls??[]).map(c=>[c.id,c.slot]),ids);
 const moved=structuredClone(workflow);const controls=moved.steps[1].controls!;controls.unshift(controls.pop()!);assert.equal(canonicalizeWorkflow(moved,config).steps[1].controls?.[0].id,annotations[0].id);
 assert.equal(migrateWorkflowForms(moved).steps[1].controls?.[0].id,annotations[0].id);
}

assert.deepEqual(assembleAnnotations({tags:[{key:'自定字段',type:'text',value:'  保留空格  '}]}).tags,{'自定字段':'  保留空格  '});
assert.throws(()=>assembleAnnotations({extensions:[{group:'a',key:'b',type:'json',value:'1e400'}]}));
const values=assembleAnnotations({tags:[{key:'zero',type:'number',value:'0'},{key:'false',type:'bool',value:false},{key:'empty',type:'null',value:null}],extensions:[{group:'custom',key:'thing',type:'json',value:'[0,false,null,{"n":1}]'}]});
assert.deepEqual(values,{tags:{zero:0,false:false,empty:null},extensions:{custom:{thing:[0,false,null,{n:1}]}}});
assert.throws(()=>assembleAnnotations({tags:[{key:'x',type:'text',value:'a'},{key:'x',type:'text',value:'b'}]}),/第 2 行/);
assert.deepEqual(assembleAnnotations({tags:[{key:'',type:'text',value:''}]}),{tags:{},extensions:{}});
assert.throws(()=>assembleAnnotations({extensions:[{group:'constructor',key:'x',type:'text',value:'bad'}]}));
const workflow=structuredClone(config.workflows.find(w=>w.id==='v3-isg_ngf_lad')!),module=workflow.steps[1].controls!.find(c=>c.kind==='tagsExtensions')!;
workflow.outputs[0].classification={class:'ISG',kind:'NGF',skind:'LAD',skind2:'CON'};
workflow.outputs[0].assignments=[{id:'id',target:'ID',expression:'"TEST"'},{id:'automatic',target:'tags.nomenclator',expression:'"author"'}];
const annotations={[workflow.outputs[0].id]:{tags:[{key:'nomenclator',type:'text' as const,value:'author'}],extensions:[]}};
assert.equal((evaluateV3WorkflowOutputs(workflow,{[module.id]:annotations})[0].record.tags as any).nomenclator,'author');
annotations[workflow.outputs[0].id].tags[0].value='other';assert.throws(()=>evaluateV3WorkflowOutputs(workflow,{[module.id]:annotations}),/不同值/);
const two=structuredClone(workflow);two.outputs.push({...two.outputs[0],id:'second',assignments:[{id:'id2',target:'ID',expression:'"TEST2"'}]});const canonical=canonicalizeWorkflow(two,config);assert(validateWorkflowDefinition(canonical,config).valid);
const result=evaluateV3WorkflowOutputs(canonical,{[module.id]:{second:{tags:[{key:'onlySecond',type:'number',value:0}]}}});
assert.equal((result[1].record.tags as any).onlySecond,0);assert.equal((result[0].record.tags as any).onlySecond,undefined);
assert(validateV3WorkflowInputs(workflow,{[module.id]:{[workflow.outputs[0].id]:{tags:[{key:'x',type:'number',value:'bad'}]}}},[workflow.steps[1]],config).some(issue=>issue.controlId===module.id));
const complexSlots={[module.id]:{[workflow.outputs[0].id]:{advanced:{tags:{array:[],object:{},empty:''},extensions:{complex:{array:[],object:{},empty:'',values:[0,false,null]}}}}}};
const complete=evaluateV3WorkflowOutputs(workflow,complexSlots,{config,coordinates:{[workflow.outputs[0].id]:[{x:0,y:-64,z:0},{x:1,y:-64,z:0},{x:1,y:-64,z:1}]}})[0].record;
assert.deepEqual((complete.extensions as any).complex,{array:[],object:{},empty:'',values:[0,false,null]});
console.log('workflow-forms-r8: 17 default forms, stable slots and moved fixed modules, typed values, complex roundtrip, duplicate conflicts and output scoping: OK');
