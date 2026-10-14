import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFormatDef, type FeatureKey, type DrawMode } from '../../src/components/Common/featureFormats';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { getOpenRIAMapWorkflowConfigs } from '../../src/core/project/openriamapRiaWorkflows';
import { validateWorkflowDefinition } from '../../src/configStudio/runtime';

const fixture = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/external-v1-workflow-output-parity.json'), 'utf8'));
const config = createConfigPackageFromCurrentProject();
const v1Workflows = getOpenRIAMapWorkflowConfigs();
for (const item of fixture.cases) {
  const definition = getFormatDef(item.subType as FeatureKey);
  const external = config.workflows.find((workflow) => workflow.mode === 'external' && workflow.external?.componentKey === item.componentKey)!;
  assert.ok(external && validateWorkflowDefinition(external, config).valid);
  assert.ok(v1Workflows.some((workflow) => workflow.componentKey === item.componentKey));
  const actual = definition.buildFeatureInfo({ op: 'create', mode: item.mode as DrawMode, coords: item.coords, values: item.values, groups: item.groups, worldId: 'zth', editorId: 'fixture-user', now: new Date(fixture.now) });
  assert.ok(external.external!.coveredClassifications!.some((scope) => scope.class === actual.Class), `${item.subType}: external classification coverage`);
  assert.deepEqual(actual, item.expectedRecord, `${item.subType}: retained external final record differs from frozen original V1`);
}
assert.equal(fixture.cases.length, 7);
assert.equal(new Set(fixture.cases.map((item: { componentKey: string }) => item.componentKey)).size, 3);
console.log('external-workflow-output-parity: 7 frozen original V1 final records across railway/station/TRP: OK');
