import { FeatureStore } from '../../src/components/Rules/data/featureStore';
import { FEATURE_RENDER_RULES } from '../../src/components/Rules/rendering/featureRenderRules';
import { resolveConfigRuntimeRule, resolveConfigRuntimeStackOrder } from '../../src/components/Rules/configRuntime/configPackageAdapter';
import { buildV3CardSections } from '../../src/configStudio/V3CardRenderer';
import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { validateConfigPackage } from '../../src/configStudio/runtime';
import { evaluateV3Expression, evaluateV3WorkflowOutputs, findV3SearchCandidates, validateV3WorkflowInputs } from '../../src/configStudio/V3WorkflowRunner';
import type { CategoryNode, GeometryKind } from '../../src/configStudio/types';

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const context = {
  worldId: 'zth', leafletZoom: 3, zoomLevel: 6, inFloorView: false,
  activeBuildingUid: null, activeContextBindingId: null, activeFloorSelector: null,
  activeBuildingFloorRefSet: null,
};

function recordFor(node: CategoryNode, geometry: GeometryKind) {
  const type = geometry === 'Point' ? 'Points' : geometry === 'LineString' ? 'Polyline' : 'Polygon';
  const featureInfo = {
    ID: `${node.path.class}-semantic-probe`, Name: `${node.path.class} 语义探针`, World: 'zth', Class: node.path.class,
    ...(node.path.kind ? { Kind: node.path.kind } : {}), ...(node.path.skind ? { SKind: node.path.skind } : {}), ...(node.path.skind2 ? { SKind2: node.path.skind2 } : {}),
    color: '#2357c8', Level: '主干道', Situation: '正常',
    tags: { nomenclator: '语义迁移测试' },
    extensions: { link: { wiki: 'https://example.invalid/wiki' }, character: { brief: '测试简介' } },
  };
  return {
    uid: `${node.nodeId}-semantic-probe`,
    meta: { Class: node.path.class, Type: type, World: 'zth', idField: 'ID', idValue: featureInfo.ID, sig: { World: 'zth' }, signatureKey: featureInfo.ID, groups: {} },
    featureInfo,
    type,
    ...(geometry === 'Point' ? { p3: { x: 0, y: -64, z: 0 } } : geometry === 'LineString' ? { coords3: [{ x: -40, y: -64, z: -20 }, { x: 0, y: -64, z: 0 }, { x: 40, y: -64, z: 20 }] } : { coords3: [{ x: -20, y: -64, z: -20 }, { x: 25, y: -64, z: -20 }, { x: 25, y: -64, z: 25 }, { x: -20, y: -64, z: 25 }] }),
  };
}

function root(config: ReturnType<typeof createConfigPackageFromCurrentProject>, classCode: string): CategoryNode {
  const node = config.nodes.find((candidate) => candidate.path.class === classCode && !candidate.path.kind);
  if (!node) throw new Error(`Missing migrated root classification: ${classCode}`);
  return node;
}

function nodeAt(config: ReturnType<typeof createConfigPackageFromCurrentProject>, path: { class: string; kind?: string; skind?: string; skind2?: string }): CategoryNode {
  const node = config.nodes.find((candidate) => candidate.path.class === path.class
    && candidate.path.kind === path.kind
    && candidate.path.skind === path.skind
    && candidate.path.skind2 === path.skind2);
  if (!node) throw new Error(`Missing migrated classification: ${JSON.stringify(path)}`);
  return node;
}

function probe(node: CategoryNode, geometry: GeometryKind, values: Record<string, unknown> = {}) {
  const base = recordFor(node, geometry) as any;
  const featureInfo = { ...base.featureInfo, ...values };
  const id = String(featureInfo.ID ?? base.meta.idValue);
  return {
    ...base,
    meta: { ...base.meta, idValue: id, signatureKey: id },
    featureInfo,
  } as any;
}

function runtimeContext(zoomLevel: number, overrides: Partial<typeof context> = {}) {
  return { ...context, zoomLevel, ...overrides };
}

function styleKey(rule: any): string {
  const key = rule?.symbol?.label?.styleKey;
  return typeof key === 'string' ? key : String(key?.key ?? '');
}

