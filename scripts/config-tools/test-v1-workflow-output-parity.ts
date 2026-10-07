import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKFLOW_EDITOR_SCHEMAS, projectRegistryScene } from '../../src/components/Common/workflowEditorRegistry';
import { getOpenRIAMapWorkflowConfigs } from '../../src/core/project/openriamapRiaWorkflows';
import { listWorkflowOutputPaths } from '../../src/core/project/workflowOutputAssembler';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { listCategoryPaths, pathMatchesScope, resolveGeometryProfile, validateWorkflowDefinition } from '../../src/configStudio/runtime';
import { evaluateV3WorkflowOutputs, normalizeV3WorldId } from '../../src/configStudio/V3WorkflowRunner';
import { finalizeV3WorkflowRecord } from '../../src/configStudio/workflowRecord';
import { assembleV1SchemaRecord } from './v1-workflow-reference';

const config = createConfigPackageFromCurrentProject();
const now = new Date('2026-10-07T00:00:00Z');
const cases: unknown[] = [];
for (const schema of WORKFLOW_EDITOR_SCHEMAS) {
  const workflow = config.workflows.find((candidate) => candidate.id === `v3-${schema.schemaKey}`);
  if (!workflow) {
    assert.ok(['RLE', 'STA', 'PLF', 'PFB', 'STB', 'SBP', 'STF', 'TRP'].includes(String(schema.match.classCode)), `Unexpected unmigrated schema: ${schema.schemaKey}`);
    continue;
  }
  assert.equal(workflow.mode, 'composed');
  assert.ok(validateWorkflowDefinition(workflow, config).valid, schema.schemaKey);
  const projected = projectRegistryScene(schema, 'workflow');
  const output = workflow.outputs[0];
  const classification = listCategoryPaths(config, output.classification).find((item) => pathMatchesScope(item, output.classification) && !config.nodes.some((node) => pathMatchesScope(node.path, item) && JSON.stringify(node.path) !== JSON.stringify(item)) && resolveGeometryProfile(config, item, output.geometry.selected)?.enabled) ?? output.classification;
  for (const optionalCategory of ['', ' CAT ']) {
    const inputs: Record<string, unknown> = { abbr: ' A B中-1 ', catAbbr: optionalCategory };
    const slots: Record<string, unknown> = { actor: 'fixture-user' };
    const controls = workflow.steps.flatMap((step) => step.controls ?? []);
    for (const field of projected.fields) {
      const control = controls.find((item) => item.id.startsWith(`${schema.schemaKey}-${field.key}-`))!;
      assert.ok(control?.slot, `${schema.schemaKey}: missing input ${field.key}`);
      const value = control.kind === 'number' ? 2 : control.kind === 'toggle' ? true : control.kind === 'select' ? control.options?.[0]?.value ?? 'fixture' : ' sample ';
      inputs[field.key] = value; slots[control.slot!] = value;
    }
    for (const aux of projected.auxInputs) {
      const control = controls.find((item) => item.id.startsWith(`${schema.schemaKey}-${aux.key}-`))!;
      assert.ok(control?.slot);
      slots[control.slot!] = inputs[aux.key] ?? ' sample ';
      if (aux.idAssemblyOnly) assert.ok(!output.assignments.some((assignment) => assignment.target === `extensions.workflow.${aux.key}`));
    }
    for (const group of projected.groups) {
      const control = controls.find((item) => item.id.startsWith(`${schema.schemaKey}-${group.key}-`))!;
      assert.ok(control?.group && control.slot);
      const rows = !optionalCategory && group.optional ? [] : [Object.fromEntries(group.fields.map((field) => [field.key, field.options?.[0]?.value ?? `${field.key}-fixture`]))];
      inputs[group.key] = rows; slots[control.slot!] = rows;
      assert.deepEqual(control.group.itemFields.map((field) => field.key), group.fields.map((field) => field.key));
    }
    const coords = output.geometry.selected === 'Point' ? [{ x: 0, y: -64, z: 0 }] : output.geometry.selected === 'LineString' ? [{ x: 0, y: -64, z: 0 }, { x: 20, y: -64, z: 10 }] : [{ x: 0, y: -64, z: 0 }, { x: 20, y: -64, z: 0 }, { x: 20, y: -64, z: 20 }, { x: 0, y: -64, z: 0 }];
    const v1 = assembleV1SchemaRecord(schema, inputs, { classification, world: 'zth', worldPrefix: 'Z', actor: 'fixture-user', coords, now });
    // World has an explicit, accepted canonical-id migration. All other fields
    // are compared as complete records, including geometry and system metadata.
    v1.World = normalizeV3WorldId(v1.World);
    const run = evaluateV3WorkflowOutputs(workflow, slots, { world: 'zth', classifications: { [output.id]: classification } })[0];
    const v3 = finalizeV3WorkflowRecord(config, { ...output, classification }, run.record, { coords, now });
    assert.deepEqual(v3, v1, `${schema.schemaKey}: category=${optionalCategory}`);
    assert.deepEqual(evaluateV3WorkflowOutputs(workflow, slots, { world: 'zth', classifications: { [output.id]: classification }, config, coordinates: { [output.id]: coords }, now })[0].record, v1);
    const imported = JSON.parse(JSON.stringify(workflow));
    assert.deepEqual(evaluateV3WorkflowOutputs(imported, slots, { world: 'zth', classifications: { [output.id]: classification } }), [run]);
    cases.push({ schemaKey: schema.schemaKey, classification, geometry: output.geometry.selected, inputs, expectedRecord: v1, assignments: output.assignments, controls: controls.map(({ id, slot, kind, options, search, group, required, defaultValue, valueNormalization }) => ({ id, slot, kind, options, search, group, required, defaultValue, valueNormalization })) });
  }
}
assert.equal(cases.length, 34);
const external = config.workflows.filter((workflow) => workflow.mode === 'external');
assert.deepEqual(external.map((workflow) => workflow.external?.reason).sort(), ['railway-integrated', 'station-integrated', 'trp-integrated']);
const sourceWorkflows = getOpenRIAMapWorkflowConfigs().map((workflow) => ({ id: workflow.id, class: workflow.targetClass, componentKey: workflow.componentKey, outputPaths: listWorkflowOutputPaths(workflow), retainedExternal: external.some((item) => item.external?.componentKey === workflow.componentKey) }));
const manifest = { schemaVersion: 'cairnmap.v1-v3-workflow-fixtures.v1', sourceWorkflows, cases };
const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/v1-workflow-output-parity.json');
if (process.argv.includes('--write-fixtures')) { fs.mkdirSync(path.dirname(fixturePath), { recursive: true }); fs.writeFileSync(fixturePath, JSON.stringify(manifest, null, 2) + '\n'); }
else assert.deepEqual(JSON.parse(fs.readFileSync(fixturePath, 'utf8')), JSON.parse(JSON.stringify(manifest)), 'Frozen workflow fixture manifest changed');
console.log(`v1-workflow-output-parity: ${cases.length} complete records, ${external.length} controlled external bindings: OK`);
