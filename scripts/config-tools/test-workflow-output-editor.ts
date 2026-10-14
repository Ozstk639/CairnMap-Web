import assert from 'node:assert/strict';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { validateWorkflowDefinition } from '../../src/configStudio/runtime';
import { canonicalizeWorkflow } from '../../src/configStudio/V3WorkflowEditor';
import { evaluateV3Expression, evaluateV3WorkflowOutputs, validateV3WorkflowInputs } from '../../src/configStudio/V3WorkflowRunner';
import { parseWorkflowExpression, workflowExpressionTokens } from '../../src/configStudio/workflowExpression';
import { canSwitchStudioTab, workflowStudioUrl } from '../../src/configStudio/studioSession';

assert.deepEqual(workflowExpressionTokens(parseWorkflowExpression('join("fixed,+literal",WorldPrefix+Class,A,"text")')), ['WorldPrefix', 'Class', 'A']);
assert.equal(evaluateV3Expression('join("_",WorldPrefix+Class,A,B)', { A: '', B: 'abbr' }, { WorldPrefix: 'Z', Class: 'ROD' }), 'ZROD_abbr');
assert.equal(evaluateV3Expression('A+"a+b, escaped \\"quote\\""', { A: 'x' }, {}), 'xa+b, escaped "quote"');
assert.equal(evaluateV3Expression('World', { World: 'other' }, { World: 'zth' }), 'zth');
assert.equal(evaluateV3Expression('false', {}, {}), false);
assert.equal(evaluateV3Expression('42', {}, {}), 42);
for (const source of ['A;', 'A.foo', 'A+', 'eval(A)', 'join("_",)', '"unclosed', 'A*B']) assert.throws(() => parseWorkflowExpression(source), source);

const config = createConfigPackageFromCurrentProject();
const workflow = canonicalizeWorkflow(structuredClone(config.workflows.find((item) => item.mode === 'composed' && item.outputs[0]?.classification.class === 'ROD')!), config);
assert.ok(validateWorkflowDefinition(workflow, config).valid);
const output = workflow.outputs[0];
const reject = (mutate: (draft: typeof workflow) => void, code: string) => {
  const draft = structuredClone(workflow); mutate(draft);
  assert.ok(validateWorkflowDefinition(draft, config).issues.some((issue) => issue.code === code), code);
};
reject((draft) => { draft.outputs[0].classification = { class: 'UNKNOWN' }; }, 'workflow-output-classification-invalid');
reject((draft) => { draft.outputs[0].geometry.selected = '' as never; }, 'workflow-output-geometry-required');
reject((draft) => { const controls = draft.steps.flatMap((step) => step.controls ?? []).filter((control) => control.slot); controls[1].slot = controls[0].slot; }, 'workflow-slot-invalid');
reject((draft) => { draft.steps.flatMap((step) => step.controls ?? []).find((control) => !control.systemManaged)!.slot = ''; }, 'workflow-slot-required');
reject((draft) => { draft.steps[1].id = draft.steps[0].id; }, 'workflow-id-invalid');
const withControl = (control: Record<string, unknown>) => {
  const draft = structuredClone(workflow);
  draft.steps.find((step) => step.kind === 'form')!.controls!.push({ id: 'negative', slot: 'TEST', label: { zh: '测试', en: '' }, kind: 'text', ...control } as never);
  return draft;
};
assert.ok(!validateWorkflowDefinition(withControl({ kind: 'featureSearch', search: { target: { class: 'ROD' }, queryFields: ['UNKNOWN'], displayTemplate: '{{Name}}', returnField: 'UNKNOWN' } }), config).valid);
assert.ok(!validateWorkflowDefinition(withControl({ kind: 'select', options: [{ value: '1', label: { zh: '一', en: '' } }, { value: '1', label: { zh: '二', en: '' } }] }), config).valid);
assert.ok(!validateWorkflowDefinition(withControl({ kind: 'group', group: { storage: 'scalar', itemFields: [{ key: 'bad', kind: 'text', label: { zh: '', en: '' } }] } }), config).valid);
const selectDraft = withControl({ kind: 'select', options: [{ value: '1', label: { zh: '显示一', en: '' } }] });
assert.ok(validateV3WorkflowInputs(selectDraft, { TEST: '显示一' }).some((issue) => issue.controlId === 'negative'));
assert.ok(!validateV3WorkflowInputs(selectDraft, { TEST: '1' }).some((issue) => issue.controlId === 'negative'));
assert.ok(validateV3WorkflowInputs(withControl({ kind: 'number' }), { TEST: 'NaN' }).some((issue) => issue.controlId === 'negative'));
const scalarDraft = withControl({ kind: 'group', group: { storage: 'scalar', itemFields: [{ key: '', kind: 'text', label: { zh: '值', en: '' } }] } });
assert.ok(validateV3WorkflowInputs(scalarDraft, { TEST: [{ value: 'a' }] }).some((issue) => issue.controlId === 'negative'));
assert.ok(!validateV3WorkflowInputs(scalarDraft, { TEST: ['a', 'b'] }).some((issue) => issue.controlId === 'negative'));
scalarDraft.outputs[0].assignments.push({ id: 'scalar', target: 'tags.scalar', expression: 'TEST' });
assert.deepEqual((evaluateV3WorkflowOutputs(scalarDraft, { TEST: ['a', 'b'] })[0].record.tags as Record<string, unknown>).scalar, ['a', 'b']);
assert.ok(validateV3WorkflowInputs(workflow, { tags: '[]' }).some((issue) => issue.message.includes('JSON 对象')));
output.assignments.push({ id: 'test-text', target: 'tags.custom', expression: '"literal words do not name slots"' });
assert.ok(validateWorkflowDefinition(workflow, config).valid);
output.assignments.at(-1)!.expression = 'UNKNOWN_SLOT';
assert.ok(validateWorkflowDefinition(workflow, config).issues.some((issue) => issue.code === 'workflow-assignment-slot-missing'));
output.assignments.at(-1)!.expression = '"safe"';
output.assignments.at(-1)!.target = 'tags.constructor.polluted';
assert.ok(validateWorkflowDefinition(workflow, config).issues.some((issue) => issue.code === 'workflow-assignment-target-invalid'));
assert.throws(() => evaluateV3WorkflowOutputs(workflow, {}));
assert.equal(({} as Record<string, unknown>).polluted, undefined);
output.assignments.at(-1)!.target = 'tags.custom';
output.assignments.at(-1)!.expression = 'World';
assert.equal(evaluateV3WorkflowOutputs(workflow, { World: 'other' }, { world: 'Z' })[0].record.World, 'zth');
assert.equal((evaluateV3WorkflowOutputs(workflow, {}, { world: 'Z' })[0].record.tags as Record<string, unknown>).custom, 'zth');

for (const feature of [false, true]) for (const workflowDraft of [false, true]) {
  assert.equal(canSwitchStudioTab('features', 'workflows', { feature, workflow: workflowDraft }), !feature && !workflowDraft);
  assert.equal(canSwitchStudioTab('workflows', 'features', { feature, workflow: workflowDraft }), !feature && !workflowDraft);
  assert.equal(canSwitchStudioTab('features', 'features', { feature, workflow: workflowDraft }), true);
}
const compatibility = new URL(workflowStudioUrl('http://localhost/?workspace=config-workflow&keep=1'));
assert.equal(compatibility.searchParams.get('workspace'), 'config-studio');
assert.equal(compatibility.searchParams.get('tab'), 'workflows');
assert.equal(compatibility.searchParams.get('keep'), '1');
console.log('workflow-output-editor: safe expressions, targets, World and draft transitions: OK');
