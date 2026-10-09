import assert from 'node:assert/strict';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { prepareConfigForActivation } from '../../src/configStudio/configActivation';
import { configCompilationStats, isCompiledConfigRuntime, resolveCategoryNodes, resolveEffectiveFields, resolveGeometryProfile, resolveRenderExtensions, resolveCardConfiguration, resolveSelectableFields, resolveZoomRule } from '../../src/configStudio/runtime';
import { resolveConfigRuntimeRule } from '../../src/components/Rules/configRuntime/configPackageAdapter';
import { FeatureStore } from '../../src/components/Rules/data/featureStore';

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
    const a = resolveGeometryProfile(snapshot, node.path, geometry), b = resolveGeometryProfile(source, node.path, geometry);
    if (a && b) for (let zoom = 0; zoom <= 8; zoom++) assert.deepEqual(resolveZoomRule(a, zoom), resolveZoomRule(b, zoom));
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
const colorConfig = createConfigPackageFromCurrentProject();
for (const rule of colorConfig.nodes.find(n => n.path.class === 'ROD' && !n.path.kind)!.geometryProfiles.LineString!.zoomPriority.rules) if (rule.style) rule.style.stroke = { mode: 'field', field: 'Name' };
const active = prepareConfigForActivation(colorConfig);
const record: any = { uid: 'cache-rod', type: 'Polyline', featureInfo: { ID: 'cache-rod', Class: 'ROD', World: 'zth', Name: '#aabbcc' }, meta: { Class: 'ROD', idValue: 'cache-rod', sig: {}, groups: {} }, coords3: [{ x: 0, y: -64, z: 0 }, { x: 100, y: -64, z: 0 }] };
const ctx: any = { worldId: 'zth', zoomLevel: 6, leafletZoom: 3, dataVersion: 1, inFloorView: false, activeBuildingUid: null, activeFloorSelector: null, activeBuildingFloorRefSet: null };
const store = new FeatureStore([record]);
const first = resolveConfigRuntimeRule(active, record, ctx, null, store)!;
assert(first); assert.strictEqual(resolveConfigRuntimeRule(active, record, ctx, null, store), first);
record.featureInfo.Name = '#dd3344'; ctx.dataVersion++;
const changed = resolveConfigRuntimeRule(active, record, ctx, null, store)!;
assert.notStrictEqual(changed, first);
assert.equal((changed.display as any).geometry.stroke, '#dd3344');
const replacement = { ...record, featureInfo: { ...record.featureInfo, Name: '#223344' } };
assert.notStrictEqual(resolveConfigRuntimeRule(active, replacement, ctx, null, new FeatureStore([replacement])), changed);
ctx.activeFloorSelector = 'floor2'; assert.notStrictEqual(resolveConfigRuntimeRule(active, record, ctx, null, store), changed);
console.log('compiled-runtime: independent inheritance/extensions/Zoom equality, immutable same-revision activation, bounded paths, hot bindings and data/store/context invalidation: OK');
