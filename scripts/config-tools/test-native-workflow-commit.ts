import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { prepareNativeWorkflowCommit } from '../../src/configStudio/nativeWorkflowCommit';
const config = createConfigPackageFromCurrentProject();
const fixtures = JSON.parse(fs.readFileSync('scripts/config-tools/fixtures/v1-workflow-output-parity.json', 'utf8'));
for (const fixture of fixtures.cases) {
  const workflow = config.workflows.find(item => item.id === `v3-${fixture.schemaKey}`)!;
  const record = structuredClone(fixture.expectedRecord);
  record.extensions = { ...record.extensions, nativeUserField: [{ value: 'preserved' }] };
  const result = [{ outputId: workflow.outputs[0].id, classification: fixture.classification, geometry: fixture.geometry, record }];
  const batch = prepareNativeWorkflowCommit(config, workflow, result, 'zth');
  assert.deepEqual(batch[0].record, record, 'Native commit rebuilt or discarded authored record fields');
  assert.notEqual(batch[0].record, record);
  assert.throws(() => prepareNativeWorkflowCommit(config, workflow, result, 'naraku'), /世界/);
  const invalid = structuredClone(result); delete invalid[0].record.CoordP; delete invalid[0].record.CoordL; delete invalid[0].record.CoordG;
  assert.throws(() => prepareNativeWorkflowCommit(config, workflow, invalid, 'zth'), /几何/);
}
console.log('native-workflow-commit: 34 actual final records preserved, world/geometry rejected before writes: OK');
