import { FeatureStore } from '../../src/components/Rules/data/featureStore';
import { normalizeRuleSourceWorldId } from '../../src/components/Rules/data/ruleDataSources';
import { isConfigRuntimeRecordVisible, resolveConfigRuntimeContextForHost, resolveConfigRuntimeRule, resolveConfigRuntimeStackOrder } from '../../src/components/Rules/configRuntime/configPackageAdapter';
import { validateConfigPackage } from '../../src/configStudio/runtime';
import { createBlankV32Package, createDefaultGeometryProfile } from '../../src/configStudio/v32Defaults';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { evaluateV3WorkflowOutputs } from '../../src/configStudio/V3WorkflowRunner';

const config = createBlankV32Package();
if (normalizeRuleSourceWorldId('Z') !== 'zth' || normalizeRuleSourceWorldId('0') !== 'zth' || normalizeRuleSourceWorldId('零洲') !== 'zth') {
  throw new Error('World aliases were not normalized to the canonical V3 source id.');
}
const profile = createDefaultGeometryProfile('Polygon');
profile.anchor = 'perPart';
profile.zoomPriority.rules[0].minZoom = 0;
profile.zoomPriority.rules[0].maxZoom = 4;
profile.zoomPriority.rules[0].style = {
  ...profile.zoomPriority.rules[0].style!,
  stroke: { mode: 'fixed', color: '#8b5cf6' },
  fill: { mode: 'fixed', color: '#7c3aed' },
};
profile.zoomPriority.rules[0].label = {
  ...profile.zoomPriority.rules[0].label!,
  style: { family: 'gm-outline', size: 18, modifiers: { italic: true } },
};
profile.zoomPriority.rules[0].geometryStack = { zLevel: 650 };
profile.zoomPriority.rules[0].priority = {
  mode: 'add',
  base: 100,
  metric: { kind: 'area', multiplier: 0.1, rounding: 'floor' },
};
profile.zoomPriority.rules[0].extensions = {
  screenGate: { mode: 'override', minScreenAreaPx: 12 },
  labelText: { maxChars: 4, multiline: true, maxLines: 2, suffix: '~' },
  anchor: { strategy: 'visibleInterior', candidates: ['C', 'N'], preferViewportCenter: true },
  density: { mode: 'override', gridSizePx: 48, maxLabelsPerGrid: 2, maxSymbolsPerGrid: 3 },
};
config.nodes.push({
  nodeId: 'native-test',
  path: { class: 'NEW' },
  children: [],
  inheritDown: { fields: true, display: true, card: true },
  fields: [],
  geometryType: 'Polygon',
  geometryProfiles: { Polygon: profile },
});

const report = validateConfigPackage(config);
if (!report.valid) throw new Error(`V3.2 native config invalid:\n${report.issues.filter((item) => item.severity === 'error').map((item) => `${item.code}: ${item.message}`).join('\n')}`);