const config = createConfigPackageFromCurrentProject();
const report = validateConfigPackage(config);
const errors = report.issues.filter((issue) => issue.severity === 'error');
expect(config.contractRevision === 6, 'Semantic migration did not create contract r6.');
expect(errors.length === 0, `Semantic migration contains ${errors.length} validation errors: ${errors.slice(0, 12).map((issue) => `${issue.code}@${issue.path}`).join(', ')}`);
const migratedFields = config.nodes.flatMap((node) => node.fields);
expect(!migratedFields.some((field) => field.key === 'tags' || field.key === 'extensions'), 'Optional tags/extensions groups were migrated as synthetic root text fields.');
expect(migratedFields.every((field) => field.scope !== 'tags' || field.key.startsWith('tags.')), 'A tags field lost its real dotted path during migration.');
expect(migratedFields.every((field) => field.scope !== 'extensions' || field.key.startsWith('extensions.')), 'An extensions field lost its real dotted path during migration.');
expect(migratedFields.some((field) => field.scope === 'tags') && migratedFields.some((field) => field.scope === 'extensions'), 'Migrated optional groups no longer expose their real child fields.');
const migratedChineseField = migratedFields.find((field) => /[\u3400-\u9fff]/.test(field.labels.zh));
expect(Boolean(migratedChineseField) && migratedChineseField!.labels.en !== migratedChineseField!.labels.zh, 'Migration copied Chinese field labels into the editable English slot.');
expect(config.parity?.entries.filter((entry) => entry.kind === 'class').every((entry) => entry.status === 'resolved'), 'A V1 class remains unresolved in the semantic parity report.');
expect(config.nodes.every((node) => Object.values(node.geometryProfiles).every((profile) => !profile || !profile.legacyDisplay)), 'A migrated profile still stores legacy display JSON.');
expect(config.nodes.every((node) => Object.values(node.geometryProfiles).every((profile) => !profile || profile.zoomPriority.rules.every((rule) => !rule.advanced))), 'A migrated render rule still uses advanced/raw legacy fallback.');

const rod = root(config, 'ROD');
const isl = root(config, 'ISL');
const isg = root(config, 'ISG');
const bud = root(config, 'BUD');
const rodRule = resolveConfigRuntimeRule(config, recordFor(rod, 'LineString'), context, null);
const islRule = resolveConfigRuntimeRule(config, recordFor(isl, 'LineString'), context, null);
const isgRule = resolveConfigRuntimeRule(config, recordFor(isg, 'Polygon'), context, null);
expect((rodRule?.display as any)?.anchor?.lineCandidateSpacing === 120, 'ROD strict road line-label spacing did not reach the runtime.');
expect((rodRule?.display as any)?.anchor?.lineLabelMode === 'strictOnLine', 'ROD strict-on-line label mode did not reach the runtime.');
expect((rodRule?.display as any)?.anchor?.advancedLineTextBudgetGroup === 'network', 'ROD advanced line-label budget did not reach the runtime.');
expect((islRule?.display as any)?.anchor?.lineCandidateSpacing === 200, 'ISL water line-label spacing did not reach the runtime.');
expect((islRule?.display as any)?.anchor?.lineLabelMode === 'strictOnLine', 'ISL strict-on-line label mode did not reach the runtime.');
expect((isgRule?.display as any)?.anchor?.geoCandidateMode === 'viewportAwareCandidateSet', 'ISG polygon candidate mode did not reach the runtime.');
expect((isgRule?.display as any)?.anchor?.geoCandidateCount === 9, 'ISG polygon candidate count did not reach the runtime.');
expect((isgRule?.display as any)?.anchor?.largeFeature?.minScreenAreaPx === 10000, 'ISG large-polygon threshold was altered during migration.');
const budRules = bud.geometryProfiles.Polygon?.zoomPriority.rules ?? [];
expect(budRules.map((rule) => `${rule.minZoom}-${rule.maxZoom}-${rule.representation}`).join(',') === '0-2-hidden,3-5-point,6-8-geometry', 'BUD did not retain its low-zoom point / high-zoom geometry split.');
const budAtHiddenZoom = resolveConfigRuntimeRule(config, recordFor(bud, 'Polygon'), runtimeContext(2), null);
const budAtPointZoom = resolveConfigRuntimeRule(config, recordFor(bud, 'Polygon'), runtimeContext(3), null) as any;
expect(budAtHiddenZoom === null, 'BUD is still visible in its authored 0–2 hidden interval.');
expect(budAtPointZoom?.symbol?.point?.kind === 'circle' && Number(budAtPointZoom.symbol.point.radius) > 0, 'BUD low-Zoom rendering is not a real authored point symbol.');
expect(!Object.prototype.hasOwnProperty.call(budAtPointZoom.symbol.label, 'withDot'), 'BUD still relies on the deprecated label-decoration dot compatibility path.');
const budWithPrefixWorld = probe(bud, 'Polygon', { World: 'Z' });
budWithPrefixWorld.meta = { ...budWithPrefixWorld.meta, World: 'Z', sig: { ...budWithPrefixWorld.meta.sig, World: 'Z' } };
expect(Boolean(resolveConfigRuntimeRule(config, budWithPrefixWorld, runtimeContext(6), null)), 'World prefix Z was not normalized to the active zth map world.');
const budOrder = resolveConfigRuntimeStackOrder(config, recordFor(bud, 'Polygon'), context);
expect(budOrder.geometryZ === 360 && budOrder.displayPriority >= 3600, `BUD geometry stacking and display priority are no longer independent V1 values: ${JSON.stringify(budOrder)}`);

