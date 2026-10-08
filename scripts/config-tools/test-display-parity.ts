import assert from 'node:assert/strict';
import { FEATURE_RENDER_RULES } from '../../src/components/Rules/rendering/featureRenderRules';
import { resolveFeatureDisplayPlan } from '../../src/components/Rules/rendering/display/displayRuleResolver';
import { FeatureStore } from '../../src/components/Rules/data/featureStore';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { resolveConfigRuntimeRule } from '../../src/components/Rules/configRuntime/configPackageAdapter';
const config = createConfigPackageFromCurrentProject();
let cases = 0;
for (const cls of ['ROD', 'ISP', 'ISL', 'ISG', 'TPP', 'WRP', 'FLR', 'STF']) {
  const node = config.nodes.find(node => node.path.class === cls && !node.path.kind)!;
  const geometry = node.geometryType!;
  for (const zoom of [6, 7, 8]) {
    const type = geometry === 'Point' ? 'Points' : geometry === 'LineString' ? 'Polyline' : 'Polygon';
    const record: any = { uid: cls, type, meta: { Class: cls, Type: type, World: 'zth', idValue: cls, sig: {} }, featureInfo: { ID: cls, Class: cls, World: 'zth', Name: 'Parity' }, p3: { x: 0, y: -64, z: 0 }, coords3: [{ x: -50, y: -64, z: -50 }, { x: 50, y: -64, z: -50 }, { x: 50, y: -64, z: 50 }] };
    const ctx: any = { worldId: 'zth', leafletZoom: zoom - 3, zoomLevel: zoom, inFloorView: cls === 'FLR' || cls === 'STF', activeBuildingUid: null, activeFloorSelector: null, activeBuildingFloorRefSet: null };
    const store = new FeatureStore([record]);
    const v1 = FEATURE_RENDER_RULES.find(rule => rule.match.Class === cls)!;
    const legacy = resolveFeatureDisplayPlan(record, v1, ctx, store);
    const native: any = resolveConfigRuntimeRule(config, record, ctx, null, store);
    if (!native) continue;
    assert.equal(native.display.collision.priority, legacy.collision.priority, cls);
    assert.deepEqual(native.display.collision.collideWith, legacy.collision.collideWith, cls);
    if (cls === 'ROD') { const path = typeof v1.symbol!.pathStyle === 'function' ? v1.symbol!.pathStyle(record, ctx, store) : v1.symbol!.pathStyle!; assert.equal(native.display.geometry.strokeOpacity, path.opacity); assert.equal(native.symbol.label.styleKey, 'gm-bw-12'); }
    if (cls === 'ISP' || cls === 'ISL' || cls === 'ISG') assert.equal(native.symbol.labelClick.mode, 'labelOnly');
    cases++;
  }
}
console.log(`display-parity: ${cases} direct V1/V3 opacity, labelOnly, priority and obstacle-policy cases: OK`);
