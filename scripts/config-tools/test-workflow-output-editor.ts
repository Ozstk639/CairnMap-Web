import assert from 'node:assert/strict';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { validateWorkflowDefinition } from '../../src/configStudio/runtime';
import { canonicalizeWorkflow } from '../../src/configStudio/V3WorkflowEditor';
import { evaluateV3Expression, evaluateV3WorkflowOutputs } from '../../src/configStudio/V3WorkflowRunner';
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