const cards = buildV3CardSections(config, recordFor(rod, 'LineString') as any);
expect((cards?.mainRows.length ?? 0) + (cards?.otherRows.length ?? 0) > 0, `A standard V1 card was not rendered through V3CardRenderer: ${JSON.stringify({ card: rod.card, cards })}`);
const external = config.workflows.filter((workflow) => workflow.mode === 'external');
expect(external.length === 3, 'Only railway, station and TRP should remain external workflows.');
expect(external.every((workflow) => ['railway-integrated', 'station-integrated', 'trp-integrated'].includes(workflow.external?.reason ?? '')), 'An unsupported external workflow escaped the migration gate.');
const standard = config.workflows.find((workflow) => workflow.mode === 'composed' && workflow.outputs.some((output) => output.assignments.length));
expect(standard, 'No standard V1 workflow became a V3 composed workflow.');
const slots = Object.fromEntries(standard.steps.flatMap((step) => (step.controls ?? []).filter((control) => control.slot).map((control) => [control.slot!, 'sample'])));
const outputs = evaluateV3WorkflowOutputs(standard, slots, { world: 'Z' });
expect(outputs.length && outputs[0].record.World === 'zth', 'V3WorkflowRunner did not produce a system-scoped record.');
expect(evaluateV3Expression('A+"_"+B', { A: 'left', B: 'right' }, {}) === 'left_right', 'V3 expression composition is not deterministic.');
expect(evaluateV3Expression('join("_",WorldPrefix+Class,A,B)', { A: '', B: 'road' }, { WorldPrefix: 'Z', Class: 'ROD' }) === 'ZROD_road', 'V3 optional-segment ID assembly is not deterministic.');

// Concrete V1 branch probes.  These assertions execute the native V3
// resolver, so a future broad default cannot silently replace a real V1
// class/subclass rule.
const rle = root(config, 'RLE');
const rlePrimary = probe(rle, 'LineString', { ID: 'rle-primary', Name: '主线', direction: '3', color: '#16a34a' });
const rleOverlay = probe(rle, 'LineString', { ID: 'rle-overlay', Name: '支线', direction: '0', color: '#dc2626' });
const railwayStore = new FeatureStore([rlePrimary, rleOverlay]);
const rlePill = resolveConfigRuntimeRule(config, rlePrimary, runtimeContext(6), null, railwayStore) as any;
const rleLine = resolveConfigRuntimeRule(config, rleOverlay, runtimeContext(8), null, railwayStore) as any;
expect(styleKey(rlePill) === 'rle-pill-13' && rlePill.symbol.label.styleKey.color === '#16a34a', 'RLE direction=3 pill style/color was not migrated.');
expect(styleKey(rleLine) === 'rle-line-13' && rleLine.symbol.label.styleKey.color === '#dc2626', 'RLE direction=0 high-zoom line style/color was not migrated.');
expect(rleLine.visible(rleOverlay, runtimeContext(6), railwayStore) === false, 'RLE overlay choice was not restricted below its high-zoom switch.');

const rodRuntime = probe(rod, 'LineString', { ID: 'road-1', color: '#f59e0b' });
const rodLow = resolveConfigRuntimeRule(config, rodRuntime, runtimeContext(6), null) as any;
const rodHigh = resolveConfigRuntimeRule(config, rodRuntime, runtimeContext(7), null) as any;
const v1RoadStyle = FEATURE_RENDER_RULES.find(rule => rule.match.Class === 'ROD')!.symbol!.pathStyle!;
for (const [zoom, native] of [[6, rodLow], [7, rodHigh]] as const) {
  const legacy = typeof v1RoadStyle === 'function' ? v1RoadStyle(rodRuntime as any, runtimeContext(zoom), new FeatureStore([rodRuntime])) : v1RoadStyle;
  expect(native.display.geometry.strokeOpacity === legacy.opacity, 'ROD opacity differs from the frozen V1 rule at the same logical Zoom.');
}

