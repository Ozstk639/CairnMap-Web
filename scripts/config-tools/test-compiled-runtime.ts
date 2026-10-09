import assert from 'node:assert/strict';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { prepareConfigForActivation } from '../../src/configStudio/configActivation';
import { configCompilationStats, isCompiledConfigRuntime, resolveCategoryNodes, resolveEffectiveFields, resolveGeometryProfile, resolveRenderExtensions, resolveCardConfiguration, resolveSelectableFields } from '../../src/configStudio/runtime';

const source = createConfigPackageFromCurrentProject();
const snapshot = prepareConfigForActivation(source);
assert(isCompiledConfigRuntime(snapshot));
assert(!isCompiledConfigRuntime(source));
assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.nodes[0]));
for (const node of source.nodes) {
  assert.deepEqual(resolveCategoryNodes(snapshot, node.path), resolveCategoryNodes(source, node.path));
  assert.deepEqual(resolveEffectiveFields(snapshot, node.path), resolveEffectiveFields(source, node.path));
  assert.deepEqual(resolveSelectableFields(snapshot, node.path), resolveSelectableFields(source, node.path));
  assert.deepEqual(resolveCardConfiguration(snapshot, node.path), resolveCardConfiguration(source, node.path));
  for (const geometry of ['Point', 'LineString', 'Polygon'] as const) {
    assert.deepEqual(resolveGeometryProfile(snapshot, node.path, geometry), resolveGeometryProfile(source, node.path, geometry));
    for (const rule of node.geometryProfiles[geometry]?.zoomPriority.rules ?? []) assert.deepEqual(resolveRenderExtensions(snapshot, geometry, rule.extensions), resolveRenderExtensions(source, geometry, rule.extensions));
  }
}
const original = resolveEffectiveFields(snapshot, source.nodes[0].path)[0].labels.zh;
source.nodes[0].fields[0].labels.zh = 'changed same revision';
assert.equal(resolveEffectiveFields(snapshot, source.nodes[0].path)[0].labels.zh, original);
const next = prepareConfigForActivation(source);
assert.equal(next.revision, snapshot.revision);
assert.equal(resolveEffectiveFields(next, source.nodes[0].path)[0].labels.zh, 'changed same revision');
assert.notEqual(configCompilationStats(snapshot)!.epoch, configCompilationStats(next)!.epoch);
const before = configCompilationStats(snapshot)!.hits;
for (let i = 0; i < 1000; i++) resolveGeometryProfile(snapshot, source.nodes[0].path, 'Point');
assert(configCompilationStats(snapshot)!.hits >= before + 1000);
for (let i = 0; i < 2000; i++) resolveCategoryNodes(snapshot, { class: 'unknown', kind: String(i) });
assert(configCompilationStats(snapshot)!.cachedPaths <= 1024);
console.log('compiled-runtime: independent inheritance/extensions equality, immutable activation, same-revision edits, hot hits and bounded paths: OK');
