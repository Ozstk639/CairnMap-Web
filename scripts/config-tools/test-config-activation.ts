import assert from 'node:assert/strict';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { prepareConfigForActivation } from '../../src/configStudio/configActivation';
import { buildConfigPackageArchive } from '../../src/configStudio/package';
import { resolveEffectiveFields, resolveWorkflowSelectOptions, validateConfigPackage } from '../../src/configStudio/runtime';
import { shouldReuseNativePlacement } from '../../src/components/Rules/rendering/label/labelRuntimeStability';
import { resolveConfigRuntimeScreenGate, resolveConfigRuntimeRule } from '../../src/components/Rules/configRuntime/configPackageAdapter';

const config = createConfigPackageFromCurrentProject();
const valid = validateConfigPackage(config);
assert.equal(valid.valid, true, JSON.stringify(valid.issues.filter(i => i.severity === 'error')));
assert.deepEqual(prepareConfigForActivation(config), config);
for (const mutate of [
  (c: any) => c.engine.screenGateDefaults.polygonMinScreenAreaPx = -1,
  (c: any) => c.engine.typo = true,
  (c: any) => c.nodes[0].fields[0].unexpected = true,
  (c: any) => c.workflows.find((w: any) => w.outputs.length).outputs[0].assignments.push({ target: 'World', expression: 'UNKNOWN' }),
  (c: any) => c.nodes = 'malformed',
  (c: any) => c.contractRevision = 99,
  (c: any) => c.nodes.find((n: any) => n.path.class === 'BUD').geometryProfiles.Polygon.zoomPriority.rules[1].extensions.collision.boundsAdjustment.y = 999,
]) {
  const bad = structuredClone(config) as any; mutate(bad);
  assert.throws(() => prepareConfigForActivation(bad));
  await assert.rejects(() => buildConfigPackageArchive(bad, valid), 'stale valid report cannot bypass archive validation');
}
const global = structuredClone(config);
global.engine.renderDefaults = { Polygon: { screenGate: { mode: 'override', minScreenAreaPx: 123 } } };
const node = global.nodes.find(n => n.path.class === 'ISG' && !n.path.kind)!;
node.geometryProfiles!.Polygon!.zoomPriority.rules.forEach(rule => { rule.extensions = { ...rule.extensions, screenGate: { mode: 'inherit' } }; });
const feature: any = { type: 'Polygon', featureInfo: { Class: 'ISG', World: 'zth' }, meta: { Class: 'ISG', sig: {} } };
assert.equal(resolveConfigRuntimeScreenGate(global, feature, { worldId: 'zth', zoomLevel: 6 } as any)!.minScreenAreaPx, 123);
global.engine.renderDefaults.Polygon!.anchor = { preferViewportCenter: true };
for (const rule of node.geometryProfiles!.Polygon!.zoomPriority.rules) { rule.conditionalOverrides=[];rule.extensions!.polygonCandidates = { mode: 'fixedInterior' }; }
assert.equal((resolveConfigRuntimeRule(global, feature, { worldId: 'zth', zoomLevel: 6 } as any, null)!.display as any).anchor.largeFeature.preferViewportCenter, true);
for (const rule of node.geometryProfiles!.Polygon!.zoomPriority.rules) { rule.extensions!.polygonCandidates!.preferViewportCenter = false; }
assert.equal((resolveConfigRuntimeRule(global, feature, { worldId: 'zth', zoomLevel: 6 } as any, null)!.display as any).anchor.largeFeature.preferViewportCenter, false);
const source = structuredClone(config);
source.registries!.optionSets!.push({ id: 'user-options', label: { zh: '自定义', en: '' }, options: [{ value: 'stored', label: { zh: '显示', en: '' } }] });
assert.equal(resolveWorkflowSelectOptions(source, { optionSource: { registryKey: 'user-options' }, options: [] } as any)[0].value, 'stored');
const root = source.nodes.find(n => n.path.class === 'TPP' && !n.path.kind)!;
const child = source.nodes.find(n => n.path.class === 'TPP' && n.path.kind === 'NOM')!;
root.fields.push({ ...root.fields[0], fieldId: 'local-test', key: 'localTest', labels: { zh: 'local', en: '' }, required: false, type: 'string', input: 'text', options: undefined, optionSource: undefined, inheritance: 'localOnly' });
assert(!resolveEffectiveFields(source, child.path).some(f => f.key === 'localTest'));
root.fields.push({ ...root.fields[0], fieldId: 'sealed-test', key: 'sealedTest', labels: { zh: 'sealed', en: '' }, required: false, type: 'string', input: 'text', options: undefined, optionSource: undefined, inheritance: 'sealed' });
child.fields.push({ ...root.fields[root.fields.length - 1], fieldId: 'override-test', labels: { zh: 'override', en: '' }, type: 'number', overrideOf: 'sealedTest' });
assert(validateConfigPackage(source).issues.some(issue => issue.code === 'field-sealed-override'));
const settings = { enabled: true, freezeDuringPan: true, hysteresisPx: 10 };
assert(shouldReuseNativePlacement({ settings, reason: 'move', sameContent: true, sameZoom: true, panDistancePx: 200 }));
assert(!shouldReuseNativePlacement({ settings, reason: 'move', sameContent: false, sameZoom: true, panDistancePx: 0 }));
assert(shouldReuseNativePlacement({ settings, reason: 'moveend', sameContent: true, sameZoom: true, panDistancePx: 5 }));
assert(!shouldReuseNativePlacement({ settings, reason: 'moveend', sameContent: true, sameZoom: true, panDistancePx: 11 }));
assert(shouldReuseNativePlacement({ settings: { ...settings, recomputeOnZoomEnd: false }, reason: 'zoomend', sameContent: true, sameZoom: false, panDistancePx: 0 }));
console.log('config-activation: strict schema, activation/archive rejection, global consumers, option sources, field inheritance and placement lifecycle: OK');