const pfb = root(config, 'PFB');
const pfbRuntime = probe(pfb, 'Polygon', { ID: 'pfb-1', LineID: 'rle-primary' });
const pfbRule = resolveConfigRuntimeRule(config, pfbRuntime, runtimeContext(6), null, new FeatureStore([rlePrimary, pfbRuntime])) as any;
expect(pfbRule.display.geometry.stroke === '#16a34a' && pfbRule.display.geometry.fill === '#16a34a', 'PFB related-line colour binding was not executed through V3.');

const islWater = nodeAt(config, { class: 'ISL', kind: 'NGF', skind: 'WTR', skind2: 'RVR' });
const islWaterRule = resolveConfigRuntimeRule(config, probe(islWater, 'LineString'), runtimeContext(6), null) as any;
expect(styleKey(islWaterRule) === 'gm-wtb-16', 'ISL waterway label family was not migrated to the V3 rule.');
const isgContinent = nodeAt(config, { class: 'ISG', kind: 'NGF', skind: 'LAD', skind2: 'CON' });
const isgContinentLow = resolveConfigRuntimeRule(config, probe(isgContinent, 'Polygon'), runtimeContext(2), null) as any;
expect(styleKey(isgContinentLow) === 'gm-bw-21', 'ISG continent style was not migrated.');
expect(resolveConfigRuntimeRule(config, probe(isgContinent, 'Polygon'), runtimeContext(5), null) === null, 'ISG continent is incorrectly visible above its V1 zoom range.');
const isgAdminL2 = nodeAt(config, { class: 'ISG', kind: 'ADM', skind: 'DBZ', skind2: 'L2' });
expect(resolveConfigRuntimeRule(config, probe(isgAdminL2, 'Polygon'), runtimeContext(5), null) === null, 'ISG administrative L2 is incorrectly visible outside zoom 6.');
expect(styleKey(resolveConfigRuntimeRule(config, probe(isgAdminL2, 'Polygon'), runtimeContext(6), null)) === 'gm-bw-17', 'ISG administrative L2 style was not migrated.');

const budHost = probe(bud, 'Polygon', { ID: 'bud-host' });
const flr = root(config, 'FLR');
const floor = probe(flr, 'Polygon', { ID: 'floor-2', Name: '', BuildingID: 'bud-host', NofFloor: '2' });
const floorStore = new FeatureStore([budHost, floor]);
const activeFloor = runtimeContext(6, { inFloorView: true, activeBuildingUid: budHost.uid, activeContextBindingId: 'bud-floor-context', activeFloorSelector: '2' });
const floorRule = resolveConfigRuntimeRule(config, floor, activeFloor, null, floorStore) as any;
expect(floorRule?.visible(floor, activeFloor, floorStore) === true && String(floorRule.symbol.label.textFrom(floor)).length > 0, 'FLR active context and fallback floor label were not migrated.');
expect(floorRule?.visible(floor, runtimeContext(6), floorStore) === false, 'FLR is visible outside its generic active context.');
const flrCard = flr.card;
const buildingLinkItem = flrCard?.mode === 'fields' ? flrCard.items.find((item) => item.source === 'BuildingID') : undefined;
expect(buildingLinkItem?.renderer === 'relationLink' && buildingLinkItem.relation?.targetClassification?.class === 'BUD' && buildingLinkItem.section === 'main', 'FLR BuildingID was not migrated as a V3 relation card item in the V1 main section.');
const renderedFloorCard = buildV3CardSections(config, floor);
const buildingRow = renderedFloorCard?.mainRows.find((row) => row.label.includes('所属建筑'));
expect((buildingRow?.value as any)?.kind === 'featureLink' && (buildingRow?.value as any)?.linkTarget?.classCode === 'BUD', 'V3CardRenderer did not execute the migrated BuildingID relation.');
const rleCard = rle.card;
expect(rleCard?.mode === 'fields' && rleCard.items.some((item) => item.renderer === 'colorCapsule' && item.source === 'color'), 'RLE colour chip remains a legacy enhancement instead of a V3 card renderer item.');
const sta = root(config, 'STA');
expect(sta.card?.mode === 'fields' && sta.card.items.some((item) => item.renderer === 'lineChips' && item.options?.lineChipSource === 'station'), 'STA line chips were not preserved as a declarative V3 card renderer item.');
const sbp = root(config, 'SBP');
const sbpRule = resolveConfigRuntimeRule(config, probe(sbp, 'Point', { ID: 'sbp-1', iconUrl: 'https://example.invalid/icon.png' }), runtimeContext(6), null) as any;
expect(sbpRule?.symbol?.point?.kind === 'icon' && sbpRule.symbol.point.iconUrlFrom === 'iconUrl', 'SBP icon field binding was not migrated.');