const feature = {
  uid: 'native-test-feature',
  meta: { Class: 'NEW', Type: 'Polygon' as const, World: 'zth', idField: 'ID', idValue: 'native-test', sig: { World: 'zth' }, signatureKey: 'native-test', groups: {} },
  featureInfo: { ID: 'native-test', Name: '原生 V3.2 样例', World: 'zth', Class: 'NEW' },
  type: 'Polygon' as const,
  coords3: [{ x: 0, y: -64, z: 0 }, { x: 20, y: -64, z: 0 }, { x: 20, y: -64, z: 20 }],
};
const context = { worldId: 'zth', leafletZoom: 1, zoomLevel: 4, inFloorView: false, activeBuildingUid: null, activeContextBindingId: null, activeFloorSelector: null, activeBuildingFloorRefSet: null };
const rule = resolveConfigRuntimeRule(config, feature, context, null);
if (!rule || rule.name.indexOf('config-v32:NEW:Polygon') < 0) throw new Error('V3.2 executor did not create a native rule.');
if ((rule.display as any)?.geometry?.stroke !== '#8b5cf6') throw new Error('V3.2 executor did not use the authored stroke color.');
if ((rule.symbol as any)?.label?.styleKey?.key !== 'gm-outline-18') throw new Error('V3.2 executor did not use the authored label style.');
if ((rule.display as any)?.anchor?.multipartMode !== 'perPart') throw new Error('V3.2 executor did not carry the profile multipart anchor into the native display plan.');
if ((rule.symbol as any)?.label?.maxChars !== 4 || (rule.symbol as any)?.label?.abbreviation?.suffix !== '~' || (rule.display as any)?.density?.maxSymbolsPerGrid !== 3) throw new Error('V3.2 executor did not carry typed extension rules into the shared renderer.');
if ((rule.display as any)?.geometry?.hitTolerancePx !== 6) throw new Error('V3.2 executor did not carry the geometry-specific global hit tolerance into the shared renderer.');
if ((rule.display as any)?.interaction?.hover?.showLabel !== true || (rule.display as any)?.interaction?.selected?.priorityOverride !== 10000) throw new Error('V3.2 executor did not carry geometry-wide interaction baselines into the display plan.');
if (resolveConfigRuntimeRule(config, { ...feature, featureInfo: { ...feature.featureInfo, World: 'other' } }, context, null)) throw new Error('V3.2 executor rendered a record outside its active World.');
const order = resolveConfigRuntimeStackOrder(config, feature, context);
if (order.geometryZ !== 650 || order.displayPriority !== 120) throw new Error('V3.2 geometry stack and dynamic display priority are not independent or are not applied.');

config.nodes.push(
  {
    nodeId: 'host',
    path: { class: 'HOST' },
    children: [],
    inheritDown: { fields: true, display: true, card: true },
    fields: [{ fieldId: 'host-key', key: 'HostKey', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '主结构键', en: 'Host key' }, description: { zh: '', en: '' } }],
    geometryType: 'Point',
    geometryProfiles: { Point: createDefaultGeometryProfile('Point') },
  },
  {
    nodeId: 'member',
    path: { class: 'UNIT' },
    children: [],
    inheritDown: { fields: true, display: true, card: true },
    fields: [
      { fieldId: 'member-ref', key: 'HostRef', type: 'string', cardinality: 'single', input: 'text', labels: { zh: '主结构引用', en: 'Host reference' }, description: { zh: '', en: '' } },
      { fieldId: 'member-floor', key: 'FloorNo', type: 'number', cardinality: 'single', input: 'text', labels: { zh: '楼层号', en: 'Floor number' }, description: { zh: '', en: '' } },
    ],
    geometryType: 'Point',
    geometryProfiles: { Point: createDefaultGeometryProfile('Point') },
  },
);
config.contextBindings = [{
  id: 'host-unit',
  label: { zh: '主结构与单元', en: 'Host and unit' },
  enabled: true,
  profile: 'show-active-member-only',
  host: { classification: { class: 'HOST' }, referenceField: 'HostKey' },
  member: { classification: { class: 'UNIT' }, referenceField: 'HostRef' },
  memberSelectorField: 'FloorNo',
}];
const host = {
  uid: 'host-1',
  meta: { Class: 'HOST', Type: 'Points' as const, World: 'zth', idField: 'ID', idValue: 'host-1', sig: {}, signatureKey: 'host-1', groups: {} },
  featureInfo: { ID: 'host-1', Name: '主结构', World: 'zth', Class: 'HOST', HostKey: 'A' },
  type: 'Points' as const,
  p3: { x: 0, y: -64, z: 0 },
};
const unit = (uid: string, ref: string, floor: number) => ({
  uid,
  meta: { Class: 'UNIT', Type: 'Points' as const, World: 'zth', idField: 'ID', idValue: uid, sig: {}, signatureKey: uid, groups: {} },
  featureInfo: { ID: uid, Name: uid, World: 'zth', Class: 'UNIT', HostRef: ref, FloorNo: floor },
  type: 'Points' as const,
  p3: { x: floor, y: -64, z: floor },
});
const member1 = unit('unit-1', 'A', 1);
const member2 = unit('unit-2', 'A', 2);
const unrelatedMember = unit('unit-x', 'B', 1);
const store = new FeatureStore([host, member1, member2, unrelatedMember]);
const genericContext = resolveConfigRuntimeContextForHost(config, host, store);
if (!genericContext || genericContext.options.map((item) => item.value).join(',') !== '1,2') throw new Error('V3.2 generic host/member context did not resolve author-selected relation fields.');
const activeContext = { ...context, inFloorView: true, activeBuildingUid: host.uid, activeContextBindingId: 'host-unit', activeFloorSelector: '1' };
if (!isConfigRuntimeRecordVisible(config, member1, activeContext, store) || isConfigRuntimeRecordVisible(config, member2, activeContext, store) || isConfigRuntimeRecordVisible(config, unrelatedMember, activeContext, store)) throw new Error('V3.2 generic context visibility did not enforce the selected member without class-specific code.');

