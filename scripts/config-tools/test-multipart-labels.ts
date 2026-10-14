import assert from 'node:assert/strict';
import { featureLabelParts, componentLabelId, filterFeatureGeometryParts } from '../../src/components/Rules/rendering/multipartLabels';
import type { LabelRequest } from '../../src/components/Rules/rendering/labelLayout';
import type { FeatureDisplayPlan } from '../../src/components/Rules/rendering/display/displayTypes';
import type { FeatureRecord } from '../../src/components/Rules/rendering/renderRules';
import type { MultipartGeometry } from '../../src/core/geometry/multipartGeometry';
import { resolveLabelPlacementCacheConfig } from '../../src/components/Rules/rendering/label/labelPlacementCache';
import { mergeDisplayCollisionIntoLabelRequest } from '../../src/components/Rules/rendering/label/labelCollision';

const point = (x: number) => ({ x, y: -64, z: 0 });
for (const geometry of [
  { type: 'Point', parts: [point(0), point(20), point(40)] },
  { type: 'LineString', parts: [[point(0), point(10)], [point(20), point(30)]] },
  { type: 'Polygon', parts: [[[point(0), { ...point(10), z: 10 }, point(20)]], [[point(30), { ...point(40), z: 10 }, point(50)]]] },
] as MultipartGeometry[]) {
  const record = { uid: 'source-feature', featureInfo: { ID: 'shared-ID' }, multipartGeometry: geometry } as FeatureRecord;
  const each = featureLabelParts(record, 'perPart');
  assert.equal(each.length, geometry.parts.length);
  assert.ok(each.every((part) => part.record.uid === record.uid && part.record.featureInfo === record.featureInfo && part.record.multipartGeometry?.parts.length === 1));
  assert.equal(new Set(each.map((part) => componentLabelId(record.uid, part.partIndex))).size, each.length);
  assert.equal(featureLabelParts(record, 'featureBbox').length, 1);
  const filtered = filterFeatureGeometryParts(record, (part) => part.coords3![0].x >= 20)!;
  assert.equal(filtered.uid, record.uid);
  assert.equal(filtered.featureInfo, record.featureInfo);
  assert.ok(filtered.multipartGeometry!.parts.length < geometry.parts.length);
  assert.ok(filtered.coords3!.every((coordinate) => coordinate.x >= 20));
  assert.equal(filterFeatureGeometryParts(record, () => false), undefined);
  assert.equal(filterFeatureGeometryParts(record, () => true), record);
  const keys = each.map(({ partIndex }) => resolveLabelPlacementCacheConfig({ id: componentLabelId(record.uid, partIndex), featureUid: record.uid, partIndex, text: 'same label', placement: 'center', zoom: 3, placementCacheEnabled: true })!.key);
  assert.equal(new Set(keys).size, each.length);
}
console.log('multipart-labels: independent component geometries/ids/caches and shared feature identity: OK');
const component = { partIndex: 0, declutter: { enabled: true, priority: 12 } } as unknown as LabelRequest;
const plan = { collision: { priority: 999 } } as unknown as FeatureDisplayPlan;
assert.equal(mergeDisplayCollisionIntoLabelRequest(component, plan).declutter.priority, 12);
assert.equal(mergeDisplayCollisionIntoLabelRequest({ ...component, partIndex: undefined } as never, plan).declutter.priority, 999);
