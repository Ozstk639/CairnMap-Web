import assert from 'node:assert/strict';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { migrateRenderRulesToR7 } from '../../src/configStudio/renderRuleMigration';
import { matchesRenderFields, renderRuleRange, isClassificationConditionField } from '../../src/configStudio/renderRuleConditions';
import { prepareConfigForActivation } from '../../src/configStudio/configActivation';
import { resolveGeometryProfile, resolveZoomRule, validateConfigPackage } from '../../src/configStudio/runtime';
import { resolveConfigRuntimeRule } from '../../src/components/Rules/configRuntime/configPackageAdapter';
import { FeatureStore } from '../../src/components/Rules/data/featureStore';

const source = createConfigPackageFromCurrentProject();
const migration = migrateRenderRulesToR7(source);
assert(migration.config, JSON.stringify(migration.issues));
const config = prepareConfigForActivation(migration.config!);
assert.equal(config.contractRevision, 7); assert.equal(source.contractRevision, 6);
assert(matchesRenderFields({ op: 'all', items: [{ kind: 'fieldEquals', field: 'x', value: 'false' }, { op: 'not', items: [{ kind: 'fieldEquals', field: 'y', value: '1' }] }] }, field => field === 'x' ? false : 0));
assert(!matchesRenderFields({ op: 'all', items: [] }, () => undefined));
const normalize = (rule: unknown) => JSON.parse(JSON.stringify(rule, (key, value) => key === 'name' ? undefined : value));
let count = 0;
for (const node of source.nodes) for (const geometry of ['Point', 'LineString', 'Polygon'] as const) {
  if (!resolveGeometryProfile(source, node.path, geometry)?.enabled) continue;
  for (const direction of ['0', '1', '3']) for (const Connect of [false, true]) for (let zoom = 0; zoom <= 8; zoom++) {
    const featureInfo = { ID: 'comparison', World: 'zth', Class: node.path.class, Kind: node.path.kind, SKind: node.path.skind, SKind2: node.path.skind2, Name: '比较', direction, Connect };
    const record: any = { uid: 'comparison', featureInfo, type: geometry === 'Point' ? 'Points' : geometry === 'LineString' ? 'Polyline' : 'Polygon', meta: { Class: node.path.class, idValue: 'comparison', sig: {}, groups: {} }, p3: { x: 0, y: -64, z: 0 }, coords3: [{ x: 0, y: -64, z: 0 }, { x: 100, y: -64, z: 0 }, { x: 100, y: -64, z: 100 }, { x: 0, y: -64, z: 0 }] };
    const ctx: any = { worldId: 'zth', zoomLevel: zoom, leafletZoom: zoom - 3, inFloorView: false, activeBuildingUid: null, activeFloorSelector: null, activeBuildingFloorRefSet: null };
    const store = new FeatureStore([record]);
    assert.deepEqual(normalize(resolveConfigRuntimeRule(config, record, ctx, null, store)), normalize(resolveConfigRuntimeRule(source, record, ctx, null, store)), `${node.nodeId}/${geometry}/${direction}/${Connect}/${zoom}`); count++;
  }
}
for (const field of ['Class', 'Kind', 'SKind', 'Skind2', 'PLineKind', 'tags.Class']) assert(isClassificationConditionField(field));
assert(!isClassificationConditionField('extensions.Class'));
for (const field of ['Class', 'SKind', 'tags.Class', 'missing', 'extensions.__proto__.x']) {
  const bad = structuredClone(config); const rule = Object.values(bad.nodes[0].geometryProfiles)[0]!.zoomPriority.rules[0];
  rule.when!.fields = { op: 'all', items: [{ op: 'not', items: [{ kind: 'fieldEquals', field, value: 'x' }] }] };
  assert(!validateConfigPackage(bad).valid, field); assert.throws(() => prepareConfigForActivation(bad));
}
const cumulative = structuredClone(source); const profile = cumulative.nodes.find(n => n.path.class === 'ROD' && !n.path.kind)!.geometryProfiles.LineString!;
const original = profile.zoomPriority.rules.at(-1)!;
original.conditionalOverrides = [{ id: 'width', when: [{ kind: 'fieldEquals', field: 'Name', value: 'both' }], style: { ...original.style!, weight: 17 } }, { id: 'label', when: [{ kind: 'fieldEquals', field: 'Name', value: 'both' }], label: { ...original.label!, style: { ...original.label!.style!, size: 23 } } }];
const combined = migrateRenderRulesToR7(cumulative); assert(combined.config, JSON.stringify(combined.issues));
const target = combined.config!.nodes.find(n => n.nodeId === cumulative.nodes.find(n => n.path.class === 'ROD' && !n.path.kind)!.nodeId)!.geometryProfiles.LineString!;
const selected = resolveZoomRule(target, renderRuleRange(original).max, () => 'both')!;
assert.equal(selected.style!.weight, 17); assert.equal(selected.label!.style!.size, 23);
original.conditionalOverrides[0].when = [{ kind: 'fieldEquals', field: 'Class', value: 'ROD' }];
assert.equal(migrateRenderRulesToR7(cumulative).config, undefined);
console.log(`render-r7: ${count} r6/r7 native results equal, cumulative combinations, AND/NOT, classification/unknown paths, immutable activation and migration isolation: OK`);