const invalidAdvanced = structuredClone(config);
invalidAdvanced.nodes[0].geometryProfiles.Polygon!.zoomPriority.rules[0].advanced = { legacyRuntime: { preserveFallback: true } };
if (!validateConfigPackage(invalidAdvanced).issues.some((item) => item.code === 'legacy-advanced-forbidden')) throw new Error('V3.2 accepted an old advanced/fallback rendering block.');

console.log('config-studio-v32: native contract, editor defaults and renderer boundary: OK');

const semantic = createConfigPackageFromCurrentProject();
const semanticReport = validateConfigPackage(semantic);
const semanticErrors = semanticReport.issues.filter((item) => item.severity === 'error');
if (semanticErrors.length) throw new Error(`V1 semantic V3 package invalid:\n${semanticErrors.slice(0, 40).map((item) => `${item.code}: ${item.path}: ${item.message}`).join('\n')}`);
const isg = semantic.nodes.find((node) => node.path.class === 'ISG' && !node.path.kind);
const rod = semantic.nodes.find((node) => node.path.class === 'ROD' && !node.path.kind);
const isl = semantic.nodes.find((node) => node.path.class === 'ISL' && !node.path.kind);
const bud = semantic.nodes.find((node) => node.path.class === 'BUD' && !node.path.kind);
if (!isg?.geometryProfiles.Polygon?.zoomPriority.rules[0].extensions?.polygonCandidates?.minScreenAreaPx) throw new Error('ISG polygon candidate screen-area baseline was not migrated.');
if (rod?.geometryProfiles.LineString?.zoomPriority.rules[0].extensions?.lineLabel?.candidateSpacing !== 120) throw new Error('ROD line-candidate baseline was not migrated.');
if (isl?.geometryProfiles.LineString?.zoomPriority.rules[0].extensions?.lineLabel?.candidateSpacing !== 200) throw new Error('ISL line-candidate baseline was not migrated.');
if (bud?.geometryProfiles.Polygon?.zoomPriority.rules.map((rule) => `${rule.minZoom}-${rule.maxZoom}-${rule.representation}`).join(',') !== '0-2-hidden,3-5-point,6-8-geometry') throw new Error('BUD low/high zoom representations were not migrated as separate native rules.');
if (semantic.workflows.filter((workflow) => workflow.mode === 'external').length !== 3) throw new Error('Only railway, station and TRP may remain external workflows.');
const composed = semantic.workflows.find((workflow) => workflow.mode === 'composed' && workflow.outputs.length && workflow.outputs[0].assignments.length);
if (!composed) throw new Error('No standard V1 workflow was migrated into a composed V3 workflow.');
const output = evaluateV3WorkflowOutputs(composed, Object.fromEntries(composed.steps.flatMap((step) => (step.controls ?? []).filter((control) => control.slot).map((control) => [control.slot!, 'value']))), { world: 'zth' });
if (!output.length || output[0].record.World !== 'zth') throw new Error('V3 workflow runner did not compose a semantic output.');
console.log('config-studio-v32: semantic V1 migration, cards and composed workflows: OK');