const rodWorkflow = config.workflows.find((workflow) => workflow.id === 'v3-rod_road');
expect(rodWorkflow?.mode === 'composed', 'ROD must be a V3 composed workflow, not an external component.');
const roadControls = rodWorkflow!.steps.flatMap((step) => step.controls ?? []);
const roadName = roadControls.find((control) => control.label.zh.includes('道路名称'));
const roadAbbr = roadControls.find((control) => control.id.includes('-abbr-'));
const roadCatAbbr = roadControls.find((control) => control.id.includes('-catAbbr-'));
const roadLandSearch = roadControls.find((control) => control.search?.target.class === 'ISG' && control.search.target.kind === 'NGF');
const roadGroup = roadControls.find((control) => control.kind === 'group' && control.label.zh.includes('显式连接关系'));
expect(roadName?.required && roadAbbr?.required && roadLandSearch?.search?.target.kind === 'NGF', 'V1 standard required/search semantics were not carried into the V3 ROD form.');
expect(roadGroup?.group?.itemFields.some((field) => field.key === 'mode' && field.kind === 'select'), 'V1 road repeat group was reduced to an untyped JSON placeholder.');
const roadModeOption = roadGroup?.group?.itemFields.find((field) => field.key === 'mode')?.options?.[0];
expect(Boolean(roadModeOption) && Boolean(roadModeOption!.label.zh) && roadModeOption!.label.zh !== roadModeOption!.value, 'A V1 select option lost its display-label versus stored-value mapping.');
const landCandidates = findV3SearchCandidates([
  { ID: 'land-1', Name: 'S 岛屿', World: 'Z', Class: 'ISG', Kind: 'NGF' },
  { ID: 'land-2', Name: 'S 其他世界', World: 'N', Class: 'ISG', Kind: 'NGF' },
], roadLandSearch?.search, 'S', 'zth');
expect(landCandidates.length === 1 && landCandidates[0].returned === 'land-1' && landCandidates[0].display.includes('land-1'), 'Controlled feature search did not scope World/query/display/one return field consistently.');
const roadSlots = Object.fromEntries(roadControls.filter((control) => control.slot).map((control) => [control.slot!, control.defaultValue ?? '']));
roadSlots[roadName!.slot!] = '测试道路';
roadSlots[roadAbbr!.slot!] = 'TEST';
roadSlots[roadCatAbbr!.slot!] = '';
roadSlots[roadGroup!.slot!] = [{ mode: 'endpoint', tgt: 'other-road' }];
const roadOutput = evaluateV3WorkflowOutputs(rodWorkflow!, roadSlots, { world: 'zth' })[0].record as any;
expect(roadOutput.ID === 'ZROD_TEST' && Array.isArray(roadOutput.ConnectL) && roadOutput.ConnectL[0].tgt === 'other-road', 'V1 ROD ID assembly or repeat-group output was not preserved.');
const roadOutputWithMetadata = evaluateV3WorkflowOutputs(rodWorkflow!, { ...roadSlots, actor: '测试填写人', tags: '{"zone":"test"}', extensions: '{"custom":{"check":"ok"}}' }, { world: 'zth' })[0].record as any;
expect(roadOutputWithMetadata.Creator === '测试填写人' && roadOutputWithMetadata.tags?.zone === 'test' && roadOutputWithMetadata.extensions?.custom?.check === 'ok', 'V3 runner did not preserve actor/tags/extensions form-tail output.');
expect(validateV3WorkflowInputs(rodWorkflow!, { World: 'zth' }).some((issue) => issue.controlId === roadName?.id), 'V3 runner does not block missing migrated required controls.');

console.log(`v3-semantic-parity: ${config.nodes.length} nodes, ${config.workflows.length} workflows, V1 display/card/workflow mapping: OK`);
